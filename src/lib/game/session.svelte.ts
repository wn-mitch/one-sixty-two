import { goto } from '$app/navigation';
import { loadChunk, loadManifest, loadSimulation } from './data.ts';
import { commitPick, createDraft, reassignPick, rollDraft, validateDraft, validateReplay } from './draft.ts';
import { persistDraft, restoreDraft, type SavedPhase } from './persistence.ts';
import { newSeed } from './random.ts';
import { decodeReplay, shareUrl } from './share.ts';
import { draftRules } from './rules.ts';
import type { Draft, HitterSlot, Manifest, Profile, Slot } from './types.ts';
import { prepareSeasonInput } from '../sim/season.ts';
import type { SeasonInput, SeasonResult, WorkerResponse } from '../sim/types.ts';

export type Phase = 'start' | 'ready' | 'revealing' | 'choosing' | 'lineup' | 'simulating' | 'results';
export class Session {
 manifest = $state.raw<Manifest | null>(null);
 draft = $state.raw<Draft | null>(null);
 pool = $state.raw<Profile[]>([]);
 profiles = $state.raw<Profile[]>([]);
 result = $state.raw<SeasonResult | null>(null);
 savedDraft = $state.raw<Draft | null>(null);
 phase = $state<Phase>('start');
 loading = $state(true);
 error = $state('');
 incompatible = $state(false);
 storageNotice = $state('');
 announce = $state('');
 confirmNew = $state(false);
 completed = $state(0);
 revealed = $state(0);
 shareLink = $state('');
 shareStatus = $state('');
 sharing = $state(false);
 private selected = new Map<string, Profile>();
 private savedPhase: SavedPhase = 'draft';
 private retryAction: 'initialize' | 'pool' | 'resume' | 'simulation' | null = null;
 private shared = false;
 private epoch = 0;
 private runId = 0;
 private worker: Worker | null = null;
 private revealTimer: number | undefined;
 private simulationInput: SeasonInput | null = null;
 private skipReveal = false;
 get busy(): boolean { return this.loading || this.phase === 'revealing' || this.phase === 'simulating'; }
 get canRetry(): boolean { return this.retryAction !== null; }

