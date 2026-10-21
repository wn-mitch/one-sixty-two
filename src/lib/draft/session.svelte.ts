import { loadManifest, loadSimulation } from '../game/data.ts';
import type { Manifest, Profile, SimulationData } from '../game/types.ts';
import { LEAGUE_CHAPTERS, type LeagueChapterResult, type LeagueWorkerResponse } from '../sim/league-types.ts';
import { deviceDb } from '../storage/db.ts';
import type { Db } from '../storage/sql.ts';
import { refreshShop } from '../cosmetics/store.svelte.ts';
import type { StackRole } from './cleanup.ts';
import { seatTable } from './franchises.ts';
import { chapterInput, LEAGUE_VERSION, LineupError, recordChapter, setLineup, startLeague, type ClubLineup, type LeagueSeason } from './league.ts';
import { loadDraftCards, loadParkFits, ProfileStore } from './load.ts';
import { applyAction, newRunSetup, RunActionError, startRun, unsupportedVersion, type DraftRun, type RunAction, type RunData, type RunSetup } from './run.ts';
import { archiveRun, getRun, latestRun, resumeRun, saveRun } from './saves.ts';
import type { Difficulty } from './scouting.ts';
import type { DraftCard, DraftSlot } from './types.ts';
import { DRAFT_RULES } from './rules.ts';

export type DraftScreen = 'loading' | 'entry' | 'drafting' | 'window' | 'season' | 'report';

/**
 * Draft Mode in the browser: one active run per device, saved after every action. The run is a
 * plain mutable object, so `revision` changes after each mutation for views to re-read it.
 */
export class DraftModeSession {
 manifest = $state.raw<Manifest | null>(null);
 run = $state.raw<DraftRun | null>(null);
 season = $state.raw<LeagueSeason | null>(null);
 revision = $state(0);
 /** Data or engine failure that blocks the screen. */
 failure = $state('');
 /** Why a saved run could not resume; the player starts a new one. */
 refused = $state('');
 storageNotice = $state('');
 busy = $state(false);
 /** New draft was requested over an unfinished run and waits for the player to confirm. */
 confirmNew = $state(false);
 playing = $state(false);
 completed = $state(0);
 lastChapter = $state.raw<LeagueChapterResult | null>(null);
 profiles: ProfileStore | null = null;
 #cards: DraftCard[] = [];
 #db: Db | null = null;
 #runId: string | null = null;
 #simulation: SimulationData | null = null;
 #worker: Worker | null = null;
 #workerRun = 0;

 get screen(): DraftScreen {
  void this.revision;
  if (!this.manifest) return 'loading';
  const run = this.run;
  if (!run) return 'entry';
  if (run.phase === 'drafting') return 'drafting';
  if (run.phase === 'window') return 'window';
  return (this.season?.chapters.length ?? 0) >= LEAGUE_CHAPTERS ? 'report' : 'season';
 }

 /** The game shell's name for a failure, shown in its error dialog. */
 get error(): string { return this.failure; }
 set error(message: string) { this.failure = message; }
 /** A failed chapter can be played again; a failed load needs a reload. */
 get canRetry(): boolean { return !!this.failure && !!this.season; }

 async retry(): Promise<void> {
  this.failure = '';
  await this.playChapter();
 }

 /** New draft from the site menu: an unfinished run asks first, a finished report starts over at once. */
 requestNew(): void {
  if (!this.run) return;
  if (this.screen !== 'report') { this.confirmNew = true; return; }
  void this.startNew();
 }

 /** Leaves the run as history and returns to the franchise choice. */
 async startNew(): Promise<void> {
  this.confirmNew = false;
  await this.abandon();
  if (this.run) return;
  const url = new URL(location.href);
  url.searchParams.delete('run');
  history.replaceState(history.state, '', url);
  window.scrollTo({ top: 0 });
 }

 /** Display name of the club at `seat`. */
 clubName(seat: number): string {
  const id = this.run?.seating.seats[seat];
  return this.manifest?.franchises.find(franchise => franchise.id === id)?.name ?? id ?? '';
 }

