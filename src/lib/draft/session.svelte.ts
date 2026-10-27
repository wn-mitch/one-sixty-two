import { loadManifest, loadSimulation } from '../game/data.ts';
import type { Manifest, Position, Profile, SimulationData } from '../game/types.ts';
import { LEAGUE_SEGMENTS, SEGMENT_MATCHDAYS, type Fixture, type LeagueSegmentResult, type LeagueWorkerResponse } from '../sim/league-types.ts';
import { appSettings, PLAYBACK_DURATION_MS } from '../game/settings.svelte.ts';
import { deviceDb } from '../storage/db.ts';
import type { Db } from '../storage/sql.ts';
import { refreshShop } from '../cosmetics/store.svelte.ts';
import type { SeasonReward } from '../cosmetics/ledger.ts';
import { finishReward } from './report.ts';
import { stickersFromSeason, type NewSticker } from '../collection/collection.ts';
import { stickerDefinition } from '../collection/stickers.ts';
import type { StackRole } from './cleanup.ts';
import { seatTable } from './franchises.ts';
import { dropPush, PushError, takePush, type PushKind } from './injuries.ts';
import { closeChapter, fieldedIds, LEAGUE_VERSION, LineupError, lockFunding, recordSegment, voteFunding, seasonStop, segmentInput, setLineup, standings, startLeague, type ClubLineup, type LeagueSeason } from './league.ts';
import { loadDraftCards, loadParkFits, ProfileStore } from './load.ts';
import { applyAction, newRunSetup, RunActionError, startRun, unsupportedVersion, type DraftRun, type RunAction, type RunData, type RunSetup, type WindowOrders } from './run.ts';
import { archiveRun, getRun, latestRun, resumeRun, runSeasonKey, saveRun, seasonComplete } from './saves.ts';
import { aiShop, buyTraining, learnedPositions, ShopError } from './shop.ts';
import type { Funding } from './packages.ts';
import type { TrainingKind } from './training.ts';
import type { Difficulty } from './scouting.ts';
import type { DraftCard, DraftSlot } from './types.ts';
import { DRAFT_RULES } from './rules.ts';

