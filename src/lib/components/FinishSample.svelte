<script lang="ts">
	import type { CardAppearance } from '../cosmetics/catalogue.ts';
	import type { Finish } from '../cards/finish.ts';
	import type { CardEra } from '../cards/era.ts';
	import { ERA_FOIL } from '../cards/surface/foil-plates.ts';
	import { ERA_HOLO } from '../cards/surface/holo-films.ts';
	import { CardLight, LightEngine, lightCanvas } from '../cards/surface/card-light.ts';
	import { tilt, type CardFinish } from '../cards/motion.ts';

	let { tier, era, appearance, idle = true }: { tier: Finish; era: CardEra; appearance: CardAppearance | null; idle?: boolean } = $props();

	const light = new CardLight();
	const available = LightEngine.shared() !== null;
	const plate = $derived(tier === 'base' ? undefined : appearance?.plate ?? ERA_FOIL[era]);
	const film = $derived(tier === 'gem' ? appearance?.film ?? ERA_HOLO[era] : undefined);
	const palette = $derived(tier === 'gem' ? appearance?.palette : undefined);
	const finish = $derived((tier === 'foil' ? 'silver' : tier === 'emboss' ? 'gold' : tier) as CardFinish);
	const identity = $derived(`finish-sample:${tier}:${era}:${plate ?? ''}:${film ?? ''}:${palette ?? ''}`);
	$effect(() => {
		void tier;
		void era;
		LightEngine.shared()?.invalidate(light);
	});
	$effect(() => {
		void plate;
		void film;
		void palette;
		LightEngine.shared()?.dirty(light);
	});
</script>

<div class="sample-frame">
<div
	class="finish-sample"
	data-finish-sample
	data-light-root
	data-card={era}
	data-finish={tier}
	data-film={film}
	data-plate={plate}
	data-palette={palette}
	data-identity={identity}
	aria-label={`${tier} finish sample`}
	use:tilt={{ enabled: available, idle, finish, light, identity }}
>
	{#if available}
		{#if tier !== 'base'}<div class="surface" data-surface="ring" data-surface-shape="box" aria-hidden="true"></div>{/if}
		<canvas class="light" aria-hidden="true" use:lightCanvas={light}></canvas>
	{:else}
		<p class="unavailable" role="status">Finish preview unavailable: this browser cannot run WebGL2 material lighting.</p>
	{/if}
</div>
</div>

<style>
	.sample-frame { container-type: inline-size; width: 100%; }
	.finish-sample {
		position: relative;
		width: 100%;
		aspect-ratio: 5 / 7;
		isolation: isolate;
		overflow: hidden;
		border-radius: 1.8cqw;
		background: #d4cfc4;
		box-shadow: 0 1cqw 3cqw rgb(0 0 0 / 0.45);
	}
	.finish-sample[data-finish='foil'] { background: #aeb7c0; }
	.finish-sample[data-finish='emboss'] { background: #c4953a; }
	.finish-sample[data-finish='gem'] { background: #e8e4ee; }
	.surface { position: absolute; inset: 0; border-radius: 1.8cqw; }
	.light {
		position: absolute;
		inset: 0;
		z-index: 2;
		width: 100%;
		height: 100%;
		border-radius: 1.8cqw;
		pointer-events: none;
		opacity: 0;
		transition: opacity 240ms ease-out;
	}
	.light:global([data-presented]) { opacity: 1; }
	.unavailable {
		position: absolute;
		inset: 0;
		z-index: 3;
		display: grid;
		place-items: center;
		margin: 0;
		padding: 1rem;
		color: var(--muted, #62656c);
		background: rgb(22 24 29 / 0.08);
		font-size: var(--text-sm, 0.875rem);
		line-height: 1.35;
		text-align: center;
	}
</style>
