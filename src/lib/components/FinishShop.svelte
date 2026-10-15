<script lang="ts">
	import { onMount, tick } from 'svelte';
	import Card from '../cards/Card.svelte';
	import FinishChoice from './FinishChoice.svelte';
	import TokenAmount from './TokenAmount.svelte';
	import CardBrowser from './CardBrowser.svelte';
	import type { CardViewModel } from '../cards/view-model.ts';
	import { CARD_ERAS } from '../cards/era.ts';
	import { ERA_FOIL } from '../cards/surface/foil-plates.ts';
	import { ERA_HOLO } from '../cards/surface/holo-films.ts';
	import { appearanceFor, COLORWAYS, finishName, itemsForTier, type CustomTier, type CosmeticItem } from '../cosmetics/catalogue.ts';
	import { unlocksFor, type ShopSnapshot } from '../cosmetics/ledger.ts';
	// Players browse two families of finishes; a foil plate unlock covers both foil tiers.
	let { tier = $bindable<CustomTier>('gem'), snapshot, cards, loading, error, busy, onRetry, onUnlock, onEquip }: {
		tier?: CustomTier;
		snapshot: ShopSnapshot | null;
		cards: readonly CardViewModel[];
		loading: boolean;
		error: string;
		busy: boolean;
		onRetry: () => void;
		/** Unlocks the finish and applies it to `tier` in one step. */
		onUnlock: (tier: CustomTier, id: string | null, colorway: string | null) => void;
		onEquip: (tier: CustomTier, id: string | null, colorway: string | null) => void;
	} = $props();
	const FAMILIES = [
		{ value: 'foil', label: 'Foil finishes' },
		{ value: 'gem', label: 'Holo patterns' }
	] as const;
	const TIER_NAMES: Record<CustomTier, string> = { foil: 'Silver foil', emboss: 'Gold emboss', gem: 'Gem' };
	const BATCH_SIZE = 12;
	const family = $derived(tier === 'gem' ? 'gem' : 'foil');
	let choice = $state<{ tier: CustomTier; id: string | null; colorway: string | null } | null>(null);
	let previewId = $state('');
	let visibleCount = $state(BATCH_SIZE);
	let sentinel = $state<HTMLLIElement>();
	let sheet = $state<HTMLDialogElement>();
	let sheetOpen = $state(false);
	let wide = $state(true);
	let returnFocus: HTMLElement | null = null;
	const items = $derived(itemsForTier(tier));
	const eraDefaults = $derived(Object.entries(tier === 'gem' ? ERA_HOLO : ERA_FOIL));
	const equipped = $derived(snapshot?.equipped[tier]);
	const selectedId = $derived(choice?.tier === tier ? choice.id : equipped?.itemId ?? items[0]?.id ?? null);
	const colorway = $derived(choice?.tier === tier ? choice.colorway : equipped?.colorway ?? null);
	const shownItems = $derived(items.slice(0, visibleCount));
	const hasMore = $derived(shownItems.length < items.length);
	const selected = $derived(items.find(item => item.id === selectedId));
	// What applying the current choice still needs to unlock: its pattern and, on Gem, its colorway.
	const needed = $derived(unlocksFor(selectedId, colorway).filter(id => !snapshot?.owned.includes(id)));
	const owned = $derived(needed.length === 0);
	const ownsColorway = (id: string) => !!snapshot?.owned.includes(`colorway:${id}`);
	const applied = $derived((equipped?.itemId ?? null) === selectedId && (equipped?.colorway ?? null) === colorway);
	const preview = $derived(cards.find(card => card.seasonId === previewId) ?? cards[0]);
	const tierName = $derived(TIER_NAMES[tier]);
	const finish = $derived(selectedId === null ? null : appearanceFor(selectedId, colorway));
	const short = $derived(!!snapshot && !owned && snapshot.balance < needed.length);
	const noDetails = () => {};
	// Catalogue swatches share one era and lighting so every finish is compared on the same stock.
	const sampleEra = '1990s';
	function equippedLabelFor(item: CosmeticItem): string | undefined {
		if (!snapshot) return undefined;
		const eras = CARD_ERAS.filter(currentEra => {
			const itemId = (snapshot.eras[tier]?.[currentEra] ?? snapshot.equipped[tier])?.itemId;
			if (itemId != null) return itemId === item.id;
			const original = tier === 'gem' ? ERA_HOLO[currentEra] : ERA_FOIL[currentEra];
			return original === (item.film ?? item.plate);
		});
		return eras.length ? `Equipped for ${tierName} cards in ${eras.join(', ')}` : undefined;
	}

	onMount(() => {
		const query = matchMedia('(min-width: 64rem)');
		const update = () => { wide = query.matches; if (wide) closeSheet(false); };
		update();
		query.addEventListener('change', update);
		return () => query.removeEventListener('change', update);
	});

	function chooseFamily(next: 'foil' | 'gem'): void {
		if (next === family) return;
		tier = next === 'gem' ? 'gem' : 'foil';
		choice = null;
		visibleCount = BATCH_SIZE;
	}
	function chooseTier(next: CustomTier): void {
		// Switching between Silver and Gold keeps the plate being previewed.
		const keep = choice && choice.tier !== 'gem' && next !== 'gem' ? choice.id : undefined;
		tier = next;
		choice = keep === undefined ? null : { tier: next, id: keep, colorway: null };
	}
	async function choose(id: string | null, trigger: HTMLElement): Promise<void> {
		choice = { tier, id, colorway: tier === 'gem' && id !== null ? colorway : null };
		if (wide) return;
		// Phones open the finish in a sheet over the catalogue, which stays exactly where it was.
		returnFocus = trigger;
		sheetOpen = true;
		await tick();
		if (!sheet?.open) sheet?.showModal();
	}
	function closeSheet(restore = true): void {
		if (sheet?.open) sheet.close();
		sheetOpen = false;
		if (restore) returnFocus?.focus({ preventScroll: true });
		returnFocus = null;
	}
	function loadMore(): void {
		if (hasMore) visibleCount = Math.min(items.length, visibleCount + BATCH_SIZE);
	}
	$effect(() => {
		if (!sentinel || !hasMore || typeof IntersectionObserver === 'undefined') return;
		void visibleCount;
		const observer = new IntersectionObserver(entries => {
			if (entries.some(entry => entry.isIntersecting)) loadMore();
		}, { rootMargin: '240px' });
		observer.observe(sentinel);
		return () => observer.disconnect();
	});
	const ownership = (id: string) => equipped?.itemId === id ? 'Applied' : snapshot?.owned.includes(id) ? 'Owned' : null;
