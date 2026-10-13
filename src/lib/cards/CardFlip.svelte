<script lang="ts">
 import FlipIcon from './FlipIcon.svelte';
 import { tick, untrack, type Snippet } from 'svelte';
 import { MediaQuery } from 'svelte/reactivity';
 import { fade } from 'svelte/transition';
 import type { InspectionSeasonView } from '../game/results-types.ts';
 import { appSettings } from '../game/settings.svelte.ts';
 import type { CardViewModel } from './view-model.ts';
 import Card from './Card.svelte';
 import InspectionBack from './InspectionBack.svelte';
 import { flip } from './motion.ts';
 import { autonomousMotion } from './motion-runtime.ts';

let {
 s,
 onDetails,
 turned = $bindable(false),
 opened = $bindable(false),
 showControl = true,
 onFrontSelect,
 inspectionView,
 textBack = false,
 backId,
 backControls,
 sourceElement,
 onReturned,
 raisedOnly = false,
 flipInPlace = false,
 readerNav,
 pairFaces = true,
 wall = false
}: {
 s: CardViewModel;
 onDetails: () => void;
 turned?: boolean;
 opened?: boolean;
 showControl?: boolean;
 onFrontSelect?: (trigger: HTMLButtonElement) => void;
 inspectionView?: InspectionSeasonView;
 textBack?: boolean;
 backId?: string;
 backControls?: Snippet;
 sourceElement?: HTMLElement | null;
 onReturned?: () => void;
 raisedOnly?: boolean;
 /** The raised reader turns between back and front where it is; only dismissal returns it. */
 flipInPlace?: boolean;
 /** Controls beside the raised reader's turn button, such as stepping through a hand of cards. */
 readerNav?: Snippet;
 /** Raise the front beside the back where the screen has room; off where the pair would cover its source. */
 pairFaces?: boolean;
 /** The front drifts and catches the light on its own until it is hovered. */
 wall?: boolean;
} = $props();

let stack = $state<HTMLDivElement>();
let sourceFocus: HTMLElement | undefined;
// A reader flipped to its front in place stays raised until it is dismissed.
let raisedFront = $state(false);
const readerOpen = $derived(raisedOnly ? opened : turned || raisedFront);
let previousOpen = untrack(() => readerOpen);
// A reader that mounts already open belongs to a parent that places focus itself.
let openedOnMount = untrack(() => readerOpen);
let backDisplayed = $state(untrack(() => turned));
// The raised front keeps its left-hand place until it has landed, so the return flight starts where the card is.
let frontUp = $state(false);
// From raising until it lands again, the card keeps the page's ambient motion still so its flight has the frame budget.
let holdingAmbient = $state(false);
$effect(() => {
 if (!holdingAmbient) return;
 return autonomousMotion.holdAmbient();
});
/** Wide screens with room for two raised cards show the front beside the back instead of hiding it. */
const roomForBoth = new MediaQuery('(min-width: 48rem) and (min-height: 34rem)');
// The raised position is set before the reader opens, so its flight measures the paired destination.
const paired = $derived(pairFaces && roomForBoth.current);

function controlOwner(): Element | undefined {
 return stack?.closest('.player-card') ?? stack?.closest('.card-review') ?? stack?.parentElement ?? undefined;
}

$effect.pre(() => {
 if (readerOpen) holdingAmbient = true;
 if (turned) backDisplayed = true;
 if (readerOpen) frontUp = !turned;
 if (readerOpen && !previousOpen && !stack?.matches(':popover-open')) {
  const active = document.activeElement;
  sourceFocus = sourceElement?.closest<HTMLElement>('button') ?? (active instanceof HTMLElement && controlOwner()?.contains(active) ? active : undefined);
 }
 previousOpen = readerOpen;
});

async function closeReader(): Promise<void> {
 if (raisedOnly) opened = false;
 raisedFront = false;
 turned = false;
 await tick();
 const target = sourceFocus?.isConnected ? sourceFocus : controlOwner()?.querySelector<HTMLButtonElement>('.draft-turn, .turn');
 target?.focus({ preventScroll: true });
}

function flightReturned(): void {
 holdingAmbient = false;
 backDisplayed = false;
 frontUp = false;
 onReturned?.();
}

// A pointer click on a selectable front waits out the double-click window, so raising a card never selects it too.
const DOUBLE_CLICK_MS = 220;
let pendingSelect: ReturnType<typeof setTimeout> | undefined;

