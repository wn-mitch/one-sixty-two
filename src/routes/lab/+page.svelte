<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { LightEngine } from '#lib/cards/surface/card-light.ts';
	import { loadHeadlineCards } from '#lib/cards/headline-seasons.ts';
	import type { CardEra, CardViewModel } from '#lib/cards/view-model.ts';
	import Control from '#lib/lab/Control.svelte';
	import LabCard from '#lib/lab/LabCard.svelte';
	import { applies, dialsOf, finishInUse, ownFinish, ownPalette, ownUnder, type Target } from '#lib/lab/controls.ts';
	import { Lab, MIN_WIDTH, MAX_WIDTH, MAX_STAGGER } from '#lib/lab/lab.svelte.ts';
	import { sceneOf } from '#lib/lab/scene.ts';
	import GradientControl from '#lib/lab/GradientControl.svelte';
	import { LabLinkSaveError } from '#lib/lab/link.ts';
	import type { VideoProgress } from '#lib/lab/video.ts';
	import { toasts } from '#lib/toast.svelte.ts';

	const lab = new Lab();
	let fronts = $state.raw<Partial<Record<CardEra, CardViewModel>>>({});
	let frontError = $state('');
	let savingLink = $state(false);
	let manualLink = $state('');
	let exporting = $state(false);
	let videoProgress = $state<VideoProgress | null>(null);
	let videoAbort: AbortController | undefined;
	let mounted = $state(false);
	let viewportWidth = $state(1440);
	let viewportHeight = $state(900);
	let stageWidth = $state(800);
	let toolbarHeight = $state(100);
	const narrow = $derived(viewportWidth <= 832);
	// Fit the whole 5:7 preview, including tilt clearance, rather than clipping a zoomed card.
	const maximumWidth = $derived(Math.max(MIN_WIDTH, Math.floor(Math.min(
		MAX_WIDTH,
		stageWidth - 64,
		(narrow ? viewportHeight * 0.52 - 64 : viewportHeight - toolbarHeight - 176) * 5 / 7
	))));
	const previewWidth = $derived(Math.min(lab.width, maximumWidth));
	const supported = LightEngine.shared() !== null;

	onMount(() => {
		mounted = true;
		if (location.hash.length > 1 && !lab.restore(location.hash.slice(1))) {
			toasts.show('This lab link is invalid or uses an unsupported version. Showing the default setup.', { tone: 'error' });
		}
	});

	onDestroy(() => videoAbort?.abort());
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

	function resizePreview(value: number): void {
		lab.width = Math.round(Math.min(maximumWidth, Math.max(MIN_WIDTH, value)));
	}

	function wheel(event: WheelEvent): void {
		// A trackpad pinch arrives as a wheel with the control key held.
		if (!event.ctrlKey && !event.metaKey) return;
		event.preventDefault();
		resizePreview(previewWidth + (event.deltaY < 0 ? 20 : -20));
	}

	async function copyLink(): Promise<void> {
		if (savingLink) return;
		savingLink = true;
		manualLink = '';
		const fallback = lab.url(location.origin);
		history.replaceState(history.state, '', fallback);
		try {
			const result = await lab.saveLink({ origin: location.origin });
			try {
				if (!navigator.clipboard) throw new Error('Clipboard is unavailable.');
				await navigator.clipboard.writeText(result.url);
				toasts.show('Lab link copied.', { id: 'lab-link' });
			} catch {
				manualLink = result.url;
				toasts.show('Lab link saved. Copy it from the link field.', { id: 'lab-link' });
			}
		} catch (error) {
			manualLink = error instanceof LabLinkSaveError ? error.fallback : fallback;
			toasts.show(`${error instanceof Error ? error.message : 'Lab link could not be saved.'} The full setup link is available to copy.`, { id: 'lab-link', tone: 'error' });
		} finally {
			savingLink = false;
		}
	}

	async function exportVideo(): Promise<void> {
		if (exporting) return;
		exporting = true;
		videoProgress = null;
		const controller = new AbortController();
		videoAbort = controller;
		try {
			const scene = sceneOf(lab.state.setup);
			const front = fronts[scene.era] ?? null;
			const { exportLabVideo } = await import('#lib/lab/video.ts');
			const result = await exportLabVideo({ scene, front, signal: controller.signal, onProgress: progress => videoProgress = progress });
			const url = URL.createObjectURL(result.blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = 'foil-lab.mp4';
			anchor.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			toasts.show('MP4 downloaded. Rendered loop endpoints match.', { id: 'lab-video' });
		} catch (error) {
			toasts.show(controller.signal.aborted ? 'MP4 export cancelled.' : error instanceof Error ? error.message : 'MP4 export failed.', { id: 'lab-video', tone: controller.signal.aborted ? 'info' : 'error' });
		} finally {
			exporting = false;
			videoAbort = undefined;
		}
	}
</script>

<svelte:head>
	<title>Foil lab | 162-0</title>
	<meta name="description" content="Explore the 162-0 card renderer: tune foil patterns, colors and light, save a setup, or export a loop." />
	<link rel="canonical" href="https://162-0.dev/lab" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://162-0.dev/lab" />
	<meta property="og:title" content="Foil lab | 162-0" />
	<meta property="og:description" content="Explore the 162-0 card renderer: tune foil patterns, colors and light, save a setup, or export a loop." />
	<meta name="robots" content="noindex" />
</svelte:head>

<svelte:window bind:innerWidth={viewportWidth} bind:innerHeight={viewportHeight} />

{#if mounted}
<main class="lab">
	<section class="stage-area" aria-label="Cards" bind:clientWidth={stageWidth}>
		<div class="toolbar" bind:clientHeight={toolbarHeight}>
			<div class="preview-controls">
				<div class="width-control">
					<label for="lab-width">Width <output for="lab-width">{previewWidth} px</output></label>
					<input id="lab-width" type="range" min={MIN_WIDTH} max={maximumWidth} step="1" value={previewWidth} oninput={event => resizePreview(event.currentTarget.valueAsNumber)} aria-describedby="lab-width-note" />
				</div>
				<label class="check"><input type="checkbox" checked={lab.setup.drift} onchange={event => (lab.setup = { ...lab.setup, drift: event.currentTarget.checked })} /> Drift</label>
			</div>
			<p id="lab-width-note" class="preview-note">Preview size only. Pattern scale and MP4 size stay unchanged.</p>
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
			<div class="actions">
				<div class="group">
					<button type="button" onclick={() => lab.randomize()}>Randomize</button>
					<button type="button" onclick={() => lab.reset()}>Reset</button>
				</div>
				<div class="group">
					<button type="button" disabled={savingLink} onclick={copyLink}>{savingLink ? 'Saving link…' : 'Copy link'}</button>
					<button type="button" disabled={exporting || !supported || (lab.setup.print === 'front' && !fronts[lab.setup.era])} onclick={exportVideo}>Export MP4</button>
				</div>
				{#if exporting}<button type="button" onclick={() => videoAbort?.abort()}>Cancel export</button>{/if}
			</div>
		</div>
		{#if manualLink}
			<label class="manual-link">Setup link<input readonly value={manualLink} onfocus={event => event.currentTarget.select()} onclick={event => event.currentTarget.select()} /></label>
		{/if}
		{#if exporting}
			<p role="status">{videoProgress?.stage === 'rendering' ? `Rendering frame ${videoProgress.frames} of ${videoProgress.total}` : videoProgress?.stage === 'finalizing' ? 'Finishing MP4…' : 'Preparing MP4…'}</p>
		{/if}
		{#if !supported}
			<p role="alert">This browser can't run WebGL2, so the foil can't be lit here.</p>
		{/if}
		{#if frontError}<p role="alert">Could not load the era fronts: {frontError}</p>{/if}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="stage" class:staggered={lab.stagger !== null} style={`--lab-card-width:${previewWidth}px`} onwheel={wheel} role={lab.stagger ? 'region' : undefined} aria-label={lab.stagger ? 'Staggered previews' : undefined}>
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
			<summary>Card & material</summary>
			<Control {lab} target="print" label="Preview" />
			<Control {lab} target="tier" label="Material" />
			<Control {lab} target="era" label="Era" />
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
				<GradientControl {lab} />
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
{/if}

<style>
	.lab { width: calc(100vw - 2rem); margin-left: calc(50% - 50vw + 1rem); box-sizing: border-box; display: grid; grid-template-columns: minmax(0, 1fr) minmax(20rem, 25rem); gap: var(--space-6); padding: var(--space-4); align-items: start; }
	.stage-area { position: sticky; top: var(--space-4); display: grid; gap: var(--space-3); min-width: 0; }
	.toolbar { display: grid; gap: var(--space-2); }
	.preview-controls { display: flex; align-items: center; gap: var(--space-6); }
	.width-control { display: grid; gap: var(--space-1); flex: 1; max-width: 28rem; min-width: 0; }
	.width-control label { display: flex; justify-content: space-between; gap: var(--space-3); font-size: var(--text-sm); font-weight: 650; }
	.width-control output { font-weight: 400; color: var(--muted); font-variant-numeric: tabular-nums; }
	.width-control input { width: 100%; min-width: 0; height: 28px; margin: 0; accent-color: var(--accent); }
	.preview-note { margin: 0; font-size: var(--text-xs); color: var(--muted); }
	.actions { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-2); }
	.group { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1); }
	.manual-link { display: grid; gap: var(--space-2); font-size: var(--text-sm); }
	.manual-link input { width: 100%; min-width: 0; min-height: 44px; box-sizing: border-box; }
	.toolbar button { min-height: 44px; padding: 0.3rem 0.75rem; font-size: var(--text-sm); }
	.what { margin-right: 0.4rem; font-size: var(--text-sm); color: var(--muted); }
	.what b { color: var(--accent); }
	.count { min-width: 1.6rem; text-align: center; font-variant-numeric: tabular-nums; }
	.check { display: flex; align-items: center; gap: var(--space-2); min-height: 44px; font-size: var(--text-sm); }
	.stage {
		display: flex; justify-content: center; align-items: flex-start; gap: var(--space-6);
		overflow: auto; padding: 32px; perspective: 1400px;
		background: radial-gradient(circle at 50% 30%, oklch(24% 0.012 255), var(--background) 70%); border-radius: var(--radius-lg);
	}
	.stage.staggered { justify-content: flex-start; }
	.panel { display: grid; gap: var(--space-3); min-width: 0; max-height: calc(100dvh - 7rem); overflow: auto; padding: 0 var(--space-2) var(--space-2); scrollbar-gutter: stable; }
	details { padding: var(--space-2) 0; border-bottom: 1px solid var(--border); }
	summary { cursor: pointer; font-size: var(--text-base); font-weight: 650; padding: var(--space-2) 0; overflow-wrap: anywhere; }
	summary b { color: var(--accent); font-weight: 650; }
	summary span { color: var(--muted); font-weight: 400; font-size: var(--text-sm); }
	.wide { min-height: 44px; margin: var(--space-2) 0; font-size: var(--text-sm); }
	.hint { color: var(--muted); font-size: var(--text-sm); margin: 0; }
	@media (max-width: 52rem) {
		.lab { width: auto; margin-left: 0; grid-template-columns: 1fr; gap: var(--space-4); padding: var(--space-2); }
		.stage-area { position: static; }
		.preview-controls { gap: var(--space-4); }
		.stage { padding: 32px; }
		.panel { max-height: none; overflow: visible; padding: 0; scrollbar-gutter: auto; }
	}
</style>
