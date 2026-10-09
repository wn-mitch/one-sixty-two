<script lang="ts">
 import { onMount, tick } from 'svelte';
 import type { Draft, HitterSlot, Manifest, Profile, Slot } from '../game/types.ts';
 import { draftRules } from '../game/rules.ts';
 import Card from '../cards/Card.svelte';
 import CardReview from '../cards/CardReview.svelte';
 import { createCardViewModel, type CardMediaStatus } from '../cards/view-model.ts';
 import { loadMedia } from '../media/client.ts';
 import type { MediaManifest } from '../media/types.ts';
 import type { WarRankings } from '../rankings/types.ts';
 import RosterAssignment from './RosterAssignment.svelte';
 let { draft, manifest, profiles, rankings, rankingLoading, rankingError, busy, onReassign, onOrder, onsimulate }: {
  draft: Draft;
  manifest: Manifest;
  profiles: Profile[];
  rankings: WarRankings | null;
  rankingLoading: boolean;
  rankingError: boolean;
  busy: boolean;
  onReassign: (seasonId: string, destination: HitterSlot) => void;
  onOrder: (kind: 'batting' | 'starter', order: string[]) => void;
  onsimulate: () => void;
 } = $props();
 let announcement = $state('');
 type OrderKind = 'batting' | 'starter';
 type Drag = {
  kind: OrderKind; seasonId: string; pointerId: number; handle: HTMLButtonElement;
  startX: number; startY: number; x: number; y: number;
  originalOrder: string[]; active: boolean; insertion: number | null;
 };
 let drag = $state<Drag | null>(null);
 let scrollFrame = 0;
 let suppressClickUntil = 0;
 let media = $state.raw<MediaManifest | null>(null);
 let mediaStatus = $state<CardMediaStatus>('loading');
 let inspectedSeasonId = $state<string | null>(null);
 let inspectionTrigger: HTMLButtonElement | null = null;
 let review = $state<CardReview>();
 let lineupHeading = $state<HTMLHeadingElement>();
 const bySeason = $derived(new Map(profiles.map(profile => [profile.seasonId, profile])));
 const bySeasonPick = $derived(new Map(draft.picks.map(pick => [pick.seasonId, pick])));
 const closerPick = $derived(draft.picks.find(pick => pick.slot === 'CL'));
 const closer = $derived(closerPick ? bySeason.get(closerPick.seasonId) : undefined);
 const bullpenPick = $derived(draft.picks.find(pick => pick.slot === 'BP'));
 const bullpen = $derived(bullpenPick ? bySeason.get(bullpenPick.seasonId) : undefined);
 const complete = $derived(draft.picks.length === draftRules(draft.schemaVersion).slots.length && draft.battingOrder.length === 9 && draft.starterOrder.length === 3 && draft.picks.every(pick => bySeason.has(pick.seasonId)));
 const cardViews = $derived(new Map(draft.picks.flatMap(pick => {
  const profile = bySeason.get(pick.seasonId);
  return profile ? [[pick.seasonId, createCardViewModel({ profile, slot: pick.slot, manifest, rankings, media, mediaStatus })] as const] : [];
 })));
 const inspectedCard = $derived(inspectedSeasonId ? cardViews.get(inspectedSeasonId) : undefined);

 function orderFor(kind: OrderKind): string[] {
  return kind === 'batting' ? draft.battingOrder : draft.starterOrder;
 }

 function commitOrder(kind: OrderKind, seasonId: string, destination: number): void {
  if (busy) return;
  const current = orderFor(kind);
  const source = current.indexOf(seasonId);
  if (source < 0 || destination < 0 || destination >= current.length || source === destination) return;
  const order = [...current];
  order.splice(source, 1);
  order.splice(destination, 0, seasonId);
  onOrder(kind, order);
  const profile = bySeason.get(seasonId);
  announcement = `${profile?.displayName ?? 'Player'}${profile ? ` ${profile.year}` : ''} moved to ${kind === 'batting' ? 'batting position' : 'rotation position'} ${destination + 1}.`;
 }

 async function inspect(seasonId: string, trigger: HTMLButtonElement): Promise<void> {
  if (drag?.active || performance.now() < suppressClickUntil || !cardViews.has(seasonId)) return;
  inspectionTrigger = trigger;
  inspectedSeasonId = seasonId;
  await tick();
  review?.focusHeading();
 }

 function closeInspection(): void {
  const trigger = inspectionTrigger;
  inspectedSeasonId = null;
  inspectionTrigger = null;
  void tick().then(() => {
   if (trigger?.isConnected && trigger.getClientRects().length > 0) trigger.focus({ preventScroll: true });
   else if (lineupHeading?.isConnected) lineupHeading.focus({ preventScroll: true });
  });
 }

 function cancelDrag(): void {
  const previous = drag;
  drag = null;
  cancelAnimationFrame(scrollFrame);
  if (previous?.active) suppressClickUntil = performance.now() + 400;
  if (previous?.handle.hasPointerCapture(previous.pointerId)) previous.handle.releasePointerCapture(previous.pointerId);
 }

 function startDrag(event: PointerEvent, kind: OrderKind, seasonId: string): void {
  if (busy || drag || !event.isPrimary || event.button !== 0) return;
  const handle = event.currentTarget as HTMLButtonElement;
  handle.setPointerCapture(event.pointerId);
  drag = {
   kind, seasonId, handle, pointerId: event.pointerId,
   startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
   originalOrder: [...orderFor(kind)], active: false, insertion: null
  };
 }

 function updateInsertion(): void {
  if (!drag?.active) return;
  const list = document.elementFromPoint(drag.x, drag.y)?.closest<HTMLOListElement>('[data-order-kind]');
  if (!list || list.dataset.orderKind !== drag.kind) {
   drag.insertion = null;
   return;
  }
  const rows = Array.from(list.children);
  const boundary = rows.findIndex(row => {
   const rect = row.getBoundingClientRect();
   return drag!.y < rect.top + rect.height / 2;
  });
  drag.insertion = boundary === -1 ? rows.length : boundary;
 }

 function scrollWhileDragging(): void {
  if (!drag?.active) return;
  const edge = 64;
  const speed = drag.y < edge ? -12 : drag.y > window.innerHeight - edge ? 12 : 0;
  if (speed) {
   window.scrollBy(0, speed);
   updateInsertion();
  }
  scrollFrame = requestAnimationFrame(scrollWhileDragging);
 }

 function moveDrag(event: PointerEvent): void {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (busy) { cancelDrag(); return; }
  drag.x = event.clientX;
  drag.y = event.clientY;
  if (!drag.active && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) >= 6) {
   drag.active = true;
   scrollFrame = requestAnimationFrame(scrollWhileDragging);
  }
  updateInsertion();
 }

 function finishDrag(event: PointerEvent): void {
  if (!drag || event.pointerId !== drag.pointerId) return;
  moveDrag(event);
  const completed = drag;
  if (completed?.active && completed.insertion !== null && !busy) {
   const source = orderFor(completed.kind).indexOf(completed.seasonId);
   const destination = completed.insertion - (source < completed.insertion ? 1 : 0);
   commitOrder(completed.kind, completed.seasonId, destination);
  }
  cancelDrag();
 }

 function cancelPointer(event: PointerEvent): void {
  if (event.pointerId === drag?.pointerId) cancelDrag();
 }

 function preventDragClick(event: MouseEvent): void {
  if (event.detail > 0 && performance.now() < suppressClickUntil) {
   event.preventDefault();
   event.stopPropagation();
   suppressClickUntil = 0;
  }
 }

 $effect(() => {
  if (!drag) return;
  const current = orderFor(drag.kind);
  if (busy || current.length !== drag.originalOrder.length || current.some((id, index) => id !== drag!.originalOrder[index])) cancelDrag();
 });

 $effect(() => {
  if (inspectedSeasonId && !cardViews.has(inspectedSeasonId)) {
   inspectedSeasonId = null;
   inspectionTrigger = null;
  }
 });

 onMount(() => {
  let disposed = false;
  void loadMedia().then(value => {
   if (!disposed) { media = value; mediaStatus = 'ready'; }
  }).catch(() => {
   if (!disposed) mediaStatus = 'unavailable';
  });
  return () => { disposed = true; cancelDrag(); };
 });
