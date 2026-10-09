<script lang="ts">
 import { tick, untrack, type Snippet } from 'svelte';
 import type { InspectionSeasonView } from '../game/results-types.ts';
 import { appSettings } from '../game/settings.svelte.ts';
 import type { CardViewModel } from './view-model.ts';
 import Card from './Card.svelte';
 import InspectionBack from './InspectionBack.svelte';
 import { flip } from './motion.ts';

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
 raisedOnly = false
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
} = $props();

let stack = $state<HTMLDivElement>();
let sourceFocus: HTMLElement | undefined;
const readerOpen = $derived(raisedOnly ? opened : turned);
let previousOpen = untrack(() => readerOpen);
let backDisplayed = $state(untrack(() => turned));

function controlOwner(): Element | undefined {
 return stack?.closest('.player-card') ?? stack?.closest('.card-review') ?? stack?.parentElement ?? undefined;
}

$effect.pre(() => {
 if (turned) backDisplayed = true;
 if (readerOpen && !previousOpen && !stack?.matches(':popover-open')) {
  const active = document.activeElement;
  sourceFocus = sourceElement?.closest<HTMLElement>('button') ?? (active instanceof HTMLElement && controlOwner()?.contains(active) ? active : undefined);
 }
 previousOpen = readerOpen;
});

async function closeReader(): Promise<void> {
 if (raisedOnly) opened = false;
 turned = false;
 await tick();
 const target = sourceFocus?.isConnected ? sourceFocus : controlOwner()?.querySelector<HTMLButtonElement>('.draft-turn, .turn');
 target?.focus({ preventScroll: true });
}

function flightReturned(): void {
 backDisplayed = false;
 onReturned?.();
}

function toggle(): void {
 if (turned) void closeReader();
 else turned = true;
}

$effect(() => {
 if (readerOpen) void tick().then(() => stack?.querySelector<HTMLButtonElement>('.reader-return')?.focus({ preventScroll: true }));
 if (!readerOpen) return;
 const closeOnOutsidePointer = (event: PointerEvent) => {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (stack && (stack.contains(target) || event.composedPath().includes(stack))) return;
  if (target instanceof Element && controlOwner()?.contains(target) && target.closest('.turn, .draft-turn, .season-toggle button, .review-header button')) return;
  if (raisedOnly) opened = false;
  turned = false;
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

/** Extends the pointer hit area without wrapping the semantic card; the sibling turn button is the keyboard equivalent. */
function surfaceFlip(node: HTMLElement): { destroy(): void } {
 const handleClick = (event: MouseEvent) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('button, a, input, select, textarea, summary, [role="button"]')) return;
  toggle();
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
  <button class="turn" type="button" data-turn aria-label="Turn over" aria-pressed={turned} onclick={toggle}>
   <span aria-hidden="true">↻</span>
  </button>
 {/if}
  <div class="slot" aria-hidden="true"></div>
  <div bind:this={stack} class="reader" data-card-reader popover="manual">
   <div class="stack" class:turned class:back-layout={backDisplayed} data-flip data-text-back={textBack} data-motion-reduced={!appSettings.animateCards} use:flip={{ turned, opened: readerOpen, sourceElement, onReturned: flightReturned }} use:surfaceFlip>
    <div class="front" inert={turned} aria-hidden={turned}>
     {#if onFrontSelect}
      <button type="button" class="select-front" aria-label="Select {s.year} {s.full}" onclick={event => onFrontSelect?.(event.currentTarget)}><Card {s} face="front" interactive {onDetails} /></button>
     {:else}
      <Card {s} face="front" interactive={!raisedOnly} {onDetails} />
     {/if}
    </div>
    {#each ['#d4cfc4', '#f2efe8', '#d4cfc4', '#a9a397'] as color, index}
     <div class="stock-edge" data-layer="flip.slab" style:background={color} style:transform="translateZ(-{index + 1}px)"></div>
    {/each}
    <div id={backId} class="back" inert={!turned} aria-hidden={!turned}>
     {#if backDisplayed && backControls}
      <div class="back-controls">{@render backControls()}</div>
     {/if}
     {#if inspectionView || textBack}
      <InspectionBack {s} view={inspectionView} simplified={textBack} {onDetails} />
     {:else}
      <Card {s} face="back" {onDetails} />
     {/if}
    </div>
   </div>
    {#if readerOpen}
     <button class="reader-return" type="button" aria-label={turned ? 'Show front' : 'Turn over'} onclick={toggle}><span aria-hidden="true">↻</span></button>
    {/if}
   </div>
</div>

<style>
 .cardbox { display: grid; grid-template-columns: minmax(0, 1fr); justify-items: center; gap: 1rem; width: 100%; }
 .turn { grid-column: 1; grid-row: 2; }
 .turn, .reader-return { display: grid; place-items: center; width: 44px; height: 44px; padding: 0; font-size: 1.5rem; }
 .cardbox[data-face='back'] > .turn { visibility: hidden; pointer-events: none; }
 .reader-return { margin: 12px auto 0; }
 .slot, .reader { grid-column: 1; grid-row: 1; }
 .slot { width: min(100%, var(--card-front-width, 20rem)); aspect-ratio: 5 / 7; pointer-events: none; }
 .reader { display: block; position: relative; inset: auto; container-type: inline-size; width: min(100%, var(--card-front-width, 20rem)); margin: 0 auto; border: 0; padding: 0; overflow: visible; background: transparent; color: inherit; }
 .reader[popover]:not(:popover-open) { display: block; }
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
 .front :global(.card) { transition: opacity 80ms var(--ease-out); }
 .stack[data-motion-reduced='true'] .front :global(.card) { transition: none; }
 .stack[data-motion-reduced='true'], .stack[data-motion-reduced='true'] .back, .stack[data-motion-reduced='true'].back-layout .front { transform: none; }
 .stack[data-motion-reduced='true']:not(.back-layout) .back, .stack[data-motion-reduced='true'].back-layout .front { display: none; }
 @media (prefers-reduced-motion: reduce) {
  .stack, .back, .back-layout .front, .reader-return { transform: none; }
  .stack:not(.back-layout) .back, .stack.back-layout .front { display: none; }
 }
</style>
