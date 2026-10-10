import { loadDraftProfiles, loadManifest, loadSimulation } from './data.ts';
import { replayInput } from './draft.ts';
import { loadLibrary, type LibraryView } from './library.ts';
import { recordSeries, seriesRecord } from './series-history.ts';
import { loadReplayLink, parseSeriesHash, ReplayLinkError, replayLinkPath, seriesHash, type SeriesField } from './replay-link.ts';
import type { Draft, Manifest, Profile } from './types.ts';
import { prepareSeasonInput } from '../sim/season.ts';
import type { SeriesInput, SeriesProgress, SeriesResult, SeriesTeamId, SeriesWorkerResponse } from '../sim/series-types.ts';

export type { SeriesField };
export type SeriesPhase = 'setup' | 'running' | 'results';
const DEFAULT_NAMES: Record<SeriesTeamId, string> = { 'team-a': 'Team A', 'team-b': 'Team B' };
const TEAM_IDS = ['team-a', 'team-b'] as const;

/**
 * Drives the head-to-head page: validates two replay links, recomputes both seasons and the
 * series in a worker. It never reads or writes the active-draft save.
 */
export class SeriesSession {
 manifest = $state.raw<Manifest | null>(null);
 library = $state.raw<LibraryView[]>([]);
 fields = $state<Record<SeriesTeamId, SeriesField>>({ 'team-a': { link: '', name: '' }, 'team-b': { link: '', name: '' } });
 fieldErrors = $state<Record<SeriesTeamId, string>>({ 'team-a': '', 'team-b': '' });
 phase = $state<SeriesPhase>('setup');
 loading = $state(true);
 error = $state('');
 /** Set when a finished series could not join the head-to-head history. */
 historyNotice = $state('');
 stage = $state('');
 progress = $state<Record<SeriesTeamId | 'series', number>>({ 'team-a': 0, 'team-b': 0, series: 0 });
 result = $state.raw<SeriesResult | null>(null);
 profiles = $state.raw<Record<SeriesTeamId, Profile[]> | null>(null);
 drafts = $state.raw<Record<SeriesTeamId, Draft> | null>(null);
 private canonical: Record<SeriesTeamId, string> | null = null;
 private runId = 0;
 private worker: Worker | null = null;
 private abort: AbortController | null = null;

 get running(): boolean { return this.phase === 'running'; }

 async initialize(): Promise<void> {
  this.loading = true;
  this.error = '';
  try {
   const manifest = await loadManifest();
   this.manifest = manifest;
   this.refreshLibrary();
   this.loading = false;
   await this.openHash();
   return;
  } catch (error) {
   this.error = error instanceof Error ? error.message : 'The game data could not be loaded.';
  }
  this.loading = false;
 }

 /** Fills the fields from a series hash and plays when both links are present; also used on in-page hash changes. */
 async openHash(): Promise<void> {
  const fromHash = parseSeriesHash(location.hash);
  if (!fromHash || !this.manifest) return;
  this.cancel();
  this.stage = '';
  this.result = null;
  this.fields = fromHash;
  this.fieldErrors = { 'team-a': '', 'team-b': '' };
  if (fromHash['team-a'].link && fromHash['team-b'].link) await this.play();
 }

 refreshLibrary(): void {
  if (!this.manifest) return;
  try { this.library = loadLibrary(localStorage, this.manifest).entries.filter(entry => entry.status === 'playable'); }
  catch { this.library = []; }
 }

 choose(id: SeriesTeamId, entry: LibraryView): void {
  this.fields[id] = { link: `${location.origin}/#replay=${entry.token}`, name: entry.nickname ?? '' };
  this.fieldErrors[id] = '';
 }