 async initialize(): Promise<void> {
  try {
   const manifest = await loadManifest();
   this.#cards = await loadDraftCards(manifest);
   this.profiles = new ProfileStore(manifest);
   try {
    const { db, notice } = await deviceDb();
    this.#db = db;
    if (notice) this.storageNotice = notice;
    const historyId = new URLSearchParams(location.search).get('run');
    const saved = historyId ? await getRun(db, historyId) : await latestRun(db);
    if (historyId && !saved) this.refused = 'This saved draft could not be found on this device.';
    if (saved) {
     const stale = unsupportedVersion(saved.setup, manifest.dataVersion);
     const reason = stale
      ? `This draft was saved with ${stale} that this version of the game no longer uses. Start a new draft.`
      : saved.season && saved.season.version !== LEAGUE_VERSION
       ? 'This season was saved with league rules this version of the game no longer uses. Start a new draft.' : null;
     const resumed = reason ? { ok: false as const, reason }
      : resumeRun(saved, await this.#runData(manifest, saved.setup), manifest.dataVersion);
     if (resumed.ok) {
      this.#runId = saved.id;
      this.run = resumed.run;
      this.season = resumed.season ?? (resumed.run.phase === 'season' ? startLeague(resumed.run) : null);
     } else {
      this.refused = resumed.reason;
      if (!historyId) {
       try { await archiveRun(db, saved); }
       catch { this.storageNotice = 'The older draft is still saved because browser storage could not retire its resume slot.'; }
      }
     }
    }
   } catch {
    this.storageNotice = 'Your saved draft could not be loaded. Its stored history has not been changed.';
   }
   this.manifest = manifest;
  } catch (error) {
   this.failure = error instanceof Error ? error.message : 'Draft Mode could not load.';
  }
 }

 async #runData(manifest: Manifest, setup: RunSetup): Promise<RunData> {
  const franchiseIds = manifest.franchises.map(franchise => franchise.id);
  const seating = seatTable(setup.seed, setup.franchiseId, franchiseIds, DRAFT_RULES.seats);
  const fits = await loadParkFits(manifest, seating.seats);
  return {
   cards: this.#cards, franchiseIds,
   parkFit: (franchiseId, seasonId) => {
    const fit = fits.get(franchiseId);
    if (!fit) throw new Error(`No park fit loaded for ${franchiseId}`);
    return fit.get(seasonId) ?? 0;
   }
  };
 }

