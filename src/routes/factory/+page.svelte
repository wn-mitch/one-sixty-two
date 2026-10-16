<script lang="ts">
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import TokenAmount from '#lib/components/TokenAmount.svelte';
	import CardBrowser from '#lib/components/CardBrowser.svelte';
	import FactoryRack from '#lib/components/factory/FactoryRack.svelte';
	import FactoryEditor from '#lib/components/factory/FactoryEditor.svelte';
	import { CARD_ERAS, type CardEra } from '#lib/cards/era.ts';
	import type { CardViewModel } from '#lib/cards/view-model.ts';
	import type { CustomTier } from '#lib/cosmetics/catalogue.ts';
	import { TIERS } from '#lib/cosmetics/factory.ts';
	import { previewCards } from '#lib/cosmetics/previews.ts';
	import { refreshShop, shopState } from '#lib/cosmetics/store.svelte.ts';
	import { loadManifest } from '#lib/game/data.ts';
	import type { Manifest } from '#lib/game/types.ts';
	import { loadMedia } from '#lib/media/client.ts';
	import type { MediaManifest } from '#lib/media/types.ts';
	import { loadRankings } from '#lib/rankings/client.ts';
	import type { WarRankings } from '#lib/rankings/types.ts';

	// The rack shows every era's cards for one tier; `?era=` opens that era's editor, so Back returns to the rack.
	let tier = $state<CustomTier>('gem');
	let busy = $state(false);
	let data = $state.raw<{ manifest: Manifest; rankings: WarRankings; media: MediaManifest | null } | null>(null);
	let cards = $state.raw<ReadonlyMap<CardEra, CardViewModel>>(new Map());
	let cardNotice = $state('');
	const snapshot = $derived(shopState.snapshot);
	const requested = $derived(page.url.searchParams.get('era'));
	const era = $derived(CARD_ERAS.find(option => option === requested) ?? null);

	// All eras returns through history when the rack opened this editor; a direct link loads the rack.
	let fromRack = false;
	// The page header returns to whichever page opened the factory: Shop, Collection or the menu's page.
	const ORIGINS: Readonly<Record<string, string>> = { '/shop': 'Shop', '/collection': 'Collection' };
	let origin = $state('/shop');
	afterNavigate(navigation => {
		fromRack = navigation.from?.url.pathname === '/factory' && !navigation.from.url.searchParams.has('era');
		const from = navigation.from?.url.pathname;
		if (from && ORIGINS[from]) origin = from;
	});
	function back(event: MouseEvent): void {
		if (!fromRack || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
		event.preventDefault();
		history.back();
	}

	$effect(() => {
		const current = data;
		const selected = tier;
		if (!current) return;
		let cancelled = false;
		previewCards(selected, current.manifest, current.rankings, current.media, current.media ? 'ready' : 'unavailable')
			.then(value => { if (!cancelled) { cards = new Map(value.map(card => [card.era, card])); cardNotice = ''; } })
			.catch(() => { if (!cancelled) { cards = new Map(); cardNotice = 'Sample cards could not be loaded, so finishes show on blank stock.'; } });
		return () => { cancelled = true; };
	});

	onMount(() => {
		let live = true;
		void refreshShop();
		void (async () => {
			try {
				const manifest = await loadManifest();
				const [rankings, media] = await Promise.all([loadRankings(manifest.dataVersion), loadMedia().catch(() => null)]);
				if (live) data = { manifest, rankings, media };
			} catch {
				if (live) cardNotice = 'Sample cards could not be loaded, so finishes show on blank stock.';
			}
		})();
		return () => { live = false; };
	});
</script>

<svelte:head>
	<title>Card factory | 162-0</title>
	<meta name="description" content="Give each card era its own foil finish, holo pattern and colorway, unlocked with tokens earned by completing seasons." />
</svelte:head>

<main class="factory">
	<header class="intro">
		<a class="back" href={origin}>← {ORIGINS[origin]}</a>
		<div class="title-row">
			<h1>Card factory</h1>
			<div class="wallet">
				<p class="balance" aria-live="polite"><TokenAmount amount={snapshot?.balance ?? null} /></p>
			</div>
		</div>
	</header>
	{#if shopState.notice}<p class="notice" role="status">{shopState.notice}</p>{/if}
	{#if !snapshot && !shopState.notice}<p role="status">Loading finishes…</p>{/if}
	{#if cardNotice}<p class="muted" role="status">{cardNotice}</p>{/if}

	{#if snapshot}
		<CardBrowser label="Card factory" searchable={false} {busy}
			filters={TIERS} filter={tier} filterLegend="Card tier"
			onFilter={value => tier = value as CustomTier}>
			{#if era}
				<FactoryEditor {tier} {era} {snapshot} card={cards.get(era)} bind:busy onBack={back} />
			{:else}
				<FactoryRack {tier} {snapshot} {cards} />
			{/if}
		</CardBrowser>
	{/if}
	<details class="factory-help">
		<summary>About era finishes</summary>
		<p>Shop unlocks finish types; Card factory equips them. Each choice applies only to one era and tier. Deck default keeps your saved deck-wide finish; Era original restores the era’s own pattern. Owned finishes are free to reuse. Cosmetic only, saved on this device.</p>
	</details>
</main>

<style>
	.factory { display: grid; gap: var(--space-5); width: min(100%, 84rem); min-width: 0; padding-block: var(--space-5) var(--space-8); }
	.intro { display: grid; gap: var(--space-2); }
	.intro p { margin: 0; }
	.back { justify-self: start; min-height: 2.75rem; display: inline-flex; align-items: center; color: var(--muted); font-weight: 650; text-decoration: none; }
	.title-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
	h1 { font-size: var(--text-2xl); }
	.wallet { display: grid; justify-items: end; gap: 2px; }
	.balance { font-size: var(--text-xl); }
	.factory-help { border-top: 1px solid var(--border); color: var(--muted); font-size: var(--text-sm); }
</style>
