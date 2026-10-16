<script lang="ts">
	import { onMount } from 'svelte';
	import FinishSample from '#lib/components/FinishSample.svelte';
	import TokenAmount from '#lib/components/TokenAmount.svelte';
	import FinishChoice from '#lib/components/FinishChoice.svelte';
	import CardBrowser from '#lib/components/CardBrowser.svelte';
	import { CARD_ERAS, type CardEra } from '#lib/cards/era.ts';
	import { appearanceFor, COLORWAYS, COSMETICS, finishName, itemsForTier, type CustomTier } from '#lib/cosmetics/catalogue.ts';
	import { equipCosmetic, readShop, resetEra, unlockAndEquip, unlocksFor, type EquippedFinish } from '#lib/cosmetics/ledger.ts';
	import { refreshShop, shopState } from '#lib/cosmetics/store.svelte.ts';
	import { deviceDb } from '#lib/storage/db.ts';
	import { toasts } from '#lib/toast.svelte.ts';

	// The factory equips finishes by era and tier; Shop only unlocks types.
	// Existing saved deck defaults remain available when an era has no override.
	const TIERS: readonly { value: CustomTier; label: string }[] = [
		{ value: 'gem', label: 'Gem holo' }, { value: 'foil', label: 'Silver foil' }, { value: 'emboss', label: 'Gold emboss' }
	];
	const DECK = 'deck';
	// Match Shop's comparison stock. Catalogue samples do not depend on the editor's era or draft,
	// so choosing a scope cannot rebuild every map and compile a new film/plate combination per tile.
	const sampleEra: CardEra = '1990s';
	const colorways = COLORWAYS.map(option => ({ ...option, appearance: appearanceFor('film:refractor', option.id) }));
	let tier = $state<CustomTier>('gem');
	let era = $state<CardEra>('1980s');
	let busy = $state(false);
	/** The unsaved choice for the selected era: deck default, the era's own finish (null), or an item. */
	let draft = $state<{ itemId: string | null | typeof DECK; colorway: string | null }>({ itemId: DECK, colorway: null });

	const snapshot = $derived(shopState.snapshot);
	const saved = (forTier: CustomTier, forEra: CardEra): EquippedFinish | undefined => snapshot?.eras[forTier]?.[forEra];
	const deckChoice = $derived(snapshot?.equipped[tier]);
	const owns = (id: string) => !!snapshot?.owned.includes(id);
	const items = $derived(itemsForTier(tier).map(item => ({ ...item, appearance: appearanceFor(item.id) })));
	const nameOf = (id: string | null) => {
		const item = id && COSMETICS.find(entry => entry.id === id);
		return item ? finishName(item) : 'Era original';
	};
	const describe = (choice: EquippedFinish | undefined) => !choice
		? 'Deck default'
		: `${nameOf(choice.itemId)}${choice.colorway ? ` · ${finishName({ name: choice.colorway })}` : ''}`;

	// Reset the editor to the saved choice when the era, tier or that saved choice changes, not on every shop refresh.
	const savedKey = $derived(JSON.stringify([tier, era, saved(tier, era) ?? null]));
	$effect.pre(() => {
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

	function choosePattern(itemId: string | null): void {
		draft = { itemId, colorway: usingDeck ? null : draft.colorway };
	}
	function chooseColorway(colorway: string | null): void {
		draft = { itemId: resolved.itemId, colorway };
	}

	async function commit(): Promise<void> {
		if (busy || unchanged) return;
		busy = true;
		const label = `${era} ${TIERS.find(entry => entry.value === tier)!.label} cards`;
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
	</header>
	{#if shopState.notice}<p class="notice" role="status">{shopState.notice}</p>{/if}
	{#if !snapshot && !shopState.notice}<p role="status">Loading finishes…</p>{/if}

	{#if snapshot}
	<CardBrowser label="Card factory" searchable={false} {busy}
		filters={TIERS} filter={tier} filterLegend="Card tier"
		onFilter={value => tier = value as CustomTier}>

	<ul class="eras" aria-label="Eras">
		{#each CARD_ERAS as option (option)}
			{@const choice = saved(tier, option)}
			<li>
				<button type="button" class="era" disabled={busy} aria-pressed={era === option} aria-label={`${option}, ${describe(choice)}`} onclick={() => era = option}>
					<span class="swatch" aria-hidden="true"><FinishSample {tier} era={option} appearance={choice ? appearanceFor(choice.itemId, choice.colorway) : deckChoice ? appearanceFor(deckChoice.itemId, deckChoice.colorway) : null} idle={false} /></span>
					<span class="era-name">{option}</span>
					<span class="era-state" class:custom={!!choice}>{describe(choice)}</span>
				</button>
			</li>
		{/each}
	</ul>

	<section class="editor" aria-labelledby="editor-heading">
		<div class="preview-panel">
			<div class="preview"><FinishSample {tier} {era} appearance={preview} /></div>
			<div class="selection">
				<h2 id="editor-heading">{era} {TIERS.find(entry => entry.value === tier)!.label}</h2>
				<p class="chosen">{usingDeck ? 'Deck default' : describe({ itemId: draft.itemId as string | null, colorway: draft.colorway })}</p>
			</div>
			<div class="commit">
				<button class="primary" type="button" disabled={busy || !snapshot || unchanged || short} onclick={() => void commit()}>
					{#if unchanged}Applied{:else if usingDeck}Use deck default{:else if needed.length}Unlock &amp; apply · <TokenAmount amount={needed.length} />{:else}Apply to {era} cards{/if}
				</button>
				{#if short}<p class="muted">{needed.length - (snapshot?.balance ?? 0)} more {needed.length - (snapshot?.balance ?? 0) === 1 ? 'token' : 'tokens'} needed. <a href="/">Play to earn</a></p>{/if}
			</div>
		</div>
		<div class="controls">
			<fieldset disabled={busy}>
				<legend>{tier === 'gem' ? 'Holo pattern' : 'Foil finish'}</legend>
				<div class="picker" role="region" aria-label="Pattern choices">
					<ul class="choices">
						<li><FinishChoice compact name="Deck default" {tier} {era}
							appearance={deckChoice ? appearanceFor(deckChoice.itemId, deckChoice.colorway) : null}
							selected={usingDeck} status="Free" disabled={busy}
							onChoose={() => draft = { itemId: DECK, colorway: null }} /></li>
						<li><FinishChoice compact name="Era original" {tier} {era}
							appearance={appearanceFor(null, tier === 'gem' ? draft.colorway : null)}
							selected={!usingDeck && draft.itemId === null} status="Free" disabled={busy}
							onChoose={() => choosePattern(null)} /></li>
						{#each items as item (item.id)}
							<li><FinishChoice compact name={finishName(item)} {tier} era={sampleEra}
								appearance={item.appearance} finishId={item.id}
								selected={draft.itemId === item.id} cost={item.cost} status={owns(item.id) ? 'Owned' : null}
								disabled={busy} onChoose={() => choosePattern(item.id)} /></li>
						{/each}
					</ul>
				</div>
			</fieldset>
			{#if tier === 'gem'}
				<fieldset disabled={busy}>
					<legend>Colorway</legend>
					<div class="picker colorways" role="region" aria-label="Colorway choices">
						<ul class="choices">
							<li><FinishChoice compact name="Film original" {tier} {era}
								appearance={appearanceFor(resolved.itemId)}
								selected={resolved.colorway === null} status="Free" disabled={busy}
								onChoose={() => chooseColorway(null)} /></li>
							{#each colorways as option (option.id)}
								<li><FinishChoice compact name={finishName(option)} {tier} era={sampleEra}
									appearance={option.appearance} finishId={`colorway:${option.id}`}
									selected={resolved.colorway === option.id} status={owns(`colorway:${option.id}`) ? 'Owned' : null}
									disabled={busy} onChoose={() => chooseColorway(option.id)} /></li>
							{/each}
						</ul>
					</div>
				</fieldset>
			{/if}
		</div>
	</section>
	</CardBrowser>
	{/if}
	<details class="factory-help">
		<summary>About era finishes</summary>
		<p>Shop unlocks finish types; Card factory equips them. Each choice applies only to this era and tier. Deck default keeps your saved deck-wide finish; Era original restores the era’s own pattern. Catalogue patterns use their original colors on shared stock; colorway samples use Refractor. The larger preview shows your exact era, pattern and colorway together. Each new pattern or colorway costs 1 token. Owned finishes are free to reuse. Cosmetic only, saved on this device.</p>
	</details>
</main>

<style>
	.factory { display: grid; gap: var(--space-5); width: min(100%, 84rem); min-width: 0; padding-block: var(--space-5) var(--space-8); }
	.intro { display: grid; gap: var(--space-2); }
	.intro p { margin: 0; max-width: 60ch; }
	.back { justify-self: start; min-height: 2.75rem; display: inline-flex; align-items: center; color: var(--muted); font-weight: 650; text-decoration: none; }
	.title-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
	h1 { font-size: var(--text-2xl); }
	.balance { margin: 0; font-size: var(--text-xl); }
	.eras { display: grid; grid-auto-flow: column; grid-auto-columns: 8.5rem; gap: var(--space-2); overflow-x: auto; overscroll-behavior-x: contain; margin: 0 0 var(--space-5); padding: var(--space-1); list-style: none; }
	.era { display: grid; grid-template-columns: 2rem minmax(0, 1fr); align-items: center; align-content: start; width: 100%; height: 100%; gap: 2px var(--space-2); padding: var(--space-2); text-align: left; background: transparent; border-color: transparent; }
	.era[aria-pressed='true'] { border-color: var(--accent); background: var(--surface); }
	.swatch { display: block; grid-row: span 2; }
	.era-name { font-size: var(--text-sm); }
	.era-state { color: var(--muted); font: 400 var(--text-xs)/1.3 system-ui, sans-serif; overflow-wrap: anywhere; }
	.era-state.custom { color: var(--accent); }
	.editor { display: grid; grid-template-areas: 'preview' 'choices'; gap: var(--space-5); align-items: start; min-width: 0; }
	.preview-panel { grid-area: preview; display: grid; grid-template-columns: 5rem minmax(0, 1fr); gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-lg); }
	.preview { grid-row: span 2; width: 100%; }
	.selection { align-self: end; }
	.selection h2 { font-size: var(--text-lg); }
	.chosen { margin: var(--space-2) 0 0; color: var(--muted); font-size: var(--text-sm); }
	.commit { display: grid; gap: var(--space-2); align-self: start; }
	.commit p { margin: 0; font-size: var(--text-sm); }
	.controls { grid-area: choices; display: grid; gap: var(--space-5); min-width: 0; }
	fieldset { min-width: 0; border: 0; padding: 0; margin: 0; }
	legend { margin-bottom: var(--space-2); font-size: var(--text-sm); font-weight: 650; }
	.picker { max-height: 20rem; overflow-y: auto; overscroll-behavior-y: contain; padding: var(--space-1); border: 1px solid var(--border); border-radius: var(--radius); }
	.choices { display: grid; grid-template-columns: repeat(auto-fill, minmax(4.75rem, 1fr)); gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
	.colorways { max-height: 14rem; }
	.primary { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); }
	.factory-help { border-top: 1px solid var(--border); color: var(--muted); font-size: var(--text-sm); }
	@media (min-width: 64rem) {
		.editor { grid-template-columns: minmax(0, 1fr) 16rem; grid-template-areas: 'choices preview'; gap: var(--space-6); }
		.preview-panel { grid-template-columns: minmax(0, 1fr); position: sticky; top: var(--space-6); padding: var(--space-4); }
		.preview { grid-row: auto; width: min(100%, 12rem); justify-self: center; }
	}
</style>
