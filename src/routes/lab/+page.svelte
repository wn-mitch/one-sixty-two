<script lang="ts">
	import { onMount } from 'svelte';
	import { LightEngine } from '#lib/cards/surface/card-light.ts';
	import { loadHeadlineCards } from '#lib/cards/headline-seasons.ts';
	import type { CardEra, CardViewModel } from '#lib/cards/view-model.ts';
	import Control from '#lib/lab/Control.svelte';
	import LabCard from '#lib/lab/LabCard.svelte';
	import { applies, dialsOf, finishInUse, ownFinish, ownPalette, ownUnder, type Target } from '#lib/lab/controls.ts';
	import { Lab, MAX_STAGGER, ZOOMS } from '#lib/lab/lab.svelte.ts';
	import { sceneOf } from '#lib/lab/scene.ts';

	const lab = new Lab();
	let fronts = $state.raw<Partial<Record<CardEra, CardViewModel>>>({});
	let frontError = $state('');
	let copied = $state(false);
	const supported = LightEngine.shared() !== null;

	onMount(() => {
		if (location.hash.length > 1) lab.restore(location.hash.slice(1));
	});

	// The era fronts load the first time a front is asked for.
	let loading = false;
	$effect(() => {
		if (loading || (lab.setup.print !== 'front' && lab.stagger?.target !== 'print')) return;
		loading = true;
		loadHeadlineCards()
			.then(rows => (fronts = Object.fromEntries(rows.map(row => [row.era, row.model]))))
			.catch(error => (frontError = error instanceof Error ? error.message : String(error)));
	});

	const variants = $derived(lab.variants);
	const shown = (target: Target) => applies(target, lab.setup);
	const dialTargets = (kind: 'film' | 'finish' | 'plate', name: string) => Object.keys(dialsOf(kind, name)).map(dial => `${kind}:${dial}`);
	const staggerIsChoice = $derived(lab.stagger !== null && !lab.stagger.target.includes(':'));

	function zoomBy(by: number): void {
		const index = ZOOMS.indexOf(lab.zoom as (typeof ZOOMS)[number]);
		lab.zoom = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, index + by))]!;
	}

	function wheel(event: WheelEvent): void {
		// A trackpad pinch arrives as a wheel with the control key held.
		if (!event.ctrlKey && !event.metaKey) return;
		event.preventDefault();
		zoomBy(event.deltaY < 0 ? 1 : -1);
	}

	async function copyLink(): Promise<void> {
		const url = `${location.origin}${location.pathname}#${lab.save()}`;
		history.replaceState(history.state, '', url);
		await navigator.clipboard?.writeText(url).catch(() => {});
		copied = true;
		setTimeout(() => (copied = false), 1600);
	}
</script>

