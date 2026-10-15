<script lang="ts">
	import { onMount } from 'svelte';
	import ScreenLoading from '#lib/components/ScreenLoading.svelte';
	import FinishShop from '#lib/components/FinishShop.svelte';
	import TokenAmount from '#lib/components/TokenAmount.svelte';
	import type { CardViewModel } from '#lib/cards/view-model.ts';
	import { loadManifest } from '#lib/game/data.ts';
	import type { Manifest } from '#lib/game/types.ts';
	import { loadMedia } from '#lib/media/client.ts';
	import type { MediaManifest } from '#lib/media/types.ts';
	import { loadRankings } from '#lib/rankings/client.ts';
	import type { WarRankings } from '#lib/rankings/types.ts';
	import { appSettings } from '#lib/game/settings.svelte.ts';
	import { deviceDb } from '#lib/storage/db.ts';
	import { COSMETICS, finishName, type CustomTier } from '#lib/cosmetics/catalogue.ts';
	import { equipCosmetic, readShop, unlockAndEquip } from '#lib/cosmetics/ledger.ts';
	import { refreshShop, shopState } from '#lib/cosmetics/store.svelte.ts';
	import { previewCards } from '#lib/cosmetics/previews.ts';
	import { toasts } from '#lib/toast.svelte.ts';

	let tier = $state<CustomTier>('foil');
	let data = $state.raw<{ manifest: Manifest; rankings: WarRankings; media: MediaManifest | null } | null>(null);
	let cards = $state.raw<CardViewModel[]>([]);
	let loading = $state(true);
	let initialLoading = $state(true);
	let busy = $state(false);
	let error = $state('');
	let mediaNotice = $state('');
	let revision = $state(0);
	let live = true;

	async function load(): Promise<void> {
		loading = true;
		initialLoading = true;
		error = '';
		try {
			const shopReady = refreshShop();
			const manifest = await loadManifest();
			const [rankings, media] = await Promise.all([
				loadRankings(manifest.dataVersion),
				loadMedia().catch(() => null),
				shopReady
			]);
			if (!live) return;
			mediaNotice = media ? '' : 'Photos are unavailable. Preview cards retain their identities and finish; reload to retry photos.';
			data = { manifest, rankings, media };
		} catch (caught) {
			if (!live) return;
			error = caught instanceof Error ? caught.message : 'Preview cards could not be loaded.';
			loading = false;
			initialLoading = false;
		}
	}

	$effect(() => {
		const current = data;
		const selectedTier = tier;
		void revision;
		if (!current) return;
		let cancelled = false;
		loading = true;
		error = '';
		previewCards(selectedTier, current.manifest, current.rankings, current.media, current.media ? 'ready' : 'unavailable')
			.then(value => { if (!cancelled) cards = value; })
			.catch(caught => { if (!cancelled) error = caught instanceof Error ? caught.message : 'The preview could not be loaded.'; })
			.finally(() => {
				if (cancelled) return;
				loading = false;
				initialLoading = false;
			});
		return () => { cancelled = true; };
	});


	async function change(action: (db: Awaited<ReturnType<typeof deviceDb>>['db']) => Promise<void>, success: string): Promise<void> {
		if (busy) return;
		busy = true;
		try {
			const { db } = await deviceDb();
			await action(db);
			shopState.snapshot = await readShop(db);
			toasts.show(success, { id: 'shop' });
		} catch (caught) {
			toasts.show(caught instanceof Error ? caught.message : 'The finish was not saved. Please retry.', { id: 'shop', tone: 'error' });
		} finally { busy = false; }
	}
	const TIER_NAMES: Record<CustomTier, string> = { foil: 'Silver foil', emboss: 'Gold emboss', gem: 'Gem' };
	const nameOf = (id: string) => { const item = COSMETICS.find(entry => entry.id === id); return item ? finishName(item) : 'Finish'; };
	const unlock = (selectedTier: CustomTier, id: string | null, colorway: string | null) => void change(db => unlockAndEquip(db, { tier: selectedTier }, id, colorway), `${id ? nameOf(id) : 'Finish'} unlocked and applied to your ${TIER_NAMES[selectedTier]} cards.`);
	const equip = (selectedTier: CustomTier, id: string | null, colorway: string | null) => void change(db => equipCosmetic(db, { tier: selectedTier }, id, colorway), id ? `${nameOf(id)} applied to your ${TIER_NAMES[selectedTier]} cards.` : `Original finishes restored on your ${TIER_NAMES[selectedTier]} cards.`);
	const balance = $derived(shopState.snapshot?.balance ?? null);
	const retry = () => { if (data) revision++; else void load(); };

	onMount(() => {
		void load();
		return () => { live = false; };
	});
