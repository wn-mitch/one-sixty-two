<script lang="ts">
 import { onMount, tick } from 'svelte';
 import { RELIEF_ROLES, RELIEF_SLOTS, type BullpenSlot, type Draft, type HitterSlot, type Manifest, type Profile, type ReliefAssignment, type ReliefRole } from '../game/types.ts';
 import { draftRules } from '../game/rules.ts';
 import Card from '../cards/Card.svelte';
 import CardReview from '../cards/CardReview.svelte';
 import { createCardViewModel, lineupStats, type CardMediaStatus } from '../cards/view-model.ts';
 import { loadMedia } from '../media/client.ts';
 import type { MediaManifest } from '../media/types.ts';
 import type { WarRankings } from '../rankings/types.ts';
 import RosterAssignment from './RosterAssignment.svelte';
 import { createOrderMotion, type OrderMotion } from './order-motion.ts';
 import { arriveAtTop, clearStage, flyInto, riseIn, stash, take } from './phase-motion.ts';
 import { MOTION } from '../motion-timing.ts';
 import { smartBattingOrder, smartReliefRoles, smartRotation } from '../game/smart-lineup.ts';
 let { draft, manifest, profiles, rankings, rankingLoading, rankingError, busy, onReassign, onOrder, onRoles, onsimulate }: {
  draft: Draft;
  manifest: Manifest;
  profiles: Profile[];
  rankings: WarRankings | null;
  rankingLoading: boolean;
  rankingError: boolean;
  busy: boolean;
  onReassign: (seasonId: string, destination: HitterSlot) => void;
  onOrder: (kind: 'batting' | 'starter', order: string[]) => void;
  onRoles: (reliefRoles: ReliefAssignment[]) => void;
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
 /** Row geometry measured when a drag activates; transforms never change these layout positions. */
 type DragLayout = { list: HTMLOListElement; rows: HTMLElement[]; tops: number[]; heights: number[]; source: number; startScroll: number; shifts: number[] };
 let layout: DragLayout | null = null;
 let motion: OrderMotion | null = null;
 let scrollFrame = 0;
 let suppressClickUntil = 0;
 let media = $state.raw<MediaManifest | null>(null);
 let mediaStatus = $state<CardMediaStatus>('loading');
 let inspectedSeasonId = $state<string | null>(null);
 let inspectionTrigger: HTMLButtonElement | null = null;
 let inspectionSource = $state<HTMLElement | null>(null);
 let inspectedOpened = $state(false);
 let inspectedTurned = $state(false);
 let inspectedTextBack = $state(false);
 let lineupHeading = $state<HTMLHeadingElement>();
 let lineupRoot = $state<HTMLElement>();
 let leaving = $state(false);
 const bySeason = $derived(new Map(profiles.map(profile => [profile.seasonId, profile])));
 const bySeasonPick = $derived(new Map(draft.picks.map(pick => [pick.seasonId, pick])));
 const closerPick = $derived(draft.picks.find(pick => pick.slot === 'CL'));
 const closer = $derived(closerPick ? bySeason.get(closerPick.seasonId) : undefined);
 const ROLE_NAMES: Record<ReliefRole, string> = { closer: 'Closer', setup: 'Setup', middle: 'Middle relief', long: 'Long relief', stopper: 'Stopper' };
 /** When the engine calls each role (`workload.rs`), in plain words. */
 const ROLE_HELP: Record<ReliefRole, string> = {
  closer: 'Pitches the 9th with a lead of 3 runs or fewer.',
  setup: 'Pitches the 8th, then the 7th, with a lead of 3 or fewer once the starter is out.',
  middle: 'Takes any other relief inning; stays a second inning after a quick first.',
  long: 'Takes over when the starter leaves before the 6th or the team trails by 4 or more; stays up to 3 innings.',
  stopper: 'Comes in mid-inning from the 6th with a runner in scoring position and a lead of 3 or fewer.'
 };
 const relievers = $derived(RELIEF_SLOTS.flatMap(slot => {
  const pick = draft.picks.find(item => item.slot === slot);
  const profile = pick ? bySeason.get(pick.seasonId) : undefined;
  return profile ? [{ slot, profile }] : [];
 }));
 const complete = $derived(draft.picks.length === draftRules(draft.schemaVersion).slots.length && draft.battingOrder.length === 9 && draft.starterOrder.length === 3 && draft.picks.every(pick => bySeason.has(pick.seasonId)));
 const cardViews = $derived(new Map(draft.picks.flatMap(pick => {
  const profile = bySeason.get(pick.seasonId);
  return profile ? [[pick.seasonId, createCardViewModel({ profile, slot: pick.slot, manifest, rankings, media, mediaStatus })] as const] : [];
 })));
 const inspectedCard = $derived(inspectedSeasonId ? cardViews.get(inspectedSeasonId) : undefined);
 const bullpenProfiles = $derived(new Map(draft.picks.flatMap(pick => {
  const profile = bySeason.get(pick.seasonId);
  return profile && (pick.slot === 'CL' || (RELIEF_SLOTS as readonly string[]).includes(pick.slot)) ? [[pick.slot as BullpenSlot, profile] as const] : [];
 })));
 const smartBatting = $derived(smartBattingOrder(draft.battingOrder, bySeason));
 const smartStarters = $derived(smartRotation(draft.starterOrder, bySeason));
 const smartRoles = $derived(smartReliefRoles(draft.reliefRoles, bullpenProfiles));
 const sameOrder = (a: string[], b: string[]) => a.length === b.length && a.every((id, index) => id === b[index]);
 const battingIsSmart = $derived(sameOrder(draft.battingOrder, smartBatting));
 const startersAreSmart = $derived(sameOrder(draft.starterOrder, smartStarters));
 const rolesAreSmart = $derived(draft.reliefRoles.every((assignment, index) => assignment.primary === smartRoles[index]?.primary && assignment.secondary === smartRoles[index]?.secondary));

 function applySmartOrder(kind: OrderKind): void {
  if (busy || drag) return;
  const order = kind === 'batting' ? smartBatting : smartStarters;
  animateOrder(lineupRoot?.querySelector<HTMLElement>(`[data-order-kind="${kind}"]`) ?? null, () => onOrder(kind, order));
  const names = order.map(id => bySeason.get(id)?.displayName ?? 'Player');
  announcement = kind === 'batting' ? `Smart lineup set: ${names.join(', ')}.` : `Ace first: ${names.join(', ')}.`;
 }

 function applySmartRoles(): void {
  if (busy) return;
  onRoles(smartRoles);
  announcement = `Smart roles set: ${smartRoles.map(assignment => `${bullpenProfiles.get(assignment.slot)?.displayName ?? assignment.slot} ${ROLE_NAMES[assignment.primary]}`).join(', ')}.`;
 }

 function rolesFor(slot: BullpenSlot): ReliefAssignment | undefined {
  return draft.reliefRoles.find(assignment => assignment.slot === slot);
 }

 /** A primary role that matches the backup clears the backup, since one pitcher holds a role once. */
 function changeRole(slot: BullpenSlot, profile: Profile, kind: 'primary' | 'secondary', value: string): void {
  if (busy) return;
  const reliefRoles = draft.reliefRoles.map(assignment => {
   if (assignment.slot !== slot) return assignment;
   if (kind === 'primary') {
    const primary = value as ReliefRole;
    return { ...assignment, primary, secondary: assignment.secondary === primary ? null : assignment.secondary };
   }
   return { ...assignment, secondary: value ? value as ReliefRole : null };
  });
  onRoles(reliefRoles);
  const next = reliefRoles.find(assignment => assignment.slot === slot)!;
  announcement = `${profile.displayName} ${profile.year}: ${ROLE_NAMES[next.primary]}${next.secondary ? `, backup ${ROLE_NAMES[next.secondary]}` : ', no backup role'}.`;
 }

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

 /** Raises the tapped card from its row thumbnail, the same flight the draft field uses. */
 async function inspect(seasonId: string, trigger: HTMLButtonElement): Promise<void> {
  if (drag?.active || performance.now() < suppressClickUntil || !cardViews.has(seasonId)) return;
  inspectedOpened = false;
  inspectedTurned = false;
  inspectedTextBack = false;
  inspectionTrigger = trigger;
  inspectionSource = trigger.querySelector<HTMLElement>('.miniature .card') ?? trigger.querySelector<HTMLElement>('.card-frame');
  inspectedSeasonId = seasonId;
  await tick();
  if (inspectedSeasonId === seasonId) inspectedOpened = true;
 }

 function closeInspection(): void {
  const trigger = inspectionTrigger;
  inspectedSeasonId = null;
  inspectionTrigger = null;
  inspectionSource = null;
  inspectedOpened = false;
  inspectedTurned = false;
  inspectedTextBack = false;
  void tick().then(() => {
   if (trigger?.isConnected && trigger.getClientRects().length > 0) trigger.focus({ preventScroll: true });
   else if (lineupHeading?.isConnected) lineupHeading.focus({ preventScroll: true });
  });
 }

 /** Reorders with a FLIP: rows move from where they appear now to their new slots. */
 function animateOrder(list: HTMLElement | null, change: () => void, lift?: string): void {
  if (!list || !motion) { change(); return; }
  const before = motion.capture(list);
  change();
  void tick().then(() => motion?.settle(list, before, lift));
 }

 function moveBy(kind: OrderKind, seasonId: string, destination: number, trigger: HTMLElement): void {
  animateOrder(trigger.closest('ol'), () => commitOrder(kind, seasonId, destination));
 }

 /** Ends any drag; `apply` runs the committed reorder while the lifted row settles into place. */
 function cancelDrag(apply?: () => void): void {
  const previous = drag;
  const measured = layout;
  drag = null;
  layout = null;
  cancelAnimationFrame(scrollFrame);
  if (previous?.active) suppressClickUntil = performance.now() + 400;
  if (previous?.handle.hasPointerCapture(previous.pointerId)) previous.handle.releasePointerCapture(previous.pointerId);
  if (measured && previous) animateOrder(measured.list, () => apply?.(), previous.seasonId);
  else apply?.();
 }

 function measureLayout(current: Drag): DragLayout | null {
  const row = current.handle.closest<HTMLElement>('li');
  const list = row?.closest<HTMLOListElement>('[data-order-kind]');
  if (!row || !list) return null;
  const rows = Array.from(list.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
  const top = list.getBoundingClientRect().top;
  const source = rows.indexOf(row);
  if (source < 0) return null;
  const rects = rows.map(child => child.getBoundingClientRect());
  return {
   list, rows, source, startScroll: window.scrollY,
   tops: rects.map(rect => rect.top - top), heights: rects.map(rect => rect.height), shifts: rows.map(() => 0)
  };
 }

 /** Follows the pointer with the lifted row and slides its neighbours aside to open the insertion gap. */
 function renderDrag(): void {
  if (!drag?.active || !layout || !motion) return;
  const { rows, source, heights } = layout;
  motion.place(rows[source], drag.y - drag.startY + window.scrollY - layout.startScroll);
  const insertion = drag.insertion;
  const destination = insertion === null ? source : insertion - (source < insertion ? 1 : 0);
  rows.forEach((row, index) => {
   if (index === source) return;
   const shift = source < index && index <= destination ? -heights[source] : destination <= index && index < source ? heights[source] : 0;
   if (shift !== layout!.shifts[index]) {
    layout!.shifts[index] = shift;
    motion!.slide(row, shift);
   }
  });
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
  if (!drag?.active || !layout) return;
  const bounds = layout.list.getBoundingClientRect();
  const y = drag.y - bounds.top;
  // Only the drag's own list accepts a drop; midpoints use untransformed layout positions.
  drag.insertion = drag.x < bounds.left || drag.x > bounds.right || y < 0 || y > bounds.height
   ? null
   : layout.tops.filter((top, index) => top + layout!.heights[index] / 2 <= y).length;
  renderDrag();
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
   layout = measureLayout(drag);
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
   cancelDrag(() => commitOrder(completed.kind, completed.seasonId, destination));
   return;
  }
  cancelDrag();
 }

 function cancelPointer(event: PointerEvent): void {
  if (event.pointerId === drag?.pointerId) cancelDrag();
 }

 /** Rows drop away before the season starts so the broadcast opens on a clear screen. */
 async function simulate(): Promise<void> {
  if (busy || leaving || !lineupRoot) return;
  leaving = true;
  const exit = await clearStage(lineupRoot.querySelectorAll<HTMLElement>('li[data-season-id]'), lineupRoot.querySelectorAll<HTMLElement>(':scope > header, .section-heading, .workload, .simulate'));
  stash('lineup');
  onsimulate();
  await tick();
  leaving = false;
  // Still mounted means the season did not start.
  if (lineupRoot?.isConnected) for (const animation of exit) animation.cancel();
 }

 function cancelDragKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') cancelDrag();
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
  motion = createOrderMotion();
  const arrival = take('field');
  if (arrival) void tick().then(() => {
   if (disposed || !lineupRoot) return;
   arriveAtTop();
   // Each field card flies from its slot to its row; the rest of the screen rises in around them.
   riseIn(lineupRoot.querySelectorAll<HTMLElement>(':scope > header, .section-heading, .workload, .simulate'));
   [...lineupRoot.querySelectorAll<HTMLElement>('li[data-season-id]')].forEach((row, index) => {
    const delay = index * MOTION.handoffStagger;
    const from = arrival.rects.get(row.dataset.seasonId!);
    const card = row.querySelector<HTMLElement>('.miniature .card');
    if (from && card && card.getBoundingClientRect().top < innerHeight) flyInto(card, from, delay);
    // Each row's details follow its card in, together.
    riseIn(row.querySelectorAll<HTMLElement>(':scope > :not(.card-trigger)'), delay + MOTION.handoff * .4, 0);
   });
  });
  void loadMedia().then(value => {
   if (!disposed) { media = value; mediaStatus = 'ready'; }
  }).catch(() => {
   if (!disposed) mediaStatus = 'unavailable';
  });
  return () => {
   disposed = true;
   layout = null;
   cancelDrag();
   motion?.destroy();
   motion = null;
  };
 });
