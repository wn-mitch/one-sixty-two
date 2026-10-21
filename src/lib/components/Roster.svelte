<script lang="ts">
 import { placementKey as rosterPlacementKey, type RosterMove, type RosterView } from '../game/roster-view.ts';
 import { HITTER_SLOTS, type FieldSlot, type HitterSlot, type Manifest, type Profile } from '../game/types.ts';
 import type { RosterClickBehavior } from '../game/settings.svelte.ts';
 import type { CardMediaStatus } from '../cards/view-model.ts';
 import type { MediaManifest } from '../media/types.ts';
 import type { WarRankings } from '../rankings/types.ts';
 import type { StadiumSummary } from '../sim/park-types.ts';
 import { venuePhoto } from '../media/venue.ts';
 import { STOCK, roles } from '../cards/tokens.ts';
 import RosterItem from './RosterItem.svelte';
 import StadiumCard from './StadiumCard.svelte';
 import TeamLogo from './TeamLogo.svelte';
 import { FIELD, fieldArt, slotPoint } from './field-layout.ts';
 import { captureField, slideField } from './field-motion.ts';

 /** A selected card shown where it would land: a slot, or the bench (`slot: null`). */
 type Preview = { profile: Profile; slot: FieldSlot | null };

 const pct = (value: number, total: number) => `${(value / total) * 100}%`;
 const { window: fieldWindow, staffPlate, stadium: stadiumPoint } = FIELD;

 let {
  roster,
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
  benchLegal = false,
  movingSeasonId = null,
  moveTargets = [],
  inspectedSeasonId = null,
  rosterFirstClick = 'move',
  inspectionId,
  compact = false,
  stadium = null,
  stadiumFranchise,
  stadiumColor,
  onSlot,
  onBench
 }: {
  roster: RosterView;
  manifest: Manifest;
  profiles: readonly Profile[];
  busy: boolean;
  rankings?: WarRankings | null;
  rankingLoading?: boolean;
  rankingError?: boolean;
  media?: MediaManifest | null;
  mediaStatus?: CardMediaStatus;
  preview?: Preview | null;
  legalSlots?: readonly FieldSlot[];
  /** The selected card may be placed on the bench. */
  benchLegal?: boolean;
  movingSeasonId?: string | null;
  moveTargets?: readonly RosterMove[];
  inspectedSeasonId?: string | null;
  rosterFirstClick?: RosterClickBehavior;
  inspectionId?: string;
  compact?: boolean;
  /** The draft's home stadium; the field card is printed from its outline. */
  stadium?: StadiumSummary | null;
  stadiumFranchise?: string;
  stadiumColor?: string;
  onSlot: (slot: FieldSlot, trigger: HTMLButtonElement) => void;
  /** A bench card, or the open bench place (`null`) as a placement or move target. */
  onBench?: (seasonId: string | null, trigger: HTMLButtonElement) => void;
 } = $props();

 const bySeason = $derived(new Map(profiles.map(profile => [profile.seasonId, profile])));
 const bySlot = $derived(new Map([...roster.placed].map(([slot, seasonId]) => [slot, { seasonId }])));
 const slots = $derived(roster.slots);
 const deep = $derived(slots.includes('RP4'));
 const pitcherSlots = $derived(slots.filter(slot => !HITTER_SLOTS.includes(slot as HitterSlot)));
 const targetsBySlot = $derived(new Map(moveTargets.flatMap(target => target.slot ? [[target.slot, target] as const] : [])));
 const benchTarget = $derived(moveTargets.some(target => target.slot === null));
 const pickedCount = $derived(roster.placed.size);


 function profileLabel(profile: Profile): string {
  return `${profile.displayName}, ${profile.year}, ${profile.historicalTeam}`;
 }

 function isInspectionTrigger(state: { profile: Profile | undefined; slot: FieldSlot; source: boolean }): boolean {
  if (!state.profile) return false;
  return !roster.movable(state.slot) || state.source || rosterFirstClick === 'review';
 }

 function slotState(slot: FieldSlot): {
  slot: FieldSlot;
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
  const movable = roster.movable(slot);
  const target = targetsBySlot.get(slot);
  const legalPlacement = !movingSeasonId && legalSlots.includes(slot);
  const occupied = Boolean(pick);
  const inspectable = occupied && (!movingSeasonId || !movable);
  const fieldPosition = slotPoint(slot, deep);
  const highlighted = source || Boolean(target) || legalPlacement;
  const targetName = target?.swapWith ? bySeason.get(target.swapWith)?.displayName ?? 'unavailable selected season' : null;

  let action = 'Unavailable';
  if (isPreview) action = `Preview, confirm ${slot}`;
  else if (source) action = 'Review card';
  else if (target) action = targetName ? `Swap with ${targetName}` : `Move to open ${slot}`;
  else if (legalPlacement) action = `Place at open ${slot}`;
  else if (unavailable) action = 'Unavailable selected season';
  else if (occupied && movable) action =rosterFirstClick === 'review' ? 'Review card' : 'Move or swap';
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
 const placementKey = $derived(`${rosterPlacementKey(roster)}#${preview ? `${preview.profile.seasonId}@${preview.slot ?? 'bench'}` : ''}`);
 /** Bench cards in order, then the selected card previewed on the bench. */
 const benchCards = $derived.by(() => {
  if (!roster.bench) return [];
  const cards = roster.bench.map((seasonId, index) => ({ seasonId, profile: bySeason.get(seasonId), preview: false, surplus: index >= roster.reserves }));
  if (preview && preview.slot === null && !movingSeasonId) cards.push({ seasonId: preview.profile.seasonId, profile: preview.profile, preview: true, surplus: cards.length >= roster.reserves });
  return cards;
 });
 /** The open bench place shows while it is a legal placement not yet previewed, or a move target. */
 const benchOpen = $derived(!!roster.bench && (movingSeasonId ? benchTarget : benchLegal && preview?.slot !== null));
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
 const stadiumPhoto = $derived(stadium ? venuePhoto(media, stadium.franchiseId) : null);
 let failedPhoto = $state('');
 const art = $derived(fieldArt(stadium));
 const palette = $derived(stadiumColor ? roles({ primary: stadiumColor, secondary: STOCK }) : null);
 const cardStyle = $derived(`aspect-ratio: ${FIELD.width} / ${FIELD.height};${palette ? ` --stock: ${palette.field}; --stock-ink: ${palette.onField};` : ''}`);
 let turned = $state(false);
</script>

<aside bind:this={root} class="roster" class:compact class:deep aria-label={`Your field, ${pickedCount} of ${slots.length} roster slots filled`}>
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
     <rect class="staff-plate" x={fieldWindow.x} y={staffPlate.y} width={fieldWindow.width} height={staffPlate.height} rx="6"></rect>
    </svg>
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
      </span>
      <span class="mini-caption" aria-hidden="true"><strong>{stadium.name}</strong><span>Park</span></span>
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
 {#if roster.bench}
  <section class="bench" aria-labelledby="bench-heading">
   <h3 id="bench-heading">Bench <span>{roster.bench.length} · {roster.reserves} reserve{roster.reserves === 1 ? '' : 's'}</span></h3>
   <div class="bench-cards">
    {#each benchCards as card (card.seasonId)}
     {@const source = card.seasonId === movingSeasonId}
     <button
      type="button"
      class="bench-slot"
      class:preview={card.preview}
      class:source
      class:highlighted={source || card.preview}
      class:surplus={card.surplus && !card.preview}
      data-bench-season={card.seasonId}
      data-preview={card.preview ? 'true' : undefined}
      aria-label={`Bench${card.surplus ? ', no roster spot' : ''}, ${card.profile ? profileLabel(card.profile) : 'unavailable selected season'}. ${card.preview ? 'Preview, confirm bench' : source || rosterFirstClick === 'review' ? 'Review card' : 'Move or swap'}.`}
      aria-expanded={!card.preview ? card.seasonId === inspectedSeasonId : undefined}
      aria-controls={!card.preview ? inspectionId : undefined}
      disabled={busy || card.preview || (!!movingSeasonId && !source)}
      onclick={event => onBench?.(card.seasonId, event.currentTarget as HTMLButtonElement)}
     >
      <span class="card-frame" aria-hidden="true">
       {#if card.profile}<RosterItem profile={card.profile} assignedSlot={null} {manifest} {rankings} {rankingLoading} {rankingError} {media} {mediaStatus} />
       {:else}<span class="slot-placeholder"><b>Bench</b><span>Unavailable</span></span>{/if}
      </span>
     </button>
    {/each}
    {#if benchOpen}
     <button type="button" class="bench-slot highlighted" data-bench-open aria-label={movingSeasonId ? 'Bench. Move to the bench.' : 'Bench. Place on the bench.'} disabled={busy} onclick={event => onBench?.(null, event.currentTarget as HTMLButtonElement)}>
      <span class="card-frame" aria-hidden="true"><span class="slot-placeholder"><b>Bench</b><span>Open</span><small>{movingSeasonId ? 'Move' : 'Place'}</small></span></span>
     </button>
    {/if}
   </div>
  </section>
 {/if}
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
  /* In the phone sheet the field also fits the height left to it (424 × 678 card units). */
  width: min(100%, 30rem, calc(var(--sheet-field-height, 100000px) * 424 / 678));
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
 /* Staff columns are 101 units apart, so a slot may be wider than the card to keep names on fewer lines. */
 .staff-slot { --roster-slot-width: calc(100cqi * 92 / 424); }
 /* A five-across relief row leaves 80.8 units per reliever. */
 .deep .staff-slot[data-slot^='RP'] { --roster-slot-width: calc(100cqi * 78 / 424); }
 .bench { container-type: inline-size; width: min(100%, 30rem); margin: var(--space-3) auto 0; }
 .bench h3 { margin: 0 0 var(--space-2); font-size: var(--text-sm); }
 .bench h3 span { color: var(--muted); font-weight: 500; }
 .bench-cards { display: flex; flex-wrap: wrap; gap: var(--space-2); }
 .bench-slot {
  --roster-mini-width: calc(100cqi * 56 / 424);
  --roster-slot-width: calc(var(--roster-mini-width) * 8 / 7);
  display: grid;
  justify-items: center;
  align-content: start;
  width: var(--roster-slot-width);
  min-height: 2.75rem;
  padding: 0;
  border: 0;
  border-radius: var(--radius);
  color: var(--text);
  background: transparent;
  font: inherit;
  text-align: center;
 }
 .bench-slot:hover:not(:disabled) { background: transparent; }
 .bench-slot:disabled { opacity: 1; cursor: default; }
 .bench-slot:focus-visible { outline: 3px solid var(--focus); outline-offset: 4px; }
 .bench-slot.surplus .card-frame { outline-color: var(--error); }
 /* Disabled slots dim without turning translucent, so the field's lines never show through a slot. */
 .field-slot:disabled, .staff-slot:disabled { opacity: 1; cursor: default; }
 .field-slot:disabled .card-frame, .staff-slot:disabled .card-frame { filter: brightness(.55) saturate(.7); }
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
  background: color-mix(in oklch, var(--surface) 94%, transparent);
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
 /* C, DH, and the pitching staff sit just above an edge of the field card, so their names stay on one line instead of spilling past it. */
 .field-slot:is([data-slot='C'], [data-slot='DH']) :global(.identity strong) { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
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
  grid-template-rows: minmax(0, 1fr);
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
 /* The park's name reads like a player caption: name, then its slot. One line each, so it stays inside the field window. */
 .mini-caption { display: grid; width: calc(100cqi * 80 / 424); text-align: center; }
 .mini-caption strong, .mini-caption span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: .5625rem; line-height: 1.08; }
 .mini-caption span { color: var(--muted); }
 @media (prefers-reduced-motion: reduce) { .stadium-mini, .mini-card { transition: none; } }
 .slot-placeholder b { font-size: calc(100cqi * 15 / 424); }
 @media (prefers-reduced-motion: reduce) { .flipper { transition: none; } }
 :global([data-motion='off']) .flipper { transition: none; }
</style>