export type DraftScreen = 'loading' | 'entry' | 'drafting' | 'window' | 'season' | 'playing' | 'report';

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
 lastSegment = $state.raw<LeagueSegmentResult | null>(null);
 /** The season's fixtures, known once a segment has been played in this tab. */
 schedule = $state.raw<Fixture[][] | null>(null);
 /** The player's games revealed so far, counted from the first game of the season. */
 revealed = $state(0);
 /** A played segment's games are being revealed before the next stop. */
 revealing = $state(false);
 /** Tokens the finishing save granted, shown once on the report; null after a reload. */
 reward = $state.raw<SeasonReward | null>(null);
 /** Stickers the finished season put on its cards. */
 earned = $state.raw<NewSticker[]>([]);
 #revealTimer: number | undefined;
 /** Skip was pressed while the segment simulated, so its games appear at once. */
 #skipReveal = false;
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
  // A chapter stop's market opens as the segment is recorded; its games reveal first.
  if (this.playing || this.revealing) return 'playing';
  if (run.phase === 'window') return 'window';
  return (this.season?.segments.length ?? 0) >= LEAGUE_SEGMENTS ? 'report' : 'season';
 }

 /** The game shell's name for a failure, shown in its error dialog. */
 get error(): string { return this.failure; }
 set error(message: string) { this.failure = message; }
 /** A failed segment can be played again; a failed load needs a reload. */
 get canRetry(): boolean { return !!this.failure && !!this.season; }

 async retry(): Promise<void> {
  this.failure = '';
  await this.playSegment();
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
  this.reward = null;
  this.earned = [];
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
      if (seasonComplete(this.season)) await this.#loadEarned();
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
   this.lastSegment = null;
   this.schedule = null;
   this.refused = '';
   this.revision++;
   await this.#save();
  } finally { this.busy = false; }
 }

 /** Leaves the current run as history without making it the next automatic resume. */
 async abandon(): Promise<void> {
  this.#stopWorker();
  this.#stopReveal();
  // A failed final history write must remain recoverable before leaving the report.
  if ((this.season?.segments.length ?? 0) >= LEAGUE_SEGMENTS && !await this.#save()) return;
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
  this.lastSegment = null;
  this.schedule = null;
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
  else if (action.type === 'submit' && this.season) closeChapter(run, this.season);
  // The view changes once the action is saved, so what the player sees survives a reload.
  await this.#save();
  this.revision++;
  return null;
 }

 pick(cardId: string, slot: DraftSlot | null) { return this.act({ type: 'pick', cardId, slot }); }
 place(cardId: string, slot: DraftSlot | null) { return this.act({ type: 'place', cardId, slot }); }
 cut(cardId: string) { return this.act({ type: 'cut', cardId }); }
 propose(seat: number, give: string[], get: string[]) { return this.act({ type: 'propose', seat, give, get }); }
 respond(offer: number, accept: boolean) { return this.act({ type: 'respond', offer, accept }); }
 claim(cardId: string, on: boolean) { return this.act({ type: 'claim', cardId, on }); }
 closeWaivers() { return this.act({ type: 'waivers' }); }
 sign(cardId: string) { return this.act({ type: 'sign', cardId }); }
 cleanup(role: StackRole) { return this.act({ type: 'cleanup', role }); }
 autofix() { return this.act({ type: 'autofix' }); }
 order(orders: WindowOrders) { return this.act({ type: 'order', orders }); }
 submit(lineup: ClubLineup) { return this.act({ type: 'submit', lineup }); }

 /** Sets the player's lineup for the next segment; returns the refusal message, or null. */
 async lineup(lineup: ClubLineup): Promise<string | null> {
  if (!this.run || !this.season) return 'The season has not started';
  try { setLineup(this.run, this.season, lineup); }
  catch (error) { if (error instanceof LineupError) return error.message; throw error; }
  await this.#save();
  this.revision++;
  return null;
 }

 /** Buys a training, intensive or not, for one of the player's cards at this stop (cross-training teaches `position`); returns the refusal message, or null. */
 async train(cardId: string, kind: TrainingKind, intensive = false, position?: Position): Promise<string | null> {
  const run = this.run;
  const season = this.season;
  if (!run || !season || !this.profiles || this.playing) return 'The season is not at a stop';
  const [profile] = (await this.profiles.load([cardId])).values();
  if (!profile) return 'That card could not be loaded';
  try { buyTraining(run, season, run.seating.humanSeat, profile, kind, intensive, position); }
  catch (error) { if (error instanceof ShopError) return error.message; throw error; }
  await this.#save();
  this.revision++;
  return null;
 }

 /** Takes a push on one of the player's cards, or calls it off; returns the refusal message, or null. */
 async push(cardId: string, kind: PushKind, on: boolean): Promise<string | null> {
  const run = this.run;
  const season = this.season;
  if (!run || !season || this.playing) return 'The season is not at a stop';
  try {
   if (on) takePush(run, season, run.seating.humanSeat, cardId, kind);
   else dropPush(season, run.seating.humanSeat, cardId, kind);
  } catch (error) { if (error instanceof PushError) return error.message; throw error; }
  await this.#save();
  this.revision++;
  return null;
 }

 /** Casts the player's funding vote for the next chapter's home grounds; returns why it cannot. */
 async voteFunding(funding: Funding): Promise<string | null> {
  const run = this.run;
  const season = this.season;
  if (!run || !season || this.playing) return 'The season is not at a stop';
  try { voteFunding(run, season, funding); } catch (error) { if (error instanceof LineupError) return error.message; throw error; }
  await this.#save();
  this.revision++;
  return null;
 }

 /** Plays the next nine-game segment in a worker; resolves once it is recorded or fails. */
 async playSegment(): Promise<void> {
  const run = this.run;
  const season = this.season;
  const manifest = this.manifest;
  if (!run || !season || !manifest || this.playing || !this.profiles || run.phase !== 'season') return;
  this.playing = true;
  this.completed = 0;
  this.revealed = season.segments.length * SEGMENT_MATCHDAYS;
  this.#skipReveal = false;
  this.failure = '';
  try {
   this.#simulation ??= await loadSimulation(manifest);
   const rostered = season.lineups.flatMap(lineup => [...Object.values(lineup.active), ...lineup.reserves]);
   const profiles: Map<string, Profile> = await this.profiles.load(rostered);
   // AI clubs shop and push at this stop before its games; the player has already.
   aiShop(run, season, profiles);
   const missing = fieldedIds(run, season).filter(id => !profiles.has(id));
   if (missing.length) for (const [id, profile] of await this.profiles.load(missing)) profiles.set(id, profile);
   lockFunding(run, season, profiles);
   const names = run.seating.seats.map((_, seat) => this.clubName(seat));
   const input = segmentInput(run, season, profiles, this.#simulation, names);
   const { result, schedule } = await this.#simulate(input);
   this.schedule = schedule;
   recordSegment(run, season, result);
   this.lastSegment = result;
   const stop = seasonStop(season);
   if (stop.chapterStop && !stop.over) {
    // Payday is in; the chapter market opens next, the worst club first.
    const order = standings(season).map(row => row.seat).reverse();
    applyAction(run, { type: 'chapter', chapter: stop.chapter, order, lineup: structuredClone(season.lineups[run.seating.humanSeat]), learned: learnedPositions(season) });
   }
   const now = new Date();
   const saved = await this.#save(now, seasonId => { const profile = profiles.get(seasonId); return profile ? `${profile.displayName} ${profile.year}` : seasonId; });
   if (saved && seasonComplete(season)) {
    void refreshShop();
    if (this.#db && this.#runId) this.reward = await finishReward(this.#db, runSeasonKey(this.#runId), now.toISOString());
    await this.#loadEarned();
   }
   this.revision++;
   this.#reveal(season.segments.length * SEGMENT_MATCHDAYS);
  } catch (error) {
   this.failure = error instanceof Error ? error.message : 'The games could not be played.';
  } finally {
   this.playing = false;
  }
 }

 /** Lights the segment's games on the reel over the playback duration, then returns to the next stop. */
 #reveal(through: number): void {
  this.#stopReveal();
  this.revealed = through - SEGMENT_MATCHDAYS;
  if (this.#skipReveal || matchMedia('(prefers-reduced-motion: reduce)').matches) { this.revealed = through; return; }
  this.revealing = true;
  const from = this.revealed;
  const started = performance.now();
  const duration = PLAYBACK_DURATION_MS[appSettings.playbackSpeed];
  this.#revealTimer = window.setInterval(() => {
   const progress = Math.min(1, (performance.now() - started) / duration);
   this.revealed = Math.max(this.revealed, from + Math.round(SEGMENT_MATCHDAYS * (.5 - Math.cos(Math.PI * progress) / 2)));
   if (this.revealed >= through) this.skip();
  }, 16);
 }

 /** Ends the reveal at once, or skips it when the segment is still simulating. */
 skip(): void {
  if (this.playing) { this.#skipReveal = true; return; }
  this.#stopReveal();
  if (this.season) this.revealed = this.season.segments.length * SEGMENT_MATCHDAYS;
 }

 #stopReveal(): void {
  clearInterval(this.#revealTimer);
  this.#revealTimer = undefined;
  this.revealing = false;
 }

 #simulate(input: ReturnType<typeof segmentInput>): Promise<{ result: LeagueSegmentResult; schedule: Fixture[][] }> {
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
    else resolve({ result: message.result, schedule: message.schedule });
   };
   worker.onerror = () => { this.#stopWorker(); reject(new Error('The simulation worker failed. Play the games again to retry.')); };
   worker.postMessage({ runId, input });
  });
 }

 #stopWorker(): void {
  this.#worker?.terminate();
  this.#worker = null;
 }

 /** The stickers the finished season's save recorded, named from the card profiles. */
 async #loadEarned(): Promise<void> {
  if (!this.#db || !this.#runId || !this.profiles) return;
  try {
   const rows = await stickersFromSeason(this.#db, runSeasonKey(this.#runId));
   const profiles = await this.profiles.load(rows.map(row => row.seasonId));
   this.earned = rows.flatMap(({ seasonId, sticker }) => {
    const definition = stickerDefinition(sticker);
    const profile = profiles.get(seasonId);
    return definition ? [{ seasonId, kind: sticker.kind, title: definition.title, label: profile ? `${profile.displayName} ${profile.year}` : seasonId }] : [];
   });
  } catch { this.earned = []; }
 }

 async #save(now = new Date(), label?: (seasonId: string) => string): Promise<boolean> {
  if (!this.#db || !this.#runId || !this.run) {
   this.storageNotice = 'Your draft could not be saved. It continues in this tab.';
   return false;
  }
  const notice = await saveRun(this.#db, this.#runId, this.run, this.season, now, label);
  if (notice) this.storageNotice = notice;
  return notice === null;
 }

 dispose(): void { this.#stopWorker(); this.#stopReveal(); }
}