<svelte:head>
	<title>Foil lab | 162-0</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="lab">
	<section class="stage-area" aria-label="Cards">
		<div class="toolbar">
			<div class="group" role="radiogroup" aria-label="Zoom">
				{#each ZOOMS as zoom (zoom)}
					<button type="button" role="radio" aria-checked={lab.zoom === zoom} onclick={() => (lab.zoom = zoom)}>{zoom}×</button>
				{/each}
			</div>
			{#if lab.stagger}
				<div class="group" aria-label="Stagger">
					<span class="what">Stagger <b>{lab.stagger.target.replace(':', ' ')}</b></span>
					<button type="button" aria-label="Fewer cards" disabled={lab.stagger.count <= 2} onclick={() => lab.stagger!.count--}>−</button>
					<span class="count">{lab.stagger.count}</span>
					<button type="button" aria-label="More cards" disabled={lab.stagger.count >= MAX_STAGGER} onclick={() => lab.stagger!.count++}>+</button>
					{#if staggerIsChoice}
						<button type="button" aria-label="Previous options" onclick={() => lab.stagger!.page--}>‹</button>
						<button type="button" aria-label="Next options" onclick={() => lab.stagger!.page++}>›</button>
					{/if}
					<button type="button" onclick={() => (lab.stagger = null)}>Done</button>
				</div>
			{/if}
			<div class="group">
				<label class="check"><input type="checkbox" checked={lab.setup.drift} onchange={event => (lab.setup = { ...lab.setup, drift: event.currentTarget.checked })} /> Drift</label>
				<button type="button" onclick={() => lab.randomize()}>Go nuts</button>
				<button type="button" onclick={() => lab.reset()}>Reset</button>
				<button type="button" onclick={copyLink}>{copied ? 'Copied' : 'Copy link'}</button>
			</div>
		</div>
		{#if !supported}
			<p role="alert">This browser can't run WebGL2, so the foil can't be lit here.</p>
		{/if}
		{#if frontError}<p role="alert">Could not load the era fronts: {frontError}</p>{/if}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="stage" class:staggered={lab.stagger !== null} style={`--lab-zoom:${lab.zoom}`} onwheel={wheel}>
			{#each variants as variant, index (`${index}:${variant.value ?? ''}`)}
				{@const scene = sceneOf(variant.setup)}
				<LabCard
					{scene}
					front={fronts[scene.era] ?? null}
					drift={lab.setup.drift}
					label={variant.label}
					onpick={() => {
						if (lab.stagger && variant.value !== undefined) lab.set(lab.stagger.target, variant.value);
					}}
				/>
			{/each}
		</div>
	</section>

	<aside class="panel" aria-label="Controls">
		<details open>
			<summary>Print</summary>
			<Control {lab} target="print" />
			<Control {lab} target="tier" />
			<Control {lab} target="era" />
			<button type="button" class="wide" onclick={() => lab.useEra()}>Use the {lab.setup.era} look</button>
			{#if shown('stock')}<Control {lab} target="stock" />{/if}
		</details>

		{#if shown('film')}
			<details open>
				<summary>Film <b>{lab.setup.film}</b></summary>
				<Control {lab} target="film" />
				{#each dialTargets('film', lab.setup.film) as target (target)}<Control {lab} {target} />{/each}
				<button type="button" class="wide" onclick={() => lab.resetModule('film')}>Reset film dials</button>
			</details>
			<details open>
				<summary>Finish <b>{finishInUse(lab.setup)}</b> <span>{lab.setup.finish ? '' : `(${ownFinish(lab.setup.film)}, the film's own)`}</span></summary>
				<Control {lab} target="finish" />
				{#each dialTargets('finish', finishInUse(lab.setup)) as target (target)}<Control {lab} {target} />{/each}
				<button type="button" class="wide" onclick={() => lab.resetModule('finish')}>Reset finish dials</button>
			</details>
			<details open>
				<summary>Colour and layers</summary>
				<Control {lab} target="palette" label={`colourway${lab.setup.palette ? '' : ` (${ownPalette(lab.setup.film)})`}`} />
				<Control {lab} target="under" label={`under film${lab.setup.under ? '' : ` (${ownUnder(lab.setup.film) || 'none'})`}`} />
				{#each ['light:underMix', 'light:holoScale', 'light:vivid', 'light:plateUnderFilm'] as target (target)}
					{#if shown(target)}<Control {lab} {target} />{/if}
				{/each}
			</details>
		{/if}

		{#if shown('plate')}
			<details open>
				<summary>Plate <b>{lab.setup.plate}</b>{#if lab.setup.tier === 'gem'} <span>under the film</span>{/if}</summary>
				<Control {lab} target="plate" />
				{#each dialTargets('plate', lab.setup.plate) as target (target)}<Control {lab} {target} />{/each}
				{#each ['light:plateDepth', 'light:plateTone', 'light:stain'] as target (target)}
					{#if shown(target)}<Control {lab} {target} />{/if}
				{/each}
				<button type="button" class="wide" onclick={() => lab.resetModule('plate')}>Reset plate dials</button>
			</details>
		{:else if lab.setup.tier === 'gem'}
			<p class="hint">Raise “plate under film” to press a plate through the holo.</p>
		{/if}

		{#if lab.setup.tier !== 'base'}
			<details>
				<summary>Light</summary>
				{#each ['light:shift', 'light:shine', 'light:glare'] as target (target)}<Control {lab} {target} />{/each}
			</details>
		{/if}
	</aside>
</main>

<style>
	.lab { width: calc(100vw - 2rem); margin-left: calc(50% - 50vw + 1rem); box-sizing: border-box; display: grid; grid-template-columns: minmax(0, 1fr) minmax(18rem, 24rem); gap: var(--space-4); padding: var(--space-4); align-items: start; }
	.stage-area { position: sticky; top: var(--space-4); display: grid; gap: var(--space-3); min-width: 0; }
	.toolbar { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; }
	.group { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; }
	.toolbar button { min-height: 2rem; padding: 0.2rem 0.6rem; font-size: var(--text-sm); }
	.toolbar [aria-checked='true'] { color: var(--background); background: var(--text); border-color: var(--text); }
	.what { margin-right: 0.4rem; font-size: var(--text-sm); color: var(--muted); }
	.what b { color: var(--accent); }
	.count { min-width: 1.6rem; text-align: center; font-variant-numeric: tabular-nums; }
	.check { display: flex; align-items: center; gap: 0.3rem; margin-right: 0.4rem; font-size: var(--text-sm); }
	.stage {
		--lab-card-width: calc(min(24rem, 60vw) * var(--lab-zoom));
		display: flex; flex-wrap: wrap; justify-content: center; align-items: flex-start; gap: var(--space-4);
		max-height: calc(100dvh - 9rem); overflow: auto; padding: var(--space-4); perspective: 1400px;
		background: radial-gradient(circle at 50% 30%, oklch(24% 0.012 255), var(--background) 70%); border-radius: var(--radius-lg);
	}
	.stage.staggered { --lab-card-width: calc(13rem * var(--lab-zoom)); flex-wrap: nowrap; justify-content: flex-start; }
	.panel { display: grid; gap: var(--space-2); max-height: calc(100dvh - 6rem); overflow: auto; padding-right: 0.3rem; }
	details { display: grid; gap: 0.2rem; padding: var(--space-2); border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); }
	summary { cursor: pointer; font-weight: 650; padding: 0.2rem 0.3rem; }
	summary b { color: var(--accent); font-weight: 650; }
	summary span { color: var(--muted); font-weight: 400; font-size: var(--text-sm); }
	.wide { min-height: 2rem; margin: 0.2rem 0.4rem; font-size: var(--text-sm); }
	.hint { color: var(--muted); font-size: var(--text-sm); margin: 0 var(--space-2); }
	@media (max-width: 52rem) {
		.lab { width: auto; margin-left: 0; grid-template-columns: 1fr; padding: var(--space-2); }
		/* The cards stay on screen above the controls as they scroll. */
		.stage-area { top: 0; z-index: 2; padding-bottom: var(--space-2); background: var(--background); }
		.toolbar { gap: var(--space-2); }
		.stage { max-height: 46dvh; padding: var(--space-2); --lab-card-width: calc(min(20rem, 78vw, 38dvh * 5 / 7) * var(--lab-zoom)); }
		.stage.staggered { --lab-card-width: calc(min(9rem, 38dvh * 5 / 7) * var(--lab-zoom)); }
		.panel { max-height: none; }
	}
</style>