</script>

{#snippet detail()}
	<div class="detail">
		<h2 id="detail-heading">{selected ? finishName(selected) : 'Original finish'}</h2>
		{#if tier !== 'gem'}
			<div class="tier-choice" role="group" aria-label="Preview and apply on">
				<button type="button" aria-pressed={tier === 'foil'} onclick={() => chooseTier('foil')}>Silver foil cards</button>
				<button type="button" aria-pressed={tier === 'emboss'} onclick={() => chooseTier('emboss')}>Gold emboss cards</button>
			</div>
		{/if}
		{#if loading}
			<div class="preview-card sk sk-card" role="status" aria-label="Loading preview card"></div>
		{:else if error}
			<div class="preview-error"><p class="error" role="alert">{error}</p><button type="button" onclick={onRetry}>Retry preview</button></div>
		{:else if preview}
			<div class="preview-card"><Card s={preview} appearance={finish} onDetails={noDetails} /></div>
			{#if cards.length > 1}
				<details class="preview-options">
					<summary>Preview player</summary>
					<select aria-label="Preview player" value={preview.seasonId} onchange={event => { previewId = event.currentTarget.value; }}>
						{#each cards as card (card.seasonId)}<option value={card.seasonId}>{card.full} · {card.year}</option>{/each}
					</select>
				</details>
			{/if}
		{:else}<p class="muted">No preview card is available for this tier.</p>{/if}
		{#if tier === 'gem' && selectedId !== null}
			<label class="colorway">Holo colorway
				<select value={colorway ?? ''} onchange={event => { choice = { tier, id: selectedId, colorway: event.currentTarget.value || null }; }}>
					<option value="">Film original</option>
					{#each COLORWAYS as option (option.id)}<option value={option.id}>{finishName(option)}{ownsColorway(option.id) ? '' : ' · 1 token'}</option>{/each}
				</select>
			</label>
		{/if}
		<div class="commit">
			{#if selectedId === null}
				<button class="primary" type="button" disabled={busy || !snapshot || applied} onclick={() => onEquip(tier, null, null)}>{applied ? `Applied to ${tierName} cards` : `Restore original ${tierName} finish`}</button>
			{:else if owned}
				<button class="primary" type="button" disabled={busy || !snapshot || applied} onclick={() => onEquip(tier, selectedId, colorway)}>{applied ? `Applied to ${tierName} cards` : `Apply to ${tierName} cards`}</button>
			{:else}
				<button class="primary unlock" type="button" aria-label={`Unlock and apply to ${tierName} cards, ${needed.length} ${needed.length === 1 ? 'token' : 'tokens'}`} disabled={busy || !snapshot || short} onclick={() => onUnlock(tier, selectedId, colorway)}>Unlock &amp; apply · <TokenAmount amount={needed.length} /></button>
				{#if needed.length > 1}<p class="muted">Pattern + colorway</p>{/if}
				{#if short}<p class="muted">{needed.length - (snapshot?.balance ?? 0)} more {needed.length - (snapshot?.balance ?? 0) === 1 ? 'token' : 'tokens'} needed. <a href="/">Play to earn</a></p>{/if}
			{/if}
			{#if tier !== 'gem'}<p class="muted">For Silver foil &amp; Gold emboss cards.</p>{/if}
		</div>
	</div>
{/snippet}

<CardBrowser label="Shop finishes" {wide} {busy} searchable={false}
	filters={FAMILIES} filter={family} filterLegend="Finishes"
	onFilter={value => chooseFamily(value as 'foil' | 'gem')}>
	{#snippet rail()}
		<button class="original quiet" type="button" disabled={busy} aria-pressed={selectedId === null} aria-label={`Original finish${equipped ? '' : ', applied'}`} onclick={event => void choose(null, event.currentTarget)}>Original finish</button>
	{/snippet}

<div class="shop-layout">
	<section class="catalogue" aria-labelledby="catalogue-heading">
		<h2 id="catalogue-heading" class="sr-only">{family === 'gem' ? 'Holo patterns' : 'Foil finishes'}</h2>
		<ul class="finish-grid" aria-label={family === 'gem' ? 'Holo patterns' : 'Foil finishes'}>
			{#each shownItems as item (item.id)}
				{@const state = ownership(item.id)}
				{@const eras = eraDefaults.filter(([, pattern]) => pattern === (item.film ?? item.plate)).map(([era]) => era).join(', ')}
				{@const equippedLabel = equippedLabelFor(item)}
				<li>
					<FinishChoice name={finishName(item)} {tier} era={sampleEra}
						appearance={appearanceFor(item.id, tier === 'gem' ? colorway : null)}
						selected={selectedId === item.id} cost={item.cost} status={state} finishId={item.id}
						description={eras ? `${eras} default` : undefined} {equippedLabel}
						onChoose={trigger => void choose(item.id, trigger)} />
				</li>
			{/each}
			{#if hasMore}
				<li class="load-more" bind:this={sentinel}><button type="button" class="secondary" onclick={loadMore}>More finishes</button></li>
			{/if}
		</ul>
	</section>
	{#if wide}
		<section class="side" aria-labelledby="detail-heading">{@render detail()}</section>
	{/if}
</div>
</CardBrowser>

<dialog bind:this={sheet} class="detail-sheet" aria-labelledby="detail-heading" onclose={() => { if (sheetOpen) closeSheet(); }} onclick={event => { if (event.target === sheet) closeSheet(); }}>
	{#if sheetOpen && !wide}
		<div class="sheet-body">
			<button type="button" class="quiet close" aria-label="Close finish" onclick={() => closeSheet()}>×</button>
			{@render detail()}
		</div>
	{/if}
</dialog>

<style>
	.original { margin-bottom: var(--space-3); color: var(--muted); font-size: var(--text-sm); }
	.original[aria-pressed='true'] { color: var(--text); border-color: var(--border); }
	.unlock { display: flex; align-items: center; justify-content: center; gap: var(--space-2); }
	.shop-layout { display: grid; gap: var(--space-8); min-width: 0; }
	h2 { font-size: var(--text-xl); }
	.detail { display: grid; gap: var(--space-3); min-width: 0; align-content: start; }
	.detail h2 { margin: 0; }
	.tier-choice { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-1); }
	.tier-choice button { padding-inline: var(--space-2); font-size: var(--text-sm); background: transparent; }
	.tier-choice button[aria-pressed='true'] { background: var(--text); color: var(--background); }
	.preview-card { width: min(100%, 13rem); justify-self: center; }
	.preview-options { font-size: var(--text-sm); color: var(--muted); }
	.preview-options summary { min-height: 2.75rem; align-content: center; }
	.colorway { display: grid; gap: var(--space-2); font-size: var(--text-sm); font-weight: 650; }
	select { width: 100%; min-width: 0; }
	.commit { display: grid; gap: var(--space-2); }
	.commit p { margin: 0; font-size: var(--text-sm); }
	.catalogue { min-width: 0; }
	.finish-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
	.load-more { grid-column: 1 / -1; display: flex; justify-content: center; }
	.detail-sheet { width: min(100vw, 32rem); max-width: 100vw; max-height: 92dvh; margin: auto auto 0; padding: 0; border: 1px solid var(--border); border-radius: var(--radius-lg) var(--radius-lg) 0 0; background: var(--background); color: var(--text); }
	.detail-sheet::backdrop { background: oklch(0% 0 0 / .6); }
	.sheet-body { position: relative; padding: var(--space-4) max(var(--space-4), env(safe-area-inset-right)) max(var(--space-6), env(safe-area-inset-bottom)) max(var(--space-4), env(safe-area-inset-left)); }
	.sheet-body .close { position: absolute; top: var(--space-2); right: var(--space-2); width: 2.75rem; padding: 0; font-size: 1.5rem; }
	.sheet-body h2 { padding-right: 3rem; }
	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
	@media (min-width: 30rem) { .finish-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
	@media (min-width: 40rem) { .finish-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-4) var(--space-3); } }
	@media (min-width: 64rem) {
		.shop-layout { grid-template-columns: minmax(0, 1fr) 20rem; align-items: start; gap: var(--space-8); }
		.side { position: sticky; top: var(--space-6); padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-lg); }
		.original { width: 100%; margin-top: var(--space-2); padding-inline: 10px; text-align: left; }
		.finish-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	}
	@media (min-width: 72rem) { .finish-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
	@media (min-width: 80rem) { .finish-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
</style>
