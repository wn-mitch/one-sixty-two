<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import CollectionBinder from '#lib/components/collection/CollectionBinder.svelte';
	import { createCardViewModel, type CardMediaStatus, type CardViewModel } from '#lib/cards/view-model.ts';
	import { loadCollection, moveSticker, setStickerHidden, type CollectedCard } from '#lib/collection/collection.ts';
	import { refreshStickers } from '#lib/collection/store.svelte.ts';
	import type { StickerFamily } from '#lib/collection/stickers.ts';
	import { loadChunk, loadManifest } from '#lib/game/data.ts';
	import { STORAGE_NOTICE } from '#lib/game/library.ts';
	import type { Manifest, Profile } from '#lib/game/types.ts';
	import { loadMedia } from '#lib/media/client.ts';
	import type { MediaManifest } from '#lib/media/types.ts';
	import { loadRankings } from '#lib/rankings/client.ts';
	import type { WarRankings } from '#lib/rankings/types.ts';
	import { deviceDb } from '#lib/storage/db.ts';
	import { HITTER_SLOTS } from '#lib/game/types.ts';

	let manifest = $state.raw<Manifest | null>(null);
	let cards = $state.raw<CollectedCard[]>([]);
	const profiles = new SvelteMap<string, Profile>();
	let media = $state.raw<MediaManifest | null>(null);
	let mediaStatus = $state<CardMediaStatus>('loading');
	// Cards show WAR/162 and their WAR-based finish from the rankings; without them those stay blank.
	let rankings = $state.raw<WarRankings | null>(null);
	let loading = $state(true);
	let error = $state('');
	let status = $state('');

	const views = $derived.by(() => {
		const byCard = new Map<string, CardViewModel>();
		for (const card of cards) {
			const profile = profiles.get(card.seasonId);
			if (profile) byCard.set(card.seasonId, createCardViewModel({ profile, slot: card.slots[0] ?? null, media, manifest, rankings, mediaStatus }));
		}
		return byCard;
	});
	/** WAR/162 in each card's own role, for sorting; bullpens and unranked seasons have none. */
	const war = $derived.by(() => {
		const bySeason = new Map<string, number>();
		for (const card of cards) {
			const ranking = rankings?.seasons[card.seasonId];
			const slot = card.slots[0];
			const value = !ranking || slot === 'BP' ? null : (HITTER_SLOTS as readonly string[]).includes(slot) ? ranking.battingWAR162 : ranking.pitchingWAR162;
			if (value !== null && Number.isFinite(value)) bySeason.set(card.seasonId, value);
		}
		return bySeason;
	});

	async function refresh(): Promise<void> {
		try {
			const device = await deviceDb();
			cards = await loadCollection(device.db);
			if (device.notice) status = device.notice;
		} catch { status = STORAGE_NOTICE; }
		void loadProfiles();
	}

	/** Loads card profiles one franchise-decade chunk at a time; a card whose chunk fails keeps its text tile. */
	async function loadProfiles(): Promise<void> {
		const current = manifest;
		if (!current) return;
		const candidates = new Map(current.candidates.map(candidate => [candidate.seasonId, candidate]));
		const rolls = new Map<string, { franchiseId: string; decade: number }>();
		for (const card of cards) {
			const candidate = candidates.get(card.seasonId);
			if (!candidate || profiles.has(card.seasonId)) continue;
			rolls.set(`${candidate.franchiseId}:${candidate.decade}`, { franchiseId: candidate.franchiseId, decade: candidate.decade });
		}
		const wanted = new Set(cards.map(card => card.seasonId));
		for (const roll of rolls.values()) {
			try {
				for (const profile of await loadChunk(current, roll)) if (wanted.has(profile.seasonId)) profiles.set(profile.seasonId, profile);
			} catch { /* the tile keeps its name and record */ }
		}
	}

	async function edit(action: (db: Awaited<ReturnType<typeof deviceDb>>['db']) => Promise<void>): Promise<void> {
		try {
			await action((await deviceDb()).db);
			await refresh();
			await refreshStickers();
		} catch { status = 'Your sticker change was not saved: browser storage is blocked or full.'; }
	}
	const onMove = (seasonId: string, family: StickerFamily, x: number, y: number) => edit(db => moveSticker(db, seasonId, family, x, y));
	const onHide = (seasonId: string, family: StickerFamily, hidden: boolean) => edit(db => setStickerHidden(db, seasonId, family, hidden));

	onMount(() => {
		let live = true;
		loadMedia().then(value => { if (live) { media = value; mediaStatus = 'ready'; } }).catch(() => { if (live) mediaStatus = 'unavailable'; });
		loadManifest()
			.then(value => {
				manifest = value;
				loadRankings(value.dataVersion).then(loaded => { if (live) rankings = loaded; }).catch(() => {});
				return refresh();
			})
			.catch(caught => { error = caught instanceof Error ? caught.message : 'The game data could not be loaded.'; })
			.finally(() => { loading = false; });
		return () => { live = false; };
	});
</script>

<svelte:head>
	<title>Collection | 162-0</title>
	<meta name="description" content="Every player-season you have drafted in 162-0, with the stickers they earned on your teams." />
</svelte:head>

<main class="page">
	<a class="back-link" href="/">← Back to the draft</a>
	<header class="intro">
		<div>
			<h1>Collection</h1>
			<p class="lede muted">Every player-season you put on a finished team is kept here, with the stickers it earned. Stickers follow the card into future drafts. They are decoration only and never change a draft or a season.</p>
		</div>
		<a class="side-link" href="/seasons">My seasons →</a>
	</header>
	{#if loading}
		<p class="muted" role="status">Loading your collection…</p>
	{:else if error}
		<p class="error" role="alert">{error}</p>
	{:else if manifest}
		<CollectionBinder {cards} {views} {war} candidates={manifest.candidates} franchises={manifest.franchises} {status} {onMove} {onHide} />
	{/if}
</main>

<style>
	.page { display: grid; gap: var(--space-4); width: min(100%, 84rem); padding-block: var(--space-8); }
	.back-link { color: var(--muted); font-weight: 700; text-decoration: none; }
	h1 { margin: 0; font-size: clamp(2rem, 6vw, 3rem); letter-spacing: -.03em; }
	.lede { margin: 0; max-width: 60ch; }
	.intro { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: var(--space-2) var(--space-6); }
	.side-link { color: var(--muted); font-size: var(--text-sm); font-weight: 650; }
	.side-link:hover { color: var(--text); }
</style>
