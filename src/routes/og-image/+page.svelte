<script lang="ts">
	import { onMount } from 'svelte';
	import { createCardViewModel, type CardViewModel } from '#lib/cards/view-model.ts';
	import { loadManifest, loadShowcase } from '#lib/game/data.ts';
	import { loadMedia } from '#lib/media/client.ts';
	import { loadRankings } from '#lib/rankings/client.ts';
	import SiteOpenGraph from '#lib/share/SiteOpenGraph.svelte';

	let cards = $state.raw<CardViewModel[]>([]);
	let ready = $state(false);

	onMount(async () => {
		const manifest = await loadManifest();
		const [showcase, media, rankings] = await Promise.all([loadShowcase(manifest), loadMedia(), loadRankings(manifest.dataVersion).catch(() => null)]);
		cards = showcase.map(({ profile, slot }) => createCardViewModel({ profile, slot, manifest, media, mediaStatus: 'ready', rankings }));
		await document.fonts.ready;
		ready = true;
	});
</script>

<svelte:head><meta name="robots" content="noindex" /></svelte:head>
<div class="frame" data-og-ready={ready}>{#if cards.length}<SiteOpenGraph {cards} />{/if}</div>

<style>
	.frame { width: 1200px; }
</style>