</script>

<svelte:head>
	<title>Shop | 162-0</title>
	<meta name="description" content="Unlock cosmetic card finishes with tokens earned by completing seasons. Finishes change how cards look, never their statistics." />
	<link rel="canonical" href="https://162-0.dev/shop" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://162-0.dev/shop" />
	<meta property="og:title" content="Shop | 162-0" />
	<meta property="og:description" content="Earn a token for each completed season. Choose foil finishes and Gem holo patterns for your cards." />
</svelte:head>
<ScreenLoading active={initialLoading} label="Loading the shop…" />

<main class="shop-page" class:content-ready={!initialLoading} class:motion-enabled={appSettings.effectiveEnabled}>
	<header class="shop-intro">
		<h1>Shop</h1>
		<div class="shop-tools">
			<a class="button secondary factory-link" href="/factory">Card factory</a>
			<div class="wallet">
				<p class="balance" aria-live="polite"><TokenAmount amount={balance} /></p>
				{#if balance === 0}<a class="earn" href="/">Play to earn</a>{/if}
			</div>
		</div>
	</header>
	{#if shopState.notice}<div class="storage-notice"><p class="notice" role="status">{shopState.notice}</p><button type="button" onclick={() => void refreshShop()}>Retry storage</button></div>{/if}
	{#if !initialLoading}
		<FinishShop bind:tier snapshot={shopState.snapshot} {cards} {loading} {error} {busy} onRetry={retry} onUnlock={unlock} onEquip={equip} />
	{/if}
	{#if mediaNotice}<p class="muted" role="status">{mediaNotice}</p>{/if}
	<details class="earning">
		<summary>Tokens &amp; unlocks</summary>
		<p>Finish a season to earn 1 token. Your first earns 2. Replays and head-to-head series do not earn tokens.</p>
		<p>Each finish or colorway costs 1 token. Foil unlocks work on Silver and Gold cards; colorways work on any Gem holo. Applying an owned finish or restoring the original is free.</p>
		<p>Cosmetic only. Unlocks and tokens stay on this device. Compact cards and exported images keep their simplified finish.</p>
	</details>
</main>

<style>
	.shop-page { display: grid; gap: var(--space-5); width: min(100%, 84rem); min-width: 0; padding-block: var(--space-5) var(--space-8); }
	.shop-page.motion-enabled { opacity: 0; transform: translateY(.5rem); }
	.shop-page.motion-enabled.content-ready { opacity: 1; transform: none; transition: opacity 280ms ease-out, transform 280ms ease-out; }
	.shop-intro { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); }
	.shop-tools { display: flex; align-items: center; gap: var(--space-6); }
	.factory-link { font-size: var(--text-sm); }
	.wallet { display: grid; justify-items: end; gap: var(--space-1); }
	.earn { font-size: var(--text-xs); }
	h1 { margin: 0; font-size: var(--text-2xl); }
	.balance { margin: 0; color: var(--text); font-size: var(--text-xl); }
	.storage-notice { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-3); }
	.storage-notice p { margin: 0; }
	.earning { margin-top: var(--space-4); border-top: 1px solid var(--border); color: var(--muted); }
	.earning summary { color: var(--text); }
	.earning p { font-size: var(--text-sm); }
	@media (max-width: 29rem) { .shop-tools { gap: var(--space-3); } }
	@media (min-width: 48rem) { h1 { font-size: var(--text-3xl); } }
</style>
