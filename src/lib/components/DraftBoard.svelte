<script lang="ts">
 import { onMount, tick, untrack } from 'svelte';
 import { legalSlots, legalReassignments } from '../game/draft.ts';
 import { draftRules } from '../game/rules.ts';
 import { HITTER_SLOTS, compareId, type Draft, type HitterSlot, type Manifest, type Profile, type Slot } from '../game/types.ts';
 import { loadMedia } from '../media/client.ts';
 import type { MediaManifest } from '../media/types.ts';
 import type { WarRankings } from '../rankings/types.ts';
 import Card from '../cards/Card.svelte';
 import CardDetails from '../cards/CardDetails.svelte';
 import CardInspection from '../cards/CardInspection.svelte';
 import { createCardViewModel, type CardMediaStatus } from '../cards/view-model.ts';
 import CandidateList from './CandidateList.svelte';
 import Roster from './Roster.svelte';
 import Reveal from './Reveal.svelte';
 import DraftSheet from './DraftSheet.svelte';
 let { draft, manifest, pool, profiles, phase, loading, busy, error, rankings, rankingLoading, rankingError, onRetryRankings, onRoll, onDraft, onReassign }: {
  draft: Draft; manifest: Manifest; pool: Profile[]; profiles: Profile[];
  phase: 'ready' | 'revealing' | 'choosing'; loading: boolean; busy: boolean; error: string;
  rankings: WarRankings | null; rankingLoading: boolean; rankingError: boolean;
  onRetryRankings: () => void; onRoll: () => void;
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
 let sheetTab = $state<'field' | 'back'>('field');
 let trigger = $state<HTMLElement | null>(null);
 let selectionTrigger: HTMLElement | null = null;
 let inspectionTrigger: HTMLElement | null = null;
 let fieldHeading = $state<HTMLHeadingElement>();
 let inspection = $state<CardInspection>();
 let cardDetails = $state<CardDetails>();
 let inspectedDetails = $state<CardDetails>();
 let requestedMove = $state<{ seasonId: string; slot: HitterSlot } | null>(null);
 let media = $state.raw<MediaManifest | null>(null);
 let mediaStatus = $state<CardMediaStatus>('loading');
 const manifestBySeason = $derived(new Map(manifest.candidates.map(candidate => [candidate.seasonId, candidate])));
 const poolBySeason = $derived(new Map(pool.map(profile => [profile.seasonId, profile])));
 const rosterBySeason = $derived(new Map(profiles.map(profile => [profile.seasonId, profile])));
 const selectedProfile = $derived(selectedSeasonId ? poolBySeason.get(selectedSeasonId) : undefined);
 const selectedCandidate = $derived(selectedSeasonId ? manifestBySeason.get(selectedSeasonId) : undefined);
 const destinations = $derived(selectedCandidate ? legalSlots(draft, selectedCandidate, manifest) : []);
 const moveTargets = $derived(movingSeasonId && draft.schemaVersion === 3 ? legalReassignments(draft, manifest, movingSeasonId) : []);
 const movingProfile = $derived(movingSeasonId ? rosterBySeason.get(movingSeasonId) : undefined);
 const inspectedProfile = $derived(inspectedSeasonId ? rosterBySeason.get(inspectedSeasonId) : undefined);
 const activeProfile = $derived(inspectedProfile ?? movingProfile ?? selectedProfile);
 const seasonChoices = $derived([...selectionChoices].sort((a, b) => a.year - b.year || compareId(a.seasonId, b.seasonId)));
 const preview = $derived(selectedProfile && pendingSlot && !movingSeasonId ? { profile: selectedProfile, slot: pendingSlot } : null);
 const selectedCard = $derived(selectedProfile ? createCardViewModel({ profile: selectedProfile, manifest, media, mediaStatus, rankings }) : null);
 const inspectedCard = $derived(inspectedProfile ? createCardViewModel({ profile: inspectedProfile, slot: draft.picks.find(pick => pick.seasonId === inspectedSeasonId)?.slot, manifest, media, mediaStatus, rankings }) : null);
 const draftBrowseKey = $derived(`${draft.schemaVersion}:${draft.dataVersion}:${draft.seed}:${draft.picks.map(pick => pick.seasonId).join('|')}:${draft.currentRoll?.franchiseId ?? ''}:${draft.currentRoll?.decade ?? ''}`);
 const lastPick = $derived(draft.picks.at(-1));
 const lastProfile = $derived(lastPick ? rosterBySeason.get(lastPick.seasonId) : undefined);
 const canConfirm = $derived(phase === 'choosing' && !busy && !movingSeasonId && !!selectedProfile && !!pendingSlot && destinations.includes(pendingSlot));

 function clearTransient(): void {
  selectedSeasonId = null;
  selectionChoices = [];
  pendingSlot = null;
  movingSeasonId = null;
  requestedMove = null;
  inspectedSeasonId = null;
  sheetTab = 'field';
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
  sheetTab = 'field';
  const candidate = manifestBySeason.get(seasonId);
  const slots = candidate ? legalSlots(draft, candidate, manifest) : [];
  pendingSlot = slots.length === 1 ? slots[0] : null;
  if (!wide) sheetOpen = true;
 }
 function changeSeason(playerId: string, seasonId: string): void {
  const profile = poolBySeason.get(seasonId);
  if (!profile || profile.playerId !== playerId || busy) return;
  rememberSeason(playerId, seasonId);
  if (selectedProfile?.playerId !== playerId) return;
  if (!selectionChoices.some(choice => choice.seasonId === seasonId)) return;
  selectedSeasonId = seasonId;
  const candidate = manifestBySeason.get(seasonId);
  if (pendingSlot && (!candidate || !legalSlots(draft, candidate, manifest).includes(pendingSlot))) pendingSlot = null;
 }
 function confirmPick(): void {
  if (!canConfirm || !selectedSeasonId || !pendingSlot || !selectedProfile || !selectedCandidate) return;
  const roll = draft.currentRoll;
  if (!roll || selectedCandidate.franchiseId !== roll.franchiseId || selectedCandidate.decade !== roll.decade) return;
  if (!legalSlots(draft, selectedCandidate, manifest).includes(pendingSlot)) return;
  // Session catches errors. Only the ensuing draft identity change closes the preview.
  onDraft(selectedSeasonId, pendingSlot);
 }
 function slotAction(slot: Slot, nextTrigger: HTMLButtonElement): void {
  if (busy) return;
  const occupant = draft.picks.find(pick => pick.slot === slot);
  if (movingSeasonId) {
   if (occupant?.seasonId === movingSeasonId) { movingSeasonId = null; requestedMove = null; return; }
   if (occupant && !HITTER_SLOTS.includes(slot as HitterSlot)) {
    inspectRoster(occupant.seasonId, nextTrigger);
    return;
   }
   const destination = moveTargets.find(target => target.slot === slot);
   if (!destination) return;
   requestedMove = { seasonId: movingSeasonId, slot: destination.slot };
   onReassign(movingSeasonId, destination.slot);
   return;
  }
  if (occupant) {
   trigger = nextTrigger;
   if (HITTER_SLOTS.includes(slot as HitterSlot) && draft.schemaVersion === 3) {
    movingSeasonId = occupant.seasonId;
    inspectedSeasonId = null;
    sheetTab = 'field';
    if (!wide) sheetOpen = true;
   } else inspectRoster(occupant.seasonId, nextTrigger);
   return;
  }
  if (phase === 'choosing' && selectedProfile && destinations.includes(slot)) pendingSlot = slot;
 }
 function inspectRoster(seasonId: string, nextTrigger: HTMLElement): void {
  inspectedSeasonId = seasonId;
  inspectionTrigger = nextTrigger;
  if (wide) void tick().then(() => inspection?.open(nextTrigger));
  else {
   trigger = nextTrigger;
   sheetOpen = true;
  }
 }
 function returnToField(): void {
  inspectedSeasonId = null;
  void tick().then(() => fieldHeading?.focus({ preventScroll: true }));
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
 onMount(() => {
  let disposed = false;
  void loadMedia().then(value => {
   if (!disposed) { media = value; mediaStatus = 'ready'; }
  }).catch(() => { if (!disposed) mediaStatus = 'unavailable'; });
  const query = window.matchMedia('(min-width: 1100px), (min-width: 1024px) and (orientation: landscape)');
  wide = query.matches;
  const adapt = () => {
   const focusedInPanel = document.activeElement instanceof HTMLElement && !!document.activeElement.closest('.field-panel, .draft-sheet');
   wide = query.matches;
   if (wide) {
    sheetOpen = false;
    void tick().then(() => {
     if (focusedInPanel) fieldHeading?.focus({ preventScroll: true });
     if (inspectedSeasonId && inspectedCard) void inspection?.open(fieldHeading ?? inspectionTrigger!);
    });
   } else if (selectedSeasonId || movingSeasonId || inspectedSeasonId) {
    sheetOpen = true;
   }
  };
  query.addEventListener('change', adapt);
  return () => { disposed = true; query.removeEventListener('change', adapt); };
 });
</script>

{#snippet fieldHeader()}
 <div class="field-header">
  <div>
   <h2 bind:this={fieldHeading} tabindex="-1">Your field <span>{draft.picks.length} / {draftRules(draft.schemaVersion).slots.length}</span></h2>
   {#if activeProfile}<p class="active-player"><strong>{activeProfile.displayName}</strong> · {activeProfile.year}{movingSeasonId && !inspectedSeasonId ? ' · Moving' : ''}</p>{/if}
  </div>
  {#if !wide}<button type="button" class="quiet" onclick={dismissSheet}>Close field</button>{/if}
 </div>
 {#if selectedProfile && !inspectedSeasonId}
  <label class="sheet-season">Exact season for {selectedProfile.displayName}
   <select aria-label="Exact season for {selectedProfile.displayName}" value={selectedSeasonId ?? ''} disabled={busy} onchange={event => changeSeason(selectedProfile!.playerId, event.currentTarget.value)}>
    {#each seasonChoices as season (season.seasonId)}<option value={season.seasonId}>{season.year} · {season.historicalTeam}</option>{/each}
   </select>
  </label>
  {#if !wide}
   <div class="tabs" role="tablist" aria-label="Selected player view" tabindex="-1" onkeydown={tabKey}>
    <button type="button" role="tab" id="{uid}-tab-field" aria-selected={sheetTab === 'field'} aria-controls="{uid}-panel-field" tabindex={sheetTab === 'field' ? 0 : -1} onclick={() => sheetTab = 'field'}>Field</button>
    <button type="button" role="tab" id="{uid}-tab-back" aria-selected={sheetTab === 'back'} aria-controls="{uid}-panel-back" tabindex={sheetTab === 'back' ? 0 : -1} onclick={() => sheetTab = 'back'}>Card back</button>
   </div>
  {/if}
 {/if}
{/snippet}

{#snippet fieldContent()}
 {#if !wide && selectedCard}
  <div hidden={sheetTab !== 'back' || !!inspectedCard} role="tabpanel" id="{uid}-panel-back" aria-labelledby={inspectedCard ? undefined : `${uid}-tab-back`}>
   <div class="designed-back"><Card s={selectedCard} face="back" onDetails={() => void cardDetails?.showDetails()} /></div>
   <CardDetails bind:this={cardDetails} s={selectedCard} />
  </div>
 {/if}
 {#if !wide && inspectedCard}
  <button type="button" class="secondary back-to-field" onclick={returnToField}>Back to field</button>
  <div class="designed-back"><Card s={inspectedCard} face="back" onDetails={() => void inspectedDetails?.showDetails()} /></div>
  <CardDetails bind:this={inspectedDetails} s={inspectedCard} />
 {:else}
  <div hidden={!wide && !!selectedCard && sheetTab !== 'field'} role={selectedProfile && !wide ? 'tabpanel' : undefined} id="{uid}-panel-field" aria-labelledby={selectedProfile && !wide ? `${uid}-tab-field` : undefined}>
   <Roster {draft} {manifest} {profiles} {rankings} {rankingLoading} {rankingError} {busy} {media} {mediaStatus} {preview} legalSlots={movingSeasonId ? [] : destinations} {movingSeasonId} {moveTargets} onSlot={slotAction} />
  </div>
 {/if}
{/snippet}

{#snippet fieldFooter()}
 {#if error && !wide}<p class="sheet-error" role="alert">{error}</p>{/if}
 {#if movingSeasonId}
  <div class="move-controls">
   <p>Choose a highlighted position to move or swap. Your exact season stays drafted.</p>
   <button type="button" class="secondary" onclick={cancelMove}>Cancel move</button>
   <button type="button" class="secondary" disabled={!movingProfile} onclick={event => inspectRoster(movingSeasonId!, event.currentTarget)}>Inspect card</button>
  </div>
 {:else if selectedProfile}
  <div class="pick-confirmation" data-pending-slot={pendingSlot ?? ''} data-selected-season={selectedSeasonId}>
   <p>{#if pendingSlot}<span class="preview-label">Preview</span> <strong>{selectedProfile.displayName}</strong> · {selectedProfile.year} · {pendingSlot}{:else}{destinations.length ? 'Choose a highlighted open position.' : 'Reassign your roster to make room.'}{/if}</p>
   <div class="confirmation-actions">
    <button type="button" class="primary" disabled={!canConfirm} onclick={confirmPick}>{pendingSlot ? `Draft at ${pendingSlot}` : 'Draft player'}</button>
    {#if pendingSlot}<button type="button" class="secondary" onclick={() => pendingSlot = null}>Back</button>{/if}
    <button type="button" class="quiet" onclick={cancelSelection}>Cancel selection</button>
   </div>
  </div>
 {:else}<p class="field-hint">Select a card to preview a pick. Select a drafted hitter to move or swap.</p>{/if}
{/snippet}

<div class="draft-board" class:wide>
 <Reveal roll={draft.currentRoll} {manifest} revealing={phase === 'revealing'} pickNumber={draft.picks.length + 1} schemaVersion={draft.schemaVersion} teamColor={draft.currentRoll ? media?.teams[draft.currentRoll.franchiseId]?.color : undefined} />
 <div class="draft-toolbar">
  <p class="eyebrow">{phase === 'ready' ? 'Pick locked in' : 'Select · Place · Confirm'}</p>
  {#if !wide}<button type="button" class="secondary open-field" onclick={event => { trigger = event.currentTarget; sheetOpen = true; }}>Open your field <span>{draft.picks.length} / {draftRules(draft.schemaVersion).slots.length}</span></button>{/if}
 </div>
 <div class="board-columns">
  <section class="draft-browser" aria-label="Make your next pick">
   {#if phase === 'ready'}
    <div class="next-roll">
     {#if lastProfile && lastPick}<p class="last-pick"><strong>{lastProfile.displayName}</strong> · {lastProfile.year} · {lastPick.slot}</p>{/if}
     <p class="muted">{draft.picks.length ? "Pick locked in. Who's next?" : 'Your roster starts with one roll.'}</p>
     <button id="roll-next" class="primary" disabled={busy} onclick={onRoll}>Roll next franchise <span aria-hidden="true">↗</span></button>
    </div>
   {:else if loading || phase === 'revealing'}
    <div class="stack" role="status" aria-label="Loading available player seasons"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><span class="muted">Finding eligible seasons…</span></div>
   {:else if pool.length}
    <CandidateList profiles={pool} {draft} {manifest} {rankings} {rankingLoading} {rankingError} {onRetryRankings} {busy} {selectedSeasonId} {selectedSeasons} {wide} onSelect={selectCandidate} onSeasonChange={changeSeason} onResetBrowse={resetBrowse} />
   {/if}
  </section>
  {#if wide}<aside class="field-panel" aria-label="Your field"><div class="panel-header">{@render fieldHeader()}</div><div class="field-scroll">{@render fieldContent()}</div><div class="field-footer">{@render fieldFooter()}</div></aside>{/if}
 </div>
 <DraftSheet open={!wide && sheetOpen} {trigger} onClose={dismissSheet} header={fieldHeader} children={fieldContent} footer={fieldFooter} />
 {#if wide && inspectedCard}<CardInspection bind:this={inspection} s={inspectedCard} returnFocus={fieldHeading} onClose={() => inspectedSeasonId = null} />{/if}
</div>

<style>
 .draft-board, .draft-browser { min-width: 0; }
 .draft-toolbar { display: flex; align-items: center; justify-content: space-between; gap: .75rem; position: sticky; top: 0; z-index: 5; background: var(--background); padding-block: .75rem; }
 .draft-toolbar p { margin: 0; }
 .open-field { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; min-height: 44px; }
 .open-field span { color: var(--muted); font-size: .8rem; }
 .board-columns { display: grid; min-width: 0; }
 .wide .board-columns { grid-template-columns: minmax(0, 1fr) 480px; gap: 32px; align-items: start; }
 .wide .draft-toolbar { position: static; }
 .field-panel { position: sticky; top: 16px; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; max-height: calc(100dvh - 32px); min-width: 0; background: var(--surface); border: 1px solid var(--border); border-radius: .65rem; overflow: hidden; }
 .panel-header { padding-inline: 1rem; }
 .field-scroll { min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
 .field-footer { padding: 1rem; border-top: 1px solid var(--border); background: var(--surface-raised); }
 .field-header { display: flex; align-items: start; justify-content: space-between; gap: .75rem; padding-block: 1rem .5rem; }
 .field-header > div { min-width: 0; }
 h2 { margin: 0; font: 800 1.7rem/1.1 'Barlow Condensed', sans-serif; }
 h2 span { color: var(--muted); font: 600 .8rem/1.2 system-ui, sans-serif; white-space: nowrap; }
 .active-player { overflow-wrap: anywhere; margin: .4rem 0 0; font-size: .9rem; }
 .sheet-season { display: grid; gap: .3rem; font-size: .8rem; margin-bottom: .75rem; }
 select { min-height: 44px; width: 100%; min-width: 0; }
 .tabs { display: flex; gap: .5rem; }
 .tabs button { flex: 1; min-height: 44px; }
 .tabs [aria-selected='true'] { background: var(--text); color: var(--background); }
 .designed-back { width: min(100%, 330px); margin-inline: auto; }
 .confirmation-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
 .confirmation-actions button, .move-controls button, .field-header button, .back-to-field { min-height: 44px; }
 .pick-confirmation p, .move-controls p, .field-hint { margin: 0 0 .6rem; font-size: .85rem; overflow-wrap: anywhere; }
 .preview-label { color: var(--accent); font-weight: 750; }
 .move-controls button + button { margin-left: .5rem; }
 .sheet-error { color: var(--error); margin: 0 0 .75rem; }
 .next-roll { padding-block: 2rem; }
 .last-pick { overflow-wrap: anywhere; }
 .back-to-field { margin-bottom: .75rem; }
 @media (min-width: 768px) { .designed-back { width: min(100%, 410px); } }
 @media (max-width: 374px) { .draft-toolbar { align-items: start; } .draft-toolbar .eyebrow { max-width: 6rem; font-size: .65rem; } }
</style>
