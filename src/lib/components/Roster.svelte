<script lang="ts">
 import { type LegalReassignment } from '../game/draft.ts';
 import { draftRules } from '../game/rules.ts';
 import { HITTER_SLOTS, type Draft, type HitterSlot, type Manifest, type Profile, type Slot } from '../game/types.ts';
 import type { CardMediaStatus } from '../cards/view-model.ts';
 import type { MediaManifest } from '../media/types.ts';
 import type { WarRankings } from '../rankings/types.ts';
 import RosterItem from './RosterItem.svelte';

 type Preview = { profile: Profile; slot: Slot };

const fieldCoordinates = {
 C: { x: 50, narrowY: 636, wideY: 631 },
 '1B': { x: 85, narrowY: 492, wideY: 487 },
 '2B': { x: 67, narrowY: 348, wideY: 343 },
 SS: { x: 33, narrowY: 348, wideY: 343 },
 '3B': { x: 15, narrowY: 492, wideY: 487 },
 LF: { x: 18, narrowY: 204, wideY: 199 },
 CF: { x: 50, narrowY: 60, wideY: 55 },
 RF: { x: 82, narrowY: 204, wideY: 199 },
 DH: { x: 85, narrowY: 636, wideY: 631 }
} as const satisfies Record<HitterSlot, { x: number; narrowY: number; wideY: number }>;

 let {
  draft,
  manifest,
  profiles,
  busy,
  rankings = null,
  rankingLoading = false,
  rankingError = false,
  media = null,
  mediaStatus = 'loading',
  preview = null,
  legalSlots = [],
  movingSeasonId = null,
  moveTargets = [],
  compact = false,
  onSlot
 }: {
  draft: Draft;
  manifest: Manifest;
  profiles: Profile[];
  busy: boolean;
  rankings?: WarRankings | null;
  rankingLoading?: boolean;
  rankingError?: boolean;
  media?: MediaManifest | null;
  mediaStatus?: CardMediaStatus;
  preview?: Preview | null;
  legalSlots?: readonly Slot[];
  movingSeasonId?: string | null;
  moveTargets?: readonly LegalReassignment[];
  compact?: boolean;
  onSlot: (slot: Slot, trigger: HTMLButtonElement) => void;
 } = $props();

 const bySeason = $derived(new Map(profiles.map(profile => [profile.seasonId, profile])));
 const bySlot = $derived(new Map(draft.picks.map(pick => [pick.slot, pick])));
 const slots = $derived(draftRules(draft.schemaVersion).slots);
 const pitcherSlots = $derived(slots.filter(slot => !HITTER_SLOTS.includes(slot as HitterSlot)));
 const targetsBySlot = $derived(new Map(moveTargets.map(target => [target.slot, target])));
 const pickedCount = $derived(draft.picks.length);
 const workloadSupport = 'Your independently drafted BP supports your closer.';


 function profileLabel(profile: Profile): string {
  return `${profile.displayName}, ${profile.year}, ${profile.historicalTeam}`;
 }

 function slotState(slot: Slot): {
  slot: Slot;
  profile: Profile | undefined;
  unavailable: boolean;
  preview: boolean;
  highlighted: boolean;
  source: boolean;
  action: string;
  actionShort: string;
  enabled: boolean;
  x?: number;
  narrowY?: number;
  wideY?: number;
 } {
  const pick = bySlot.get(slot);
  const isPreview = !movingSeasonId && preview?.slot === slot;
  const profile = isPreview ? preview.profile : pick ? bySeason.get(pick.seasonId) : undefined;
  const unavailable = Boolean(pick && !profile);
  const source = pick?.seasonId === movingSeasonId;
  const hitter = HITTER_SLOTS.includes(slot as HitterSlot);
  const target = hitter ? targetsBySlot.get(slot as HitterSlot) : undefined;
  const legalPlacement = !movingSeasonId && legalSlots.includes(slot);
  const occupied = Boolean(pick);
  const inspectable = occupied && (!movingSeasonId || !hitter);
  const fieldPosition = hitter ? fieldCoordinates[slot as HitterSlot] : null;
  const highlighted = source || Boolean(target) || legalPlacement;
  const targetName = target?.swapWith ? bySeason.get(target.swapWith)?.displayName ?? 'unavailable selected season' : null;

  let action = 'Unavailable';
  if (isPreview) action = `Preview, confirm ${slot}`;
  else if (source) action = 'Cancel move';
  else if (target) action = targetName ? `Swap with ${targetName}` : `Move to open ${slot}`;
  else if (legalPlacement) action = `Place at open ${slot}`;
  else if (unavailable) action = 'Unavailable selected season';
  else if (occupied && hitter) action = 'Move or swap';
  else if (occupied) action = 'Inspect card';
  else action = 'Open, unavailable';

  const actionShort = isPreview ? 'Preview'
   : source ? 'Moving'
   : target ? target.swapWith ? 'Swap' : 'Move'
   : legalPlacement ? 'Place'
   : '';

  return {
   slot,
   profile,
   unavailable,
   preview: isPreview,
   highlighted,
   source,
   action,
   actionShort,
   enabled: !busy && (source || Boolean(target) || legalPlacement || inspectable),
   ...(fieldPosition ? { x: fieldPosition.x, narrowY: fieldPosition.narrowY, wideY: fieldPosition.wideY } : {})
  };
 }

 const field = $derived.by(() => HITTER_SLOTS.map(slot => slotState(slot)));
 const staff = $derived.by(() => pitcherSlots.map(slot => slotState(slot)));
