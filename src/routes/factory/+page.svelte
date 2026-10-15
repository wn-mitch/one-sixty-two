<script lang="ts">
	import { onMount } from 'svelte';
	import FinishSample from '#lib/components/FinishSample.svelte';
	import TokenAmount from '#lib/components/TokenAmount.svelte';
	import { CARD_ERAS, type CardEra } from '#lib/cards/era.ts';
	import { appearanceFor, COLORWAYS, COSMETICS, finishName, itemsForTier, type CustomTier } from '#lib/cosmetics/catalogue.ts';
	import { equipCosmetic, readShop, resetEra, unlockAndEquip, unlocksFor, type EquippedFinish } from '#lib/cosmetics/ledger.ts';
	import { refreshShop, shopState } from '#lib/cosmetics/store.svelte.ts';
	import { deviceDb } from '#lib/storage/db.ts';
	import { toasts } from '#lib/toast.svelte.ts';

	// The card factory: one era at a time, choose that era's finish for one tier. Choices override the
	// deck-wide finish from the Shop for that era only; everything is drawn from material swatches.
	const TIERS: readonly { id: CustomTier; label: string }[] = [
		{ id: 'gem', label: 'Gem holo' }, { id: 'foil', label: 'Silver foil' }, { id: 'emboss', label: 'Gold emboss' }
	];
	const DECK = 'deck';
	let tier = $state<CustomTier>('gem');
	let era = $state<CardEra>('1980s');
	let busy = $state(false);
	/** The unsaved choice for the selected era: deck default, the era's own finish (null), or an item. */
	let draft = $state<{ itemId: string | null | typeof DECK; colorway: string | null }>({ itemId: DECK, colorway: null });

	const snapshot = $derived(shopState.snapshot);
	const saved = (forTier: CustomTier, forEra: CardEra): EquippedFinish | undefined => snapshot?.eras[forTier]?.[forEra];
	const deckChoice = $derived(snapshot?.equipped[tier]);
	const owns = (id: string) => !!snapshot?.owned.includes(id);
	const items = $derived(itemsForTier(tier));
	const nameOf = (id: string | null) => {
		const item = id && COSMETICS.find(entry => entry.id === id);
		return item ? finishName(item) : 'Era original';
	};
	const describe = (choice: EquippedFinish | undefined) => !choice
		? 'Deck default'
		: `${nameOf(choice.itemId)}${choice.colorway ? ` · ${finishName({ name: choice.colorway })}` : ''}`;

	// Reset the editor to the saved choice when the era, tier or that saved choice changes, not on every shop refresh.
	const savedKey = $derived(JSON.stringify([tier, era, saved(tier, era) ?? null]));
	$effect(() => {
		const [, , current] = JSON.parse(savedKey) as [CustomTier, CardEra, EquippedFinish | null];
		draft = current ? { itemId: current.itemId, colorway: current.colorway } : { itemId: DECK, colorway: null };
	});

	const usingDeck = $derived(draft.itemId === DECK);
	const resolved = $derived(usingDeck ? (deckChoice ? { itemId: deckChoice.itemId, colorway: deckChoice.colorway } : { itemId: null, colorway: null }) : { itemId: draft.itemId as string | null, colorway: draft.colorway });
	const preview = $derived(appearanceFor(resolved.itemId, tier === 'gem' ? resolved.colorway : null));
	const needed = $derived(usingDeck ? [] : unlocksFor(draft.itemId as string | null, draft.colorway).filter(id => !owns(id)));
	const current = $derived(saved(tier, era));
	const unchanged = $derived(usingDeck ? !current : !!current && current.itemId === draft.itemId && current.colorway === draft.colorway);
	const short = $derived(!!snapshot && snapshot.balance < needed.length);

	async function commit(): Promise<void> {
		if (busy || unchanged) return;
		busy = true;
		const label = `${era} ${TIERS.find(entry => entry.id === tier)!.label} cards`;
		try {
			const { db } = await deviceDb();
			if (usingDeck) await resetEra(db, tier, era);
			else if (needed.length) await unlockAndEquip(db, { tier, era }, draft.itemId as string | null, draft.colorway);
			else await equipCosmetic(db, { tier, era }, draft.itemId as string | null, draft.colorway);
			shopState.snapshot = await readShop(db);
			toasts.show(usingDeck ? `${label} follow your deck finish again.` : `Applied to your ${label}.`, { id: 'factory' });
		} catch (caught) {
			toasts.show(caught instanceof Error ? caught.message : 'The finish was not saved. Please retry.', { id: 'factory', tone: 'error' });
		} finally { busy = false; }
	}

	onMount(() => { void refreshShop(); });
</script>

<svelte:head>
	<title>Card factory | 162-0</title>
	<meta name="description" content="Give each card era its own foil finish, holo pattern and colorway, unlocked with tokens earned by completing seasons." />
</svelte:head>

