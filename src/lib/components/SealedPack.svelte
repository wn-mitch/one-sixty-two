<script lang="ts">
	import type { Snippet } from 'svelte';
	import { SILVER } from '../cards/finish.ts';
	import { tilt } from '../cards/motion.ts';
	import { CardLight, LightEngine, lightCanvas } from '../cards/surface/card-light.ts';
	import PackSeal from './PackSeal.svelte';

	/**
	 * A sealed silver foil pack: crimped seals at both ends around a dark face. Where the browser runs the card light,
	 * the foil is lit and follows the pointer like a card; elsewhere it keeps its CSS foil and glint. Opening animates
	 * `element` and the top `seal`, which callers bind.
	 */
	let { id, label, identity, disabled = false, sealed = true, element = $bindable(), seal = $bindable(), onclick, children }: {
		id?: string;
		label: string;
		/** Keeps the pack's light pose distinct from other packs on the page. */
		identity: string;
		disabled?: boolean;
		/** Lit seals and tilt follow the pointer only while the pack is still sealed. */
		sealed?: boolean;
		element?: HTMLButtonElement;
		seal?: HTMLElement;
		onclick: () => void;
		children: Snippet;
	} = $props();
	const shaded = LightEngine.shared() !== null;
	const light = new CardLight();
</script>

<button
	{id}
	type="button"
	class="pack sealed-pack"
	bind:this={element}
	aria-label={label}
	{disabled}
	{onclick}
	style:--foil={SILVER}
	data-light-root={shaded || undefined}
	data-finish="foil"
	data-card="2020s"
	data-plate="sunburst"
	data-identity={identity}
	use:tilt={{ enabled: shaded && sealed, idle: true, finish: 'silver', light, identity }}
>
	{#if shaded}
		<span class="sheet" data-surface="ring" data-surface-shape="box" aria-hidden="true"></span>
		<canvas class="light" aria-hidden="true" use:lightCanvas={light}></canvas>
	{/if}
	<!-- The torn seal leaves the light and flies off as print, so the canvas stops drawing it. -->
	<PackSeal bind:element={seal} lit={shaded && sealed} />
	<span class="pack-face" aria-hidden="true">{@render children()}</span>
	<PackSeal bottom lit={shaded} />
</button>

<style>
	.pack {
		--mx: 30%;
		--my: 50%;
		position: relative;
		z-index: 2;
		display: grid;
		grid-template-rows: 1.1rem 1fr 1.1rem;
		width: 100%;
		height: 100%;
		min-height: 44px;
		padding: 0;
		border: 0;
		border-radius: .35rem;
		color: var(--background);
		background: var(--foil);
		box-shadow: 0 1rem 2rem oklch(8% .01 255 / .45), inset 0 0 0 1px oklch(100% 0 0 / .35);
		overflow: hidden;
		cursor: pointer;
	}
	.pack::after {
		content: '';
		position: absolute;
		inset: 0;
		/* A strip 2.5 packs wide slides across; moving it by transform keeps the glint on the GPU. */
		right: auto;
		width: 250%;
		/* A plain translucent sheen: a blend mode would recomposite everything under the strip on every frame. */
		background: linear-gradient(105deg, transparent 30%, oklch(100% 0 0 / .22) 45%, transparent 60%);
		translate: -72% 0;
		animation: glint 3.2s ease-in-out infinite;
		pointer-events: none;
	}
	@keyframes glint { 0%, 55% { translate: -72% 0; } 100% { translate: 72% 0; } }
	:global([data-motion='off']) .pack::after { animation: none; }
	@media (prefers-reduced-motion: reduce) { .pack::after { animation: none; } }
	.pack:hover:not(:disabled) { background: var(--foil); filter: brightness(1.06); }
	.pack:active:not(:disabled) { transform: translateY(1px); }
	.pack:disabled { cursor: default; opacity: 1; }
	.pack:focus-visible { outline: 3px solid var(--focus); outline-offset: 4px; }
	/* A lit pack's foil sheet and light canvas sit under its seals and face; the canvas brings its own glint. */
	.sheet, .light { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; }
	.light { width: 100%; height: 100%; opacity: 0; transition: opacity 240ms ease-out; }
	.light:global([data-presented]) { opacity: 1; }
	.pack[data-light-root] > :not(.sheet, .light) { position: relative; z-index: 1; }
	.pack[data-light-root]::after { display: none; }
	.pack-face {
		display: grid;
		align-content: center;
		justify-items: center;
		gap: var(--space-2);
		margin-inline: .6rem;
		padding: var(--space-3) var(--space-2);
		color: var(--text);
		background: oklch(16% .012 255 / .92);
		border-block: 3px solid oklch(100% 0 0 / .6);
	}
</style>
