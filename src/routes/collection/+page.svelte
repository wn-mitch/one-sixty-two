<script lang="ts">
	import { onMount } from 'svelte';
	import ScreenLoading from '#lib/components/ScreenLoading.svelte';
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

	const LAST_VISIT_KEY = '162-zero:collection-visit:v1';

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
	/** Sticker kinds earned since the last visit, by player-season; they slap on when their card first opens. */
	let fresh = $state.raw<ReadonlyMap<string, ReadonlySet<string>>>(new Map());
	let lastVisit: string | null | undefined;

	/** Reads the previous visit once and records this one; denied storage just means nothing is fresh. */
	function noteVisit(loaded: readonly CollectedCard[]): void {
		if (lastVisit !== undefined) return;
		try {
			lastVisit = localStorage.getItem(LAST_VISIT_KEY);
			localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
		} catch { lastVisit = null; }
		if (!lastVisit) return;
		const since = lastVisit;
		fresh = new Map(loaded
			.map(card => [card.seasonId, new Set(card.stickers.filter(sticker => sticker.earnedAt > since).map(sticker => sticker.kind))] as const)
			.filter(([, kinds]) => kinds.size > 0));
	}

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
			noteVisit(cards);
			if (device.notice) status = device.notice;
		} catch { status = STORAGE_NOTICE; }
		await loadProfiles();
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
		const mediaReady = loadMedia().then(value => { if (live) { media = value; mediaStatus = 'ready'; } }).catch(() => { if (live) mediaStatus = 'unavailable'; });
		loadManifest()
			.then(async value => {
				manifest = value;
				await Promise.all([
					refresh(),
					mediaReady,
					loadRankings(value.dataVersion).then(loaded => { if (live) rankings = loaded; }).catch(() => {})
				]);
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
<ScreenLoading active={loading} label="Loading your collection…" />

<main class="page">
	<header class="intro"><h1>Collection</h1>{#if !loading && !error}<span class="card-count">{cards.length.toLocaleString('en-US')} {cards.length === 1 ? 'card' : 'cards'}</span>{/if}</header>
	{#if loading}
		<p class="muted" role="status">Loading your collection…</p>
	{:else if error}
		<p class="error" role="alert">{error}</p>
	{:else if manifest}
		<CollectionBinder {cards} {views} {war} {fresh} candidates={manifest.candidates} franchises={manifest.franchises} {status} {onMove} {onHide} />
	{/if}
</main>

<style>
	.page { display: grid; gap: var(--space-3); width: min(100%, 84rem); padding-block: var(--space-4); }
	.intro { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-3); }
	h1 { margin: 0; font-size: var(--text-2xl); letter-spacing: -.03em; }
	.card-count { color: var(--muted); font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
</style>
