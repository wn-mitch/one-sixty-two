<script lang="ts">
	import { tick } from 'svelte';
	import Card from '../cards/Card.svelte';
	import FinishSample from './FinishSample.svelte';
	import TokenAmount from './TokenAmount.svelte';
	import type { Finish } from '../cards/finish.ts';
	import type { CardViewModel } from '../cards/view-model.ts';
	import { appearanceFor, COLORWAYS, itemsForTier, type CardAppearance, type CustomTier } from '../cosmetics/catalogue.ts';
	import type { ShopSnapshot } from '../cosmetics/ledger.ts';

	let { tier = $bindable<Finish>('gem'), snapshot, cards, loading, error, busy, onRetry, onUnlock, onEquip }: {
		tier?: Finish;
		snapshot: ShopSnapshot | null;
		cards: readonly CardViewModel[];
		loading: boolean;
		error: string;
		busy: boolean;
		onRetry: () => void;
		onUnlock: (id: string) => void;
		onEquip: (tier: CustomTier, id: string | null, colorway: string | null) => void;
	} = $props();
	const TIERS: readonly { id: Finish; label: string }[] = [
		{ id: 'base', label: 'Base' }, { id: 'foil', label: 'Silver foil' },
		{ id: 'emboss', label: 'Gold emboss' }, { id: 'gem', label: 'Gem' }
	];
	const BATCH_SIZE = 6;
	let choice = $state<{ tier: Finish; id: string | null; colorway: string | null } | null>(null);
	let previewId = $state('');
	let previewSection = $state<HTMLElement>();
	let visibleCount = $state(BATCH_SIZE);
	let sentinel = $state<HTMLLIElement>();
	let showCard = $state(true);
	let rail = $state<HTMLUListElement>();
	const equipped = $derived(tier === 'base' ? undefined : snapshot?.equipped[tier]);
	const selectedId = $derived(choice?.tier === tier ? choice.id : equipped?.itemId ?? null);
	const colorway = $derived(choice?.tier === tier ? choice.colorway : equipped?.colorway ?? null);
	const items = $derived(itemsForTier(tier));
	const shownItems = $derived(items.slice(0, visibleCount));
	const hasMore = $derived(shownItems.length < items.length);
	const selected = $derived(items.find(item => item.id === selectedId));
	const owned = $derived(selectedId === null || !!snapshot?.owned.includes(selectedId));
	const isEquipped = $derived((equipped?.itemId ?? null) === selectedId && (equipped?.colorway ?? null) === colorway);
	const preview = $derived(cards.find(card => card.seasonId === previewId) ?? cards[0]);
	const label = $derived(TIERS.find(item => item.id === tier)!.label);
	const finish = $derived(selectedId === null ? null : appearanceFor(selectedId, colorway));
	const noDetails = () => {};

	function chooseTier(next: Finish): void {
		tier = next;
		choice = null;
		visibleCount = BATCH_SIZE;
		rail?.scrollTo({ left: 0, behavior: 'instant' });
		previewId = '';
	}
	function choose(id: string | null): void {
		choice = { tier, id, colorway: tier === 'gem' ? colorway : null };
		if (id === null) choice.colorway = null;
		if (matchMedia('(max-width: 63.99rem)').matches) {
			previewSection?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
		}
	}
	async function loadMore(focusNew = false): Promise<void> {
		if (!hasMore) return;
		const firstNew = items[shownItems.length].id;
		visibleCount = Math.min(items.length, visibleCount + BATCH_SIZE);
		if (!focusNew) return;
		await tick();
		rail?.querySelector<HTMLButtonElement>(`[data-finish-id="${CSS.escape(firstNew)}"]`)?.focus();
	}
	$effect(() => {
		if (!sentinel || loading || !hasMore || typeof IntersectionObserver === 'undefined') return;
		void visibleCount;
		const observer = new IntersectionObserver(entries => {
			if (entries.some(entry => entry.isIntersecting) && !sentinel?.contains(document.activeElement)) void loadMore();
		}, { rootMargin: '240px' });
		observer.observe(sentinel);
		return () => observer.disconnect();
	});
</script>

