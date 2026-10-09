<script module lang="ts">
	import type { CardEra } from '#lib/cards/view-model.ts';

	export interface HistoricalEraGalleryProps {
		era: CardEra;
		width?: number;
	}
</script>

<script lang="ts">
	import { onDestroy, tick, untrack } from 'svelte';
	import { createDialKitController } from 'dialkit/svelte';
	import Card from '#lib/cards/Card.svelte';
	import InspectionBack from '#lib/cards/InspectionBack.svelte';
	import { createCardViewModel } from '#lib/cards/view-model.ts';
	import { loadHistoricalEra, type HistoricalEraGalleryData, type HistoricalGalleryEntry } from './historical-gallery.ts';

	let { era, width = 240 }: HistoricalEraGalleryProps = $props();

	const decadeFor: Record<CardEra, number> = {
		'1950s': 1950,
		'1960s': 1960,
		'1970s': 1970,
		'1980s': 1980,
		'1990s': 1990,
		'2000s': 2000,
		'2010s': 2010,
		'2020s': 2020
	};
	const dials = createDialKitController('Historical era gallery', {
		cardWidth: [240, 160, 410, 1],
		textBacks: false
	});
	let data = $state.raw<HistoricalEraGalleryData | null>(null);
	let loading = $state(true);
	let manifestError = $state<string | null>(null);
	let requestVersion = 0;
	let disposed = false;
	let seededWidth = $state<number | null>(null);
	let textOverrides = $state<Record<string, boolean>>({});
	let textToggles = $state<Record<string, HTMLButtonElement | undefined>>({});

	function clampWidth(value: number): number {
		return Math.max(160, Math.min(410, Math.round(Number.isFinite(value) ? value : 240)));
	}

	const dialWidth = $derived(clampWidth(Number(dials.values.cardWidth)));
	const dialTextBacks = $derived(Boolean(dials.values.textBacks));

	function isTextBack(seasonId: string): boolean {
		return textOverrides[seasonId] ?? dialTextBacks;
	}

	function toggleTextBack(seasonId: string): void {
		textOverrides = { ...textOverrides, [seasonId]: !isTextBack(seasonId) };
	}

	async function showTextVersion(seasonId: string): Promise<void> {
		textOverrides = { ...textOverrides, [seasonId]: true };
		await tick();
		textToggles[seasonId]?.focus({ preventScroll: true });
	}

	function resetPresentation(): void {
		textOverrides = {};
	}

	export function reset(): void {
		dials.resetValues();
		dials.setValues({ cardWidth: clampWidth(Number(width)), textBacks: false });
		resetPresentation();
		retry();
	}

	async function load(decade: number, token: number): Promise<void> {
		try {
			const next = await loadHistoricalEra(decade);
			if (disposed || token !== requestVersion) return;
			data = next;
			manifestError = null;
		} catch (error) {
			if (disposed || token !== requestVersion) return;
			data = null;
			manifestError = error instanceof Error && error.message ? error.message : 'Historical runtime data could not be loaded.';
		} finally {
			if (!disposed && token === requestVersion) loading = false;
		}
	}

	function retry(): void {
		const token = ++requestVersion;
		loading = true;
		manifestError = null;
		void load(decadeFor[era], token);
	}

	$effect(() => {
		const requestedWidth = clampWidth(Number(width));
		if (seededWidth !== requestedWidth) {
			seededWidth = requestedWidth;
			// Story args seed the native panel without reacting to dial changes.
			untrack(() => dials.setValues({ cardWidth: requestedWidth }));
		}
	});

	$effect(() => {
		// A global Text backs dial applies only to present reverse faces. Any
		// per-entry override belongs to the previous presentation and is reset.
		void dialTextBacks;
		textOverrides = {};
	});

	$effect(() => {
		const requestedEra = era;
		const token = ++requestVersion;
		loading = true;
		manifestError = null;
		data = null;
		resetPresentation();
		void load(decadeFor[requestedEra], token);
		return () => {
			if (token === requestVersion) requestVersion++;
		};
	});

	onDestroy(() => {
		disposed = true;
		requestVersion++;
	});

	function modelFor(entry: Extract<HistoricalGalleryEntry, { state: 'present' }>, loaded: HistoricalEraGalleryData) {
		return createCardViewModel({
			profile: entry.profile,
			slot: entry.slot,
			manifest: loaded.manifest,
			media: loaded.media,
			mediaStatus: loaded.mediaStatus,
			rankings: loaded.rankings
		});
	}
