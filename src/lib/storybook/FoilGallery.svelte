<script lang="ts">
	import { untrack } from 'svelte';
	import { createDialKitController } from 'dialkit/svelte';
	import { tilt } from '#lib/cards/motion.ts';
	import { CardLight, LightEngine, lightCanvas } from '#lib/cards/surface/card-light.ts';
	import { DEFAULT_LIGHT } from '#lib/cards/surface/light-renderer.ts';
	import { ERA_FOIL, FOIL_PLATES } from '#lib/cards/surface/foil-plates.ts';
	import type { Finish } from '#lib/cards/finish.ts';
	import type { CardEra } from '#lib/cards/view-model.ts';
	import StoryFrame from './StoryFrame.svelte';

	/** Which era presses each plate, for the labels. */
	const eraOf = new Map(Object.entries(ERA_FOIL).map(([era, plate]) => [plate, era as CardEra]));
	const metals: { finish: Finish; label: string }[] = [{ finish: 'foil', label: 'Silver' }, { finish: 'emboss', label: 'Gold' }];
	const rows = metals.map(metal => ({ ...metal, plates: FOIL_PLATES.map(plate => ({ plate, era: eraOf.get(plate), light: new CardLight() })) }));

	type Range = [number, number, number, number];
	const dials = createDialKitController('Foil gallery', untrack(() => ({
		layout: { width: [260, 120, 480, 1] as Range, drift: true },
		foil: {
			plateDepth: [DEFAULT_LIGHT.plateDepth, 0, 3, 0.05] as Range,
			plateScale: [DEFAULT_LIGHT.plateScale, 0.25, 4, 0.05] as Range,
			plateTone: [DEFAULT_LIGHT.plateTone, 0, 2, 0.05] as Range,
			stain: [DEFAULT_LIGHT.stain, 0, 2, 0.05] as Range,
			brush: [DEFAULT_LIGHT.brush, 0, 2, 0.05] as Range,
			foil: [DEFAULT_LIGHT.foil, 0, 1, 0.05] as Range,
			relief: [DEFAULT_LIGHT.relief, 1, 18, 0.5] as Range,
			lightHeight: [DEFAULT_LIGHT.lightHeight, 0.6, 8, 0.1] as Range,
			shift: [DEFAULT_LIGHT.shift, 0, 10, 0.25] as Range,
			waves: [DEFAULT_LIGHT.waves, 0.5, 30, 0.5] as Range,
			shine: [DEFAULT_LIGHT.shine, 0, 3, 0.05] as Range,
			glare: [DEFAULT_LIGHT.glare, 0, 0.6, 0.01] as Range
		}
	})));
	const values = $derived(dials.values);
	$effect(() => {
		const options = { ...DEFAULT_LIGHT, foilPlate: -1, ...values.foil };
		const timer = setTimeout(() => untrack(() => LightEngine.shared()?.configure(options)), 150);
		return () => clearTimeout(timer);
	});
	let instance = $state(0);
</script>

<StoryFrame wide onReset={() => instance++}>
	{#if !LightEngine.shared()}
		<p role="alert">This browser cannot run the card light, so the foil plates cannot be shown.</p>
	{:else}
		{#key instance}
			{#each rows as row (row.finish)}
				<h3>{row.label}</h3>
				<div class="gallery" style={`--card-width:${Math.round(values.layout.width)}px`}>
					{#each row.plates as { plate, era, light } (plate)}
						<figure>
							<div class="frame">
								<!-- A blank card face entirely under foil: no art, no ink, just the plate pressed into the metal. Plates no era uses sit on the brushed 1960s stock. -->
								<div
									class="card"
									data-card={era ?? '1960s'}
									data-finish={row.finish}
									data-plate={plate}
									data-identity={plate}
									use:tilt={{ enabled: true, idle: values.layout.drift, finish: row.finish === 'foil' ? 'silver' : 'gold', light, identity: plate }}
								>
									<div class="film" data-surface="ring" data-surface-shape="box"></div>
									<canvas class="light" aria-hidden="true" use:lightCanvas={light}></canvas>
								</div>
							</div>
							<figcaption><b>{plate}</b>{#if era}<span>{era}</span>{/if}</figcaption>
						</figure>
					{/each}
				</div>
			{/each}
		{/key}
	{/if}
</StoryFrame>

<style>
	.gallery { display: grid; grid-template-columns: repeat(auto-fill, var(--card-width)); gap: var(--space-5) var(--space-4); }
	h3 { margin: var(--space-5) 0 var(--space-3); }
	figure { margin: 0; }
	.frame { width: var(--card-width); }
	.card { container-type: inline-size; position: relative; width: 100%; aspect-ratio: 5 / 7; isolation: isolate; border-radius: 1.8cqw; background: #15171c; box-shadow: 0 1cqw 3cqw rgb(0 0 0 / 0.45); }
	.film { position: absolute; inset: 0; border-radius: 1.8cqw; }
	.light { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 1.8cqw; pointer-events: none; opacity: 0; transition: opacity 240ms ease-out; }
	.light:global([data-presented]) { opacity: 1; }
	figcaption { display: flex; justify-content: space-between; margin-top: var(--space-2); color: var(--muted); }
	figcaption b { color: var(--text, inherit); }
</style>