<main class="factory">
	<header class="intro">
		<a class="back" href="/shop">← Shop</a>
		<div class="title-row"><h1>Card factory</h1><p class="balance" aria-live="polite"><TokenAmount amount={snapshot?.balance ?? null} /></p></div>
		<p class="muted">Give each era its own look. A choice here replaces your deck-wide Shop finish for that era’s cards only. Cosmetic only; unlocks cost 1 token each and stay on this device.</p>
	</header>
	{#if shopState.notice}<p class="notice" role="status">{shopState.notice}</p>{/if}

	<div class="tiers" role="group" aria-label="Card tier">
		{#each TIERS as entry (entry.id)}<button type="button" aria-pressed={tier === entry.id} onclick={() => tier = entry.id}>{entry.label}</button>{/each}
	</div>

	<ul class="eras" aria-label="Eras">
		{#each CARD_ERAS as option (option)}
			{@const choice = saved(tier, option)}
			<li>
				<button type="button" class="era" aria-pressed={era === option} aria-label={`${option}, ${describe(choice)}`} onclick={() => era = option}>
					<span class="swatch" aria-hidden="true"><FinishSample {tier} era={option} appearance={choice ? appearanceFor(choice.itemId, choice.colorway) : deckChoice ? appearanceFor(deckChoice.itemId, deckChoice.colorway) : null} idle={false} /></span>
					<span class="era-name">{option}</span>
					<span class="era-state" class:custom={!!choice}>{describe(choice)}</span>
				</button>
			</li>
		{/each}
	</ul>

	<section class="editor" aria-labelledby="editor-heading">
		<div class="preview"><FinishSample {tier} {era} appearance={preview} /></div>
		<div class="controls">
			<h2 id="editor-heading">{era} {TIERS.find(entry => entry.id === tier)!.label}</h2>
			<label>{tier === 'gem' ? 'Holo pattern' : 'Foil finish'}
				<select value={draft.itemId ?? ''} onchange={event => {
					const value = event.currentTarget.value;
					draft = value === DECK ? { itemId: DECK, colorway: null } : { itemId: value || null, colorway: draft.itemId === DECK ? null : draft.colorway };
				}}>
					<option value={DECK}>Deck default ({deckChoice ? describe({ itemId: deckChoice.itemId, colorway: deckChoice.colorway }) : 'era original'})</option>
					<option value="">Era original</option>
					{#each items as item (item.id)}<option value={item.id}>{finishName(item)}{owns(item.id) ? '' : ' · 1 token'}</option>{/each}
				</select>
			</label>
			{#if tier === 'gem' && !usingDeck}
				<label>Colorway
					<select value={draft.colorway ?? ''} onchange={event => { draft = { ...draft, colorway: event.currentTarget.value || null }; }}>
						<option value="">Film original</option>
						{#each COLORWAYS as option (option.id)}<option value={option.id}>{finishName(option)}{owns(`colorway:${option.id}`) ? '' : ' · 1 token'}</option>{/each}
					</select>
				</label>
			{/if}
			<button class="primary" type="button" disabled={busy || !snapshot || unchanged || short} onclick={() => void commit()}>
				{#if unchanged}Applied{:else if usingDeck}Use deck default{:else if needed.length}Unlock &amp; apply · <TokenAmount amount={needed.length} />{:else}Apply to {era} cards{/if}
			</button>
			{#if short}<p class="muted">You need {needed.length === 1 ? 'a token' : `${needed.length} tokens`}. Complete a season to earn one. <a href="/">Play a season</a></p>{/if}
		</div>
	</section>
</main>

<style>
	.factory { display: grid; gap: var(--space-5); width: min(100%, 64rem); min-width: 0; padding-block: var(--space-5) var(--space-8); }
	.intro { display: grid; gap: var(--space-2); }
	.intro p { margin: 0; max-width: 60ch; }
	.back { justify-self: start; min-height: 2.75rem; display: inline-flex; align-items: center; color: var(--muted); font-weight: 650; text-decoration: none; }
	.title-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
	h1 { font-size: var(--text-2xl); }
	.balance { margin: 0; font-size: var(--text-xl); }
	.tiers { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-1); }
	.tiers button { padding-inline: var(--space-2); background: transparent; font-size: var(--text-sm); }
	.tiers button[aria-pressed='true'] { background: var(--text); color: var(--background); }
	.eras { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
	.era { display: grid; width: 100%; gap: 2px; padding: var(--space-1); text-align: left; background: transparent; border-color: transparent; }
	.era[aria-pressed='true'] { border-color: var(--accent); background: var(--surface); }
	.swatch { display: block; }
	.era-name { font-size: var(--text-sm); }
	.era-state { color: var(--muted); font: 400 var(--text-xs)/1.3 system-ui, sans-serif; overflow-wrap: anywhere; }
	.era-state.custom { color: var(--accent); }
	.editor { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-4); align-items: start; padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); }
	.preview { width: min(100%, 11rem); justify-self: center; }
	.controls { display: grid; gap: var(--space-3); min-width: 0; }
	.controls h2 { margin: 0; font-size: var(--text-lg); }
	.controls label { display: grid; gap: var(--space-1); font-size: var(--text-sm); font-weight: 650; }
	.controls select { width: 100%; min-width: 0; }
	.controls p { margin: 0; font-size: var(--text-sm); }
	.primary { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); }
	@media (min-width: 48rem) {
		.eras { grid-template-columns: repeat(8, minmax(0, 1fr)); }
		.editor { grid-template-columns: 14rem minmax(0, 1fr); }
		.preview { width: 100%; }
	}
</style>