 async initialize(): Promise<void> {
  this.loading = true;
  this.error = '';
  const epoch = ++this.epoch;
  try {
   const manifest = await loadManifest();
   if (epoch !== this.epoch) return;
   this.manifest = manifest;
   const sharedPath = location.pathname.match(/^\/r\/([A-Za-z0-9_-]{22})$/);
   const forceNew = location.pathname === '/' && new URLSearchParams(location.search).get('new') === '1';
   if (forceNew) {
    this.shared = false;
    this.draft = createDraft(manifest, newSeed());
    this.savedDraft = null;
    this.phase = 'ready';
    this.save('draft');
    this.loading = false;
    await this.roll();
    return;
   }
   if (sharedPath) {
    this.shared = true;
    const response = await fetch(`/api/replays/${sharedPath[1]}`);
    let payload: unknown = null;
    try { payload = await response.json(); } catch { /* preserve the safe status fallback */ }
    if (!response.ok) {
     const message = payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
      ? payload.message
      : 'Replay could not be loaded. Please retry.';
     throw new Error(message);
    }
    this.draft = validateReplay(payload, manifest);
    await this.hydrateRoster();
    if (epoch !== this.epoch) return;
    this.loading = false;
    await this.simulate();
    return;
   }
   if (location.hash.startsWith('#replay=')) {
    this.shared = true;
    try { this.draft = decodeReplay(location.hash.slice(8), manifest); }
    catch (error) { this.incompatible = true; throw error; }
    await this.hydrateRoster();
    if (epoch !== this.epoch) return;
    this.loading = false;
    await this.simulate();
    return;
   }
   let saved;
   try { saved = restoreDraft(localStorage, manifest); }
   catch { saved = { kind: 'unavailable' as const, message: 'Resume unavailable: browser storage is blocked. You can still play.' }; }
   if (saved.kind === 'valid') { this.savedDraft = saved.draft; this.savedPhase = saved.phase; }
   else if (saved.kind === 'incompatible') { this.error = saved.message; this.incompatible = true; }
   else if (saved.kind === 'unavailable') this.storageNotice = saved.message;
   this.retryAction = null;
  } catch (error) {
   if (epoch !== this.epoch) return;
   this.error = error instanceof Error ? error.message : 'Could not load game data. Please retry.';
   if (!this.incompatible) this.retryAction = this.draft ? 'resume' : 'initialize';
  } finally { if (epoch === this.epoch) this.loading = false; }
 }
 private save(phase: SavedPhase): void {
  if (!this.draft || this.shared) return;
  try { this.storageNotice = persistDraft(localStorage, this.draft, phase, this.result ?? undefined) ?? ''; }
  catch { this.storageNotice = 'Resume unavailable: browser storage is blocked. You can still play.'; }
 }
 private async hydrateRoster(): Promise<void> {
  if (!this.manifest || !this.draft) return;
  const manifest = this.manifest;
  const draft = this.draft;
  const epoch = this.epoch;
  const chunks = new Map(draft.picks.map(pick => [`${pick.franchiseId}-${pick.decade}`, pick]));
  const pools = await Promise.all([...chunks.values()].map(roll => loadChunk(manifest, roll)));
  if (epoch !== this.epoch) return;
  const available = new Map(pools.flat().map(profile => [profile.seasonId, profile]));
  this.selected.clear();
  for (const pick of draft.picks) {
   const profile = available.get(pick.seasonId);
   if (!profile) throw new Error('Saved roster profile is missing from the dataset');
   this.selected.set(profile.seasonId, profile);
  }
  this.profiles = [...this.selected.values()];
 }
 async resume(): Promise<void> {
  if (this.loading || !this.manifest || !this.savedDraft) return;
  this.draft = this.savedDraft;
  await this.restoreActive();
 }
 private async restoreActive(): Promise<void> {
  if (!this.draft) return;
  this.loading = true;
  this.error = '';
  const epoch = this.epoch;
  try {
   await this.hydrateRoster();
   if (epoch !== this.epoch) return;
   this.retryAction = null;
   if (this.draft.picks.length === draftRules(this.draft.schemaVersion).slots.length) {
    this.phase = 'lineup';
    this.loading = false;
    if (this.savedPhase === 'simulating' || this.savedPhase === 'results' || this.shared) await this.simulate();
   } else if (this.draft.currentRoll) {
    this.phase = 'choosing';
    await this.loadPool();
   } else this.phase = 'ready';
  } catch (error) {
   if (epoch !== this.epoch) return;
   this.error = error instanceof Error ? error.message : 'Could not restore the draft';
   this.retryAction = 'resume';
  } finally { if (epoch === this.epoch) this.loading = false; }
 }
 requestNew(): void {
  if (this.loading) return;
  const active = this.draft ?? this.savedDraft;
  if (active && this.phase !== 'results') { this.confirmNew = true; return; }
  void this.startNew();
 }
 async startNew(): Promise<void> {
  if (!this.manifest || this.loading) return;
  this.stopRun();
  const epoch = ++this.epoch;
  if (location.pathname.startsWith('/r/')) {
   this.loading = true;
   try { await goto('/?new=1', { replaceState: true }); }
   catch (error) {
    if (epoch === this.epoch) this.error = error instanceof Error ? error.message : 'Could not start a new draft';
   } finally { if (epoch === this.epoch) this.loading = false; }
   return;
  }
  if (location.hash) {
   this.loading = true;
   try { await goto(location.pathname + location.search, { shallow: true, replace: true, reset: false }); }
   catch (error) {
    if (epoch === this.epoch) this.error = error instanceof Error ? error.message : 'Could not start a new draft';
    return;
   } finally { if (epoch === this.epoch) this.loading = false; }
   if (epoch !== this.epoch) return;
  }
  this.shared = false;
  this.draft = createDraft(this.manifest, newSeed());
  this.savedDraft = null;
  this.selected.clear();
  this.profiles = [];
  this.pool = [];
  this.result = null;
  this.simulationInput = null;
  this.shareLink = '';
  this.shareStatus = '';
  this.error = '';
  this.incompatible = false;
  this.confirmNew = false;
  this.phase = 'ready';
  this.save('draft');
  await this.roll();
 }
 async roll(): Promise<void> {
  if (this.busy || this.phase !== 'ready' || !this.draft || !this.manifest) return;
  const epoch = this.epoch;
  this.error = '';
  try {
   this.draft = rollDraft(this.draft, this.manifest);
   this.save('draft'); // The committed roll survives reload before any reveal choreography.
   this.phase = 'revealing';
   this.pool = [];
   const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
   const reveal = Promise.withResolvers<void>();
   setTimeout(reveal.resolve, reduced ? 0 : 550);
   await Promise.all([this.loadPool(), reveal.promise]);
   if (epoch !== this.epoch) return;
   this.phase = 'choosing';
   const roll = this.draft.currentRoll!;
   this.announce = `${this.manifest.franchises.find(franchise => franchise.id === roll.franchiseId)?.name}, ${this.manifest.coverage.find(coverage => coverage.decade === roll.decade)?.label}. Choose your player season.`;
  } catch (error) {
   if (epoch !== this.epoch) return;
   this.phase = this.draft.currentRoll ? 'choosing' : 'ready';
   this.error = error instanceof Error ? error.message : 'Could not reveal the roll';
   this.retryAction = this.draft.currentRoll ? 'pool' : null;
  }
 }
 private async loadPool(): Promise<void> {
  if (!this.manifest || !this.draft?.currentRoll) return;
  this.loading = true;
  const epoch = this.epoch;
  try {
   const pool = await loadChunk(this.manifest, this.draft.currentRoll);
   if (epoch === this.epoch) { this.pool = pool; this.retryAction = null; }
  } finally { if (epoch === this.epoch) this.loading = false; }
 }
 commit(seasonId: string, slot: Slot): void {
  if (this.busy || this.phase !== 'choosing' || !this.draft || !this.manifest) return;
  try {
   const profile = this.pool.find(profile => profile.seasonId === seasonId);
   if (!profile) throw new Error('Choose a loaded season from the current roll');
   this.draft = commitPick(this.draft, this.manifest, seasonId, slot);
   this.simulationInput = null;
   this.selected.set(seasonId, profile);
   this.profiles = [...this.selected.values()];
   this.pool = [];
   this.phase = this.draft.picks.length === draftRules(this.draft.schemaVersion).slots.length ? 'lineup' : 'ready';
   this.error = '';
   this.announce = `${profile.displayName}, ${profile.year}, drafted at ${slot}. ${this.draft.picks.length} of ${draftRules(this.draft.schemaVersion).slots.length} picks complete.`;
   this.save(this.phase === 'lineup' ? 'lineup' : 'draft');
  } catch (error) { this.error = error instanceof Error ? error.message : 'Could not commit the pick'; }
 }
 reassign(seasonId: string, destination: HitterSlot): void {
  if (this.busy || this.shared || !['ready', 'choosing', 'lineup'].includes(this.phase) || !this.draft || !this.manifest) return;
  try {
   const origin = this.draft.picks.find(pick => pick.seasonId === seasonId)?.slot;
   const occupant = this.draft.picks.find(pick => pick.slot === destination);
   const next = reassignPick(this.draft, this.manifest, seasonId, destination);
   if (next === this.draft) return;
   this.draft = next;
   this.simulationInput = null;
   this.error = '';
   const name = this.selected.get(seasonId)?.displayName ?? 'Selected player';
   const otherName = occupant ? this.selected.get(occupant.seasonId)?.displayName ?? 'Other player' : '';
   this.announce = occupant
    ? `${name} swapped to ${destination}; ${otherName} moved to ${origin}.`
    : `${name} moved from ${origin} to ${destination}.`;
   this.save(this.phase === 'lineup' ? 'lineup' : 'draft');
  } catch (error) { this.error = error instanceof Error ? error.message : 'Could not change the assignment'; }
 }
 order(kind: 'batting' | 'starter', order: string[]): void {
  if (this.phase !== 'lineup' || !this.draft || !this.manifest || this.loading) return;
  try {
   this.draft = validateDraft({ ...this.draft, [kind === 'batting' ? 'battingOrder' : 'starterOrder']: order }, this.manifest, true);
   this.simulationInput = null;
   this.save('lineup');
  } catch (error) { this.error = error instanceof Error ? error.message : 'Invalid lineup'; }
 }
 async simulate(): Promise<void> {
  if (!this.draft || !this.manifest || this.loading || this.worker) return;
  this.phase = 'simulating';
  this.loading = true;
  this.error = '';
  this.completed = 0;
  this.revealed = 0;
  this.result = null;
  this.skipReveal = matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.save('simulating');
  const epoch = this.epoch;
  try {
   if (!this.simulationInput) {
    const data = await loadSimulation(this.manifest);
    if (epoch !== this.epoch) return;
    this.simulationInput = prepareSeasonInput(this.draft, this.profiles, data);
   }
   const runId = ++this.runId;
   const worker = new Worker(new URL('../sim/season.worker.ts', import.meta.url), { type: 'module' });
   this.worker = worker;
   worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    if (message.runId !== this.runId || epoch !== this.epoch) return;
    if (message.type === 'progress') this.completed = message.completed;
    else if (message.type === 'error') this.failRun(message.message);
    else {
     this.result = message.result;
     this.completed = 162;
     this.worker?.terminate();
     this.worker = null;
     this.save('results');
     if (this.skipReveal) this.showResults();
     else this.revealTimer = window.setInterval(() => {
      this.revealed = Math.min(162, this.revealed + 1);
      if (this.revealed === 162) this.showResults();
     }, 35);
    }
   };
   worker.onerror = () => {
    if (runId === this.runId && epoch === this.epoch) this.failRun('Simulation worker failed. Retry runs the identical season inputs.');
   };
   worker.onmessageerror = () => {
    if (runId === this.runId && epoch === this.epoch) this.failRun('Simulation worker response could not be read. Please retry.');
   };
   worker.postMessage({ runId, input: this.simulationInput });
   this.retryAction = null;
  } catch (error) {
   if (epoch === this.epoch) this.failRun(error instanceof Error ? error.message : 'Could not start the season');
  } finally { if (epoch === this.epoch) this.loading = false; }
 }
 private failRun(message: string): void {
  this.stopRun();
  this.error = message;
  this.loading = false;
  this.retryAction = 'simulation';
 }
 private showResults(): void {
  if (!this.result) return;
  clearInterval(this.revealTimer);
  this.revealTimer = undefined;
  this.revealed = 162;
  this.phase = 'results';
  this.announce = `Season complete: ${this.result.wins} wins, ${this.result.losses} losses.`;
 }
 skip(): void { this.skipReveal = true; if (this.result) this.showResults(); }
 async share(): Promise<void> {
  if (!this.draft || !this.result || this.loading || this.sharing) return;
  this.sharing = true;
  this.shareStatus = 'Uploading replay…';
  try {
   const link = await shareUrl(this.draft, location.origin);
   this.shareLink = link;
   try {
    await navigator.clipboard.writeText(link);
    this.shareStatus = 'Replay link copied. Your friend will recompute the same season.';
   } catch {
    this.shareStatus = 'Clipboard unavailable. Select and copy the replay link below.';
   }
  } catch (error) {
   this.shareLink = '';
   this.shareStatus = `${error instanceof Error ? error.message : 'Could not upload replay.'} Select Share result to retry.`;
  } finally {
   this.sharing = false;
  }
 }
 async retry(): Promise<void> {
  if (this.loading) return;
  this.error = '';
  try {
   if (this.retryAction === 'initialize') await this.initialize();
   else if (this.retryAction === 'resume') await this.restoreActive();
   else if (this.retryAction === 'pool') { await this.loadPool(); this.phase = 'choosing'; }
   else if (this.retryAction === 'simulation') await this.simulate();
  } catch (error) { this.error = error instanceof Error ? error.message : 'Retry failed. Your draft is preserved.'; }
 }
 private stopRun(): void {
  this.worker?.terminate();
  this.worker = null;
  ++this.runId;
  clearInterval(this.revealTimer);
  this.revealTimer = undefined;
 }
 dispose(): void { ++this.epoch; this.stopRun(); }
}
