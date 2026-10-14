<script lang="ts">
	import { untrack } from 'svelte';
	import { createDialKitController } from 'dialkit/svelte';
	import { tilt } from '#lib/cards/motion.ts';
	import { CardLight, LightEngine, lightCanvas } from '#lib/cards/surface/card-light.ts';
	import { DEFAULT_LIGHT, ERA_HOLO, HOLO_PATTERNS, type HoloPattern } from '#lib/cards/surface/light-renderer.ts';
	import type { CardEra } from '#lib/cards/view-model.ts';
	import StoryFrame from './StoryFrame.svelte';

	/** Which era prints each film, for the labels. */
	const eraOf = new Map(Object.entries(ERA_HOLO).map(([era, film]) => [film, era as CardEra]));
	const films = HOLO_PATTERNS.map(film => ({ film, era: eraOf.get(film), light: new CardLight() }));

	type Range = [number, number, number, number];
	const dials = createDialKitController('Holo gallery', untrack(() => ({
		layout: { width: [260, 120, 480, 1] as Range, drift: true },
		foil: {
			holoScale: [DEFAULT_LIGHT.holoScale, 3, 40, 0.5] as Range,
			shift: [DEFAULT_LIGHT.shift, 0, 10, 0.25] as Range,
			waves: [DEFAULT_LIGHT.waves, 0.5, 30, 0.5] as Range,
			shine: [DEFAULT_LIGHT.shine, 0, 3, 0.05] as Range,
			glare: [DEFAULT_LIGHT.glare, 0, 0.6, 0.01] as Range
		}
	})));
	const values = $derived(dials.values);
	$effect(() => {
		const options = { ...DEFAULT_LIGHT, holoPattern: -1, ...values.foil };
		const timer = setTimeout(() => untrack(() => LightEngine.shared()?.configure(options)), 150);
		return () => clearTimeout(timer);
	});
	let instance = $state(0);
</script>

<StoryFrame wide onReset={() => instance++}>
	{#if !LightEngine.shared()}
		<p role="alert">This browser cannot run the card light, so the holo films cannot be shown.</p>
	{:else}
		{#key instance}
			<div class="gallery" style={`--card-width:${Math.round(values.layout.width)}px`}>
				{#each films as { film, era, light } (film)}
					<figure>
						<div class="frame">
							<!-- A blank card face entirely under gem film: no art, no ink, just the holo. -->
							<div
								class="card"
								data-card={era ?? '2020s'}
								data-finish="gem"
								data-film={film}
								data-identity={film}
								use:tilt={{ enabled: true, idle: values.layout.drift, finish: 'gem', light, identity: film }}
							>
								<div class="film" data-surface="ring" data-surface-shape="box"></div>
								<canvas class="light" aria-hidden="true" use:lightCanvas={light}></canvas>
							</div>
						</div>
						<figcaption><b>{film}</b>{#if era}<span>{era}</span>{/if}</figcaption>
					</figure>
				{/each}
			</div>
		{/key}
	{/if}
</StoryFrame>

<style>
	.gallery { display: grid; grid-template-columns: repeat(auto-fill, var(--card-width)); gap: var(--space-5) var(--space-4); }
	figure { margin: 0; }
	.frame { width: var(--card-width); }
	.card { container-type: inline-size; position: relative; width: 100%; aspect-ratio: 5 / 7; isolation: isolate; border-radius: 1.8cqw; background: #15171c; box-shadow: 0 1cqw 3cqw rgb(0 0 0 / 0.45); }
	.film { position: absolute; inset: 0; border-radius: 1.8cqw; }
	.light { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 1.8cqw; pointer-events: none; opacity: 0; transition: opacity 240ms ease-out; }
	.light:global([data-presented]) { opacity: 1; }
	figcaption { display: flex; justify-content: space-between; margin-top: var(--space-2); color: var(--muted); }
	figcaption b { color: var(--text, inherit); }
</style>