{#snippet sample(appearance: CardAppearance | null, catalogue = false)}
	{#if preview}
		{#if showCard}
			<Card s={preview} {appearance} idle={!catalogue} stickers={catalogue ? [] : undefined} onDetails={noDetails} />
		{:else}
			<FinishSample {tier} era={preview.era} {appearance} idle={!catalogue} />
		{/if}
	{/if}
{/snippet}

<div class="tier-tabs" role="group" aria-label="Card tier">
	{#each TIERS as item (item.id)}
		<button type="button" aria-pressed={tier === item.id} onclick={() => chooseTier(item.id)}>{item.label}</button>
	{/each}
</div>
<label class="card-visibility"><input type="checkbox" bind:checked={showCard} />Show card</label>

{#if tier === 'base'}
	<section class="stock">
		{#if loading}
			<div class="stock-card sk sk-card" role="status" aria-label="Loading preview card"></div>
		{:else if error}
			<div><p class="error" role="alert">{error}</p><button type="button" onclick={onRetry}>Retry preview</button></div>
		{:else if preview}
			<div class="stock-card">{@render sample(null)}</div>
		{/if}
		<div><h2>Original stock</h2><p class="muted">Base cards keep their printed stock. Plates change the finish within a tier, never the tier itself.</p></div>
	</section>
{:else}
	<div class="shop-layout">
		<section class="preview" id="finish-preview" bind:this={previewSection} aria-labelledby="preview-heading">
			<h2 id="preview-heading">{selected?.name ?? 'Original by era'}</h2>
			{#if loading}
				<div class="preview-card sk sk-card" role="status" aria-label="Loading preview card"></div>
			{:else if error}
				<div class="preview-error"><p class="error" role="alert">{error}</p><button type="button" onclick={onRetry}>Retry preview</button></div>
			{:else if preview}
				<div class="preview-card">{@render sample(finish)}</div>
				<label class="preview-select">Preview card
					<select value={preview.seasonId} onchange={event => { previewId = event.currentTarget.value; }}>
						{#each cards as card (card.seasonId)}<option value={card.seasonId}>{card.full} · {card.year}</option>{/each}
					</select>
				</label>
			{:else}<p class="muted">No preview card is available in this tier.</p>{/if}
			{#if tier === 'gem' && selectedId !== null}
				<label class="colorway">Holo colorway
					<select value={colorway ?? ''} onchange={event => { choice = { tier, id: selectedId, colorway: event.currentTarget.value || null }; }}>
						<option value="">Film original</option>
						{#each COLORWAYS as option (option.id)}<option value={option.id}>{option.name}</option>{/each}
					</select>
				</label>
			{/if}
			<div class="commit">
				{#if owned}
					<button class="primary" type="button" disabled={busy || !snapshot || isEquipped} onclick={() => { if (tier !== 'base') onEquip(tier, selectedId, colorway); }}>{isEquipped ? 'Equipped' : `Equip for all ${label} cards`}</button>
				{:else if selected}
					<button class="primary unlock" type="button" aria-label={`Unlock · ${selected.cost} token`} disabled={busy || !snapshot || snapshot.balance < selected.cost} onclick={() => onUnlock(selected.id)}>Unlock <TokenAmount amount={selected.cost} /></button>
					{#if snapshot && snapshot.balance < selected.cost}<p class="muted">Finish a run to earn an unlock token.</p>{/if}
				{/if}
				<p class="muted">{tier === 'gem' ? 'Holo colorways included. Equip freely once owned.' : 'One plate unlock works in both foil tiers. Each tier keeps its own equipped plate.'}</p>
			</div>
		</section>

		<section class="catalogue" aria-labelledby="plates-heading">
			<div class="catalogue-heading"><h2 id="plates-heading">{tier === 'gem' ? 'Holo patterns' : 'Foil plates'}</h2><button class="quiet" type="button" aria-pressed={selectedId === null} onclick={() => choose(null)}>Original by era</button></div>
			<ul class="plate-rail" bind:this={rail} aria-label={`${label} finishes`}>
				{#each shownItems as item (item.id)}
					<li>
						<button class="plate-choice" type="button" data-finish-id={item.id} aria-label={`${item.name} ${equipped?.itemId === item.id ? 'Equipped' : snapshot?.owned.includes(item.id) ? 'Owned' : `${item.cost} token`}`} aria-pressed={selectedId === item.id} onclick={() => choose(item.id)}>
							<span class="plate-card" aria-hidden="true">
								{#if !loading && preview}{@render sample(appearanceFor(item.id, tier === 'gem' ? colorway : null), true)}{:else}<span class="sk sk-card"></span>{/if}
							</span>
							<span class="plate-name">{item.name}</span>
							<span class="ownership">{#if equipped?.itemId === item.id}Equipped{:else if snapshot?.owned.includes(item.id)}Owned{:else}<TokenAmount amount={item.cost} />{/if}</span>
						</button>
					</li>
				{/each}
				<li class="load-more" bind:this={sentinel}>
					<span role="status">{shownItems.length} of {items.length} finishes</span>
					{#if hasMore}<button type="button" class="secondary" onclick={() => void loadMore(true)}>Load more finishes</button>{/if}
				</li>
			</ul>
		</section>
	</div>
{/if}

<style>
	.tier-tabs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-1); border-bottom: 1px solid var(--border); padding-bottom: var(--space-4); }
	.tier-tabs button { background: transparent; border-color: transparent; padding-inline: var(--space-2); }
	.tier-tabs button[aria-pressed='true'] { background: var(--text); color: var(--background); }
	.card-visibility { display: inline-flex; align-items: center; justify-self: end; gap: var(--space-2); min-height: 2.75rem; margin-top: calc(-1 * var(--space-4)); font-size: var(--text-sm); cursor: pointer; }
	.card-visibility input { accent-color: var(--accent); }
	.unlock { display: flex; align-items: center; justify-content: center; gap: var(--space-2); }
	.shop-layout { display: grid; gap: var(--space-8); min-width: 0; }
	h2 { font-size: var(--text-xl); }
	.preview { order: 1; display: grid; gap: var(--space-4); justify-items: stretch; min-width: 0; align-content: start; scroll-margin-top: var(--space-4); }
	.preview h2 { text-align: center; }
	.preview-card { width: min(100%, 19rem); justify-self: center; }
	.preview-select, .colorway { display: grid; gap: var(--space-2); font-size: var(--text-sm); font-weight: 650; }
	select { width: 100%; min-width: 0; }
	.commit { display: grid; gap: var(--space-2); }
	.commit p { margin: 0; font-size: var(--text-sm); }
	.catalogue { min-width: 0; }
	.catalogue-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); margin-bottom: var(--space-4); }
	.catalogue-heading button[aria-pressed='true'] { color: var(--accent); }
	.plate-rail { display: grid; grid-auto-flow: column; grid-auto-columns: min(72vw, 14rem); gap: var(--space-5); min-width: 0; overflow-x: auto; overscroll-behavior-inline: contain; scroll-snap-type: x proximity; padding: var(--space-2); margin: calc(-1 * var(--space-2)); list-style: none; }
	.plate-rail li { min-width: 0; scroll-snap-align: start; }
	.plate-choice { display: grid; width: 100%; gap: var(--space-2); text-align: left; padding: 0; background: transparent; border: 0; }
	.plate-choice:hover:not(:disabled) { background: transparent; }
	.plate-card { display: block; width: 100%; border-radius: var(--radius); }
	.plate-choice[aria-pressed='true'] .plate-card { outline: 2px solid var(--accent); outline-offset: 4px; }
	.plate-name { margin-top: var(--space-2); font-size: var(--text-lg); }
	.ownership { color: var(--muted); font: 400 var(--text-sm)/1.4 system-ui, sans-serif; }
	.plate-rail .load-more { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-3); color: var(--muted); font-size: var(--text-sm); }
	.stock { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-6); }
	.stock-card { width: min(100%, 16rem); }
	.stock > div:last-child { flex: 1 1 16rem; }
	@media (min-width: 64rem) {
		.tier-tabs { display: flex; gap: var(--space-2); }
		.tier-tabs button { padding-inline: var(--space-4); }
		.shop-layout { grid-template-columns: minmax(0, 1fr) 21rem; align-items: start; gap: var(--space-10); }
		.preview { grid-column: 2; grid-row: 1; position: sticky; top: var(--space-6); }
		.catalogue { grid-column: 1; grid-row: 1; border: 0; padding: 0; }
		.plate-rail { grid-auto-flow: row; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-auto-columns: auto; overflow: visible; gap: var(--space-6); }
		.plate-rail .load-more { grid-column: 1 / -1; flex-direction: row; padding-block: var(--space-3); }
	}
</style>
