<script lang="ts">
	import Card from '#lib/cards/Card.svelte';
	import { materialFor } from '#lib/cards/finish.ts';
	import { tilt } from '#lib/cards/motion.ts';
	import { CardLight, LightEngine, lightCanvas } from '#lib/cards/surface/card-light.ts';
	import type { CardViewModel } from '#lib/cards/view-model.ts';
	import { INK, PAPER, STOCK } from '#lib/cards/tokens.ts';
	import type { Scene } from './scene.ts';

	/**
	 * One lab card: a blank foil sheet, a live options reference, or a real era front. The engine draws it
	 * with this card's own settings, so staggered cards differ side by side.
	 */
	let { scene, front, drift, label, onpick }: {
		scene: Scene;
		/** The era's headline card, for the era front; null while it loads. */
		front: CardViewModel | null;
		drift: boolean;
		label?: string;
		onpick?: () => void;
	} = $props();

	const light = new CardLight();
	let holder: HTMLElement;
	// Every lab card drifts in step, so staggered cards are always seen at the same angle.
	const IDENTITY = 'foil-lab';
	const motionFinish = $derived(scene.tier === 'foil' ? 'silver' : scene.tier === 'emboss' ? 'gold' : scene.tier);
	const plateTuning = $derived(`${scene.plateTuning.scale},${scene.plateTuning.tone},${scene.plateTuning.stain},${scene.plateTuning.vivid ?? 1}`);

	$effect(() => {
		const { light: options, map } = scene;
		void scene.print;
		void front;
		// The card element is the front's own root, or the blank card; find it once it has rendered.
		const root = holder.querySelector<HTMLElement>('.card');
		const engine = LightEngine.shared();
		if (!root || !engine) return;
		engine.configureCard(root, options, map);
		return () => engine.configureCard(root, null);
	});
</script>

<figure class="lab-card">
	<div class="holder" bind:this={holder}>
		{#if scene.print === 'front'}
			{#if front}
				<Card s={{ ...front, fin: materialFor(scene.tier) }} film={scene.film} plate={scene.plate} plateTuning={scene.plateTuning} interactive idle={drift} onDetails={() => {}} />
			{:else}
				<div class="loading">Loading the {scene.era} card…</div>
			{/if}
		{:else}
			{#key scene.print}
				<div
					class="card blank"
					class:options={scene.print === 'options'}
					style={`--reference-paper:${PAPER};--reference-ink:${INK};--reference-stock:${STOCK}`}
					data-card={scene.era}
					data-finish={scene.tier}
					data-identity={IDENTITY}
					data-film={scene.film}
					data-plate={scene.plate}
					data-plate-tuning={plateTuning}
					use:tilt={{ enabled: true, idle: drift, finish: motionFinish, light, identity: IDENTITY }}
				>
					{#if scene.print === 'sheet'}
						<div class="sheet" data-surface="ring" data-surface-shape="box"></div>
					{:else}
						<section class="reference" aria-label="Selected options">
							<header class="reference-heading">
								<h2>Options</h2>
								<span>Live material reference</span>
							</header>
							<div class="specimen" data-surface="ring" data-surface-shape="box" aria-hidden="true"></div>
							<div class="reference-groups">
								{#each scene.reference as section (section.title)}
									<section class="reference-section" aria-label={section.title}>
										<h3>{section.title}</h3>
										<dl>
											{#each section.rows as row (row.label)}
												<div class="reference-row">
													<dt>{row.label}</dt>
													<dd>{row.value}</dd>
												</div>
											{/each}
										</dl>
									</section>
								{/each}
							</div>
						</section>
					{/if}
					<canvas class="light" aria-hidden="true" use:lightCanvas={light}></canvas>
				</div>
			{/key}
		{/if}
	</div>
	{#if label !== undefined}
		<figcaption>
			<button type="button" title="Use this value" onclick={onpick}>{label}</button>
		</figcaption>
	{/if}
</figure>

<style>
	.lab-card { margin: 0; width: var(--lab-card-width); flex: none; }
	.holder { width: 100%; }
	.loading { display: grid; place-items: center; aspect-ratio: 5 / 7; color: var(--muted); border: 1px dashed var(--border); border-radius: 2cqw; }
	.blank { container-type: inline-size; position: relative; width: 100%; aspect-ratio: 5 / 7; isolation: isolate; border-radius: 1.8cqw; background: #15171c; box-shadow: 0 1cqw 3cqw rgb(0 0 0 / 0.45); }
	.blank.options { background: var(--reference-paper); color: var(--reference-ink); }
	.sheet { position: absolute; inset: 0; border-radius: 1.8cqw; }
	/* Card print uses width-relative units, like the era fronts, so export and small previews match. */
	.reference { --reference-unit: 1cqw; --reference-type: 2.5cqw; position: absolute; inset: calc(4 * var(--reference-unit)); }
	.reference-heading { display: flex; align-items: baseline; justify-content: space-between; gap: calc(2 * var(--reference-unit)); margin-bottom: calc(2 * var(--reference-unit)); }
	.reference-heading h2 { margin: 0; font-size: calc(2 * var(--reference-type)); line-height: 1; }
	.reference-heading span { font-size: var(--reference-type); line-height: 1.25; text-align: right; }
	.specimen { height: calc(20 * var(--reference-unit)); margin-bottom: calc(4 * var(--reference-unit)); background: var(--reference-stock); }
	.reference-groups { columns: 2; column-gap: calc(4 * var(--reference-unit)); font-size: var(--reference-type); line-height: 1.25; }
	.reference-section { margin-bottom: calc(2 * var(--reference-unit)); }
	.reference-section h3 { break-after: avoid; margin: 0 0 var(--reference-unit); padding-bottom: var(--reference-unit); border-bottom: 1px solid var(--reference-ink); font-size: inherit; font-weight: 750; }
	.reference-section dl { margin: 0; }
	.reference-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--reference-unit); padding-block: calc(var(--reference-unit) / 4); break-inside: avoid; }
	.reference-row dt, .reference-row dd { margin: 0; overflow-wrap: anywhere; }
	.reference-row dd { text-align: right; font-weight: 650; font-variant-numeric: tabular-nums; }
	.light { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 1.8cqw; pointer-events: none; opacity: 0; transition: opacity 240ms ease-out; }
	.light:global([data-presented]) { opacity: 1; }
	figcaption { margin-top: 0.4rem; text-align: center; }
	figcaption button { min-height: 1.8rem; padding: 0.15rem 0.6rem; font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
</style>
