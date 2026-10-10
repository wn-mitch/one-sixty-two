<script lang="ts">
 import { type LegalReassignment } from '../game/draft.ts';
 import { draftRules } from '../game/rules.ts';
 import { HITTER_SLOTS, type Draft, type HitterSlot, type Manifest, type Profile, type Slot } from '../game/types.ts';
 import type { RosterClickBehavior } from '../game/settings.svelte.ts';
 import type { CardMediaStatus } from '../cards/view-model.ts';
 import type { MediaManifest } from '../media/types.ts';
 import type { WarRankings } from '../rankings/types.ts';
 import type { StadiumSummary } from '../sim/park-types.ts';
 import { STOCK, roles } from '../cards/tokens.ts';
 import RosterItem from './RosterItem.svelte';
 import StadiumCard from './StadiumCard.svelte';
 import TeamLogo from './TeamLogo.svelte';
 import { venuePhoto } from './VenueCard.svelte';
 import { FIELD, fieldArt } from './field-layout.ts';
 import { captureField, slideField } from './field-motion.ts';

 type Preview = { profile: Profile; slot: Slot };

 const pct = (value: number, total: number) => `${(value / total) * 100}%`;
 const { window: fieldWindow, nameplate, stadium: stadiumPoint } = FIELD;

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
  inspectedSeasonId = null,
  rosterFirstClick = 'move',
  inspectionId,
  compact = false,
  stadium = null,
  stadiumFranchise,
  stadiumColor,
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
  inspectedSeasonId?: string | null;
  rosterFirstClick?: RosterClickBehavior;
  inspectionId?: string;
  compact?: boolean;
  /** The draft's home stadium; the field card is printed from its outline. */
  stadium?: StadiumSummary | null;
  stadiumFranchise?: string;
  stadiumColor?: string;
  onSlot: (slot: Slot, trigger: HTMLButtonElement) => void;
 } = $props();

 const bySeason = $derived(new Map(profiles.map(profile => [profile.seasonId, profile])));
 const bySlot = $derived(new Map(draft.picks.map(pick => [pick.slot, pick])));
 const slots = $derived(draftRules(draft.schemaVersion).slots);
 const pitcherSlots = $derived(slots.filter(slot => !HITTER_SLOTS.includes(slot as HitterSlot)));
 const targetsBySlot = $derived(new Map(moveTargets.map(target => [target.slot, target])));
 const pickedCount = $derived(draft.picks.length);


 function profileLabel(profile: Profile): string {
  return `${profile.displayName}, ${profile.year}, ${profile.historicalTeam}`;
 }

 function isInspectionTrigger(state: { profile: Profile | undefined; slot: Slot; source: boolean }): boolean {
  if (!state.profile) return false;
  return !HITTER_SLOTS.includes(state.slot as HitterSlot) || state.source || rosterFirstClick === 'review';
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
  x: string;
  y: string;
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
  const fieldPosition = FIELD.slots[slot];
  const highlighted = source || Boolean(target) || legalPlacement;
  const targetName = target?.swapWith ? bySeason.get(target.swapWith)?.displayName ?? 'unavailable selected season' : null;

  let action = 'Unavailable';
  if (isPreview) action = `Preview, confirm ${slot}`;
  else if (source) action = 'Review card';
  else if (target) action = targetName ? `Swap with ${targetName}` : `Move to open ${slot}`;
  else if (legalPlacement) action = `Place at open ${slot}`;
  else if (unavailable) action = 'Unavailable selected season';
  else if (occupied && hitter) action = rosterFirstClick === 'review' ? 'Review card' : 'Move or swap';
  else if (occupied) action = 'Review card';
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
   x: pct(fieldPosition.x, FIELD.width),
   y: pct(fieldPosition.y, FIELD.height)
  };
 }

 let root = $state<HTMLElement>();
 let before: Map<string, DOMRect> | null = null;
 const placementKey = $derived(`${draft.picks.map(pick => `${pick.seasonId}@${pick.slot}`).join('|')}#${preview ? `${preview.profile.seasonId}@${preview.slot}` : ''}`);
 // Capture card positions before a placement change reaches the DOM, then slide them to their new slots.
 $effect.pre(() => {
  void placementKey;
  if (root) before = captureField(root);
 });
 $effect(() => {
  void placementKey;
  if (root && before) slideField(root, before);
  before = null;
 });

 const field = $derived.by(() => HITTER_SLOTS.map(slot => slotState(slot)));
 const staff = $derived.by(() => pitcherSlots.map(slot => slotState(slot)));
 const art = $derived(fieldArt(stadium));
 const palette = $derived(stadiumColor ? roles({ primary: stadiumColor, secondary: STOCK }) : null);
 const cardStyle = $derived(palette ? `--stock: ${palette.field}; --stock-ink: ${palette.onField};` : undefined);
 const dimensions = $derived(([['LF', -45], ['CF', 0], ['RF', 45]] as const).flatMap(([label, bearing]) => {
  const dimension = stadium?.dimensions.find(item => item.bearingDeg === bearing);
  return dimension ? [`${label} ${Math.round(dimension.distanceFt)}`] : [];
 }));
 let turned = $state(false);
 const stadiumPhoto = $derived(stadium ? venuePhoto(media, stadium.franchiseId) : null);
 let failedPhoto = $state('');
