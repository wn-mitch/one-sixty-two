<script lang="ts">
 import { onMount, tick, untrack } from 'svelte';
 import { extraPacksLeft, legalSlots, legalReassignments, maxPacks, rollContains, rollKey, rollYears } from '../game/draft.ts';
 import { draftRules } from '../game/rules.ts';
 import { HITTER_SLOTS, compareId, isJackpot, type Draft, type HitterSlot, type Manifest, type Profile, type Roll, type Slot } from '../game/types.ts';
 import { loadMedia } from '../media/client.ts';
 import type { MediaManifest } from '../media/types.ts';
 import type { WarRankings } from '../rankings/types.ts';
 import CardReview from '../cards/CardReview.svelte';
 import { createCardViewModel, type CardMediaStatus } from '../cards/view-model.ts';
 import { appSettings } from '../game/settings.svelte.ts';
 import { EASE_OUT, MOTION } from '../motion-timing.ts';
 import CandidateList from './CandidateList.svelte';
 import { dealIntoGrid, dealOutOfGrid } from './deal-motion.ts';
 import { arriveAtTop, dropInto, freeze, morphInto, riseIn, stamp, stash, take } from './phase-motion.ts';
 import Roster from './Roster.svelte';
 import Reveal from './Reveal.svelte';
 import DraftSheet from './DraftSheet.svelte';
 import FoilPack from './FoilPack.svelte';
 import Settings from './Settings.svelte';
 import { BOARD_WIDE_QUERY } from './skeletons/board.ts';
 import PoolSkeleton from './skeletons/PoolSkeleton.svelte';
 import Skeleton from './skeletons/Skeleton.svelte';
 let { draft, manifest, pool, profiles, phase, loading, busy, rankings, rankingLoading, rankingError, onRetryRankings, onRoll, onAddPack, onChoosePack, onDraft, onReassign, onNew }: {
  draft: Draft; manifest: Manifest; pool: Profile[]; profiles: Profile[];
  phase: 'ready' | 'revealing' | 'choosing'; loading: boolean; busy: boolean;
  rankings: WarRankings | null; rankingLoading: boolean; rankingError: boolean;
  onRetryRankings: () => void; onRoll: () => void; onAddPack: () => void; onChoosePack: (pack: number) => void; onNew: () => void;
  onDraft: (seasonId: string, slot: Slot) => void;
  onReassign: (seasonId: string, slot: HitterSlot) => void;
 } = $props();
 const uid = $props.id();
 let wide = $state(false);
 let selectedSeasonId = $state<string | null>(null);
 let selectedSeasons = $state(new Map<string, string>());
 let selectionChoices = $state<Profile[]>([]);
 let pendingSlot = $state<Slot | null>(null);
 let movingSeasonId = $state<string | null>(null);
 let inspectedSeasonId = $state<string | null>(null);
 let sheetOpen = $state(false);
 /** The foil pack is still dealing the committed roll; candidates wait for it to land. */
 let dealing = $state(false);
 /** The dealt card has reached the rail, which may show the roll before the deal finishes. */
 let dealtArrived = $state(false);
 /** A finished deal still owes the candidate grid its deal-out, played when the grid first renders. */
 let dealOutPending = $state(false);
 /** Add pack was pressed beside the pool, so the table fades back in and the added pack opens out of its ghost. */
 let returning = $state(false);
 /** A confirmed pick is clearing the candidate grid before it commits. */
 let leaving = $state(false);
 let sheetTab = $state<'field' | 'back'>('field');
 let trigger = $state<HTMLElement | null>(null);
 let selectionTrigger: HTMLElement | null = null;
 let inspectionTrigger = $state<HTMLElement | null>(null);
 let inspectionSourceElement = $state<HTMLElement | null>(null);
 let inspectionOffersMove = $state(false);
 let inspectionMoveRequested = $state(false);
 let preserveInspectionClick = false;
 /** The pointer press turned a candidate card back over, so its click must not also drop the selection. */
 let preserveFlipClick = false;
 let returningSourceClick = false;
 let preserveSheetCancel = false;
 let draftBoard = $state<HTMLElement>();
 /** Two or three open packs, from the pool's toolbar or a reload, show as dealt cards until one is taken. */
 $effect(() => {
  if (draft.packs.length < 2 || untrack(() => dealing)) return;
  dealing = true;
  dealtArrived = false;
  dealOutPending = false;
 });
 const dealtPacks = $derived(draft.packs.map(pack => isJackpot(pack) ? { roll: pack } : {
  roll: pack,
  name: manifest.franchises.find(franchise => franchise.id === pack.franchiseId)?.name,
  years: rollYears(pack, manifest, draft.schemaVersion),
  color: media?.teams[pack.franchiseId]?.color
 }));
 const showingCandidates = $derived(!(phase === 'ready' || dealing) && !(loading || phase === 'revealing') && pool.length > 0);
 $effect(() => {
  if (!dealOutPending || !showingCandidates) return;
  dealOutPending = false;
  void tick().then(() => {
   const grid = draftBoard?.querySelector<HTMLElement>('.candidates');
   const mark = draftBoard?.querySelector<HTMLElement>('[data-roll-mark]');
   if (grid) dealIntoGrid(grid, mark?.getBoundingClientRect() ?? null);
   // Taking the dealt card removes it, so focus that fell to the page moves to the pool's cards.
   const active = document.activeElement;
   if (!active || active === document.body) grid?.querySelector<HTMLElement>('.content')?.focus({ preventScroll: true });
  });
 });
 let fieldHeading = $state<HTMLHeadingElement>();
 let candidateReview = $state<CardReview>();
 let candidateTurned = $state(true);
 let candidateTextBack = $state(false);
 let inspectedTurned = $state(false);
 let inspectedOpened = $state(false);
 let inspectionOpening = false;
 let inspectedTextBack = $state(false);
 let requestedMove = $state<{ seasonId: string; slot: HitterSlot } | null>(null);
 let media = $state.raw<MediaManifest | null>(null);
 let mediaStatus = $state<CardMediaStatus>('loading');
 const manifestBySeason = $derived(new Map(manifest.candidates.map(candidate => [candidate.seasonId, candidate])));
 const poolBySeason = $derived(new Map(pool.map(profile => [profile.seasonId, profile])));
 const rosterBySeason = $derived(new Map(profiles.map(profile => [profile.seasonId, profile])));
 const selectedProfile = $derived(selectedSeasonId ? poolBySeason.get(selectedSeasonId) : undefined);
 const selectedCandidate = $derived(selectedSeasonId ? manifestBySeason.get(selectedSeasonId) : undefined);
 const destinations = $derived(selectedCandidate ? legalSlots(draft, selectedCandidate, manifest) : []);
 const moveTargets = $derived(movingSeasonId ? legalReassignments(draft, manifest, movingSeasonId) : []);
 const movingProfile = $derived(movingSeasonId ? rosterBySeason.get(movingSeasonId) : undefined);
 const inspectedProfile = $derived(inspectedSeasonId ? rosterBySeason.get(inspectedSeasonId) : undefined);
 const seasonChoices = $derived([...selectionChoices].sort((a, b) => a.year - b.year || compareId(a.seasonId, b.seasonId)));
 const preview = $derived(selectedProfile && pendingSlot && !movingSeasonId ? { profile: selectedProfile, slot: pendingSlot } : null);
 const selectedCard = $derived(selectedProfile ? createCardViewModel({ profile: selectedProfile, manifest, media, mediaStatus, rankings }) : null);
 const inspectedCard = $derived(inspectedProfile ? createCardViewModel({ profile: inspectedProfile, slot: draft.picks.find(pick => pick.seasonId === inspectedSeasonId)?.slot, manifest, media, mediaStatus, rankings }) : null);
 const draftBrowseKey = $derived(`${draft.schemaVersion}:${draft.dataVersion}:${draft.seed}:${draft.picks.map(pick => pick.seasonId).join('|')}:${draft.currentRoll ? rollKey(draft.currentRoll) : ''}`);
 const rosterSlots = $derived(draftRules(draft.schemaVersion).slots);
 const occupiedSlots = $derived(new Set(draft.picks.map(pick => pick.slot)));
 const roll = $derived(draft.currentRoll);
 const rollColor = $derived(roll && !isJackpot(roll) ? media?.teams[roll.franchiseId]?.color : undefined);
 const homeStadium = $derived(draft.homeStadium ? manifest.stadiums.find(stadium => stadium.ref.id === draft.homeStadium!.id) ?? null : null);
 const rollFranchise = $derived(roll ? isJackpot(roll) ? 'Jackpot' : manifest.franchises.find(franchise => franchise.id === roll.franchiseId)?.name : undefined);
 const canConfirm = $derived(phase === 'choosing' && !busy && !leaving && !movingSeasonId && !!selectedProfile && !!pendingSlot && destinations.includes(pendingSlot));

 function clearTransient(): void {
  selectedSeasonId = null;
  selectionChoices = [];
  pendingSlot = null;
  movingSeasonId = null;
  requestedMove = null;
  inspectedSeasonId = null;
  inspectionTrigger = null;
  inspectionSourceElement = null;
  inspectionOffersMove = false;
  inspectionMoveRequested = false;
  inspectedOpened = false;
  sheetTab = 'field';
  candidateTurned = true;
  candidateTextBack = false;
  inspectedTurned = false;
  inspectedTextBack = false;
  inspectionOpening = false;
 }
 function resetBrowse(): void { clearTransient(); }
 function restoreCandidateFocus(seasonId: string | null, preferred: HTMLElement | null): void {
  void tick().then(() => {
   const visible = preferred?.isConnected && preferred.getClientRects().length ? preferred : null;
   const candidate = seasonId ? document.querySelector<HTMLButtonElement>(`.candidate-card [data-season-id=\"${CSS.escape(seasonId)}\"] button[aria-label^=\"Select \"]`) : null;
   (visible ?? candidate ?? fieldHeading ?? document.querySelector<HTMLButtonElement>('.open-field'))?.focus({ preventScroll: true });
  });
 }
 function dismissSheet(): void {
  const seasonId = selectedSeasonId;
  const previousTrigger = trigger;
  clearTransient();
  sheetOpen = false;
  restoreCandidateFocus(seasonId, previousTrigger);
 }
 function cancelSelection(): void {
  const seasonId = selectedSeasonId;
  clearTransient();
  sheetOpen = false;
  restoreCandidateFocus(seasonId, selectionTrigger);
 }
 function trackInspectionPointer(event: PointerEvent): void {
  const flipped = draftBoard?.querySelector('.candidate-card[data-flipped="true"]');
  preserveFlipClick = !!flipped && !event.composedPath().includes(flipped);
  const reviewing = !!inspectedSeasonId;
  preserveInspectionClick = reviewing && !event.composedPath().some(node =>
   node instanceof Element && node.matches('.card-review'));
  returningSourceClick = reviewing && event.target instanceof Element &&
   event.target.closest<HTMLElement>('[data-slot]')?.dataset.seasonId === inspectedSeasonId;
  if (reviewing && event.target instanceof HTMLDialogElement && event.target.matches('.draft-sheet')) {
   event.preventDefault();
   event.stopPropagation();
   inspectedOpened = false;
   inspectedTurned = false;
  }
 }
 function closeInspectionOnEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !inspectedSeasonId) return;
  if (document.activeElement?.closest('.settings-dialog[open], .error-dialog[open]')) return;
  preserveSheetCancel = true;
  event.preventDefault();
  event.stopPropagation();
  inspectedOpened = false;
  inspectedTurned = false;
 }
 function guardInspectionCancel(event: Event): void {
  if (!preserveSheetCancel || !(event.target instanceof HTMLDialogElement) || !event.target.matches('.draft-sheet')) return;
  preserveSheetCancel = false;
  event.preventDefault();
  event.stopImmediatePropagation();
 }
 function clearInspectionEscape(): void {
  preserveSheetCancel = false;
 }
 function deselectOutsideCard(event: MouseEvent): void {
  if (preserveInspectionClick) {
   preserveInspectionClick = false;
   returningSourceClick = false;
   return;
  }
  if (preserveFlipClick) {
   preserveFlipClick = false;
   return;
  }
  if (!selectedProfile || busy) return;
  if (event.composedPath().some(node => node instanceof Element &&
   node.matches('[data-app-settings], .error-dialog, [data-candidate-card], [data-slot], [data-pool-load], .card-review, .field-footer, .sheet-footer, .sheet-header, .open-field'))) return;
  clearTransient();
  sheetOpen = false;
 }
 function rememberSeason(playerId: string, seasonId: string): void {
  selectedSeasons = new Map(selectedSeasons).set(playerId, seasonId);
 }
 function selectCandidate(seasonId: string, seasons: Profile[], nextTrigger: HTMLButtonElement): void {
  if (busy || phase !== 'choosing') return;
  const profile = poolBySeason.get(seasonId);
  if (!profile) return;
  if (selectedSeasonId === seasonId) { cancelSelection(); return; }
  selectionTrigger = nextTrigger;
  trigger = nextTrigger;
  rememberSeason(profile.playerId, seasonId);
  selectionChoices = seasons;
  selectedSeasonId = seasonId;
  movingSeasonId = null;
  requestedMove = null;
  inspectedSeasonId = null;
  inspectionTrigger = null;
  inspectionSourceElement = null;
  inspectionOffersMove = false;
  inspectionMoveRequested = false;
  candidateTurned = true;
  candidateTextBack = false;
  inspectedOpened = false;
  inspectedTurned = false;
  inspectedTextBack = false;
  inspectionOpening = false;
  sheetTab = 'field';
  const candidate = manifestBySeason.get(seasonId);
  const slots = candidate ? legalSlots(draft, candidate, manifest) : [];
  pendingSlot = slots.length === 1 ? slots[0] : null;
  if (!wide) sheetOpen = true;
 }
 function placeCandidate(seasonId: string, seasons: Profile[], slot: Slot, nextTrigger: HTMLButtonElement): void {
  if (busy || phase !== 'choosing' || !poolBySeason.has(seasonId)) return;
  const candidate = manifestBySeason.get(seasonId);
  if (!candidate || !legalSlots(draft, candidate, manifest).includes(slot)) return;
  if (selectedSeasonId !== seasonId) selectCandidate(seasonId, seasons, nextTrigger);
  movingSeasonId = null;
  requestedMove = null;
  inspectedSeasonId = null;
  inspectionTrigger = null;
  inspectionSourceElement = null;
  inspectionOffersMove = false;
  inspectionMoveRequested = false;
  inspectedOpened = false;
  inspectedTurned = false;
  inspectedTextBack = false;
  inspectionOpening = false;
  pendingSlot = slot;
 }
 function changeSeason(playerId: string, seasonId: string): void {
  const profile = poolBySeason.get(seasonId);
  if (!profile || profile.playerId !== playerId || busy) return;
  rememberSeason(playerId, seasonId);
  if (selectedProfile?.playerId !== playerId) return;
  if (!selectionChoices.some(choice => choice.seasonId === seasonId)) return;
  selectedSeasonId = seasonId;
  candidateTurned = true;
  candidateTextBack = false;
  const candidate = manifestBySeason.get(seasonId);
  if (pendingSlot && (!candidate || !legalSlots(draft, candidate, manifest).includes(pendingSlot))) pendingSlot = null;
 }
 /**
  * Adds a pack beside the taken roll. The session deals at once; a still copy of the pool fades out while the
  * table fades back in and opens the added pack, as tapping its ghost would.
  */
 function addPackFromPool(): void {
  if (busy || leaving) return;
  cancelSelection();
  const grid = draftBoard?.querySelector<HTMLElement>('.candidates');
  const host = draftBoard?.querySelector<HTMLElement>('.draft-browser');
  const before = draft;
  returning = true;
  const fading = grid && host && appSettings.effectiveEnabled ? fadeCopy(grid, host) : null;
  onAddPack();
  // A failed add leaves the pool in place.
  if (draft === before) fading?.remove();
 }
 /** A still copy of `grid` laid over it in `host` that fades out, then removes itself. */
 function fadeCopy(grid: HTMLElement, host: HTMLElement): HTMLElement {
  const rect = grid.getBoundingClientRect();
  const origin = host.getBoundingClientRect();
  const copy = grid.cloneNode(true) as HTMLElement;
  copy.setAttribute('aria-hidden', 'true');
  copy.setAttribute('inert', '');
  for (const element of copy.querySelectorAll('[id]')) element.removeAttribute('id');
  Object.assign(copy.style, { position: 'absolute', left: `${rect.left - origin.left}px`, top: `${rect.top - origin.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: '0', pointerEvents: 'none', zIndex: '0' });
  // First in the section, so the foil pack's positioned cards paint over it.
  host.prepend(copy);
  copy.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MOTION.returnFade / (appSettings.snapshot.cardSpeed || 1), easing: EASE_OUT, fill: 'forwards' })
   .finished.finally(() => copy.remove()).catch(() => {});
  return copy;
 }
 async function confirmPick(): Promise<void> {
  if (!canConfirm || !selectedSeasonId || !pendingSlot || !selectedProfile || !selectedCandidate) return;
  const roll = draft.currentRoll;
  if (!roll || !rollContains(roll, selectedCandidate)) return;
  if (!legalSlots(draft, selectedCandidate, manifest).includes(pendingSlot)) return;
  const seasonId = selectedSeasonId;
  const slot = pendingSlot;
  const before = draft;
  // The candidates leave first so the next pack arrives on a clear stage.
  leaving = true;
  const grid = wide ? draftBoard?.querySelector<HTMLElement>('.candidates') : null;
  const exit = grid ? await dealOutOfGrid(grid) : [];
  // Phones confirm inside the field sheet, so the previewed card presses into its slot before the sheet closes.
  const placed = wide ? null : draftBoard?.querySelector<HTMLElement>('dialog.draft-sheet[open] [data-preview="true"] .card-frame');
  const placedCard = placed?.querySelector<HTMLElement>('.miniature .card') ?? placed;
  if (placed) await stamp(placed);
  const landing = placedCard?.isConnected ? { clone: freeze(placedCard), rect: placedCard.getBoundingClientRect() } : null;
  // The last pick hands every field card to its lineup row.
  if (draft.picks.length + 1 === rosterSlots.length) stash('field', new Map([...draftBoard?.querySelectorAll<HTMLElement>(`${wide ? '.field-panel' : 'dialog.draft-sheet[open]'} .roster-item[data-season-id]`) ?? []]
   .map(item => [item.dataset.seasonId!, (item.querySelector<HTMLElement>('.miniature .card') ?? item).getBoundingClientRect()] as const)
   .filter(([, rect]) => rect.width > 0)));
  // Session catches errors. Only the ensuing draft identity change closes the preview.
  onDraft(seasonId, slot);
  leaving = false;
  await tick();
  if (draft === before) {
   for (const animation of exit) animation.cancel();
   return;
  }
  if (wide) return;
  // The next pack rises at the top of the page while the drafted card drops into the field button.
  arriveAtTop();
  await tick();
  const fieldButton = draftBoard?.querySelector<HTMLElement>('.open-field');
  if (landing && fieldButton) dropInto(landing.clone, landing.rect, fieldButton);
 }
 function beginMove(seasonId: string, nextTrigger: HTMLElement): void {
  movingSeasonId = seasonId;
  requestedMove = null;
  inspectedSeasonId = null;
  inspectionTrigger = null;
  inspectionSourceElement = null;
  inspectionOffersMove = false;
  inspectionMoveRequested = false;
  inspectedOpened = false;
  inspectedTurned = false;
  inspectedTextBack = false;
  inspectionOpening = false;
  trigger = nextTrigger;
  sheetTab = 'field';
  if (!wide) sheetOpen = true;
 }
 function slotAction(slot: Slot, nextTrigger: HTMLButtonElement): void {
  if (busy) return;
  const occupant = draft.picks.find(pick => pick.slot === slot);
  if (returningSourceClick || occupant?.seasonId === inspectedSeasonId) {
   returningSourceClick = false;
   inspectedOpened = false;
   inspectedTurned = false;
   return;
  }
  if (movingSeasonId) {
   if (occupant?.seasonId === movingSeasonId) {
    inspectRoster(occupant.seasonId, nextTrigger, false);
    return;
   }
   if (occupant && !HITTER_SLOTS.includes(slot as HitterSlot)) {
    inspectRoster(occupant.seasonId, nextTrigger, false);
    return;
   }
   const destination = moveTargets.find(target => target.slot === slot);
   if (!destination) return;
   requestedMove = { seasonId: movingSeasonId, slot: destination.slot };
   onReassign(movingSeasonId, destination.slot);
   return;
  }
  if (occupant) {
   const hitter = HITTER_SLOTS.includes(slot as HitterSlot);
   if (hitter && appSettings.rosterFirstClick === 'move') beginMove(occupant.seasonId, nextTrigger);
   else inspectRoster(occupant.seasonId, nextTrigger, hitter);
   return;
  }
  if (phase === 'choosing' && selectedProfile && destinations.includes(slot)) pendingSlot = slot;
 }
 function restoreInspectionFocus(preferred: HTMLElement | null): void {
  void tick().then(() => {
   const visible = preferred?.isConnected && preferred.getClientRects().length ? preferred : null;
   (visible ?? fieldHeading)?.focus({ preventScroll: true });
  });
 }
 function cardSource(trigger: HTMLElement): HTMLElement | null {
  return trigger.querySelector<HTMLElement>('.miniature .card')
   ?? trigger.querySelector<HTMLElement>('.card-frame');
 }
 async function refreshInspectionSource(seasonId: string): Promise<void> {
  const pick = draft.picks.find(item => item.seasonId === seasonId);
  if (!pick) return;
  await tick();
  let nextTrigger = draftBoard?.querySelector<HTMLButtonElement>(`${wide ? '.field-panel' : 'dialog.draft-sheet[open]'} [data-slot="${CSS.escape(pick.slot)}"]`);
  if (!nextTrigger && !wide) {
   await tick();
   nextTrigger = draftBoard?.querySelector<HTMLButtonElement>(`dialog.draft-sheet[open] [data-slot="${CSS.escape(pick.slot)}"]`);
  }
  if (inspectedSeasonId !== seasonId || !nextTrigger) return;
  inspectionTrigger = nextTrigger;
  inspectionSourceElement = cardSource(nextTrigger);
 }
 async function refreshInspectionAfterLayout(seasonId: string): Promise<void> {
  await refreshInspectionSource(seasonId);
  if (inspectedSeasonId === seasonId && !inspectionOpening && !inspectedOpened) {
   if (inspectionMoveRequested) moveFromInspection();
   else returnToField();
  }
 }
 async function inspectRoster(seasonId: string, nextTrigger: HTMLElement, offerMove = false): Promise<void> {
  inspectionOpening = true;
  inspectionMoveRequested = false;
  inspectedOpened = false;
  inspectedTurned = false;
  inspectedTextBack = false;
  inspectionTrigger = nextTrigger;
  inspectionSourceElement = cardSource(nextTrigger);
  inspectionOffersMove = offerMove;
  inspectedSeasonId = seasonId;
  sheetTab = 'field';
  if (!wide) {
   trigger = nextTrigger;
   sheetOpen = true;
  }
  await tick();
  if (inspectedSeasonId !== seasonId) {
   inspectionOpening = false;
   return;
  }
  inspectedOpened = true;
  inspectionOpening = false;
 }
 function returnToField(): void {
  const previousTrigger = inspectionTrigger;
  inspectionTrigger = null;
  inspectionSourceElement = null;
  inspectionOffersMove = false;
  inspectionMoveRequested = false;
  inspectedOpened = false;
  inspectedSeasonId = null;
  inspectedTurned = false;
  inspectedTextBack = false;
  inspectionOpening = false;
  restoreInspectionFocus(previousTrigger);
 }
 function moveFromInspection(): void {
  const seasonId = inspectedSeasonId;
  const previousTrigger = inspectionTrigger;
  const pick = seasonId ? draft.picks.find(item => item.seasonId === seasonId) : undefined;
  if (!seasonId || !previousTrigger || !pick || !HITTER_SLOTS.includes(pick.slot as HitterSlot)) {
   returnToField();
   return;
  }
  beginMove(seasonId, previousTrigger);
  inspectedTurned = false;
  inspectedTextBack = false;
  inspectionOpening = false;
  restoreInspectionFocus(previousTrigger);
 }
 function cancelMove(): void {
  movingSeasonId = null;
  requestedMove = null;
  void tick().then(() => fieldHeading?.focus({ preventScroll: true }));
 }
 function tabKey(event: KeyboardEvent): void {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  sheetTab = event.key === 'Home' ? 'field' : event.key === 'End' ? 'back' : sheetTab === 'field' ? 'back' : 'field';
  if (sheetTab === 'back') candidateTurned = true;
  void tick().then(() => document.getElementById(`${uid}-tab-${sheetTab}`)?.focus());
 }
 $effect(() => {
  draftBrowseKey;
  untrack(() => {
   clearTransient();
   selectedSeasons = new Map();
   sheetOpen = false;
  });
 });
 $effect(() => {
  const request = requestedMove;
  if (request && draft.picks.some(pick => pick.seasonId === request.seasonId && pick.slot === request.slot)) {
   movingSeasonId = null;
   requestedMove = null;
  }
 });
 $effect(() => {
  if (pendingSlot && !destinations.includes(pendingSlot)) pendingSlot = null;
 });
 $effect(() => {
  if (inspectedSeasonId && !inspectedProfile) {
   inspectedSeasonId = null;
   inspectionTrigger = null;
   inspectionSourceElement = null;
   inspectionOffersMove = false;
   inspectionMoveRequested = false;
   inspectedOpened = false;
   inspectedTurned = false;
   inspectedTextBack = false;
   inspectionOpening = false;
  }
 });
 onMount(() => {
  let disposed = false;
  const releaseSettings = appSettings.retain();
  void loadMedia().then(value => {
   if (!disposed) { media = value; mediaStatus = 'ready'; }
  }).catch(() => { if (!disposed) mediaStatus = 'unavailable'; });
  const query = window.matchMedia(BOARD_WIDE_QUERY);
  wide = query.matches;
  const adapt = () => {
   const focusedInPanel = document.activeElement instanceof HTMLElement && !!document.activeElement.closest('.field-panel, .draft-sheet');
   const inspected = inspectedSeasonId;
   if (inspected) inspectionSourceElement = null;
   wide = query.matches;
   if (wide) {
    sheetOpen = false;
    if (focusedInPanel && !inspected) void tick().then(() => fieldHeading?.focus({ preventScroll: true }));
   } else if (selectedSeasonId || movingSeasonId || inspected) {
    sheetOpen = true;
   }
   if (inspected) void refreshInspectionAfterLayout(inspected);
  };
  query.addEventListener('change', adapt);
  window.addEventListener('cancel', guardInspectionCancel, true);
  const arrival = take('stadium');
  if (arrival) void tick().then(() => {
   if (disposed || !draftBoard) return;
   arriveAtTop();
   // The chosen park's card shrinks onto the field's stadium card while the board rises around it;
   // phones keep the field in a sheet, so the card settles into the sealed pack instead.
   const from = arrival.rects.get('card');
   const clone = arrival.clones.get('card');
   const target = draftBoard.querySelector<HTMLElement>('.field-panel .stadium-mini .mini-card') ?? draftBoard.querySelector<HTMLElement>('.foil-pack .pack');
   if (from && clone && target) morphInto(clone, from, target);
   riseIn(draftBoard.querySelectorAll<HTMLElement>(':scope > .draft-header, :scope > .draft-toolbar, .field-panel'));
  });
  return () => {
   disposed = true;
   releaseSettings();
   query.removeEventListener('change', adapt);
   window.removeEventListener('cancel', guardInspectionCancel, true);
  };
 });
</script>

<svelte:window onpointerdowncapture={trackInspectionPointer} onkeydowncapture={closeInspectionOnEscape} onkeyup={clearInspectionEscape} onclick={deselectOutsideCard} />

{#snippet fieldHeader()}
 {@const sheetTabs = !wide && !!selectedProfile}
 <div class="field-header" class:sheet-tabs={sheetTabs}>
  <div class:sr-only={sheetTabs}>
   <div class="field-title"><h2 bind:this={fieldHeading} tabindex="-1">Your field <span class="sr-only">{draft.picks.length} of {rosterSlots.length} picked</span></h2>
    {#if wide}<div class="pick-track" aria-hidden="true">{#each rosterSlots as slot}<span class:locked={occupiedSlots.has(slot)}></span>{/each}</div>{/if}
    <span class="picked-count" aria-hidden="true">{draft.picks.length} / {rosterSlots.length}</span>
   </div>
  </div>
  {#if sheetTabs}
   <div class="tabs" role="tablist" aria-label="Selected player view" tabindex="-1" onkeydown={tabKey}>
    <button type="button" role="tab" id="{uid}-tab-field" aria-selected={sheetTab === 'field'} aria-controls="{uid}-panel-field" tabindex={sheetTab === 'field' ? 0 : -1} onclick={() => sheetTab = 'field'}>Field <span class="tab-count" aria-hidden="true">{draft.picks.length}/{rosterSlots.length}</span></button>
    <button type="button" role="tab" id="{uid}-tab-back" aria-selected={sheetTab === 'back'} aria-controls="{uid}-panel-back" tabindex={sheetTab === 'back' ? 0 : -1} onclick={() => { candidateTurned = true; sheetTab = 'back'; }}>Card back</button>
   </div>
  {/if}
  {#if !wide}<button type="button" class="quiet close-field" aria-label="Close field" onclick={dismissSheet}><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg></button>{/if}
 </div>
 {#if !wide && selectedProfile}
  <label class="sheet-season"><span class="sr-only">Exact season for {selectedProfile.displayName}</span>
   <select aria-label="Exact season for {selectedProfile.displayName}" value={selectedSeasonId ?? ''} disabled={busy} onchange={event => changeSeason(selectedProfile!.playerId, event.currentTarget.value)}>
    {#each seasonChoices as season (season.seasonId)}<option value={season.seasonId}>{season.year} · {season.historicalTeam}</option>{/each}
   </select>
  </label>
 {/if}
{/snippet}

{#snippet fieldContent()}
 {#if !wide && selectedCard && sheetTab === 'back' && !inspectedCard}
  <div role="tabpanel" id="{uid}-panel-back" aria-labelledby={`${uid}-tab-back`}>
   <CardReview
    bind:this={candidateReview}
    id={`${uid}-candidate-review`}
    s={selectedCard}
    bind:turned={candidateTurned}
    bind:textBack={candidateTextBack}
   />
  </div>
 {/if}
 <div hidden={!wide && !!selectedCard && sheetTab !== 'field'} role={selectedProfile && !wide ? 'tabpanel' : undefined} id="{uid}-panel-field" aria-labelledby={selectedProfile && !wide ? `${uid}-tab-field` : undefined}>
  <Roster
   {draft}
   {manifest}
   {profiles}
   {rankings}
   {rankingLoading}
   {rankingError}
   {busy}
   {media}
   {mediaStatus}
   {preview}
   compact={wide}
   stadium={homeStadium}
   stadiumFranchise={homeStadium ? manifest.franchises.find(franchise => franchise.id === homeStadium.franchiseId)?.name : undefined}
   stadiumColor={homeStadium ? media?.teams[homeStadium.franchiseId]?.color : undefined}
   legalSlots={movingSeasonId ? [] : destinations}
   {movingSeasonId}
   {moveTargets}
   {inspectedSeasonId}
   rosterFirstClick={appSettings.rosterFirstClick}
   inspectionId={`${uid}-roster-review`}
   onSlot={slotAction}
  />
 </div>
 {#if inspectedCard}
  {#key inspectedSeasonId}
   <CardReview
    id={`${uid}-roster-review`}
    s={inspectedCard}
    bind:opened={inspectedOpened}
    bind:turned={inspectedTurned}
    bind:textBack={inspectedTextBack}
    bind:moveRequested={inspectionMoveRequested}
    showControl={false}
    sourceElement={inspectionSourceElement}
    raisedOnly
    pairFaces={false}
    onMove={inspectionOffersMove ? moveFromInspection : undefined}
    onClose={returnToField}
   />
  {/key}
 {/if}
{/snippet}

{#snippet fieldFooter()}
 {#if movingSeasonId}
  <div class="move-controls">
   {#if wide && movingProfile}<p><strong>Moving {movingProfile.displayName} · {movingProfile.year}</strong></p>{/if}
   <button type="button" class="secondary" onclick={cancelMove}>Cancel move</button>
  </div>
 {:else if selectedProfile}
  <div class="pick-confirmation" data-pending-slot={pendingSlot ?? ''} data-selected-season={selectedSeasonId}>
   <!-- The highlighted slots and the Draft button carry the pick; only a pick with nowhere to go needs words. -->
   {#if !destinations.length}<p class="placement-hint">Reassign your roster to make room.</p>{/if}
   <div class="confirmation-actions">
    <button type="button" class="primary" disabled={!canConfirm} onclick={() => void confirmPick()}>{pendingSlot ? `Draft at ${pendingSlot}` : 'Draft player'}</button>
    {#if pendingSlot}<button type="button" class="secondary" onclick={() => pendingSlot = null}>Back</button>{/if}
    <button type="button" class="quiet" onclick={cancelSelection}>Cancel selection</button>
   </div>
  </div>
 {/if}
{/snippet}

<div bind:this={draftBoard} class="draft-board" class:wide>
{#snippet rerollControl()}
 {#if showingCandidates}
  {@const left = extraPacksLeft(draft)}
  {@const total = draftRules(draft.schemaVersion).extraPacks}
  <button type="button" class="secondary reroll" disabled={busy || leaving || left <= 0} aria-label={`Add a franchise pack to choose from, ${left} of ${total} left`} title="Add a franchise pack" onclick={addPackFromPool}>
   <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 3.5v9M3.5 8h9"></path></svg>
   <span class="reroll-word">Add pack</span>
   <span class="reroll-count" aria-hidden="true">{left}/{total}</span>
  </button>
 {/if}
{/snippet}
{#snippet reveal()}
 <Reveal {roll} {manifest} compact={wide} bar={!wide} revealing={phase === 'revealing'} concealed={dealing && !dealtArrived} pickNumber={draft.picks.length + 1} schemaVersion={draft.schemaVersion} teamColor={rollColor} />
{/snippet}
 {#if wide}
  <header class="draft-header">
   <a class="wordmark" href="/" aria-label="162-0 home"><span class="mark" aria-hidden="true"></span>162-0</a>
   {@render reveal()}
   {@render rerollControl()}
   {#if roll && !(dealing && !dealtArrived)}<p class="eyebrow header-pick">Pick {draft.picks.length + 1} of {rosterSlots.length}</p>{/if}
   <a class="rules-link" href="/about">Rules &amp; model</a>
   <Settings />
   <button class="secondary new-draft" disabled={loading} onclick={onNew}>New draft</button>
  </header>
 {/if}
 <!-- Phones keep the roll and the field together in one sticky bar above the pool. -->
 <div class="draft-toolbar">
  {#if !wide}
   {@render reveal()}
   {@render rerollControl()}
   <button type="button" class="secondary open-field" aria-label={`Open your field ${draft.picks.length} / ${rosterSlots.length}`} onclick={event => { trigger = event.currentTarget; sheetOpen = true; }}>
    Field
    <span class="field-count">{draft.picks.length} / {rosterSlots.length}</span>
   </button>
   <button type="button" class="secondary toolbar-new" aria-label="New draft" title="New draft" disabled={loading} onclick={onNew}>
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 3.5v9M3.5 8h9"></path></svg>
   </button>
  {/if}
 </div>
 <div class="board-columns">
  <section class="draft-browser" aria-label="Make your next pick" inert={leaving}>
   {#if phase === 'ready' || dealing || draft.packs.length > 1}
    <FoilPack
     packs={dealtPacks}
     pickNumber={draft.picks.length + 1}
     pickCount={rosterSlots.length}
     marks={manifest.franchises.map(franchise => franchise.id)}
     disabled={busy && !dealing}
     extraPacks={{ left: extraPacksLeft(draft), total: draftRules(draft.schemaVersion).extraPacks, max: maxPacks(draft) }}
     addDisabled={busy || phase !== 'choosing'}
     {onAddPack}
     {returning}
     onChoose={pack => { returning = false; onChoosePack(pack); }}
     flyTarget={() => draftBoard?.querySelector<HTMLElement>('[data-roll-mark]') ?? null}
     onOpen={() => { returning = false; dealing = true; dealtArrived = false; dealOutPending = false; onRoll(); }}
     onArrive={() => dealtArrived = true}
     onDealt={() => { dealing = false; dealOutPending = true; }}
    />
   {:else if loading || phase === 'revealing'}
    <Skeleton label="Finding eligible seasons…"><PoolSkeleton {wide} /></Skeleton>
   {:else if showingCandidates}
    <CandidateList profiles={pool} {draft} {manifest} {rankings} {rankingLoading} {rankingError} {onRetryRankings} {busy} {selectedSeasonId} {selectedSeasons} previewing={!!preview} {wide} onSelect={selectCandidate} onPlace={placeCandidate} onSeasonChange={changeSeason} onResetBrowse={resetBrowse} />
   {/if}
  </section>
  {#if wide}
   <aside class="field-panel" aria-label="Your field">
    <div class="panel-header">{@render fieldHeader()}</div>
    <div class="field-scroll">{@render fieldContent()}</div>
    {#if movingSeasonId || selectedProfile}<div class="field-footer">{@render fieldFooter()}</div>{/if}
   </aside>
  {/if}
 </div>
 <DraftSheet open={!wide && sheetOpen} {trigger} onClose={dismissSheet} header={fieldHeader} children={fieldContent} footer={movingSeasonId || selectedProfile ? fieldFooter : undefined} />
</div>

<style>
 .draft-board, .draft-browser { min-width: 0; }
 /* Holds the fading copy of the pool when a pack is added; the foil pack shows above it. */
 .draft-browser { position: relative; }
 .draft-toolbar { display: flex; align-items: center; justify-content: flex-end; gap: .5rem; position: sticky; top: 0; z-index: 5; background: var(--background); padding-block: .5rem; }
 .open-field { flex: none; display: flex; align-items: center; gap: .5rem; min-height: 3rem; padding-inline: .75rem; white-space: nowrap; }
 .field-count { color: var(--muted); font-size: .8rem; font-variant-numeric: tabular-nums; }
 .reroll { flex: none; display: inline-flex; align-items: center; gap: var(--space-2); min-height: 2.75rem; padding-inline: .75rem; font-size: .875rem; }
 /* Reroll waits for the roll identity to finish growing so it never upstages the reveal. */
 .reroll, .header-pick { animation: reroll-in calc(var(--motion-deal) * .7) var(--ease-out) var(--motion-deal) both; }
 @keyframes reroll-in { from { opacity: 0; transform: translateX(-1.5rem); } }
 :global([data-motion='off']) :is(.reroll, .header-pick) { animation: none; }
 @media (prefers-reduced-motion: reduce) { .reroll, .header-pick { animation: none; } }
 .header-pick { flex: none; margin: 0; white-space: nowrap; }
 .reroll-count { color: var(--muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
 /* Phones keep the toolbar to icons and counts so the roll identity keeps its room. */
 .draft-toolbar .reroll { min-height: 3rem; padding-inline: .5rem; gap: .3rem; }
 .draft-toolbar .reroll-word { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
 .reroll svg { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
 .toolbar-new { flex: none; display: grid; place-items: center; width: 3rem; min-height: 3rem; padding: 0; }
 .toolbar-new svg { width: 1.1rem; height: 1.1rem; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
 .board-columns { display: grid; min-width: 0; }
 .wide .board-columns { grid-template-columns: minmax(0, 1fr) 452px; gap: 28px; align-items: start; padding-top: 16px; }
 .wide .draft-toolbar { display: none; }
 .field-panel { position: sticky; top: 72px; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; max-height: calc(100dvh - 88px); min-width: 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; }
 .panel-header { padding-inline: 1rem; }
 .field-scroll { min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; padding: 0 1rem 1rem; }
 .field-footer { padding: 1rem 1rem 1rem; border-top: 1px solid var(--border); background: var(--background); }
 .field-header { display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding-block: 1rem .5rem; }
 .close-field { display: grid; place-items: center; flex: none; width: 44px; height: 44px; padding: 0; margin-right: -.5rem; }
 .field-header > div { min-width: 0; width: 100%; }
 .field-title { display: flex; align-items: center; gap: .75rem; }
 h2 { margin: 0; font: 800 1.7rem/1.1 'Barlow Condensed', sans-serif; }
 .wide h2 { font: italic 800 1.5rem/1 'Barlow Condensed', sans-serif; letter-spacing: .02em; text-transform: uppercase; white-space: nowrap; }
 .picked-count { color: var(--muted); font: 600 .75rem/1.2 system-ui, sans-serif; white-space: nowrap; }
 .pick-track { display: flex; flex: 1; gap: 3px; }
 .pick-track span { flex: 1; height: 4px; background: var(--border); }
 .pick-track .locked { background: var(--text); }
 .sheet-season { display: grid; gap: .3rem; font-size: .8rem; margin-bottom: .75rem; }
 select { min-height: 44px; width: 100%; min-width: 0; }
 .tabs { display: flex; gap: .5rem; }
 /* Phone sheet: the tabs share the close button's row, and the field gets the space the title and labels used. */
 .field-header.sheet-tabs { padding-block: 0 .75rem; }
 .field-header.sheet-tabs .tabs { flex: 1; min-width: 0; }
 .tab-count { margin-left: .35rem; opacity: .65; font-size: .8em; font-variant-numeric: tabular-nums; }
 :global(.draft-sheet .roster > .pick-track) { display: none; }
 /* The candidate's card fits the space between the sheet header and footer, so a turned card is never cut off. */
 [role='tabpanel'][id$='-panel-back'] { --card-front-width: min(20rem, calc((100dvh - 23rem) * 5 / 7)); }
 .tabs button { flex: 1; min-height: 44px; }
 .tabs [aria-selected='true'] { background: var(--text); color: var(--background); }
 .confirmation-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
 .confirmation-actions button, .move-controls button, .field-header button { min-height: 44px; }
 .pick-confirmation p, .move-controls p { margin: 0 0 .6rem; font-size: .85rem; overflow-wrap: anywhere; }
 .placement-hint { color: var(--muted); font-size: .75rem; }
 .wide .move-controls { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
 .wide .move-controls p { flex-basis: 100%; }
 .wide .confirmation-actions { gap: .4rem; }
 .wide .confirmation-actions button { padding-inline: .65rem; font-size: .8125rem; }
 .wide .confirmation-actions .primary { margin-left: auto; order: 3; }
 .draft-header { min-width: 0; }
 .wide .draft-header { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 20px; min-height: 64px; box-sizing: border-box; padding-block: 10px; border-bottom: 1px solid var(--border); background: var(--background); }
 .wordmark { flex: none; display: inline-flex; align-items: center; gap: .625rem; min-height: 44px; color: var(--text); text-decoration: none; font-size: 1.25rem; font-weight: 850; letter-spacing: -.04em; }
 .mark { width: .625rem; height: .625rem; border: 2px solid var(--text); transform: rotate(45deg); }
 .rules-link { margin-left: auto; flex: none; display: inline-flex; align-items: center; min-height: 44px; font-size: .875rem; color: var(--muted); text-decoration: none; }
 .new-draft { flex: none; padding-inline: .75rem; font-size: .875rem; }
 .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
</style>
