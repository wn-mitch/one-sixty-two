<script lang="ts">
	import { onMount } from 'svelte';
	import FinishShop from '#lib/components/FinishShop.svelte';
	import TokenAmount from '#lib/components/TokenAmount.svelte';
	import type { Finish } from '#lib/cards/finish.ts';
	import type { CardViewModel } from '#lib/cards/view-model.ts';
	import { loadManifest } from '#lib/game/data.ts';
	import type { Manifest } from '#lib/game/types.ts';
	import { loadMedia } from '#lib/media/client.ts';
	import type { MediaManifest } from '#lib/media/types.ts';
	import { loadRankings } from '#lib/rankings/client.ts';
	import type { WarRankings } from '#lib/rankings/types.ts';
	import { deviceDb } from '#lib/storage/db.ts';
	import { COSMETICS, type CustomTier } from '#lib/cosmetics/catalogue.ts';
	import { equipCosmetic, readShop, unlockCosmetic } from '#lib/cosmetics/ledger.ts';
	import { refreshShop, shopState } from '#lib/cosmetics/store.svelte.ts';
	import { previewCards } from '#lib/cosmetics/previews.ts';
	import { toasts } from '#lib/toast.svelte.ts';

	let tier = $state<Finish>('gem');
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
		cards = [];
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
	const unlock = (id: string) => void change(db => unlockCosmetic(db, id), `${COSMETICS.find(item => item.id === id)?.name ?? 'Finish'} unlocked. Choose Equip to use it.`);
	const equip = (selectedTier: CustomTier, id: string | null, colorway: string | null) => void change(db => equipCosmetic(db, selectedTier, id, colorway), id ? 'Finish equipped across this tier.' : 'Original era finishes restored for this tier.');
	const retry = () => { if (data) revision++; else void load(); };

	onMount(() => {
		void refreshShop();
		void load();
		return () => { live = false; };
	});
</script>

<svelte:head>
	<title>Plate shop | 162-0</title>
	<meta name="description" content="Unlock card plates and holo colorways with tokens earned by completing runs. Customize your deck without changing its tiers or stats." />
	<link rel="canonical" href="https://162-0.dev/shop" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://162-0.dev/shop" />
	<meta property="og:title" content="Plate shop | 162-0" />
	<meta property="og:description" content="Earn a token for each completed run. Choose foil plates and Gem holo colorways for your deck." />
</svelte:head>

<main class="shop-page">
	<header class="shop-intro"><h1>Shop</h1><p class="balance" aria-live="polite"><TokenAmount amount={shopState.snapshot?.balance ?? null} /></p></header>
	{#if shopState.notice}<div class="storage-notice"><p class="notice" role="status">{shopState.notice}</p><button type="button" onclick={() => void refreshShop()}>Retry storage</button></div>{/if}
	{#if mediaNotice}<p class="muted" role="status">{mediaNotice}</p>{/if}
	<FinishShop bind:tier snapshot={shopState.snapshot} {cards} {loading} {error} {busy} onRetry={retry} onUnlock={unlock} onEquip={equip} />
	<details class="earning"><summary>Tokens and finishes</summary><p>Complete a new Classic season or a full Draft Mode run to earn one token. Every plate or holo pattern costs one token and stays unlocked on this device. Holo colorways are included.</p><p>Your earlier history starts with no token credit. Reopening results, playing someone else’s replay, and head-to-head series do not earn tokens. Deleting a saved season does not refund an unlock or award another token.</p><p>Cards keep their original tier and statistics. Full-size cards show the chosen finish in the light; compact cards and exported images retain their simplified finish.</p></details>
</main>

<style>
	.shop-page { display: grid; gap: var(--space-6); width: min(100%, 84rem); min-width: 0; padding-block: var(--space-8); }
	.shop-intro { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); }
	h1 { font-size: var(--text-2xl); }
	.balance { margin: 0; color: var(--text); font-size: var(--text-xl); }
	.storage-notice { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-3); }
	.storage-notice p { margin: 0; }
	.earning { margin-top: var(--space-4); border-top: 1px solid var(--border); color: var(--muted); }
	.earning summary { color: var(--text); }
	@media (min-width: 48rem) { h1 { font-size: var(--text-3xl); } }
</style>