</script>

<svelte:window onpointermove={moveDrag} onpointerup={finishDrag} onpointercancel={cancelPointer} onblur={() => cancelDrag()} onkeydown={cancelDragKey} onclickcapture={preventDragClick} />

<section bind:this={lineupRoot} class="lineup" aria-label="Set your lineup" aria-busy={busy} inert={leaving}>
 <header>
  <h2 id="lineup-heading" bind:this={lineupHeading} tabindex="-1">Set your lineup</h2>
  <p class="muted">Drag the numbers or use the arrows to set the order. Tap a card to inspect its season.</p>
  {#if !rankings && (rankingLoading || rankingError)}
   <p class="muted">{rankingLoading ? 'Season value rankings are loading.' : 'Season value rankings are unavailable.'} Your lineup can still be edited.</p>
  {/if}
 </header>
 <p class="announcement" aria-live="polite" aria-atomic="true">{announcement}</p>
 <div class="lineup-columns">
  <section aria-labelledby="batting-heading">
   <div class="section-heading"><h3 id="batting-heading">Batting order</h3>{@render smartButton('Smart lineup', battingIsSmart, () => applySmartOrder('batting'))}</div>
   {@render orderList('batting', draft.battingOrder)}
   <p class="workload muted">Smart lineup bats your three best hitters 1, 2 and 4: the best on-base hitter leads off and the most power bats cleanup. The next two bat 5 and 3, and the rest follow, best first. Each spot down the order comes up about 18 fewer times a season.</p>
  </section>
  <section aria-labelledby="rotation-heading">
   <div class="section-heading"><h3 id="rotation-heading">Starting rotation</h3>{@render smartButton('Ace first', startersAreSmart, () => applySmartOrder('starter'))}</div>
   {@render orderList('starter', draft.starterOrder)}
   <p class="workload muted">The three starters cycle in this order, 54 starts each, without injuries or fatigue. The order only decides which games each one gets: the opponent, its starter, and the park. Ace first gives your best arm opening day.</p>
   <div class="section-heading relief-heading"><h3 id="relief-heading">Relief</h3>{@render smartButton('Smart roles', rolesAreSmart, applySmartRoles)}</div>
   <ul class="order fixed" aria-labelledby="relief-heading">
    {#if closer}
     {@render fixedPlayer(closer, 'CL')}
    {:else}
     <li><span class="order-number fixed-label">CL</span><span class="muted identity">Loading selected closer…</span></li>
    {/if}
    {#each relievers as { slot, profile } (slot)}{@render fixedPlayer(profile, slot)}{/each}
   </ul>
   <p class="workload muted">Smart roles gives your best arm the closer's job, the next two setup, and the rest middle and long relief. Roles decide who pitches when, a backup role is used only after a day off, no one pitches three days running, and a league-average relief pool covers the rest; <a href="/about#simulation">Rules &amp; model</a> has the details.</p>
  </section>
 </div>
 {#if inspectedCard}
  {#key inspectedSeasonId}
   <CardReview id="lineup-card-review" s={inspectedCard} bind:opened={inspectedOpened} bind:turned={inspectedTurned} bind:textBack={inspectedTextBack} showControl={false} sourceElement={inspectionSource} raisedOnly onClose={closeInspection} />
  {/key}
 {/if}
 <footer class="simulate">
  <button type="button" class="primary" disabled={busy || !complete} onclick={() => void simulate()}>{busy ? 'Preparing your season…' : 'Simulate 162 games'}</button>
  {#if !complete && !busy}<p class="notice">All {draftRules(draft.schemaVersion).slots.length} selected seasons must finish loading before the season can start.</p>{/if}
 </footer>
</section>

{#snippet smartButton(label: string, applied: boolean, apply: () => void)}
 <button type="button" class="secondary smart" disabled={busy || applied || !complete} title={applied ? 'Already in this order' : undefined} onclick={apply}>
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 4.5h10M3 8h7M3 11.5h4"></path></svg>
  {label}
 </button>
{/snippet}

{#snippet artwork(profile: Profile)}
 {@const card = cardViews.get(profile.seasonId)}
 {#if card}
  <button type="button" class="card-trigger" aria-label={`Inspect ${profile.year} ${profile.displayName} card`} aria-expanded={inspectedSeasonId === profile.seasonId && inspectedOpened} aria-controls="lineup-card-review" onclick={event => inspect(profile.seasonId, event.currentTarget)}>
   <span class="miniature" aria-hidden="true" inert>
    <Card s={card} face="front" thumbnail interactive={false} onDetails={() => {}} />
   </span>
  </button>
 {:else}
  <span class="card-trigger placeholder" aria-hidden="true"></span>
 {/if}
{/snippet}

{#snippet stats(profile: Profile, role: 'batting' | 'starter' | 'closer')}
 <span class="stats">
  {#each lineupStats(profile, role) as stat (stat.l)}
   <span class="stat"><span class="value">{stat.v}</span> <span class="label">{stat.l}</span></span>
  {/each}
 </span>
{/snippet}

{#snippet fixedPlayer(profile: Profile, slot: BullpenSlot)}
 {@const assigned = rolesFor(slot)}
 {@const name = `${profile.displayName} ${profile.year}`}
 <li class="fixed-player" data-season-id={profile.seasonId} data-bullpen-slot={slot}>
  <span class="order-number fixed-label">{slot}</span>
  {@render artwork(profile)}
  <div class="identity">
   <strong class="name">{profile.displayName}</strong>
   <span class="season">{profile.year}</span>
  </div>
  <div class="meta">
   {@render stats(profile, 'closer')}
  </div>
  {#if assigned}
   <div class="roles">
    <label><span>Role</span>
     <select value={assigned.primary} disabled={busy} aria-label={`Role for ${name}`} onchange={event => changeRole(slot, profile, 'primary', event.currentTarget.value)}>
      {#each RELIEF_ROLES as role (role)}<option value={role}>{ROLE_NAMES[role]}</option>{/each}
     </select>
    </label>
    <label><span>Backup</span>
     <select value={assigned.secondary ?? ''} disabled={busy} aria-label={`Backup role for ${name}`} onchange={event => changeRole(slot, profile, 'secondary', event.currentTarget.value)}>
      <option value="">None</option>
      {#each RELIEF_ROLES.filter(role => role !== assigned.primary) as role (role)}<option value={role}>{ROLE_NAMES[role]}</option>{/each}
     </select>
    </label>
    <p class="role-help muted">{ROLE_HELP[assigned.primary]}</p>
   </div>
  {/if}
 </li>
{/snippet}

{#snippet orderList(kind: OrderKind, order: string[])}
 <ol class="order {kind}" data-order-kind={kind} aria-label={kind === 'batting' ? 'Batting order' : 'Starting rotation'}>
  {#each order as seasonId, index (seasonId)}
   {@const profile = bySeason.get(seasonId)}
   {@const pick = bySeasonPick.get(seasonId)}
   {@const dragging = drag?.active && drag.kind === kind}
   {@const label = `${profile?.displayName ?? 'player'}${profile ? ` ${profile.year}` : ''}`}
   {@const listName = kind === 'batting' ? 'batting order' : 'starting rotation'}
   <li data-season-id={seasonId} class:drag-source={dragging && drag?.seasonId === seasonId} class:insert-before={dragging && drag?.insertion === index} class:insert-after={dragging && drag?.insertion === order.length && index === order.length - 1}>
    <button type="button" class="order-number drag-handle" disabled={busy} aria-label={`Position ${index + 1}. Drag ${label} within ${listName}`} title="Drag to reorder" onpointerdown={event => startDrag(event, kind, seasonId)} onlostpointercapture={cancelPointer}>
     <span class="grip" aria-hidden="true">⠿</span><span aria-hidden="true">{index + 1}</span>
    </button>
    {#if profile && pick}{@render artwork(profile)}{:else}<span class="card-trigger placeholder" aria-hidden="true"></span>{/if}
    <div class="identity">
     <strong class="name">{profile?.displayName ?? 'Loading selected season…'}</strong>
     {#if profile}<span class="season">{profile.year}</span>{/if}
    </div>
    <div class="meta">
     {#if kind === 'batting'}
      <span class="assignment-control">
       <RosterAssignment {seasonId} {draft} {manifest} {profiles} busy={busy || !!drag?.active} {onReassign} onAnnounce={message => { announcement = message; }} />
      </span>
     {/if}
     {#if profile}{@render stats(profile, kind === 'batting' ? 'batting' : 'starter')}{/if}
    </div>
    <div class="move-controls">
     <button type="button" class="quiet move" disabled={busy || index === 0} aria-label="Move {label} up in {listName}" onclick={event => moveBy(kind, seasonId, index - 1, event.currentTarget)}><span aria-hidden="true">↑</span></button>
     <button type="button" class="quiet move" disabled={busy || index === order.length - 1} aria-label="Move {label} down in {listName}" onclick={event => moveBy(kind, seasonId, index + 1, event.currentTarget)}><span aria-hidden="true">↓</span></button>
    </div>
   </li>
  {/each}
 </ol>
{/snippet}

<style>
 .lineup { min-width: 0; }
 header { margin-block: var(--space-6) var(--space-8); }
 h2 { margin: 0 0 var(--space-2); font-size: var(--text-2xl); }
 header > .muted { max-width: 60ch; font-size: var(--text-sm); margin: 0; }
 .lineup-columns { display: grid; gap: var(--space-8); }
 .lineup-columns > section { min-width: 0; }
 .section-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--space-1) var(--space-4); padding-bottom: var(--space-2); border-bottom: 1px solid var(--border); }
 .relief-heading { margin-top: var(--space-8); }
 h3 { font-size: var(--text-lg); }
 .smart { display: inline-flex; align-items: center; gap: var(--space-2); min-height: 2.5rem; padding-inline: var(--space-3); font-size: var(--text-sm); }
 .smart svg { width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; }
 .section-heading { align-items: center; }

 /* Narrow: number | card | identity over meta | stacked arrows. */
 .order { list-style: none; padding: 0; margin: 0; }
 .order li {
  position: relative; display: grid; align-items: center; min-width: 0;
  grid-template-columns: 3.25rem 56px minmax(0, 1fr) 2.75rem;
  grid-template-areas: 'num card identity move' 'num card meta move';
  gap: var(--space-1) var(--space-3); padding: var(--space-2) var(--space-2) var(--space-2) 0;
  border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface);
 }
 /* Each player is a compact card tile; tiles stack with a small gap. */
 .order { display: grid; gap: var(--space-2); padding-top: var(--space-3); container-type: inline-size; }
 .order-number { grid-area: num; }
 .order li > .card-trigger { grid-area: card; }
 .identity { grid-area: identity; display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 var(--space-2); min-width: 0; align-self: end; }
 .meta { grid-area: meta; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); min-width: 0; align-self: start; }
 .move-controls { grid-area: move; display: flex; flex-direction: column; }
 .name { font-weight: 650; overflow-wrap: anywhere; font-size: var(--text-sm); }
 .season { color: var(--muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }

 .drag-handle {
  display: flex; align-items: center; justify-content: center; gap: var(--space-1);
  width: 3.25rem; min-height: 2.75rem; align-self: stretch; padding: 0; border: 0; border-radius: var(--radius);
  background: none; color: var(--text); font-size: var(--text-xl); font-weight: 750; font-variant-numeric: tabular-nums; line-height: 1;
  touch-action: none; cursor: grab; user-select: none;
 }
 .drag-handle:hover:not(:disabled) { background: var(--surface-hover); }
 .drag-handle .grip { color: var(--muted); font-size: var(--text-base); line-height: 1; }
 .drag-source .drag-handle { cursor: grabbing; }
 .fixed-label { display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: var(--text-sm); font-weight: 750; letter-spacing: .04em; }
 .move { width: 2.75rem; min-height: 2.75rem; padding: 0; font-size: var(--text-lg); }
 /* The lifted row floats above neighbours that slide aside; the opened gap marks the insertion point. */
 .drag-source { z-index: 2; background: var(--surface-raised); border-radius: var(--radius); box-shadow: 0 12px 32px oklch(8% .01 255 / .52); }

 .assignment-control { flex: 0 0 5.5rem; min-width: 0; }
 .stats { display: flex; gap: var(--space-3); font-variant-numeric: tabular-nums; }
 .stat { display: grid; justify-items: end; min-width: 2.75rem; line-height: 1.2; }
 .stat .value { font-size: var(--text-sm); font-weight: 650; }
 .stat .label { color: var(--muted); font-size: var(--text-xs); }

 /* Relief rows: role selects take their own full-width row on phones. */
 .order .fixed-player { grid-template-areas: 'num card identity identity' 'num card meta meta' 'roles roles roles roles'; }
 .roles { grid-area: roles; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); min-width: 0; }
 .roles label { display: grid; gap: var(--space-1); min-width: 0; }
 .roles label > span { color: var(--muted); font-size: var(--text-xs); }
 .roles select { width: 100%; min-width: 0; }
 .order .fixed-player .roles { padding-left: var(--space-3); }
 .role-help { grid-column: 1 / -1; margin: 0; font-size: var(--text-xs); line-height: 1.4; }
 .card-trigger { display: block; width: 56px; padding: 0; border: 0; background: none; color: inherit; cursor: pointer; }
 .card-trigger.placeholder { aspect-ratio: 5 / 7; border-radius: var(--radius); background: var(--surface-raised); cursor: default; }
 .card-trigger:focus-visible { outline: 3px solid var(--focus); outline-offset: 4px; }
 .miniature { display: block; width: 100%; pointer-events: none; }
 .workload { margin: var(--space-2) 0 0; font-size: var(--text-xs); line-height: 1.5; max-width: 60ch; }

 .simulate { position: sticky; bottom: 0; z-index: 1; margin-top: var(--space-8); padding-block: var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom)); border-top: 1px solid var(--border); background: var(--background); }
 .simulate .primary { width: 100%; }
 .simulate .notice { margin: var(--space-2) 0 0; }
 .announcement { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

 /* Wide rows: one line per player, arrows side by side, once the list itself is wide enough. */
 @container (min-width: 40rem) {
  .order li { grid-template-columns: 3.25rem 56px minmax(0, 1fr) auto 5.5rem; grid-template-areas: 'num card identity meta move'; }
  .order .fixed-player { grid-template-areas: 'num card identity meta .' 'num card roles roles roles'; }
  .roles { max-width: 26rem; }
  .order .fixed-player .roles { padding-left: 0; }
  .identity { flex-direction: column; flex-wrap: nowrap; align-items: start; gap: var(--space-1); align-self: center; }
  .meta { flex-wrap: nowrap; align-self: center; }
  .move-controls { flex-direction: row; }
 }
 @media (max-width: 23.99rem) {
  .order li { grid-template-columns: 2.75rem 56px minmax(0, 1fr) 2.75rem; column-gap: var(--space-2); }
  .drag-handle { width: 2.75rem; gap: 2px; }
  .stats { gap: var(--space-2); }
  .stat { min-width: 0; }
 }
 @media (min-width: 64rem) { .lineup-columns { grid-template-columns: 1.35fr 1fr; gap: var(--space-12); } .simulate .primary { width: auto; min-width: 16rem; } }
</style>
