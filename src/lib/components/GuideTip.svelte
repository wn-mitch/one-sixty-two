<script lang="ts">
	import { onDestroy, untrack, type Snippet } from 'svelte';
	import { guide, type GuideStep } from '../game/guide.svelte.ts';

	/**
	 * A first-season callout pointing at what it explains. It floats beside its anchor (below it when
	 * there is room, else above) without covering it, and shows only when its step is the earliest one on
	 * screen. Tapping the anchor, Got it, or leaving the moment (unmounting) counts as seen; a reload
	 * mid-moment shows it again. Without an anchor on screen it docks at the bottom of the viewport.
	 */
	let { step, text, anchor, extra }: {
		step: GuideStep;
		text: string;
		/** The element the callout points at, looked up each frame since cards deal and sheets slide. */
		anchor?: () => HTMLElement | null | undefined;
		/** Trailing content after the text, such as a link. */
		extra?: Snippet;
	} = $props();

	// Registering reads the mounted list it changes, so it must not track it.
	$effect(() => { const current = step; return untrack(() => guide.mount(current)); });
	const shown = $derived(guide.shows(step));
	let wasShown = false;
	$effect(() => { if (shown) wasShown = true; });
	onDestroy(() => { if (wasShown) guide.done(step); });

	const GAP = 12;
	const MARGIN = 12;
	let callout = $state<HTMLElement>();
	let place = $state<{ top: number; left: number; arrow: number; above: boolean } | null>(null);
	/** An open dialog or sheet covers the page, so the callout waits behind it rather than floating over it. */
	let covered = $state(false);

	/** Moves the callout to the document body so no clipping or stacking context of its anchor's ancestors hides it. */
	function portal(node: HTMLElement) {
		document.body.append(node);
		return { destroy: () => node.remove() };
	}

	$effect(() => {
		if (!shown || !callout) return;
		let frame = 0;
		let target: HTMLElement | null = null;
		const seen = () => guide.done(step);
		const measure = () => {
			const dialog = !!document.querySelector('dialog[open]');
			if (dialog !== covered) covered = dialog;
			const element = anchor?.() ?? null;
			if (element !== target) {
				target?.removeEventListener('click', seen);
				target = element;
				target?.addEventListener('click', seen);
			}
			const rect = element?.getBoundingClientRect();
			if (!rect || (!rect.width && !rect.height) || !callout) {
				if (place) place = null;
				frame = requestAnimationFrame(measure);
				return;
			}
			const width = callout.offsetWidth;
			const height = callout.offsetHeight;
			const viewport = document.documentElement.clientWidth;
			const below = innerHeight - rect.bottom;
			const above = below < height + GAP + MARGIN && rect.top > below;
			const center = rect.left + rect.width / 2;
			const left = Math.min(Math.max(center - width / 2, MARGIN), Math.max(MARGIN, viewport - width - MARGIN));
			const next = {
				top: Math.round(scrollY + (above ? rect.top - GAP - height : rect.bottom + GAP)),
				left: Math.round(scrollX + left),
				arrow: Math.round(Math.min(Math.max(center - left, 18), width - 18)),
				above
			};
			if (!place || place.top !== next.top || place.left !== next.left || place.arrow !== next.arrow || place.above !== next.above) place = next;
			frame = requestAnimationFrame(measure);
		};
		measure();
		return () => { cancelAnimationFrame(frame); target?.removeEventListener('click', seen); };
	});
</script>

{#if shown}
	<aside
		use:portal
		bind:this={callout}
		class="guide-tip"
		class:docked={!place}
		class:above={place?.above}
		class:covered
		style:top={place ? `${place.top}px` : null}
		style:left={place ? `${place.left}px` : null}
		style:--arrow={place ? `${place.arrow}px` : null}
		aria-label="First-season tip"
		data-guide-step={step}
	>
		<p role="status">{text}{#if extra}{' '}{@render extra()}{/if}</p>
		<div class="guide-actions">
			<button type="button" class="quiet" onclick={() => guide.done(step)}>Got it</button>
			<button type="button" class="quiet skip" onclick={() => guide.skip()}>Skip guidance</button>
		</div>
	</aside>
{/if}

<style>
	.guide-tip {
		position: absolute;
		z-index: 30;
		width: min(21rem, calc(100vw - 24px));
		padding: var(--space-3) var(--space-3) var(--space-1) var(--space-4);
		border: 1px solid var(--accent);
		border-radius: var(--radius-lg);
		background: var(--surface-raised);
		color: var(--text);
		font-size: var(--text-sm);
		box-shadow: 0 .75rem 2rem oklch(0% 0 0 / .45);
		animation: guide-in 180ms var(--ease-out) both;
		/* Taps on the callout's text reach the cards beneath it; only its own controls take them. */
		pointer-events: none;
	}
	.guide-tip button, .guide-tip :global(a) { pointer-events: auto; }
	/* The arrow is a rotated square sharing the callout's border, pointing at the anchor's center. */
	.guide-tip::before {
		content: '';
		position: absolute;
		top: -7px;
		left: calc(var(--arrow, 50%) - 6px);
		width: 12px;
		height: 12px;
		border: solid var(--accent);
		border-width: 1px 0 0 1px;
		background: var(--surface-raised);
		transform: rotate(45deg);
	}
	.guide-tip.above::before { top: auto; bottom: -7px; transform: rotate(225deg); }
	.guide-tip.docked { position: fixed; left: 50%; bottom: max(var(--space-4), env(safe-area-inset-bottom)); translate: -50% 0; }
	.guide-tip.docked::before { display: none; }
	.guide-tip.covered { visibility: hidden; }
	.guide-tip p { margin: 0; line-height: 1.45; }
	.guide-tip p :global(a) { color: var(--accent); font-weight: 650; }
	.guide-actions { display: flex; justify-content: flex-end; gap: var(--space-1); }
	.guide-actions button { min-height: 2.75rem; padding-inline: var(--space-3); font-size: var(--text-sm); }
	.skip { color: var(--muted); }
	@keyframes guide-in { from { opacity: 0; } }
	:global([data-motion='off']) .guide-tip { animation: none; }
	@media (prefers-reduced-motion: reduce) { .guide-tip { animation: none; } }
</style>
