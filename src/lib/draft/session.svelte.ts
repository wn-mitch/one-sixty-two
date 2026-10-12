import { loadManifest, loadSimulation } from '../game/data.ts';
import type { Manifest, Profile, SimulationData } from '../game/types.ts';
import { LEAGUE_CHAPTERS, type LeagueChapterResult, type LeagueWorkerResponse } from '../sim/league-types.ts';
import { deviceDb } from '../storage/db.ts';
import type { Db } from '../storage/sql.ts';
import type { StackRole } from './cleanup.ts';
import { seatTable } from './franchises.ts';
import { chapterInput, LineupError, recordChapter, setLineup, startLeague, type ClubLineup, type LeagueSeason } from './league.ts';
import { loadDraftCards, loadParkFits, ProfileStore } from './load.ts';
import { applyAction, newRunSetup, RunActionError, startRun, type DraftRun, type RunAction, type RunData, type RunSetup } from './run.ts';
import { deleteRun, latestRun, resumeRun, saveRun } from './saves.ts';
import type { Difficulty } from './scouting.ts';
import type { DraftCard, DraftSlot } from './types.ts';
import { DRAFT_RULES } from './rules.ts';

export type DraftScreen = 'loading' | 'failed' | 'entry' | 'drafting' | 'window' | 'season' | 'report';

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
  if (this.failure) return 'failed';
  if (!this.manifest) return 'loading';
  const run = this.run;
  if (!run) return 'entry';
  if (run.phase === 'drafting') return 'drafting';
  if (run.phase === 'window') return 'window';
  return (this.season?.chapters.length ?? 0) >= LEAGUE_CHAPTERS ? 'report' : 'season';
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
    const saved = await latestRun(db);
    if (saved) {
     const data = await this.#runData(manifest, saved.setup);
     const resumed = resumeRun(saved, data, manifest.dataVersion);
     if (resumed.ok) {
      this.#runId = saved.id;
      this.run = resumed.run;
      this.season = resumed.season ?? (resumed.run.phase === 'season' ? startLeague(resumed.run) : null);
     } else {
      this.refused = resumed.reason;
     }
    }
   } catch {
    this.storageNotice = 'Your draft could not be loaded from this browser. A new draft will not be saved.';
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

 /** Replaces any saved run with a new one at `franchiseId`. */
 async start(franchiseId: string, difficulty: Difficulty): Promise<void> {
  const manifest = this.manifest;
  if (!manifest || this.busy) return;
  this.busy = true;
  try {
   const seed = crypto.getRandomValues(new Uint32Array(1))[0];
   const setup = newRunSetup(seed, franchiseId, manifest.dataVersion, difficulty);
   const run = startRun(setup, await this.#runData(manifest, setup));
   if (this.#db && this.#runId) await deleteRun(this.#db, this.#runId).catch(() => undefined);
   this.#runId = crypto.randomUUID();
   this.run = run;
   this.season = null;
   this.lastChapter = null;
   this.refused = '';
   this.revision++;
   await this.#save();
  } finally { this.busy = false; }
 }

 /** Leaves the current run; the next start replaces its save. */
 async abandon(): Promise<void> {
  this.#stopWorker();
  if (this.#db && this.#runId) await deleteRun(this.#db, this.#runId).catch(() => undefined);
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

 pick(cardId: string) { return this.act({ type: 'pick', cardId }); }
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
   await this.#save();
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

 async #save(): Promise<void> {
  if (!this.#db || !this.#runId || !this.run) return;
  const notice = await saveRun(this.#db, this.#runId, this.run, this.season);
  if (notice) this.storageNotice = notice;
 }

 dispose(): void { this.#stopWorker(); }
}
