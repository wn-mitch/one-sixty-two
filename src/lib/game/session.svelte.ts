import { goto } from '$app/navigation';
import { loadRollProfiles, loadDraftProfiles, loadManifest, loadSimulation } from './data.ts';
import { addPack, choosePack, commitPick, createDailyDraft, createDraft, reassignPick, rollDraft, rollLabel, selectHomeStadium, validateDraft, validateReplay } from './draft.ts';
import { dailyRewardKey, libraryKey, saveSeason } from './library.ts';
import { newCards, newStickers, type NewCard, type NewSticker } from '../collection/collection.ts';
import { refreshStickers } from '../collection/store.svelte.ts';
import { refreshShop } from '../cosmetics/store.svelte.ts';
import { grantedReward, type SeasonReward } from '../cosmetics/ledger.ts';
import { loadDailyStandings, type DailyStandingsView } from './standings.ts';
import { submitStadiumRun, type StadiumStandingsView } from './stadium-standings.ts';
import { clearCompletedDraft, DAILY_STORAGE_NOTICE, persistDraft, restoreDaily, restoreDraft, RESUME_NOTICE, type DailyRun, type Restore, type SavedPhase } from './persistence.ts';
import { dailyDate, dailyLabel, dailyStadium } from './daily.ts';
import { deviceDb } from '../storage/db.ts';
import { newSeed } from './random.ts';
import { challengeFor, claimChallenge, type Challenge } from './challenge.ts';
import {
 beginCopyPublishedImage,
 challengeUrl,
 copyShareLink,
 decodeReplay,
 downloadPublishedImage,
 isShareIncompatibility,
 publishShare,
 requestNativeShare,
 storeReplay,
 supportsImageClipboard
} from './share.ts';
import { draftRules } from './rules.ts';
import { appSettings, PLAYBACK_DURATION_MS } from './settings.svelte.ts';
import type { Draft, HitterSlot, Manifest, Profile, ReliefAssignment, Slot } from './types.ts';
import { prepareSeasonInput } from './season-input.ts';
import type { SeasonInput, SeasonResult, WorkerResponse } from '../sim/types.ts';
import { PUBLISHED_FORMATS, type ShareAction, type ShareFormat, type SharePublication, type ShareRenderModel } from '../share/types.ts';
import { holdRasterization, renderSharePng, slowCaptureDevice, untilRasterAllowed, warmShareCapture } from '../share/render.ts';
import { createShareRenderModel, shareImageUrls } from '../share/model.ts';
import { loadMedia } from '../media/client.ts';
import type { MediaManifest } from '../media/types.ts';
import { loadRankings } from '../rankings/client.ts';
import type { WarRankings } from '../rankings/types.ts';