function frontClick(event: MouseEvent & { currentTarget: HTMLButtonElement }): void {
 if (readerOpen) return raisedClick();
 clearTimeout(pendingSelect);
 pendingSelect = undefined;
 // Keyboard activation reports no clicks and selects at once.
 if (event.detail === 0) return onFrontSelect?.(event.currentTarget);
 if (event.detail > 1) return;
 const trigger = event.currentTarget;
 pendingSelect = setTimeout(() => {
  pendingSelect = undefined;
  if (trigger.isConnected) onFrontSelect?.(trigger);
 }, DOUBLE_CLICK_MS);
}

$effect(() => () => clearTimeout(pendingSelect));

/** A double click lifts the card into the reader face up, as turning it over lifts it face down. */
function raiseFront(): void {
 clearTimeout(pendingSelect);
 pendingSelect = undefined;
 if (readerOpen || raisedOnly) return;
 raisedFront = true;
}

function toggle(): void {
 if (turned) void closeReader();
 else turned = true;
}

/** The raised reader's own turn control and surface. */
function readerToggle(): void {
 if (!flipInPlace || raisedOnly || !readerOpen) return toggle();
 raisedFront = turned;
 turned = !turned;
}

$effect(() => {
 if (readerOpen && !openedOnMount) void tick().then(() => (stack?.querySelector<HTMLButtonElement>('.reader-return:not(.spacer)') ?? stack)?.focus({ preventScroll: true }));
 if (!readerOpen) {
  openedOnMount = false;
  return;
 }
 const closeOnOutsidePointer = (event: PointerEvent) => {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (stack && (stack.contains(target) || event.composedPath().includes(stack))) return;
  if (target instanceof Element && controlOwner()?.contains(target) && target.closest('.turn, .draft-turn, .season-toggle button, .review-header button')) return;
  if (raisedOnly) opened = false;
  raisedFront = false;
  turned = false;
  // A raised card dims the page, so the click that dismisses it does nothing else, except on
  // another card's turn control or a workshop control, which act in the same click.
  // A card shown inside a dialog, as in the phone field sheet, layers in place and leaves the dialog live.
  const raised = (stack?.matches(':popover-open') ?? false) && !stack?.closest('dialog');
  if (!raised || (target instanceof Element && target.closest('[data-turn], .draft-turn, .workshop-controls'))) return;
  const swallow = (click: MouseEvent) => { click.preventDefault(); click.stopPropagation(); };
  document.addEventListener('click', swallow, { capture: true, once: true });
  setTimeout(() => document.removeEventListener('click', swallow, true), 600);
 };
 const closeOnEscape = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return;
  const activeDialog = document.activeElement?.closest('dialog[open]');
  if (activeDialog && !activeDialog.contains(stack ?? null)) return;
  event.preventDefault();
  void closeReader();
 };
 document.addEventListener('pointerdown', closeOnOutsidePointer, true);
 document.addEventListener('keydown', closeOnEscape, true);
 return () => {
  document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
  document.removeEventListener('keydown', closeOnEscape, true);
 };
});

/** Side by side, both faces already show, so clicking the raised card puts it down; alone, it turns over. */
function raisedClick(): void {
 if (paired && readerOpen) void closeReader();
 else readerToggle();
}

/** Extends the pointer hit area without wrapping the semantic card; the sibling turn button is the keyboard equivalent. */
function surfaceFlip(node: HTMLElement): { destroy(): void } {
 const handleClick = (event: MouseEvent) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('button, a, input, select, textarea, summary, [role="button"]')) return;
  raisedClick();
 };
 node.addEventListener('click', handleClick);
 return { destroy: () => node.removeEventListener('click', handleClick) };
}

</script>

<div
 class="cardbox"
 data-cardbox
 class:external-source={raisedOnly || !!sourceElement}
 data-face={turned ? 'back' : 'front'}