</script>

<section class="historical-gallery" aria-labelledby="historical-gallery-heading">
	<header class="gallery-header">
		<div>
			<p class="eyebrow">Historical runtime gallery</p>
			<h2 id="historical-gallery-heading">{era}</h2>
			<p class="gallery-summary">Thirty canonical franchise entries, selected from the smallest validated season identity.</p>
		</div>
		{#if data && (data.mediaStatus === 'unavailable' || !data.rankings)}
			<div class="availability" role="status">
				<p>{data.mediaStatus === 'unavailable' ? 'Historical media unavailable. ' : ''}{!data.rankings ? 'Historical WAR rankings unavailable. ' : ''}Season cards remain visible.</p>
				<button type="button" onclick={retry}>Retry media and rankings</button>
			</div>
		{/if}
	</header>

	{#if loading}
		<p class="status" role="status" aria-live="polite">Loading historical runtime data for {era}…</p>
	{/if}
	{#if manifestError}
		<div class="failure" role="alert">
			<h3>Historical runtime data failed to load</h3>
			<p>{manifestError}</p>
			<button type="button" onclick={retry}>Retry</button>
		</div>
	{:else if data}
		<div class="gallery-grid" aria-label="{era} historical franchise cards">
			{#each data.entries as entry (entry.franchise.id)}
				<article class="gallery-entry" data-franchise-id={entry.franchise.id} data-season-id={entry.state === 'present' ? entry.profile.seasonId : undefined}>
					<h3>{entry.franchise.name}</h3>
					{#if entry.state === 'present'}
						{@const card = modelFor(entry, data)}
						<div class="identity" aria-label="Selected historical season">
							<span>{entry.profile.displayName}</span>
							<span>{entry.profile.year} · {entry.profile.seasonId}</span>
						</div>
						<div class="card-pair" style={`--gallery-card-width:${dialWidth}px`}>
							<figure class="card-face" data-face-label="Front">
								<Card s={card} face="front" onDetails={() => showTextVersion(entry.profile.seasonId)} />
								<figcaption>Front · {entry.profile.seasonId}</figcaption>
							</figure>
							<figure class="card-face" data-face-label="Back">
								<div class="reverse-viewport" id={`historical-${entry.franchise.id}-back`}>
									{#if isTextBack(entry.profile.seasonId)}
										<InspectionBack s={card} simplified onDetails={() => showTextVersion(entry.profile.seasonId)} />
									{:else}
										<Card s={card} face="back" onDetails={() => showTextVersion(entry.profile.seasonId)} />
									{/if}
								</div>
								<button bind:this={textToggles[entry.profile.seasonId]} class="text-toggle" type="button" aria-pressed={isTextBack(entry.profile.seasonId)} aria-controls={`historical-${entry.franchise.id}-back`} onclick={() => toggleTextBack(entry.profile.seasonId)}>Text version</button>
								<figcaption>Back · {entry.profile.seasonId}</figcaption>
							</figure>
							<figure class="card-face compact-face" data-face-label="Compact">
								<Card s={card} face="front" compact thumbnail interactive={false} onDetails={() => {}} />
								<figcaption>Compact · 72px</figcaption>
							</figure>
						</div>
					{:else}
						<div class="status-pair" style={`--gallery-card-width:${dialWidth}px`}>
							<div class="card-face">
								<div class="status-panel">
									{#if entry.state === 'absent'}
										<strong>No eligible historical season in {era}</strong>
									{:else}
										<strong>Historical card error</strong>
										<span>{entry.message}</span>
									{/if}
								</div>
								{#if entry.state === 'error'}<button class="retry-season" type="button" aria-label="Retry historical season" onclick={retry}>Retry season</button>{/if}
							</div>
							<div class="card-face" aria-hidden="true"><div class="status-panel"></div></div>
							<div class="card-face compact-face" aria-hidden="true"><div class="status-panel"></div></div>
						</div>
					{/if}
				</article>
			{/each}
		</div>
	{:else if !loading}
		<p class="status" role="status">Historical runtime data is unavailable.</p>
	{/if}
</section>

<style>
	.historical-gallery { min-width: 0; color: var(--text); container-type: inline-size; }
	.gallery-header { display: flex; justify-content: space-between; align-items: end; gap: var(--space-5, 1.5rem); margin-bottom: var(--space-6, 2rem); }
	.gallery-header h2 { margin: 0; font-size: clamp(2rem, 5vw, 3.25rem); }
	.eyebrow { margin: 0 0 .4rem; color: var(--muted); font-size: .75rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
	.gallery-summary { max-width: 58ch; margin: .5rem 0 0; color: var(--muted); }
	.availability { display: grid; gap: .5rem; max-width: 32rem; }
	.availability p { margin: 0; color: var(--muted); }
	button { min-height: 44px; padding: .5rem .8rem; }
	.status, .failure { margin: 2rem 0; }
	.failure { padding: 1rem; border: 1px solid var(--border); background: var(--surface); }
	.failure h3 { margin: 0 0 .5rem; }
	.failure p { margin: 0 0 1rem; overflow-wrap: anywhere; }
	.gallery-grid { display: grid; grid-template-columns: 1fr; grid-auto-rows: auto minmax(calc(var(--text-sm) * 1.5), auto) auto; gap: var(--space-1) var(--space-6); min-width: 0; }
	.gallery-entry { display: grid; grid-row: span 3; grid-template-rows: subgrid; min-width: 0; margin-bottom: var(--space-12); }
	.gallery-entry > h3 { margin: 0; font-size: var(--text-lg); overflow-wrap: anywhere; }
	.identity { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-1) var(--space-3); color: var(--muted); font-size: var(--text-sm); }
	.identity span:last-child { font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
	.card-pair, .status-pair { grid-row: 3; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)) 72px; align-items: start; gap: var(--space-3); min-width: 0; margin-top: var(--space-2); }
	.card-face { display: grid; grid-template-rows: auto minmax(2.75rem, auto) minmax(calc(var(--text-xs) * 1.5), auto); align-content: start; gap: var(--space-2); width: min(100%, var(--gallery-card-width)); min-width: 0; margin: 0 auto; }
	.card-face > :global(.card), .reverse-viewport, .status-panel { grid-row: 1; width: 100%; min-width: 0; }
	.card-face figcaption { grid-row: 3; color: var(--muted); font-size: var(--text-xs); overflow-wrap: anywhere; }
	.compact-face { width: 72px; grid-template-rows: auto auto; }
	.compact-face figcaption { grid-row: 2; }
	.text-toggle, .retry-season { grid-row: 2; justify-self: start; }
	.status-panel { display: grid; align-content: safe center; gap: var(--space-3); aspect-ratio: 5 / 7; min-height: 0; padding: var(--space-4); border: 1px dashed var(--border); background: var(--surface); color: var(--muted); overflow: auto; overflow-wrap: anywhere; }
	.status-panel strong { color: var(--text); }
	@container (min-width: 1024px) {
		.gallery-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	}
	@container (max-width: 559px) {
		.gallery-header { display: grid; align-items: start; }
		.card-pair, .status-pair { grid-template-columns: 1fr; }
	}
</style>