</script>

<aside bind:this={root} class="roster" class:compact aria-label={`Your field, ${pickedCount} of ${slots.length} roster slots filled`}>
 {#if !compact}
  <div class="pick-track" aria-label={`${pickedCount} of ${slots.length} roster slots filled`}>
   {#each slots as slot}<span class:locked={bySlot.has(slot)}></span>{/each}
  </div>
 {/if}

 <div class="field-card" class:turned style={cardStyle}>
  <div class="flipper">
   <section class="face front" aria-label="Field positions" inert={turned}>
    <svg class="field-art" viewBox="0 0 {FIELD.width} {FIELD.height}" aria-hidden="true" focusable="false">
     <rect class="stock" width={FIELD.width} height={FIELD.height} rx="14"></rect>
     <rect class="ground" x={fieldWindow.x} y={fieldWindow.y} width={fieldWindow.width} height={fieldWindow.height} rx="6"></rect>
     <polygon class="fair" points={art.fair}></polygon>
     <polygon class="infield-dirt" points={art.infieldDirt}></polygon>
     <polygon class="infield-grass" points={art.infieldGrass}></polygon>
     <polyline class="foul-line" points={art.foulLines}></polyline>
     <circle class="mound" cx={art.mound.x} cy={art.mound.y} r="8"></circle>
     {#each art.bases as base}<rect class="base" x={base.x - 4.5} y={base.y - 4.5} width="9" height="9" transform="rotate(45 {base.x} {base.y})"></rect>{/each}
     <path class="base" d="M{art.home.x - 5} {art.home.y - 4}h10v4l-5 5l-5 -5z"></path>
     <rect class="staff-plate" x={fieldWindow.x} y={nameplate.y + nameplate.height + 4} width={fieldWindow.width} height={FIELD.height - nameplate.y - nameplate.height - 14} rx="6"></rect>
    </svg>
    <div class="nameplate" style={`--top:${pct(nameplate.y, FIELD.height)};--height:${pct(nameplate.height, FIELD.height)}`}>
     {#if stadium}<TeamLogo franchiseId={stadium.franchiseId} label={stadiumFranchise ?? stadium.franchiseId} size="small" />{/if}
     <span class="plate-copy">
      <strong>{stadium?.name ?? 'Your field'}</strong>
      {#if dimensions.length}<span class="dimensions">{dimensions.join(' · ')}</span>{/if}
     </span>
     {#if stadium}
      <button type="button" class="turn" aria-label={`Turn over: ${stadium.name} details`} onclick={() => turned = true}>
       <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>
      </button>
     {/if}
    </div>
    {#if stadium}
     <button
      type="button"
      class="stadium-mini"
      style={`--x:${pct(stadiumPoint.x, FIELD.width)};--y:${pct(stadiumPoint.y, FIELD.height)}`}
      aria-label={`${stadium.name}. Turn over for stadium details.`}
      onclick={() => turned = true}
     >
      <span class="mini-card" aria-hidden="true">
       <span class="mini-photo">
        {#if stadiumPhoto && stadiumPhoto.url !== failedPhoto}
         <img src={stadiumPhoto.url} alt="" width={stadiumPhoto.width} height={stadiumPhoto.height} loading="lazy" decoding="async" onerror={event => failedPhoto = event.currentTarget.getAttribute('src') ?? ''} />
        {:else}
         <TeamLogo franchiseId={stadium.franchiseId} label={stadiumFranchise ?? stadium.franchiseId} size="small" />
        {/if}
       </span>
       <span class="mini-name">{stadium.name}</span>
       {#if dimensions.length}<span class="mini-dimensions">{#each dimensions as dimension}<span>{dimension}</span>{/each}</span>{/if}
      </span>
      <span class="mini-caption" aria-hidden="true">Park</span>
     </button>
    {/if}
    {#each field as state}{@render slotButton(state, 'field-slot')}{/each}
    <h3 id="pitching-heading" class="sr-only">Pitching staff</h3>
    <div class="staff-slots" role="group" aria-labelledby="pitching-heading">
     {#each staff as state}{@render slotButton(state, 'staff-slot')}{/each}
    </div>
   </section>
   {#if stadium}
    <section class="face back" aria-label={`${stadium.name} details`} inert={!turned}>
     <StadiumCard {stadium} franchiseName={stadiumFranchise ?? stadium.franchiseId} />
     <button type="button" class="secondary turn-back" onclick={() => turned = false}>Show field</button>
    </section>
   {/if}
  </div>
 </div>
</aside>

{#snippet slotButton(state: ReturnType<typeof slotState>, kind: 'field-slot' | 'staff-slot')}
 <button
  type="button"
  class={kind}
  class:highlighted={state.highlighted}
  class:preview={state.preview}
  class:source={state.source}
  class:unavailable={state.unavailable}
  style={`--x:${state.x};--y:${state.y}`}
  data-slot={state.slot}
  data-preview={state.preview ? 'true' : undefined}
  aria-label={`${state.slot}, ${state.profile ? profileLabel(state.profile) : state.unavailable ? 'unavailable selected season' : 'open'}. ${state.action}.`}
  aria-expanded={isInspectionTrigger(state) ? state.profile?.seasonId === inspectedSeasonId : undefined}
  aria-controls={isInspectionTrigger(state) && inspectionId ? inspectionId : undefined}
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
{/snippet}

<style>
 .roster { container-type: inline-size; min-width: 0; color: var(--text); }
 .pick-track { display: flex; gap: .25rem; margin-bottom: var(--space-4); }
 .pick-track span { flex: 1; height: .25rem; background: var(--border); }
 .pick-track .locked { background: var(--text); }
 .field-card {
  container-type: inline-size;
  width: min(100%, 30rem);
  aspect-ratio: 424 / 594;
  margin: 0 auto var(--space-2);
  perspective: 1400px;
 }
 .flipper { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; transition: transform var(--motion-field-flip) var(--ease-out); }
 .turned .flipper { transform: rotateY(180deg); }
 .face { position: absolute; inset: 0; backface-visibility: hidden; border-radius: calc(100cqi * 14 / 424); }
 .front { box-shadow: 0 1rem 2rem oklch(8% .01 255 / .35); }
 .back {
  display: grid;
  align-content: center;
  gap: var(--space-3);
  padding: var(--space-4);
  overflow-y: auto;
  transform: rotateY(180deg);
  color: var(--stock-ink, var(--text));
  background: var(--stock, var(--surface-raised));
 }
 .back :global(.stadium-card) { padding: var(--space-3); border-radius: var(--radius); color: var(--text); background: var(--surface); }
 .turn-back { justify-self: center; min-height: 44px; }
 .field-art { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
 .stock { fill: var(--stock, var(--surface-raised)); }
 .ground { fill: oklch(19% .02 160); }
 .fair { fill: oklch(24% .028 158); stroke: oklch(70% .02 255 / .45); stroke-width: 2; }
 .infield-dirt { fill: oklch(32% .035 65 / .7); }
 .infield-grass { fill: oklch(26% .03 155); stroke: oklch(70% .02 255 / .5); stroke-width: 1.2; }
 .foul-line { fill: none; stroke: oklch(88% .01 255 / .55); stroke-width: 1.4; }
 .mound { fill: oklch(34% .035 65); }
 .base { fill: oklch(92% .01 255 / .8); }
 .staff-plate { fill: oklch(17% .012 255 / .88); }
 .nameplate {
  position: absolute;
  left: calc(100cqi * 16 / 424);
  right: calc(100cqi * 16 / 424);
  top: var(--top);
  height: var(--height);
  display: flex;
  align-items: center;
  gap: calc(100cqi * 8 / 424);
  min-width: 0;
  color: var(--stock-ink, var(--text));
 }
 .plate-copy { display: grid; flex: 1; min-width: 0; gap: calc(100cqi * 2 / 424); }
 .nameplate strong { font: italic 900 calc(100cqi * 17 / 424) / .95 'Barlow Condensed', sans-serif; text-transform: uppercase; overflow-wrap: anywhere; }
 .nameplate .dimensions { font: 700 calc(100cqi * 10.5 / 424) / 1 'Barlow Condensed', sans-serif; letter-spacing: .08em; font-variant-numeric: tabular-nums; }
 .turn {
  flex: none;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-block: -8px;
  margin-right: -10px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: inherit;
  background: transparent;
 }
 .turn:hover { background: color-mix(in oklch, currentColor 14%, transparent); }
 .turn:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
 .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
 .field-slot, .staff-slot {
  /* Roster artwork is 56 of the card's 424 units, so every card scales with the field card. */
  --roster-mini-width: calc(100cqi * 56 / 424);
  --roster-slot-width: calc(var(--roster-mini-width) * 8 / 7);
  --roster-mini-half: calc(var(--roster-mini-width) * .7);
  position: absolute;
  z-index: 1;
  left: var(--x);
  top: calc(var(--y) - var(--roster-mini-half));
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
  transform: translateX(-50%);
  transition: opacity 180ms var(--ease-out), transform 180ms var(--ease-out);
 }
 .field-slot:hover:not(:disabled), .staff-slot:hover:not(:disabled) { background: transparent; }
 .field-slot:active:not(:disabled), .staff-slot:active:not(:disabled) { transform: translate(-50%, 1px); }
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
 .staff-slots { display: contents; }
 /* Sized and placed like a roster slot so it mirrors the DH card. */
 .stadium-mini {
  --mini-width: calc(100cqi * 56 / 424);
  position: absolute;
  z-index: 1;
  left: var(--x);
  top: calc(var(--y) - var(--mini-width) * .7);
  display: grid;
  justify-items: center;
  gap: calc(100cqi * 3 / 424);
  width: calc(var(--mini-width) * 8 / 7);
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: var(--radius);
  color: var(--text);
  background: transparent;
  font: inherit;
  transform: translateX(-50%);
  transition: transform 180ms var(--ease-out);
 }
 .stadium-mini:hover { background: transparent; }
 .stadium-mini:hover .mini-card { box-shadow: 0 0 0 2px var(--stock-ink, var(--text)); }
 .stadium-mini:active { transform: translate(-50%, 1px); }
 .stadium-mini:focus-visible { outline: 3px solid var(--focus); outline-offset: 4px; }
 .mini-card {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto auto;
  gap: calc(100cqi * 2 / 424);
  width: var(--mini-width);
  aspect-ratio: 5 / 7;
  padding: calc(100cqi * 3 / 424);
  overflow: hidden;
  border-radius: var(--radius);
  color: var(--stock-ink, var(--text));
  background: var(--stock, var(--surface-raised));
  box-shadow: 0 .3rem .7rem oklch(8% .01 255 / .4);
  transition: box-shadow 180ms var(--ease-out);
 }
 .mini-photo { display: grid; place-items: center; min-height: 0; overflow: hidden; border-radius: calc(100cqi * 2 / 424); background: oklch(17% .012 255 / .55); }
 .mini-photo img { display: block; width: 100%; height: 100%; object-fit: cover; }
 .mini-photo :global(.team-mark) { width: 70%; height: auto; aspect-ratio: 1; flex-basis: auto; overflow: hidden; }
 .mini-name { font: italic 900 calc(100cqi * 7.5 / 424) / .95 'Barlow Condensed', sans-serif; text-align: left; text-transform: uppercase; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
 .mini-dimensions { display: grid; font: 700 calc(100cqi * 5.5 / 424) / 1.1 'Barlow Condensed', sans-serif; letter-spacing: .04em; text-align: left; font-variant-numeric: tabular-nums; }
 .mini-caption { color: var(--muted); font: 800 calc(100cqi * 9 / 424) / 1 'Barlow Condensed', sans-serif; letter-spacing: .06em; text-transform: uppercase; }
 @media (prefers-reduced-motion: reduce) { .stadium-mini, .mini-card { transition: none; } }
 .slot-placeholder b { font-size: calc(100cqi * 15 / 424); }
 @media (prefers-reduced-motion: reduce) { .flipper { transition: none; } }
 :global([data-motion='off']) .flipper { transition: none; }
</style>