 /** Starts a new run while retaining the previous run as history. */
 async start(franchiseId: string, difficulty: Difficulty): Promise<void> {
  const manifest = this.manifest;
  if (!manifest || this.busy) return;
  this.busy = true;
  try {
   const seed = crypto.getRandomValues(new Uint32Array(1))[0];
   const setup = newRunSetup(seed, franchiseId, manifest.dataVersion, difficulty);
   const run = startRun(setup, await this.#runData(manifest, setup));
   if (this.#db && this.#runId) {
    try {
     const saved = await getRun(this.#db, this.#runId);
     if (saved) await archiveRun(this.#db, saved);
    } catch {
     this.storageNotice = 'A new draft could not replace the current resume slot. Your current draft is still available.';
     return;
    }
   }
   this.#runId = crypto.randomUUID();
   this.run = run;
   this.season = null;
   this.lastChapter = null;
   this.refused = '';
   this.revision++;
   await this.#save();
  } finally { this.busy = false; }
 }

 /** Leaves the current run as history without making it the next automatic resume. */
 async abandon(): Promise<void> {
  this.#stopWorker();
  // A failed final history write must remain recoverable before leaving the report.
  if ((this.season?.chapters.length ?? 0) >= LEAGUE_CHAPTERS && !await this.#save()) return;
  if (this.#db && this.#runId) {
   try {
    const saved = await getRun(this.#db, this.#runId);
    if (saved) await archiveRun(this.#db, saved);
   } catch {
    this.storageNotice = 'Your draft could not be left because browser storage is unavailable. It is still available to resume.';
    return;
   }
  }
  this.#runId = null;
  this.run = null;
  this.season = null;
  this.lastChapter = null;
  this.revision++;
 }

 /** Applies one run action; returns the refusal message, or null. */
 async act(action: RunAction): Promise<string | null> {
  const run = this.run;
  if (!run) return 'No draft is in progress';
  try {
   applyAction(run, action);
  } catch (error) {
   if (error instanceof RunActionError) return error.message;
   throw error;
  }
  if (run.phase === 'season' && !this.season) this.season = startLeague(run);
  // The view changes once the action is saved, so what the player sees survives a reload.
  await this.#save();
  this.revision++;
  return null;
 }

 pick(cardId: string, slot: DraftSlot | null) { return this.act({ type: 'pick', cardId, slot }); }
 place(cardId: string, slot: DraftSlot | null) { return this.act({ type: 'place', cardId, slot }); }
 cut(cardId: string) { return this.act({ type: 'cut', cardId }); }
 cleanup(role: StackRole) { return this.act({ type: 'cleanup', role }); }
 autofix() { return this.act({ type: 'autofix' }); }
 submit(active: Record<DraftSlot, string>, reserves: string[]) { return this.act({ type: 'submit', active, reserves }); }

 /** Sets the player's lineup for the next chapter; returns the refusal message, or null. */
 async lineup(lineup: ClubLineup): Promise<string | null> {
  if (!this.run || !this.season) return 'The season has not started';
  try { setLineup(this.run, this.season, lineup); }
  catch (error) { if (error instanceof LineupError) return error.message; throw error; }
  await this.#save();
  this.revision++;
  return null;
 }

 /** Plays the next chapter in a worker; resolves once it is recorded or fails. */
 async playChapter(): Promise<void> {
  const run = this.run;
  const season = this.season;
  const manifest = this.manifest;
  if (!run || !season || !manifest || this.playing || !this.profiles) return;
  this.playing = true;
  this.completed = 0;
  this.failure = '';
  try {
   this.#simulation ??= await loadSimulation(manifest);
   const active = season.lineups.flatMap(lineup => Object.values(lineup.active));
   const profiles: Map<string, Profile> = await this.profiles.load(active);
   const names = run.seating.seats.map((_, seat) => this.clubName(seat));
   const input = chapterInput(run, season, profiles, this.#simulation, names);
   const result = await this.#simulate(input);
   recordChapter(season, result);
   this.lastChapter = result;
   const saved = await this.#save();
   if (saved && season.chapters.length >= LEAGUE_CHAPTERS) void refreshShop();
   this.revision++;
  } catch (error) {
   this.failure = error instanceof Error ? error.message : 'The chapter could not be played.';
  } finally {
   this.playing = false;
  }
 }

 #simulate(input: ReturnType<typeof chapterInput>): Promise<LeagueChapterResult> {
  this.#stopWorker();
  const runId = ++this.#workerRun;
  const worker = new Worker(new URL('../engine/league.worker.ts', import.meta.url), { type: 'module' });
  this.#worker = worker;
  return new Promise((resolve, reject) => {
   worker.onmessage = (event: MessageEvent<LeagueWorkerResponse>) => {
    const message = event.data;
    if (message.runId !== runId) return;
    if (message.type === 'progress') { this.completed = message.completed; return; }
    this.#stopWorker();
    if (message.type === 'error') reject(new Error(message.message));
    else resolve(message.result);
   };
   worker.onerror = () => { this.#stopWorker(); reject(new Error('The simulation worker failed. Play the chapter again to retry.')); };
   worker.postMessage({ runId, input });
  });
 }

 #stopWorker(): void {
  this.#worker?.terminate();
  this.#worker = null;
 }

 async #save(): Promise<boolean> {
  if (!this.#db || !this.#runId || !this.run) {
   this.storageNotice = 'Your draft could not be saved. It continues in this tab.';
   return false;
  }
  const notice = await saveRun(this.#db, this.#runId, this.run, this.season);
  if (notice) this.storageNotice = notice;
  return notice === null;
 }

 dispose(): void { this.#stopWorker(); }
}
