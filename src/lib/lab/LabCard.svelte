<script lang="ts">
	import Card from '#lib/cards/Card.svelte';
	import { materialFor } from '#lib/cards/finish.ts';
	import { tilt } from '#lib/cards/motion.ts';
	import { CardLight, LightEngine, lightCanvas } from '#lib/cards/surface/card-light.ts';
	import type { CardViewModel } from '#lib/cards/view-model.ts';
	import type { Scene } from './scene.ts';

	/**
	 * One lab card: a blank foil sheet, a foil frame round bare stock, or a real era front. The engine draws it
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
					class:window={scene.print === 'window'}
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
						<div class="frame" data-surface="ring" data-surface-shape="frame"></div>
						<div class="star" data-surface="mark"></div>
						<div class="rule" data-surface="ink"></div>
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
	.blank.window { background: #ece4cf; }
	.sheet { position: absolute; inset: 0; border-radius: 1.8cqw; }
	.frame { position: absolute; inset: 0; padding: 6cqw; border-radius: 1.8cqw; background: #b9bcc2; }
	.star { position: absolute; left: 32%; top: 34%; width: 36%; aspect-ratio: 1; background: #c23a32; clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%); }
	.rule { position: absolute; left: 14%; right: 14%; bottom: 16%; height: 2.4cqw; background: #1d2a4a; }
	.light { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 1.8cqw; pointer-events: none; opacity: 0; transition: opacity 240ms ease-out; }
	.light:global([data-presented]) { opacity: 1; }
	figcaption { margin-top: 0.4rem; text-align: center; }
	figcaption button { min-height: 1.8rem; padding: 0.15rem 0.6rem; font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
</style>
