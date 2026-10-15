import { loadDraftProfiles, loadManifest, loadSimulation } from './data.ts';
import { replayInput } from './draft.ts';
import { loadLibrary, type LibraryView } from './library.ts';
import { recordSeries, seriesRecord } from './series-history.ts';
import { deviceDb } from '../storage/db.ts';
import { loadReplayLink, parseSeriesHash, ReplayLinkError, replayLinkPath, seriesHash, type SeriesField } from './replay-link.ts';
import type { Draft, Manifest, Profile } from './types.ts';
import { prepareSeasonInput } from './season-input.ts';
import type { SeriesInput, SeriesProgress, SeriesResult, SeriesTeamId, SeriesWorkerResponse } from '../sim/series-types.ts';

export type { SeriesField };
export type SeriesPhase = 'setup' | 'running' | 'results';
export type SeriesClubStatus = 'empty' | 'pending' | 'ready' | 'error';
export interface SeriesClub {
 source: 'saved' | 'replay';
 entry: LibraryView | null;
 draft: Draft;
 profiles: Profile[];
 canonical: string;
 stadiumName: string;
}
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
 clubStatus = $state<Record<SeriesTeamId, SeriesClubStatus>>({ 'team-a': 'empty', 'team-b': 'empty' });
 clubs = $state.raw<Record<SeriesTeamId, SeriesClub | null>>({ 'team-a': null, 'team-b': null });
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
 private validationIds: Record<SeriesTeamId, number> = { 'team-a': 0, 'team-b': 0 };
 private worker: Worker | null = null;

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
  this.clubs = { 'team-a': null, 'team-b': null };
  this.clubStatus = { 'team-a': 'empty', 'team-b': 'empty' };
  if (fromHash['team-a'].link && fromHash['team-b'].link) await this.play();
 }

 async refreshLibrary(): Promise<void> {
  const manifest = this.manifest;
  if (!manifest) return;
  try { this.library = (await loadLibrary((await deviceDb()).db, manifest)).entries.filter(entry => entry.status === 'playable'); }
  catch { this.library = []; }
 }

 async choose(id: SeriesTeamId, entry: LibraryView): Promise<void> {
  this.fields[id] = { link: `${location.origin}/#replay=${entry.token}`, name: entry.nickname ?? '' };
  await this.validate(id, entry);
 }

 /** Validates one replay and loads its exact roster without starting either regular season. */
 async validate(id: SeriesTeamId, entry: LibraryView | null = null): Promise<boolean> {
  const manifest = this.manifest;
  if (!manifest) return false;
  const validationId = ++this.validationIds[id];
  this.fieldErrors[id] = '';
  this.clubStatus[id] = 'pending';
  this.clubs = { ...this.clubs, [id]: null };
  try {
   const loaded = await loadReplayLink(this.fields[id].link, manifest, location.origin);
   const profiles = await loadDraftProfiles(manifest, loaded.draft);
   if (validationId !== this.validationIds[id]) return false;
   const stadiumName = manifest.stadiums.find(stadium => stadium.ref.id === loaded.draft.homeStadium?.id)?.name ?? 'Home park unavailable';
   this.clubs = {
    ...this.clubs,
    [id]: { source: entry ? 'saved' : 'replay', entry, draft: loaded.draft, profiles, canonical: replayLinkPath(loaded.link), stadiumName }
   };
   this.clubStatus[id] = 'ready';
   return true;
  } catch (error) {
   if (validationId !== this.validationIds[id]) return false;
   this.fieldErrors[id] = error instanceof ReplayLinkError ? error.message : 'The replay could not be loaded. Please retry.';
   this.clubStatus[id] = 'error';
   return false;
  }
 }

 /** Returns one side to its chooser without disturbing the opposing club. */
 change(id: SeriesTeamId): void {
  this.validationIds[id]++;
  this.clubs = { ...this.clubs, [id]: null };
  this.clubStatus[id] = 'empty';
  this.fieldErrors[id] = '';
 }

 async play(): Promise<void> {
  if (!this.manifest || this.running) return;
  const manifest = this.manifest;
  const readiness = await Promise.all(TEAM_IDS.map(id => this.clubs[id] ? true : this.validate(id)));
  if (readiness.some(ready => !ready)) return;
  const a = this.clubs['team-a'];
  const b = this.clubs['team-b'];
  if (!a || !b) return;

  this.stopWorker();
  const runId = ++this.runId;
  this.phase = 'running';
  this.error = '';
  this.result = null;
  this.fieldErrors = { 'team-a': '', 'team-b': '' };
  this.progress = { 'team-a': 0, 'team-b': 0, series: 0 };
  this.canonical = { 'team-a': a.canonical, 'team-b': b.canonical };
  this.drafts = { 'team-a': a.draft, 'team-b': b.draft };
  this.profiles = { 'team-a': a.profiles, 'team-b': b.profiles };
  this.stage = 'Loading the series model…';
  const current = () => runId === this.runId;
  try {
   const data = await loadSimulation(manifest);
   if (!current()) return;
   const team = (id: SeriesTeamId, club: SeriesClub) => ({
    id, name: this.fields[id].name.trim() || DEFAULT_NAMES[id], key: JSON.stringify(replayInput(club.draft)), season: prepareSeasonInput(club.draft, club.profiles, data)
   });
   const input: SeriesInput = { teams: [team('team-a', a), team('team-b', b)] };
   this.stage = 'Replaying both regular seasons for seeding…';
   const worker = new Worker(new URL('../engine/series.worker.ts', import.meta.url), { type: 'module' });
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
   if (!current()) return;
   this.fail(error instanceof Error ? error.message : 'The series could not start.');
  }
 }

 /** Adds a finished series to this device's head-to-head history for the season library. */
 private async record(result: SeriesResult): Promise<void> {
  try {
   const record = await seriesRecord(result, `${location.pathname}${this.seriesHash()}`, new Date().toISOString());
   this.historyNotice = await recordSeries((await deviceDb()).db, record) ?? '';
  }
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
  this.stopWorker();
  this.error = message;
  this.phase = 'setup';
  this.stage = '';
 }

 private stopWorker(): void {
  this.worker?.terminate();
  this.worker = null;
 }


 cancel(): void {
  this.runId++;
  this.stopWorker();
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