>
 {#if showControl}
  <button class="turn" type="button" data-turn aria-label="Turn over" title="Flip card over" aria-pressed={turned} onclick={toggle}>
   <FlipIcon />
  </button>
 {/if}
  <div class="slot" aria-hidden="true"></div>
  <div bind:this={stack} class="reader" class:paired class:front-up={frontUp} data-card-reader popover="manual" tabindex="-1">
   {#if paired && readerOpen}
    <!-- The face the raised card is not showing. -->
    <div class="companion" data-card-companion aria-hidden="true" inert out:fade={{ duration: appSettings.animateCards ? 160 : 0 }}>
     {#if turned}<Card {s} face="front" interactive={false} {onDetails} />
     {:else if inspectionView || textBack}<InspectionBack {s} view={inspectionView} simplified={textBack} {onDetails} />
     {:else}<Card {s} face="back" {onDetails} />{/if}
    </div>
   {/if}
   <div class="stack" class:turned class:back-layout={backDisplayed} data-flip data-text-back={textBack} data-motion-reduced={!appSettings.animateCards} use:flip={{ turned, opened: readerOpen, sourceElement, onReturned: flightReturned }} use:surfaceFlip>
    <div class="front" inert={turned} aria-hidden={turned}>
     {#if onFrontSelect}
      <button type="button" class="select-front" aria-label="Select {s.year} {s.full}" onclick={frontClick} ondblclick={raiseFront}><Card {s} face="front" interactive {wall} {onDetails} /></button>
     {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="raise-front" ondblclick={raiseFront}><Card {s} face="front" interactive={!raisedOnly} {wall} {onDetails} /></div>
     {/if}
    </div>
    {#each ['#d4cfc4', '#f2efe8', '#d4cfc4', '#a9a397'] as color, index}
     <div class="stock-edge" data-layer="flip.slab" style:background={color} style:transform="translateZ(-{index + 1}px)"></div>
    {/each}
    <div id={backId} class="back" inert={!turned} aria-hidden={!turned}>
     {#if inspectionView || textBack}
      <InspectionBack {s} view={inspectionView} simplified={textBack} {onDetails} controls={backDisplayed ? backControls : undefined} />
     {:else}
      {#if backDisplayed && backControls}
       <div class="back-controls">{@render backControls()}</div>
      {/if}
      <Card {s} face="back" {onDetails} />
     {/if}
    </div>
   </div>
    {#if readerOpen}
     <!-- Side by side, both faces show, so the turn button only keeps the row for the reader's other controls. -->
     {#if !paired || readerNav}<button class="reader-return" class:spacer={paired} type="button" aria-label={turned ? 'Show front' : 'Turn over'} title={turned ? 'Flip to the front' : 'Flip card over'} onclick={readerToggle}><FlipIcon /></button>{/if}
     {#if readerNav}<div class="reader-nav">{@render readerNav()}</div>{/if}
    {/if}
   </div>
</div>

<style>
 .cardbox { display: grid; grid-template-columns: minmax(0, 1fr); justify-items: center; gap: 1rem; width: 100%; }
 .turn { grid-column: 1; grid-row: 2; }
 .turn, .reader-return { display: grid; place-items: center; width: 44px; height: 44px; padding: 0; font-size: 1.5rem; }
 .cardbox[data-face='back'] > .turn { visibility: hidden; pointer-events: none; }
 .reader-return { margin: 12px auto 0; }
 .reader-return.spacer { visibility: hidden; }
 .reader:focus { outline: none; }
 .turn :global(.flip-icon), .reader-return :global(.flip-icon) { width: 1.4rem; height: 1.4rem; }
 .raise-front { display: contents; }
 /* Shares the turn button's row: its controls sit at either end with the turn button between. */
 .reader-nav { position: absolute; inset: auto 0 0; display: flex; align-items: center; justify-content: space-between; height: 44px; pointer-events: none; }
 .reader-nav > :global(*) { pointer-events: auto; }
 .slot, .reader { grid-column: 1; grid-row: 1; }
 .slot { width: min(100%, var(--card-front-width, 20rem)); aspect-ratio: 5 / 7; pointer-events: none; }
 .reader { display: block; position: relative; inset: auto; container-type: inline-size; width: min(100%, var(--card-front-width, 20rem)); margin: 0 auto; border: 0; padding: 0; overflow: visible; background: transparent; color: inherit; }
 .reader[popover]:not(:popover-open) { display: block; }
 /* The flight scales the raised card every frame; one full-size raster keeps the foil layers from re-rasterizing at each step. */
 .reader:popover-open .stack { will-change: transform; }
 .reader:popover-open { position: fixed; top: 50%; left: 50%; translate: -50% -50%; width: min(410px, calc(100vw - 2rem)); }
 .reader:popover-open:has(.reader-return) { translate: -50% calc(-50% + 28px); }
 .stack { display: block; position: relative; transform-origin: center; transform-style: preserve-3d; width: 100%; overflow: visible; }
 .front { position: relative; width: 100%; margin-inline: auto; backface-visibility: hidden; }
 .back { position: absolute; inset: 0; width: 100%; overflow: hidden; backface-visibility: hidden; transform: translateZ(-5px) rotateY(180deg); }
 .back-layout .front { position: absolute; top: 50%; left: 0; width: 100%; margin: 0; transform: translateY(-50%); }
 .back-layout .back { position: relative; max-height: calc(100dvh - 9rem); overflow: auto; }
 .back-controls { display: flex; flex-wrap: wrap; gap: .5rem; padding: .75rem 1rem; }
 .stack[data-text-back='true'] .stock-edge { display: none; }
 .select-front { display: block; width: 100%; min-height: 44px; padding: 0; border: 0; border-radius: .4rem; background: transparent; color: inherit; text-align: inherit; cursor: pointer; }
 .back :global([data-layer="sources.cue"]) { position: relative; z-index: 2; }
 .external-source { position: fixed; inset: 0 auto auto 0; width: 0; height: 0; pointer-events: none; }
 .external-source .slot { display: none; }
 .external-source .reader { width: 410px; visibility: hidden; }
 .external-source .reader:popover-open { width: min(410px, calc(100vw - 2rem)); visibility: visible; pointer-events: auto; }
 .external-source .front { aspect-ratio: 5 / 7; }
 /* A raised back with its front beside it: the pair centers on the screen, the front on the left. */
 .cardbox .reader.paired:popover-open { width: min(410px, calc((100vw - 4rem) / 2)); translate: .75rem -50%; }
 .cardbox .reader.paired:popover-open:has(.reader-return) { translate: .75rem calc(-50% + 28px); }
 .companion { position: absolute; top: 50%; right: calc(100% + 1.5rem); width: 100%; translate: 0 -50%; animation: companion-in var(--motion-card-flight) var(--ease-out) both; }
 /* The paired face arrives with the raised card's flight rather than after it. */
 .reader:has(.reader-return) .companion { top: calc(50% - 28px); }
 /* The rest of the page dims a little behind a raised card; an outside click returns it and the dim fades with the flight. */
 .reader:popover-open::backdrop { background: oklch(8% .01 255 / .38); pointer-events: none; transition: background 200ms var(--ease-out); animation: reader-dim 240ms var(--ease-out) backwards; }
 .reader:global([data-returning])::backdrop { background: oklch(8% .01 255 / 0); }
 /* Inside a dialog the reader layers in place over the sheet, which stays undimmed. */
 :global(dialog) .reader:popover-open::backdrop { background: transparent; animation: none; }
 @keyframes reader-dim { from { background: oklch(8% .01 255 / 0); } }
 :global([data-motion='off']) .reader:popover-open::backdrop { animation: none; transition: none; }
 @media (prefers-reduced-motion: reduce) { .reader:popover-open::backdrop { animation: none; transition: none; } }
 /* The front always sits on the left: a raised front takes the left place and its back pairs on the right. */
 .cardbox .reader.paired.front-up:popover-open { translate: calc(-100% - .75rem) -50%; }
 .cardbox .reader.paired.front-up:popover-open:has(.reader-return) { translate: calc(-100% - .75rem) calc(-50% + 28px); }
 .front-up .companion { right: auto; left: calc(100% + 1.5rem); animation-name: companion-in-right; }
 @keyframes companion-in-right { from { opacity: 0; transform: translateX(-2rem); } }
 @keyframes companion-in { from { opacity: 0; transform: translateX(2rem); } }
 :global([data-motion='off']) .companion { animation: none; }
 @media (prefers-reduced-motion: reduce) { .companion { animation: none; } }
 .front :global(.card) { transition: opacity 80ms var(--ease-out); }
 .stack[data-motion-reduced='true'] .front :global(.card) { transition: none; }
 .stack[data-motion-reduced='true'], .stack[data-motion-reduced='true'] .back, .stack[data-motion-reduced='true'].back-layout .front { transform: none; }
 .stack[data-motion-reduced='true']:not(.back-layout) .back, .stack[data-motion-reduced='true'].back-layout .front { display: none; }
 @media (prefers-reduced-motion: reduce) {
  .stack, .back, .back-layout .front, .reader-return { transform: none; }
  .stack:not(.back-layout) .back, .stack.back-layout .front { display: none; }
 }
</style>