</script>

<aside class="roster" class:compact aria-label={`Your field, ${pickedCount} of ${slots.length} roster slots filled`}>
 {#if !compact}
  <div class="pick-track" aria-label={`${pickedCount} of ${slots.length} roster slots filled`}>
   {#each slots as slot}<span class:locked={bySlot.has(slot)}></span>{/each}
  </div>
 {/if}

 <section class="diamond" aria-label="Field positions">
  {#if compact}
   <svg class="field-art compact-field-art" viewBox="0 0 404 565" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <rect class="field-ground" width="404" height="565"></rect>
    <path class="outfield-line" d="M12 170C90 10 314 10 392 170"></path>
    <path class="infield-shape" d="m140 350 62-62 62 62-62 62z"></path>
   </svg>
  {:else}
   <svg class="field-art" viewBox="0 0 440 640" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path class="outfield-line" d="M20 220C70 35 370 35 420 220"></path>
    <path class="infield-shape" d="m142 390 78-78 78 78-78 78z"></path>
   </svg>
  {/if}
  {#each field as state}
   <button
    type="button"
    class="field-slot"
    class:highlighted={state.highlighted}
    class:preview={state.preview}
    class:source={state.source}
    class:unavailable={state.unavailable}
    style={`--x:${state.x}%;--y-narrow:${state.narrowY}px;--y-wide:${state.wideY}px`}
    data-slot={state.slot}
    data-preview={state.preview ? 'true' : undefined}
    aria-label={`${state.slot}, ${state.profile ? profileLabel(state.profile) : state.unavailable ? 'unavailable selected season' : 'open'}. ${state.action}.`}
    disabled={!state.enabled}
    onclick={event => onSlot(state.slot, event.currentTarget as HTMLButtonElement)}
   >
    <span class="card-frame" aria-hidden="true">
     {#if state.profile}
      <RosterItem profile={state.profile} assignedSlot={state.slot} {manifest} {rankings} {rankingLoading} {rankingError} {media} {mediaStatus} />
     {:else}
      <span class="slot-placeholder">
       <b>{state.slot}</b>
       <span>{state.unavailable ? 'Unavailable' : 'Open'}</span>
       {#if state.actionShort}<small>{state.actionShort}</small>{/if}
      </span>
     {/if}
    </span>
   </button>
  {/each}
 </section>

 <section class="pitching-staff" aria-labelledby="pitching-heading">
  <h3 id="pitching-heading">Pitching staff</h3>
  <div class="staff-slots">
   {#each staff as state}
    <button
     type="button"
     class="staff-slot"
     class:highlighted={state.highlighted}
     class:preview={state.preview}
     class:source={state.source}
     class:unavailable={state.unavailable}
     data-slot={state.slot}
     data-preview={state.preview ? 'true' : undefined}
     aria-label={`${state.slot}, ${state.profile ? profileLabel(state.profile) : state.unavailable ? 'unavailable selected season' : 'open'}. ${state.action}.`}
     disabled={!state.enabled}
     onclick={event => onSlot(state.slot, event.currentTarget as HTMLButtonElement)}
    >
     <span class="card-frame" aria-hidden="true">
      {#if state.profile}
       <RosterItem profile={state.profile} assignedSlot={state.slot} {manifest} {rankings} {rankingLoading} {rankingError} {media} {mediaStatus} />
      {:else}
       <span class="slot-placeholder">
        <b>{state.slot}</b>
        <span>{state.unavailable ? 'Unavailable' : 'Open'}</span>
        {#if state.actionShort}<small>{state.actionShort}</small>{/if}
       </span>
      {/if}
     </span>
    </button>
   {/each}
  </div>
  {#if compact}
   <details class="workload-details">
    <summary>Pitching workload</summary>
    <p>Three starters, 54 starts each. {workloadSupport}</p>
    <p class="muted">An arcade workload, not a real-world pitching schedule.</p>
   </details>
  {:else}
   <p class="workload">Three starters, 54 starts each. {workloadSupport}</p>
   <p class="workload muted">An arcade workload, not a real-world pitching schedule.</p>
  {/if}
 </section>
</aside>

<style>
 .roster { container-type: inline-size; min-width: 0; color: var(--text); }
 .pick-track { display: flex; gap: .25rem; margin-bottom: var(--space-4); }
 .pick-track span { flex: 1; height: .25rem; background: var(--border); }
 .pick-track .locked { background: var(--text); }
 .diamond {
  position: relative;
  width: min(100%, 27.5rem);
  height: 724px;
  margin: 0 auto var(--space-8);
  overflow: visible;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
 }
 .field-art { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
 .field-ground { fill: oklch(22% .022 160); }
 .outfield-line { fill: none; stroke: var(--border); stroke-width: 1.5; }
 .infield-shape { fill: color-mix(in oklch, var(--surface-raised) 72%, transparent); stroke: color-mix(in oklch, var(--border) 70%, transparent); stroke-width: 1.5; }
 .field-slot, .staff-slot {
  --roster-mini-width: max(4.5rem, 72px);
  --roster-slot-width: 5rem;
  --roster-mini-half: max(3.15rem, 50.4px);
  position: absolute;
  z-index: 1;
  display: grid;
  justify-items: center;
  align-content: start;
  width: var(--roster-slot-width);
  min-width: var(--roster-slot-width);
  min-height: 2.75rem;
  padding: 0;
  border: 0;
  border-radius: var(--radius);
  color: var(--text);
  background: transparent;
  font: inherit;
  text-align: center;
  transition: opacity 180ms var(--ease-out), transform 180ms var(--ease-out);
 }
 .field-slot {
  left: var(--x);
  top: calc(var(--y-narrow) - var(--roster-mini-half));
  transform: translateX(-50%);
 }
 .field-slot:hover:not(:disabled), .staff-slot:hover:not(:disabled) { background: transparent; }
 .field-slot:active:not(:disabled) { transform: translate(-50%, 1px); }
 .staff-slot:active:not(:disabled) { transform: translateY(1px); }
 .field-slot:focus-visible, .staff-slot:focus-visible { outline: 3px solid var(--focus); outline-offset: 4px; }
 .card-frame {
  display: grid;
  place-items: start center;
  width: var(--roster-slot-width);
  border-radius: var(--radius);
  outline: 2px solid transparent;
  outline-offset: 3px;
  pointer-events: none;
 }
 .slot-placeholder {
  display: grid;
  place-items: center;
  align-content: center;
  gap: .15rem;
  width: var(--roster-mini-width);
  aspect-ratio: 5 / 7;
  padding: .3rem;
  border: 1.5px dashed var(--muted);
  border-radius: var(--radius);
  color: var(--muted);
  background: color-mix(in oklch, var(--surface) 72%, transparent);
  font-family: 'Barlow Condensed', sans-serif;
  font-weight: 800;
  line-height: 1;
  text-transform: uppercase;
 }
 .slot-placeholder b { font-size: 1rem; letter-spacing: .04em; }
 .slot-placeholder span { font-size: .75rem; letter-spacing: .06em; }
 .slot-placeholder small { color: var(--accent); font-size: .6875rem; letter-spacing: .05em; }
 .highlighted .card-frame { outline-color: var(--accent); }
 .highlighted .slot-placeholder { border-color: var(--accent); color: var(--accent); background: color-mix(in oklch, var(--accent) 14%, transparent); }
 .preview .card-frame { outline-style: dashed; }
 .source { opacity: .82; }
 .unavailable .slot-placeholder { border-color: var(--error); color: var(--error); }
 .pitching-staff { margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--border); }
 h3 { margin: 0 0 var(--space-3); color: var(--muted); font-family: 'Barlow Condensed', sans-serif; font-size: var(--text-base); font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
 .staff-slots { display: grid; grid-template-columns: repeat(5, minmax(72px, 1fr)); gap: var(--space-1); }
 .staff-slot { --roster-slot-width: min(5rem, 100%); position: relative; width: var(--roster-slot-width); justify-self: center; }
 .workload { margin: var(--space-3) 0 0; font-size: var(--text-xs); line-height: 1.45; }
 .workload-details { margin-top: var(--space-3); font-size: var(--text-xs); line-height: 1.45; }
 .workload-details summary { display: flex; align-items: center; min-height: 2.75rem; cursor: pointer; color: var(--muted); font-weight: 700; }
 .workload-details p { margin: var(--space-2) 0 0; }
 .compact .diamond { width: min(100%, 25.25rem); margin-bottom: var(--space-6); }
 .compact .staff-slots { gap: var(--space-1); }
 .compact .pitching-staff { margin-top: var(--space-3); padding-top: var(--space-2); }
 .compact .pitching-staff h3 { margin-bottom: var(--space-2); }

 @container (min-width: 25rem) {
  .diamond { height: 719px; }
  .field-slot { top: calc(var(--y-wide) - var(--roster-mini-half)); }
 }

 @container (max-width: 24.999rem) {
  .staff-slots { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: var(--space-2) var(--space-1); }
  .staff-slot { grid-column: span 2; }
  .staff-slot:nth-child(4) { grid-column: 2 / span 2; }
  .staff-slot:nth-child(5) { grid-column: 4 / span 2; }
 }
</style>
