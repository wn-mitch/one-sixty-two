<script lang="ts">
	import { onMount } from 'svelte';
	import { createCardViewModel, type CardViewModel } from '#lib/cards/view-model.ts';
	import { loadManifest, loadShowcase } from '#lib/game/data.ts';
	import { loadMedia } from '#lib/media/client.ts';
	import { loadRankings } from '#lib/rankings/client.ts';
	import Card from '#lib/cards/Card.svelte';
	import SiteOpenGraph from '#lib/share/SiteOpenGraph.svelte';

	let cards = $state.raw<CardViewModel[]>([]);
	let ready = $state(false);
	const loadingCapture = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('loading-cards');

	onMount(async () => {
		const manifest = await loadManifest();
		const [showcase, media, rankings] = await Promise.all([loadShowcase(manifest), loadMedia(), loadRankings(manifest.dataVersion).catch(() => null)]);
		cards = showcase.map(({ profile, slot }) => createCardViewModel({ profile, slot, manifest, media, mediaStatus: 'ready', rankings }));
		await document.fonts.ready;
		ready = true;
	});
	function ignoreCardDetails(): void {}
</script>

<svelte:head><meta name="robots" content="noindex" /></svelte:head>
<div class:loading-capture={loadingCapture} class="frame" data-og-ready={ready}>
	{#if loadingCapture}
		<div class="capture-grid" aria-hidden="true">
			{#each cards as card (card.seasonId)}
				<div class="capture-card"><Card s={card} face="front" capture interactive={false} onDetails={ignoreCardDetails} /></div>
			{/each}
		</div>
	{:else if cards.length}
		<SiteOpenGraph {cards} />
	{/if}
</div>

<style>
	.frame { width: 1200px; }
	.loading-capture { width: 992px; background: transparent; }
	.capture-grid { display: grid; grid-template-columns: repeat(4, 240px); gap: 8px; width: 992px; }
	.capture-card { width: 240px; height: 336px; }
</style>