</script>

<svelte:window onpointermove={moveDrag} onpointerup={finishDrag} onpointercancel={cancelPointer} onblur={cancelDrag} onkeydown={event => { if (event.key === 'Escape') cancelDrag(); }} onclickcapture={preventDragClick} />

<section class="lineup" aria-label="Set your lineup" aria-busy={busy}>
 <header>
  <p class="eyebrow">{draftRules(draft.schemaVersion).slots.length} picks. One shot at perfection.</p>
  <h2 id="lineup-heading" bind:this={lineupHeading} tabindex="-1">Make the lineup yours.</h2>
  <p class="muted">Drag the handles or use the arrows to order hitters and starters. Tap a card to inspect its exact season. Fielding and DH assignments can change before simulation.</p>
  {#if !rankings && (rankingLoading || rankingError)}
   <p class="muted">{rankingLoading ? 'Season value rankings are loading.' : 'Season value rankings are unavailable.'} Your lineup can still be edited.</p>
  {/if}
 </header>
 <p class="announcement" aria-live="polite" aria-atomic="true">{announcement}</p>
 <div class="lineup-columns">
  <section aria-labelledby="batting-heading">
   <div class="section-heading"><h3 id="batting-heading">Batting order</h3><span class="muted">1 through 9</span></div>
   {@render orderList('batting', draft.battingOrder)}
  </section>
  <section aria-labelledby="rotation-heading">
   <div class="section-heading"><h3 id="rotation-heading">Starting rotation</h3><span class="muted">54 starts each</span></div>
   {@render orderList('starter', draft.starterOrder)}
   <p class="workload muted">Your three starters cycle in this order for all 162 games. No injuries or seasonal starter fatigue are modeled.</p>
   <div class="closer">
    <h3>Closer</h3>
    {#if closer}
     {@render compactCard(closer, 'CL')}
    {:else}
     <p class="muted">Loading selected closer…</p>
    {/if}
    <p class="workload muted">Available from the ninth inning when tied or ahead by 1–3. One inning per appearance, with a season innings cap and rest after two consecutive games.</p>
   </div>
   <div class="support">
    <h3>Drafted bullpen remainder</h3>
    {#if bullpen}{@render compactCard(bullpen, 'BP')}{/if}
    <p class="workload muted">Pooled relief-dominant pitcher-seasons, excluding this team-season’s saves leader, handle the remaining innings with unlimited support workload. Composition stays fixed independently of your closer. This is a pitching abstraction, not a full 26-player roster.</p>
   </div>
  </section>
 </div>
 {#if inspectedCard}
  {#key inspectedSeasonId}
   <CardReview id="lineup-card-review" bind:this={review} s={inspectedCard} onClose={closeInspection} />
  {/key}
 {/if}
 <footer class="simulate">
  <p>No second chances inside the season. Every game counts.</p>
  <button type="button" class="primary" disabled={busy || !complete} onclick={onsimulate}>{busy ? 'Preparing your season…' : 'Simulate 162 games'}</button>
  {#if !complete && !busy}<p class="notice">All {draftRules(draft.schemaVersion).slots.length} selected seasons must finish loading before the season can start.</p>{/if}
 </footer>
</section>

{#snippet artwork(profile: Profile)}
 {@const card = cardViews.get(profile.seasonId)}
 {#if card}
  <button type="button" class="card-trigger" aria-label={`Inspect ${profile.year} ${profile.displayName} card`} aria-expanded={inspectedSeasonId === profile.seasonId} aria-controls="lineup-card-review" onclick={event => inspect(profile.seasonId, event.currentTarget)}>
   <span class="miniature" aria-hidden="true" inert>
    <Card s={card} face="front" compact thumbnail interactive={false} onDetails={() => {}} />
   </span>
  </button>
 {/if}
{/snippet}

{#snippet compactCard(profile: Profile, slot: Slot)}
 <div class="fixed-player" data-season-id={profile.seasonId}>
  {@render artwork(profile)}
  <div class="identity">
   <strong class="name">{profile.displayName}</strong>
   <span class="season">{profile.year} · {slot}</span>
  </div>
 </div>
{/snippet}

{#snippet orderList(kind: OrderKind, order: string[])}
 <ol class="order" data-order-kind={kind} aria-label={kind === 'batting' ? 'Batting order' : 'Starting rotation'}>
  {#each order as seasonId, index (seasonId)}
   {@const profile = bySeason.get(seasonId)}
   {@const pick = bySeasonPick.get(seasonId)}
   {@const dragging = drag?.active && drag.kind === kind}
   <li data-season-id={seasonId} class:drag-source={dragging && drag?.seasonId === seasonId} class:insert-before={dragging && drag?.insertion === index} class:insert-after={dragging && drag?.insertion === order.length && index === order.length - 1}>
    {#if profile && pick}{@render artwork(profile)}{/if}
    <div class="order-heading">
     <span class="order-number" aria-label="Position {index + 1}">{index + 1}</span>
     <div class="identity">
      <strong class="name">{profile?.displayName ?? 'Loading selected season…'}</strong>
      {#if profile && pick}<span class="season">{profile.year} · {pick.slot}</span>{/if}
     </div>
    </div>
    <div class="move-controls">
     <button type="button" class="secondary drag-handle" disabled={busy} aria-label={`Drag ${profile?.displayName ?? 'player'}${profile ? ` ${profile.year}` : ''} within ${kind === 'batting' ? 'batting order' : 'starting rotation'}`} title="Drag to reorder; use arrow buttons for keyboard ordering" onpointerdown={event => startDrag(event, kind, seasonId)} onlostpointercapture={cancelPointer}><span aria-hidden="true">⠿</span></button>
     <button type="button" class="secondary move" disabled={busy || index === 0} aria-label="Move {profile?.displayName ?? 'player'}{profile ? ` ${profile.year}` : ''} up in {kind === 'batting' ? 'batting order' : 'starting rotation'}" onclick={() => commitOrder(kind, seasonId, index - 1)}><span aria-hidden="true">↑</span></button>
     <button type="button" class="secondary move" disabled={busy || index === order.length - 1} aria-label="Move {profile?.displayName ?? 'player'}{profile ? ` ${profile.year}` : ''} down in {kind === 'batting' ? 'batting order' : 'starting rotation'}" onclick={() => commitOrder(kind, seasonId, index + 1)}><span aria-hidden="true">↓</span></button>
    </div>
    {#if kind === 'batting'}
     <div class="assignment-control">
      <RosterAssignment {seasonId} {draft} {manifest} {profiles} busy={busy || !!drag?.active} {onReassign} />
     </div>
    {/if}
   </li>
  {/each}
 </ol>
{/snippet}

<style>
 .lineup { min-width: 0; }
 header { margin-block: var(--space-6); }
 h2 { margin: var(--space-2) 0 var(--space-4); font-size: var(--text-2xl); }
 header > .muted { max-width: 60ch; font-size: var(--text-sm); }
 .lineup-columns { display: grid; gap: var(--space-8); }
 .lineup-columns > section { min-width: 0; }
 .section-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--space-2) var(--space-4); margin-bottom: var(--space-2); padding-bottom: var(--space-3); border-bottom: 1px solid var(--border); }
 h3 { font-size: var(--text-lg); }
 .section-heading > span { font-size: var(--text-xs); }
 .order { list-style: none; padding: 0; margin: 0; }
 .order li { position: relative; display: grid; grid-template-columns: max(4.5rem, 72px) minmax(0, 1fr); align-items: start; gap: var(--space-2) var(--space-3); padding-block: var(--space-4); min-width: 0; border-bottom: 1px solid var(--border); }
 .order li > .card-trigger { grid-row: 1 / 3; }
 .order-heading { grid-column: 2; display: flex; align-items: baseline; gap: var(--space-2); min-width: 0; }
 .order-number { flex: 0 0 1rem; color: var(--muted); font-size: var(--text-base); font-weight: 750; }
 .identity { display: grid; min-width: 0; gap: var(--space-1); }
 .name { font-weight: 650; overflow-wrap: anywhere; font-size: var(--text-sm); }
 .season { color: var(--muted); font-size: var(--text-xs); }
 .move-controls { display: flex; flex-wrap: wrap; gap: var(--space-1); grid-column: 2; }
 .move, .drag-handle { width: 2.75rem; min-height: 2.75rem; padding: var(--space-2); font-size: var(--text-lg); }
 .drag-handle { touch-action: none; cursor: grab; user-select: none; }
 .drag-source .drag-handle { cursor: grabbing; }
 .drag-source { background: var(--surface-raised); }
 .insert-before::before, .insert-after::after { content: ''; position: absolute; inset-inline: 0; height: 3px; background: var(--accent); pointer-events: none; }
 .insert-before::before { top: 0; }
 .insert-after::after { bottom: 0; }
 .assignment-control { grid-column: 1 / -1; min-width: 0; }
 .fixed-player { display: grid; grid-template-columns: max(4.5rem, 72px) minmax(0, 1fr); gap: var(--space-3); align-items: center; margin-block: var(--space-3); }
 .card-trigger { display: block; width: max(4.5rem, 72px); min-width: 72px; padding: 0; border: 0; background: none; color: inherit; cursor: pointer; }
 .card-trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
 .miniature { display: block; width: 100%; pointer-events: none; }
 .closer, .support { margin-top: var(--space-6); padding-top: var(--space-6); border-top: 1px solid var(--border); }
 .workload { font-size: var(--text-xs); line-height: 1.5; max-width: 60ch; }
 .simulate { margin-top: var(--space-8); padding-block: var(--space-6); border-top: 1px solid var(--border); }
 .simulate > p:first-child { margin: 0 0 var(--space-4); }
 .simulate .primary { width: 100%; }
 .announcement { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
 @media (min-width: 64rem) { .lineup-columns { grid-template-columns: 1.25fr 1fr; gap: var(--space-12); } .simulate .primary { width: auto; min-width: 16rem; } }
 @media (min-width: 40rem) { .assignment-control { grid-column: 2; } }
</style>