export type Phase = 'start' | 'stadium' | 'ready' | 'revealing' | 'choosing' | 'lineup' | 'simulating' | 'results';

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
 resumeNotice = $state('');
 announce = $state('');
 confirmNew = $state(false);
 completed = $state(0);
 revealed = $state(0);
 shareLink = $state('');
 shareStatus = $state('');
 sharing = $state(false);
 publication = $state.raw<SharePublication | null>(null);
 /** Stickers the finished season earned for the first time, for Results. */
 newStickers = $state.raw<NewSticker[]>([]);
 /** Player-seasons this season added to the collection for the first time. */
 newCards = $state.raw<NewCard[]>([]);
 /** Tokens this season's save granted just now; null until saved, and nothing new on a revisit. */
 reward = $state.raw<SeasonReward | null>(null);
 /** Today's daily and this device's run of it; null until read. */
 daily = $state.raw<{ date: string; run: DailyRun } | null>(null);
 /** Where this device's finished daily stands among the day's runs; null until loaded or when it cannot count. */
 dailyStandings = $state.raw<DailyStandingsView | null>(null);
 /** Where the finished own season stands among every run at its home park; null until the server answers. */
 stadiumStandings = $state.raw<StadiumStandingsView | null>(null);
 nativeShareReady = $state(false);
 imageDownloadFallback = $state(false);
 textCopyFallback = $state(false);
 private selected = new Map<string, Profile>();
 /** The Classic draft's last saved phase. */
 private savedPhase: SavedPhase = 'draft';
 /** The phase the draft being resumed was saved at, Classic or daily. */
 private resumePhase: SavedPhase = 'draft';
 private archivedDraft: Draft | null = null;
 private savePending: Promise<void> = Promise.resolve();
 get canAutoResume(): boolean { return !!this.savedDraft && this.savedPhase !== 'results'; }
 private retryAction = $state<'initialize' | 'pool' | 'resume' | 'simulation' | null>(null);
 shared = false;
 private epoch = 0;
 private runId = 0;
 private shareRequest = 0;
 private shareReplayId: string | null = null;
 private replayRequest: { epoch: number; promise: Promise<{ replayId: string; replayUrl: string }> } | null = null;
 private publicationRequest: { epoch: number; promise: Promise<SharePublication> } | null = null;
 /** Releases the share renderer's drawing step once season playback stops animating. */
 private releaseRaster: (() => void) | null = null;
 private shareAssets: { epoch: number; assets: Promise<{ media: MediaManifest | null; rankings: WarRankings | null }> } | null = null;
 private worker: Worker | null = null;
 private revealTimer: number | undefined;
 private simulationInput: SeasonInput | null = null;
 private skipReveal = false;
 get busy(): boolean { return this.loading || this.phase === 'revealing' || this.phase === 'simulating'; }
 get canRetry(): boolean { return this.retryAction !== null; }
 private clearShareState(): void {
  ++this.shareRequest;
  this.publication = null;
  this.shareReplayId = null;
  this.replayRequest = null;
  this.publicationRequest = null;
  this.shareAssets = null;
  this.shareLink = '';
  this.shareStatus = '';
  this.sharing = false;
  this.nativeShareReady = false;
  this.imageDownloadFallback = false;
  this.textCopyFallback = false;
 }

 private shareIsCurrent(request: number, epoch: number): boolean {
  return request === this.shareRequest && epoch === this.epoch;
 }

 /** Stores the replay once per finished season; links need only its id, so they never wait on images. */
 private replayLink(draft: Draft): Promise<{ replayId: string; replayUrl: string }> {
  if (this.shareReplayId) {
   return Promise.resolve({ replayId: this.shareReplayId, replayUrl: new URL(`/r/${this.shareReplayId}`, location.origin).href });
  }
  const epoch = this.epoch;
  // A request from an earlier epoch (the player left and came back) is never reused.
  if (this.replayRequest?.epoch !== epoch) {
   const promise = storeReplay(draft, location.origin).then(stored => {
    if (epoch === this.epoch) this.shareReplayId = stored.id;
    return { replayId: stored.id, replayUrl: stored.replayUrl };
   }).catch(error => {
    if (this.replayRequest?.promise === promise) this.replayRequest = null;
    throw error;
   });
   this.replayRequest = { epoch, promise };
  }
  return this.replayRequest.promise;
 }

 private async prepareCurrentPublication(draft: Draft, model: ShareRenderModel, epoch: number): Promise<SharePublication> {
  const { replayId } = await this.replayLink(draft);
  if (epoch !== this.epoch) throw new Error('Share request was replaced');
  // Both share formats publish together, so the player can switch between them without another upload,
  // with the landscape link preview that unfurls the season's links. The renderer runs their stages one
  // at a time, each at an idle moment, and holds the long drawing step while playback animates.
  const [field, fan, og] = await Promise.all(PUBLISHED_FORMATS.map(format => renderSharePng(model, format)));
  if (epoch !== this.epoch) throw new Error('Share request was replaced');
  return publishShare(replayId, location.origin, model.record, { field, fan, og });
 }

 /** Publishes the share images once; links already work without them, and gain the season preview when this lands. */
 private publishImages(draft: Draft, model: ShareRenderModel): Promise<SharePublication> {
  if (this.publication) return Promise.resolve(this.publication);
  const epoch = this.epoch;
  if (this.publicationRequest?.epoch !== epoch) {
   const promise = this.prepareCurrentPublication(draft, model, epoch).then(publication => {
    if (epoch === this.epoch) this.publication = publication;
    return publication;
   }).catch(error => {
    if (this.publicationRequest?.promise === promise) this.publicationRequest = null;
    throw error;
   });
   this.publicationRequest = { epoch, promise };
  }
  return this.publicationRequest.promise;
 }

 /**
  * Starts fetching and decoding everything the share artwork needs as the season starts simulating:
  * media, rankings, the rasterizer, fonts, and the roster's photos and marks.
  */
 private warmShare(draft: Draft, manifest: Manifest): void {
  if (this.shared) return;
  // Measured before playback starts, so the probe itself never costs a playback frame.
  slowCaptureDevice();
  const profiles = this.profiles;
  const assets = Promise.all([
   loadMedia().catch(() => null),
   loadRankings(draft.dataVersion).catch(() => null)
  ]).then(([media, rankings]) => ({ media, rankings }));
  this.shareAssets = { epoch: this.epoch, assets };
  void assets.then(({ media, rankings }) => warmShareCapture(shareImageUrls({ draft, profiles, manifest, media, rankings }))).catch(() => undefined);
 }

 /**
  * Publishes the season's images as soon as its result exists, while playback is still running, so the
  * Results screen and a link pasted from it already have them. Share actions reuse this work. A failure
  * stays silent; the next image action retries it. Someone else's replay is never published here.
  */
 private publishSeason(result: SeasonResult): void {
  if (this.shared || !this.draft || !this.manifest) return;
  const [draft, manifest, profiles, epoch] = [this.draft, this.manifest, this.profiles, this.epoch];
  if (this.shareAssets?.epoch !== epoch) this.warmShare(draft, manifest);
  // A device too slow to prepare captures without dropping playback frames starts them after playback.
  const ready = slowCaptureDevice() ? Promise.all([this.shareAssets!.assets, untilRasterAllowed()]).then(([assets]) => assets) : this.shareAssets!.assets;
  void ready.then(({ media, rankings }) => {
   if (epoch !== this.epoch) return;
   return this.publishImages(draft, createShareRenderModel({ draft, result, profiles, manifest, media, rankings }));
  }).catch(() => undefined);
 }

 async initialize(): Promise<void> {
  this.clearShareState();
  this.loading = true;
  this.error = '';
  const epoch = ++this.epoch;
  let resumeSaved = false;
  // `?build=1` (Build my team from another page) starts a team unless one is in progress, which stays for Resume.
  let buildRequested = false;
  try {
   const manifest = await loadManifest();
   if (epoch !== this.epoch) return;
   this.manifest = manifest;
   const sharedPath = location.pathname.match(/^\/r\/([A-Za-z0-9_-]{22})$/);
   const classicPath = location.pathname === '/' || location.pathname === '/classic';
   const forceNew = classicPath && new URLSearchParams(location.search).get('new') === '1';
   resumeSaved = classicPath && new URLSearchParams(location.search).get('resume') === '1';
   buildRequested = classicPath && new URLSearchParams(location.search).get('build') === '1';
   if (forceNew) {
    this.shared = false;
    this.draft = createDraft(manifest, newSeed());
    claimChallenge(this.draft.seed);
    this.savedDraft = null;
    this.phase = 'stadium';
    this.save('stadium');
    this.loading = false;
    return;
   }
   if (sharedPath) {
    this.shared = true;
    this.shareReplayId = sharedPath[1];
    const response = await fetch(`/api/replays/${sharedPath[1]}`);
    let payload: unknown = null;
    try { payload = await response.json(); } catch { /* preserve the safe status fallback */ }
    if (!response.ok) {
     if (response.status === 409) { this.incompatible = true; this.retryAction = null; }
     const message = payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
      ? payload.message
      : response.status === 409 ? 'Replay is incompatible with this dataset.' : 'Replay could not be loaded. Please retry.';
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
   let saved: Restore;
   try {
    const device = await deviceDb();
    if (device.notice) this.storageNotice = device.notice;
    saved = await restoreDraft(device.db, manifest);
   } catch { saved = { kind: 'unavailable', message: RESUME_NOTICE }; }
   if (epoch !== this.epoch) return;
   if (saved.kind === 'valid') {
    this.savedDraft = saved.draft;
    this.savedPhase = saved.phase;
    if (saved.notice) this.storageNotice = saved.notice;
    else if (saved.phase === 'results') this.storageNotice = 'This completed season still needs saving. Resume it to recover your results.';
   }
   else if (saved.kind === 'incompatible') this.resumeNotice = saved.message;
   else if (saved.kind === 'unavailable') this.storageNotice = saved.message;
   await this.refreshDaily();
   if (epoch !== this.epoch) return;
   this.retryAction = null;
  } catch (error) {
   if (epoch !== this.epoch) return;
   this.error = error instanceof Error ? error.message : 'Could not load game data. Please retry.';
   if (!this.incompatible) this.retryAction = this.draft ? 'resume' : 'initialize';
  } finally { if (epoch === this.epoch) this.loading = false; }
  // `/classic?resume=1` (answering a challenge with the draft in progress) skips the Resume button.
  if (resumeSaved && epoch === this.epoch && this.savedDraft) await this.resume();
  else if (buildRequested && epoch === this.epoch && !this.savedDraft && this.manifest && !this.error) await this.startNew();
 }
 /** Every completed season of the player's own draft joins the device library; viewed replays do not. */
 private async saveToLibrary(result: SeasonResult, epoch: number): Promise<void> {
  if (this.shared || !this.draft || !this.manifest) return;
  const { draft, profiles, manifest } = this;
  const now = new Date();
  await this.savePending;
  let notice: string | null;
  try {
   const { db } = await deviceDb();
   notice = await saveSeason(db, draft, result, profiles, manifest, now);
   if (!notice) {
    void refreshShop();
    try {
     const reward = await grantedReward(db, `classic:${await libraryKey(draft)}`, now.toISOString(), draft.daily === undefined ? null : dailyRewardKey(draft.daily));
     if (epoch === this.epoch) this.reward = reward;
    } catch { /* the reward is saved; only its announcement is lost */ }
    if (this.draft === draft) this.archivedDraft = draft;
    void this.refreshStadiumStandings(draft, result.wins);
    if (draft.daily === undefined) {
     if (this.savedDraft === draft) this.savedDraft = null;
     notice = await clearCompletedDraft(db, draft);
    } else {
     // The save recorded the day's result with the season.
     if (this.daily?.date === draft.daily) this.daily = { date: draft.daily, run: { kind: 'complete', record: { wins: result.wins, losses: result.losses }, draft } };
     void this.refreshDailyStandings(draft.daily);
    }
    try {
     const key = await libraryKey(draft);
     const [earned, added] = await Promise.all([newStickers(db, key, now.toISOString(), profiles), newCards(db, key, profiles)]);
     if (epoch === this.epoch) { this.newStickers = earned; this.newCards = added; }
     void refreshStickers();
    } catch {
     notice ??= 'Your season is in My teams, but its new collection items could not be loaded.';
    }
   }
  }
  catch { notice = 'Your season library is unavailable: browser storage is blocked or full.'; }
  if (notice && epoch === this.epoch) this.storageNotice = notice;
 }
 private save(phase: SavedPhase): void {
  if (!this.draft || this.shared) return;
  const draft = this.draft;
  const epoch = this.epoch;
  if (draft.daily === undefined) this.savedPhase = phase;
  else if (this.daily?.date === draft.daily && this.daily.run.kind !== 'complete') this.daily = { date: draft.daily, run: { kind: 'active', draft, phase } };
  // Writes queue in order on the database worker; the notice reflects the latest outcome.
  this.savePending = this.savePending.then(async () => {
   const notice = await deviceDb()
    .then(device => persistDraft(device.db, draft, phase).then(failure => failure ?? device.notice))
    .catch(() => RESUME_NOTICE);
   if (epoch === this.epoch) this.storageNotice = notice ?? '';
  });
 }
 private async hydrateRoster(): Promise<void> {
  if (!this.manifest || !this.draft) return;
  const manifest = this.manifest;
  const draft = this.draft;
  const epoch = this.epoch;
  const profiles = await loadDraftProfiles(manifest, draft);
  if (epoch !== this.epoch) return;
  this.selected.clear();
  for (const profile of profiles) this.selected.set(profile.seasonId, profile);
  this.profiles = [...this.selected.values()];
 }
 async resume(): Promise<void> {
  if (this.loading || !this.manifest || !this.savedDraft) return;
  this.clearShareState();
  this.draft = this.savedDraft;
  this.resumePhase = this.savedPhase;
  await this.restoreActive();
 }
 /** Reads today's daily from the device: on load, on returning home, and when the day turns over. */
 async refreshDaily(): Promise<void> {
  if (!this.manifest || this.shared) return;
  const manifest = this.manifest;
  const date = dailyDate();
  let run: DailyRun;
  try {
   await this.savePending;
   run = await restoreDaily((await deviceDb()).db, manifest, date);
  } catch { run = { kind: 'unavailable', message: DAILY_STORAGE_NOTICE }; }
  if (manifest !== this.manifest) return;
  // The run on screen is newer than any write still queued for it.
  if (this.draft?.daily === date && this.phase !== 'start') return;
  this.daily = { date, run };
  if (run.kind === 'unplayed' && run.notice) this.resumeNotice = run.notice;
  if (run.kind === 'complete') void this.refreshDailyStandings(date);
 }
 /** Submits or refreshes the day's standing; a failure leaves the last one shown, or none, and retries on the next view. */
 private async refreshDailyStandings(date: string): Promise<void> {
  const manifest = this.manifest;
  if (!manifest || this.shared) return;
  try {
   const view = await loadDailyStandings((await deviceDb()).db, manifest, date, location.origin);
   if (manifest === this.manifest) this.dailyStandings = view;
  } catch { /* offline or unavailable: shown once the next view succeeds */ }
 }
 /** Counts the own season at its home park and shows its place; offline or refused leaves none, and a later view retries. */
 private async refreshStadiumStandings(draft: Draft, wins: number): Promise<void> {
  try {
   const view = await submitStadiumRun((await deviceDb()).db, draft, wins, location.origin);
   if (this.draft === draft) this.stadiumStandings = view;
  } catch { /* offline or unavailable */ }
 }
 /** Asks for a board name on the day's run; the view says whether it was taken. Throws when the server cannot be reached. */
 async nameDaily(date: string, name: string): Promise<void> {
  const manifest = this.manifest;
  if (!manifest || this.shared) return;
  const view = await loadDailyStandings((await deviceDb()).db, manifest, date, location.origin, fetch, name);
  if (manifest === this.manifest) this.dailyStandings = view;
 }
 /** Starts today's daily with its seed and stadium pinned, resumes it, or reopens a finished one's results. */
 async playDaily(): Promise<void> {
  if (!this.manifest || this.loading || !this.daily) return;
  if (this.daily.date !== dailyDate()) { await this.refreshDaily(); return; }
  const { date, run } = this.daily;
  if (run.kind === 'active' || (run.kind === 'complete' && run.draft)) {
   this.clearShareState();
   this.draft = run.draft;
   this.resumePhase = run.kind === 'active' ? run.phase : 'results';
   await this.restoreActive();
   return;
  }
  if (run.kind !== 'unplayed') return;
  this.stopRun();
  this.clearShareState();
  ++this.epoch;
  this.shared = false;
  this.draft = createDailyDraft(this.manifest, date);
  this.resetRun();
  this.phase = 'ready';
  this.save('draft');
  this.announce = `The daily for ${dailyLabel(date)} plays at ${dailyStadium(date, this.manifest).name}. Open the pack for your first franchise.`;
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
   if (!this.draft.homeStadium) this.phase = 'stadium';
   else if (this.draft.picks.length === draftRules(this.draft.schemaVersion).slots.length) {
    this.phase = 'lineup';
    this.loading = false;
    // A season this device already played opens on its results rather than playing back again.
    if (this.resumePhase === 'simulating' || this.resumePhase === 'results' || this.shared) await this.simulate(this.shared || this.resumePhase !== 'results');
   } else if (this.draft.packs.length) {
    // Two or three open packs wait for the player's choice; the pool loads once one is chosen.
    this.phase = 'choosing';
    await this.loadPool();
   } else this.phase = 'ready';
  } catch (error) {
   if (epoch !== this.epoch) return;
   this.error = error instanceof Error ? error.message : 'Could not restore the draft';
   this.retryAction = 'resume';
  } finally { if (epoch === this.epoch) this.loading = false; }
 }
 /** Returns to the welcome screen, as the browser's back button does, keeping the draft for Resume. */
 leave(): void {
  if (this.phase === 'start' || this.shared) return;
  this.stopRun();
  // Anything still loading for the screen being left settles without moving the player back into it.
  this.epoch += 1;
  this.loading = false;
  this.confirmNew = false;
  // A daily keeps its own slot, which every save already updates.
  if (this.draft && this.draft.daily === undefined) this.savedDraft = this.draft === this.archivedDraft ? null : this.draft;
  this.phase = 'start';
  void this.refreshDaily();
 }
 requestNew(): void {
  if (this.loading) return;
  // Only a Classic draft in progress is replaced; a daily on screen keeps its own slot.
  const daily = this.draft?.daily !== undefined;
  const active = daily || this.draft === this.archivedDraft ? this.savedDraft : this.draft ?? this.savedDraft;
  if (active && (daily || this.phase !== 'results')) { this.confirmNew = true; return; }
  void this.startNew();
 }
 async startNew(): Promise<void> {
  if (!this.manifest || this.loading) return;
  this.stopRun();
  this.clearShareState();
  const epoch = ++this.epoch;
  if (location.pathname.startsWith('/r/')) {
   this.loading = true;
   try { await goto('/classic?new=1', { replace: true }); }
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
  claimChallenge(this.draft.seed);
  this.savedDraft = null;
  this.resetRun();
  this.phase = 'stadium';
  this.save('stadium');
 }
 /** Clears everything the previous run left on screen before a new draft starts. */
 private resetRun(): void {
  this.selected.clear();
  this.profiles = [];
  this.pool = [];
  this.result = null;
  this.newStickers = [];
  this.newCards = [];
  this.reward = null;
  this.simulationInput = null;
  this.error = '';
  this.incompatible = false;
  this.confirmNew = false;
 }
 /** Pins the home stadium, saves it, then takes the first roll. */
 async selectStadium(stadiumId: string): Promise<void> {
  if (this.busy || this.phase !== 'stadium' || !this.draft || !this.manifest) return;
  try {
   this.draft = selectHomeStadium(this.draft, this.manifest, stadiumId);
   this.error = '';
   this.phase = 'ready';
   this.save('draft');
   const name = this.manifest.stadiums.find(stadium => stadium.ref.id === stadiumId)?.name ?? 'Your stadium';
   this.announce = `${name} is your home stadium. Open the pack for your first franchise.`;
  } catch (error) {
   this.error = error instanceof Error ? error.message : 'Could not choose the stadium';
  }
 }
 /** Deals another franchise pack beside the open ones; the pool waits until the player chooses a pack. */
 addPack(): void {
  if (this.busy || this.phase !== 'choosing' || !this.draft?.packs.length || !this.manifest) return;
  try {
   this.draft = addPack(this.draft, this.manifest);
   this.save('draft');
   this.pool = [];
   this.error = '';
   this.announce = `Added ${rollLabel(this.draft.packs.at(-1)!, this.manifest)}. Choose one of ${this.draft.packs.length} packs.`;
  } catch (error) {
   this.error = error instanceof Error ? error.message : 'Could not add a pack';
  }
 }
 /** Keeps one open pack, by its place on the table, as the pending roll and reveals its pool. */
 async choosePack(pack: number): Promise<void> {
  if (this.busy || this.phase !== 'choosing' || !this.draft || this.draft.packs.length < 2 || !this.manifest) return;
  const epoch = this.epoch;
  this.error = '';
  try {
   this.draft = choosePack(this.draft, pack);
   this.save('draft');
   await this.revealPool(epoch);
  } catch (error) {
   if (epoch !== this.epoch) return;
   this.error = error instanceof Error ? error.message : 'Could not open that pack';
   this.retryAction = this.draft.currentRoll ? 'pool' : null;
  }
 }
 async roll(): Promise<void> {
  if (this.busy || this.phase !== 'ready' || !this.draft || !this.manifest) return;
  const epoch = this.epoch;
  this.error = '';
  try {
   this.draft = rollDraft(this.draft, this.manifest);
   this.save('draft'); // The committed roll survives reload before any reveal choreography.
   await this.revealPool(epoch);
  } catch (error) {
   if (epoch !== this.epoch) return;
   this.phase = this.draft.currentRoll ? 'choosing' : 'ready';
   this.error = error instanceof Error ? error.message : 'Could not reveal the roll';
   this.retryAction = this.draft.currentRoll ? 'pool' : null;
  }
 }
 private async revealPool(epoch: number): Promise<void> {
  if (!this.draft?.currentRoll || !this.manifest) return;
  this.phase = 'revealing';
  this.pool = [];
  await this.loadPool();
  if (epoch !== this.epoch || !this.draft.currentRoll) return;
  this.phase = 'choosing';
  this.announce = `${rollLabel(this.draft.currentRoll, this.manifest)}. Choose your player season.`;
 }
 private async loadPool(): Promise<void> {
  if (!this.manifest || !this.draft?.currentRoll) return;
  this.loading = true;
  const epoch = this.epoch;
  try {
   const pool = await loadRollProfiles(this.manifest, this.draft.currentRoll);
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
 /** Replaces the bullpen's relief roles; the draft validator rejects an incomplete or repeated assignment. */
 roles(reliefRoles: ReliefAssignment[]): void {
  if (this.phase !== 'lineup' || !this.draft || !this.manifest || this.loading) return;
  try {
   this.draft = validateDraft({ ...this.draft, reliefRoles }, this.manifest, true);
   this.simulationInput = null;
   this.save('lineup');
  } catch (error) { this.error = error instanceof Error ? error.message : 'Invalid relief roles'; }
 }
 async simulate(reveal = true): Promise<void> {
  if (!this.draft || !this.manifest || this.loading || this.worker) return;
  this.phase = 'simulating';
  this.loading = true;
  this.error = '';
  this.completed = 0;
  this.revealed = 0;
  this.result = null;
  this.newStickers = [];
  this.newCards = [];
  this.reward = null;
  this.stadiumStandings = null;
  this.skipReveal = !reveal || matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.save('simulating');
  const epoch = this.epoch;
  performance.mark('season:simulate');
  // The roster is final, so the share artwork's assets load while the season simulates.
  if (!this.shared) this.warmShare(this.draft, this.manifest);
  try {
   if (!this.simulationInput) {
    const data = await loadSimulation(this.manifest);
    if (epoch !== this.epoch) return;
    this.simulationInput = prepareSeasonInput(this.draft, this.profiles, data);
   }
   const runId = ++this.runId;
   const worker = new Worker(new URL('../engine/season.worker.ts', import.meta.url), { type: 'module' });
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
     void this.saveToLibrary(message.result, epoch);
     performance.mark('season:result');
     // Playback animates until Results, so the captures' long drawing step waits for it to end.
     if (!this.skipReveal) this.releaseRaster = holdRasterization();
     // The whole season exists before playback starts, so its images prepare while it plays.
     this.publishSeason(message.result);
     if (this.skipReveal) this.showResults();
     else {
      const started = performance.now();
      const duration = PLAYBACK_DURATION_MS[appSettings.playbackSpeed];
      this.revealTimer = window.setInterval(() => {
       const progress = Math.min(1, (performance.now() - started) / duration);
       this.revealed = Math.max(this.revealed, Math.round(162 * (.5 - Math.cos(Math.PI * progress) / 2)));
       if (this.revealed === 162) this.showResults();
      }, 16);
     }
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
  this.endPlaybackHold();
  this.revealed = 162;
  this.phase = 'results';
  performance.mark('season:results');
  this.announce = `Season complete: ${this.result.wins} wins, ${this.result.losses} losses.`;
  // Store the replay now, so sharing the season's link is instant and stays inside the tap that asked for it.
  if (this.draft && !this.shared) void this.replayLink(this.draft).catch(() => undefined);
 }
 skip(): void { this.skipReveal = true; if (this.result) this.showResults(); }
 /** The friend's season this finished draft was started to answer, if any. */
 get challenge(): Challenge | null {
  return this.draft && !this.shared && this.phase === 'results' ? challengeFor(this.draft.seed) : null;
 }
 async share(action: ShareAction, format: ShareFormat, model: ShareRenderModel): Promise<void> {
  if (!this.draft || !this.result || this.loading || this.sharing) return;
  const draft = this.draft;
  const epoch = this.epoch;
  const request = ++this.shareRequest;
  this.sharing = true;
  this.imageDownloadFallback = false;
  this.textCopyFallback = false;
  try {
   if (action === 'challenge' || action === 'copy-link') await this.shareLinkAction(action, draft, model, request, epoch);
   else await this.shareImageAction(action, format, draft, model, request, epoch);
  } catch (error) {
   if (!this.shareIsCurrent(request, epoch)) return;
   if (isShareIncompatibility(error)) {
    this.incompatible = true;
    this.error = error instanceof Error ? error.message : 'Replay is incompatible with this dataset.';
    this.shareStatus = 'This replay cannot be published by the current model. Start a new draft.';
   } else {
    this.shareStatus = `${error instanceof Error ? error.message : 'Share images could not be prepared.'} Retry the same action.`;
   }
  } finally {
   // Busy belongs to the gesture, not the screen: leaving mid-share must not leave the buttons disabled on return.
   if (request === this.shareRequest) this.sharing = false;
  }
 }

 /** Challenge and replay links need only the stored replay; the images publish while the season plays back (`publishSeason`). */
 private async shareLinkAction(action: 'challenge' | 'copy-link', draft: Draft, model: ShareRenderModel, request: number, epoch: number): Promise<void> {
  const stored = this.shareReplayId !== null;
  if (!stored) this.shareStatus = 'Preparing your link…';
  const replay = await this.replayLink(draft);
  if (!this.shareIsCurrent(request, epoch)) return;
  const link = { ...replay, record: model.record };
  this.shareLink = action === 'challenge' ? challengeUrl(link) : link.replayUrl;
  this.nativeShareReady = true;
  if (action === 'copy-link') {
   try {
    await copyShareLink(link.replayUrl);
    if (this.shareIsCurrent(request, epoch)) this.shareStatus = 'Replay link copied.';
   } catch {
    if (!this.shareIsCurrent(request, epoch)) return;
    this.textCopyFallback = true;
    this.shareStatus = 'Clipboard unavailable. Select and copy the replay link below.';
   }
   return;
  }
  if (typeof navigator.share === 'function') {
   // Browsers open the share sheet only inside the tap itself, so a link that had to be fetched waits for the next tap.
   if (!stored) {
    this.shareStatus = 'Your link is ready. Tap Challenge a friend again to open the share sheet.';
    return;
   }
   try {
    await requestNativeShare(link);
    if (this.shareIsCurrent(request, epoch)) this.shareStatus = 'Shared.';
    return;
   } catch (error) {
    if (!this.shareIsCurrent(request, epoch)) return;
    const errorName = error && typeof error === 'object' && 'name' in error && typeof error.name === 'string' ? error.name : '';
    if (errorName === 'AbortError') {
     this.shareStatus = 'Share canceled.';
     return;
    }
    if (errorName !== 'NotSupportedError') {
     this.textCopyFallback = true;
     this.shareStatus = 'Sharing is unavailable. Select and copy the challenge link below.';
     return;
    }
   }
  }
  try {
   await copyShareLink(challengeUrl(link));
   if (this.shareIsCurrent(request, epoch)) this.shareStatus = 'Challenge link copied.';
  } catch {
   if (!this.shareIsCurrent(request, epoch)) return;
   this.textCopyFallback = true;
   this.shareStatus = 'Clipboard unavailable. Select and copy the challenge link below.';
  }
 }

 private async shareImageAction(action: 'download' | 'copy-image', format: ShareFormat, draft: Draft, model: ShareRenderModel, request: number, epoch: number): Promise<void> {
  this.shareStatus = this.publication ? 'Completing share action…' : 'Preparing the share image…';
  const publicationPromise = this.publishImages(draft, model);
  let imageCopy: Promise<void> | null = null;
  let imageClipboardSupported = true;
  if (action === 'copy-image') {
   imageClipboardSupported = supportsImageClipboard();
   if (imageClipboardSupported) {
    try {
     imageCopy = beginCopyPublishedImage(publicationPromise, format);
     void imageCopy.catch(() => undefined);
    } catch {
     imageClipboardSupported = false;
    }
   }
  }
  const publication = await publicationPromise;
  if (!this.shareIsCurrent(request, epoch)) return;
  this.shareLink = publication.replayUrl;
  this.nativeShareReady = true;
  if (action === 'download') {
   await downloadPublishedImage(publication, format);
   if (this.shareIsCurrent(request, epoch)) this.shareStatus = 'Season PNG downloaded.';
  } else if (!imageClipboardSupported || !imageCopy) {
   this.imageDownloadFallback = true;
   this.shareStatus = 'Image copy is unavailable. Use Download PNG instead.';
  } else {
   try {
    await imageCopy;
    if (this.shareIsCurrent(request, epoch)) this.shareStatus = 'PNG copied.';
   } catch {
    if (!this.shareIsCurrent(request, epoch)) return;
    this.imageDownloadFallback = true;
    this.shareStatus = 'Image copy was denied or unavailable. Use Download PNG instead.';
   }
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
  this.endPlaybackHold();
 }
 private endPlaybackHold(): void {
  this.releaseRaster?.();
  this.releaseRaster = null;
 }
 dispose(): void { ++this.epoch; ++this.shareRequest; this.stopRun(); }
}
