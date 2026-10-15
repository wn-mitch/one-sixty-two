<script lang="ts">
	import { onMount } from 'svelte';
	import FinishShop from '#lib/components/FinishShop.svelte';
	import TokenAmount from '#lib/components/TokenAmount.svelte';
	import type { CardViewModel } from '#lib/cards/view-model.ts';
	import { loadManifest } from '#lib/game/data.ts';
	import type { Manifest } from '#lib/game/types.ts';
	import { loadMedia } from '#lib/media/client.ts';
	import type { MediaManifest } from '#lib/media/types.ts';
	import { loadRankings } from '#lib/rankings/client.ts';
	import type { WarRankings } from '#lib/rankings/types.ts';
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
	let busy = $state(false);
	let error = $state('');
	let mediaNotice = $state('');
	let revision = $state(0);
	let live = true;

	async function load(): Promise<void> {
		loading = true;
		error = '';
		try {
			const manifest = await loadManifest();
			const [rankings, media] = await Promise.all([
				loadRankings(manifest.dataVersion),
				loadMedia().catch(() => null)
			]);
			if (!live) return;
			mediaNotice = media ? '' : 'Photos are unavailable. Preview cards retain their identities and finish; reload to retry photos.';
			data = { manifest, rankings, media };
		} catch (caught) {
			if (!live) return;
			error = caught instanceof Error ? caught.message : 'Preview cards could not be loaded.';
			loading = false;
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
			.finally(() => { if (!cancelled) loading = false; });
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
		void refreshShop();
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

<main class="shop-page">
	<header class="shop-intro">
		<div class="title-row"><h1>Shop</h1><p class="balance" aria-live="polite"><TokenAmount amount={balance} /></p></div>
		<p class="factory-link"><a href="/factory">Card factory</a> · give each era its own finish and colorway</p>
		<p class="rule"><strong>Cosmetic finishes · 1 token each.</strong> Complete a season to earn a token. Finishes change how cards look, never player statistics or strength.</p>
		{#if balance === 0}
			<p class="earn">No tokens yet. {shopState.snapshot?.firstSeasonBonus ? 'Your first completed season earns two, including a first-season bonus.' : 'Each completed season of your own earns one.'} <a href="/">Play a season</a></p>
		{/if}
	</header>
	{#if shopState.notice}<div class="storage-notice"><p class="notice" role="status">{shopState.notice}</p><button type="button" onclick={() => void refreshShop()}>Retry storage</button></div>{/if}
	<FinishShop bind:tier snapshot={shopState.snapshot} {cards} {loading} {error} {busy} onRetry={retry} onUnlock={unlock} onEquip={equip} />
	{#if mediaNotice}<p class="muted" role="status">{mediaNotice}</p>{/if}
	<details class="earning"><summary>How tokens and finishes work</summary><p>Each new season of your own that plays all 162 games earns one token; the first season completed on this device earns one bonus token on top. Tokens are earned by playing; they cannot be bought. Every foil finish, holo pattern or holo colorway costs one token. Colorways recolor any Gem holo, including an era’s own.</p><p>Unlocks, tokens and applied finishes are saved in this browser on this device only; they do not sync to other devices. History from before tokens existed starts with no credit. Reopening results, playing someone else’s replay, and head-to-head series do not earn tokens. Deleting a saved season does not refund an unlock or award another token.</p><p>Cards keep their original tier and statistics. Full-size cards show the chosen finish in the light; compact cards and exported images keep their simplified finish.</p></details>
</main>

<style>
	.shop-page { display: grid; gap: var(--space-5); width: min(100%, 84rem); min-width: 0; padding-block: var(--space-5) var(--space-8); }
	.shop-intro { display: grid; gap: var(--space-3); }
	.title-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
	.factory-link { margin: 0; font-size: var(--text-sm); color: var(--muted); }
	.factory-link a { font-weight: 700; }
	.rule { margin: 0; max-width: 60ch; color: var(--muted); }
	.rule strong { color: var(--text); }
	.earn { margin: 0; padding: var(--space-3); border-left: 3px solid var(--accent); background: var(--surface); }
	.earn a { font-weight: 700; }
	h1 { font-size: var(--text-2xl); }
	.balance { margin: 0; color: var(--text); font-size: var(--text-xl); }
	.storage-notice { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-3); }
	.storage-notice p { margin: 0; }
	.earning { margin-top: var(--space-4); border-top: 1px solid var(--border); color: var(--muted); }
	.earning summary { color: var(--text); }
	@media (min-width: 48rem) { h1 { font-size: var(--text-3xl); } }
</style>