 async play(): Promise<void> {
  if (!this.manifest || this.running) return;
  const manifest = this.manifest;
  this.stopRun();
  const runId = ++this.runId;
  const abort = new AbortController();
  this.abort = abort;
  this.phase = 'running';
  this.error = '';
  this.result = null;
  this.fieldErrors = { 'team-a': '', 'team-b': '' };
  this.progress = { 'team-a': 0, 'team-b': 0, series: 0 };
  this.stage = 'Checking both replay links…';
  const current = () => runId === this.runId;
  try {
   const loaded = await Promise.allSettled(TEAM_IDS.map(id => loadReplayLink(this.fields[id].link, manifest, location.origin, fetch, abort.signal)));
   if (!current()) return;
   let failed = false;
   loaded.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') return;
    failed = true;
    this.fieldErrors[TEAM_IDS[index]] = outcome.reason instanceof ReplayLinkError ? outcome.reason.message : 'The replay could not be loaded. Please retry.';
   });
   if (failed) { this.phase = 'setup'; this.stage = ''; return; }
   const [a, b] = loaded.map(outcome => (outcome as PromiseFulfilledResult<Awaited<ReturnType<typeof loadReplayLink>>>).value);
   this.canonical = { 'team-a': replayLinkPath(a.link), 'team-b': replayLinkPath(b.link) };
   this.stage = 'Loading both rosters…';
   const [data, profilesA, profilesB] = await Promise.all([loadSimulation(manifest), loadDraftProfiles(manifest, a.draft), loadDraftProfiles(manifest, b.draft)]);
   if (!current()) return;
   this.drafts = { 'team-a': a.draft, 'team-b': b.draft };
   this.profiles = { 'team-a': profilesA, 'team-b': profilesB };
   const team = (id: SeriesTeamId, draft: Draft, profiles: Profile[]) => ({
    id, name: this.fields[id].name.trim() || DEFAULT_NAMES[id], key: JSON.stringify(replayInput(draft)), season: prepareSeasonInput(draft, profiles, data)
   });
   const input: SeriesInput = { teams: [team('team-a', a.draft, profilesA), team('team-b', b.draft, profilesB)] };
   this.stage = 'Replaying both regular seasons for seeding…';
   const worker = new Worker(new URL('../sim/series.worker.ts', import.meta.url), { type: 'module' });
   this.worker = worker;
   worker.onmessage = (event: MessageEvent<SeriesWorkerResponse>) => {
    const message = event.data;
    if (message.runId !== this.runId) return;
    if (message.type === 'progress') this.applyProgress(message.progress);
    else if (message.type === 'error') this.fail(message.message);
    else {
     this.stopWorker();
     this.result = message.result;
     this.phase = 'results';
     this.stage = '';
     history.replaceState(history.state, '', `${location.pathname}${this.seriesHash()}`);
     void this.record(message.result);
    }
   };
   worker.onerror = () => { if (current()) this.fail('The series worker failed. Retry replays the identical series.'); };
   worker.onmessageerror = () => { if (current()) this.fail('The series result could not be read. Please retry.'); };
   worker.postMessage({ runId, input });
  } catch (error) {
   if (!current() || abort.signal.aborted) return;
   this.fail(error instanceof Error ? error.message : 'The series could not start.');
  }
 }

 /** Adds a finished series to this device's head-to-head history for the season library. */
 private async record(result: SeriesResult): Promise<void> {
  try { this.historyNotice = recordSeries(localStorage, await seriesRecord(result, `${location.pathname}${this.seriesHash()}`, new Date().toISOString())) ?? ''; }
  catch { this.historyNotice = 'This series could not be added to your head-to-head history: browser storage is blocked or full.'; }
 }

 private applyProgress(progress: SeriesProgress): void {
  if (progress.stage === 'regular-season') {
   this.progress[progress.teamId] = progress.completed;
   if (this.progress['team-a'] === 162 && this.progress['team-b'] === 162) this.stage = 'Playing the best-of-five…';
  } else {
   this.progress.series = progress.completed;
   this.stage = `Game ${progress.completed} final.`;
  }
 }

 private fail(message: string): void {
  this.stopRun();
  this.error = message;
  this.phase = 'setup';
  this.stage = '';
 }

 private stopWorker(): void {
  this.worker?.terminate();
  this.worker = null;
 }

 private stopRun(): void {
  this.abort?.abort();
  this.abort = null;
  this.stopWorker();
 }

 cancel(): void {
  this.runId++;
  this.stopRun();
  this.phase = 'setup';
  this.stage = 'Series cancelled.';
 }

 reset(): void {
  this.cancel();
  this.stage = '';
  this.result = null;
  this.refreshLibrary();
  history.replaceState(history.state, '', location.pathname);
 }

 /** Hash for the played series, using each link's canonical form. */
 seriesHash(): string {
  const links = this.canonical;
  if (!links) return seriesHash(this.fields);
  return seriesHash({
   'team-a': { link: links['team-a'], name: this.fields['team-a'].name },
   'team-b': { link: links['team-b'], name: this.fields['team-b'].name }
  });
 }

 destroy(): void { this.cancel(); }
}
