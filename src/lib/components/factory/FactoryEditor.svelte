<script lang="ts">
	import Card from '../../cards/Card.svelte';
	import type { CardViewModel } from '../../cards/view-model.ts';
	import type { CardEra } from '../../cards/era.ts';
	import { appearanceFor, COLORWAYS, finishName, itemsForTier, type CustomTier } from '../../cosmetics/catalogue.ts';
	import { equipCosmetic, readShop, resetEra, unlockAndEquip, type ShopSnapshot } from '../../cosmetics/ledger.ts';
	import { appearanceOf, choiceName, DECK, draftChoice, draftStatus, initialDraft, tierLabel, wornChoice, type FactoryDraft } from '../../cosmetics/factory.ts';
	import { shopState } from '../../cosmetics/store.svelte.ts';
	import { deviceDb } from '../../storage/db.ts';
	import { toasts } from '../../toast.svelte.ts';
	import FinishChoice from '../FinishChoice.svelte';
	import FinishSample from '../FinishSample.svelte';
	import TokenAmount from '../TokenAmount.svelte';
	import { ERA_FOIL } from '../../cards/surface/foil-plates.ts';
	import { ERA_HOLO } from '../../cards/surface/holo-films.ts';

	/** One era's finish editor: the card as it is now beside the draft, and one tray of choices. */
	let { tier, era, snapshot, card, busy = $bindable(false), onBack }: {
		tier: CustomTier;
		era: CardEra;
		snapshot: ShopSnapshot;
		card: CardViewModel | undefined;
		busy?: boolean;
		/** Handles a plain click on the All eras link, e.g. to return through history. */
		onBack: (event: MouseEvent) => void;
	} = $props();
	const uid = $props.id();
	const noDetails = () => {};

	let tab = $state<'pattern' | 'colorway'>('pattern');
	let draft = $state<FactoryDraft>({ itemId: DECK, colorway: null });
	// Reset the draft when the era, tier or its saved choice changes, not on every shop refresh.
	const savedKey = $derived(JSON.stringify([tier, era, snapshot.eras[tier]?.[era] ?? null]));
	$effect.pre(() => {
		void savedKey;
		draft = initialDraft(snapshot, tier, era);
	});
	$effect.pre(() => { if (tier !== 'gem') tab = 'pattern'; });

	const usingDeck = $derived(draft.itemId === DECK);
	const now = $derived(wornChoice(snapshot, tier, era));
	const next = $derived(draftChoice(snapshot, tier, draft));
	const status = $derived(draftStatus(snapshot, tier, era, draft));
	const owns = (id: string) => snapshot.owned.includes(id);
	const deck = $derived(snapshot.equipped[tier]);
	const items = $derived(itemsForTier(tier));
	const label = $derived(`${era} ${tierLabel(tier)}`);

	function choosePattern(itemId: string | null): void {
		draft = { itemId, colorway: usingDeck ? null : draft.colorway };
	}
	function chooseColorway(colorway: string | null): void {
		draft = { itemId: next.itemId, colorway };
	}

	async function commit(): Promise<void> {
		if (busy || status.unchanged || status.short) return;
		busy = true;
		try {
			const { db } = await deviceDb();
			if (usingDeck) await resetEra(db, tier, era);
			else if (status.needed.length) await unlockAndEquip(db, { tier, era }, draft.itemId as string | null, draft.colorway);
			else await equipCosmetic(db, { tier, era }, draft.itemId as string | null, draft.colorway);
			shopState.snapshot = await readShop(db);
			toasts.show(usingDeck ? `${label} cards follow your deck finish again.` : `Applied to your ${label} cards.`, { id: 'factory' });
		} catch (caught) {
			toasts.show(caught instanceof Error ? caught.message : 'The finish was not saved. Please retry.', { id: 'factory', tone: 'error' });
		} finally { busy = false; }
	}
</script>

{#snippet face(heading: string, appearance: ReturnType<typeof appearanceOf>, name: string, live: boolean)}
	<figure class="face" class:live>
		<figcaption><span class="face-label">{heading}</span><span class="face-name">{name}</span></figcaption>
		<!-- The draft's resolved material, era defaults included, for tests and tools that inspect the preview. -->
		<div class:preview={live} data-card={era} data-finish={tier} data-plate={appearance.plate ?? ERA_FOIL[era]}
			data-film={tier === 'gem' ? appearance.film ?? ERA_HOLO[era] : undefined} data-palette={tier === 'gem' ? appearance.palette : undefined}>
			{#if card}<Card s={card} {appearance} onDetails={noDetails} />
			{:else}<FinishSample {tier} {era} {appearance} />{/if}
		</div>
	</figure>
{/snippet}

<section class="editor" aria-labelledby="{uid}-heading">
	<header class="editor-head">
		<a class="back" href="/factory" onclick={onBack}>← All eras</a>
		<h2 id="{uid}-heading">{label}</h2>
	</header>
	<div class="bench">
		<div class="faces">
			{@render face('Now', appearanceOf(tier, now), choiceName(now), false)}
			{@render face(status.unchanged ? 'Applied' : 'New', appearanceOf(tier, next), usingDeck ? `Deck default · ${choiceName(next)}` : choiceName(next), true)}
		</div>
		<div class="commit">
			<button class="primary" type="button" disabled={busy || status.unchanged || status.short} onclick={() => void commit()}>
				{#if status.unchanged}Applied{:else if usingDeck}Use deck default{:else if status.needed.length}Unlock &amp; apply · <TokenAmount amount={status.needed.length} />{:else}Apply to {era} cards{/if}
			</button>
			{#if status.short}<p class="muted">You have {snapshot.balance}. Finish a season to earn a token. <a href="/">Play</a></p>{/if}
		</div>
	</div>

	<div class="tray">
		{#if tier === 'gem'}
			<div class="tabs" role="tablist" aria-label="Finish part">
				<button type="button" role="tab" id="{uid}-tab-pattern" aria-controls="{uid}-panel" aria-selected={tab === 'pattern'} onclick={() => tab = 'pattern'}>Pattern <span class="tab-value">{next.itemId ? choiceName({ itemId: next.itemId, colorway: null }) : 'Era original'}</span></button>
				<button type="button" role="tab" id="{uid}-tab-colorway" aria-controls="{uid}-panel" aria-selected={tab === 'colorway'} onclick={() => tab = 'colorway'}>Colorway <span class="tab-value">{next.colorway ? finishName({ name: next.colorway }) : 'Film original'}</span></button>
			</div>
		{/if}
		<div id="{uid}-panel" role={tier === 'gem' ? 'tabpanel' : undefined} aria-labelledby={tier === 'gem' ? `${uid}-tab-${tab}` : undefined}>
			{#if tab === 'pattern'}
				<fieldset disabled={busy}>
					<legend class:sr-only={tier === 'gem'}>{tier === 'gem' ? 'Holo pattern' : 'Foil finish'}</legend>
					<ul class="choices">
						<li><FinishChoice compact showCost={false} name="Deck default" {tier} {era}
							appearance={deck ? appearanceFor(deck.itemId, deck.colorway) : null}
							selected={usingDeck} status="Free" disabled={busy}
							onChoose={() => draft = { itemId: DECK, colorway: null }} /></li>
						<li><FinishChoice compact showCost={false} name="Era original" {tier} {era}
							appearance={appearanceFor(null, tier === 'gem' ? draft.colorway : null)}
							selected={!usingDeck && draft.itemId === null} status="Free" disabled={busy}
							onChoose={() => choosePattern(null)} /></li>
						{#each items as item (item.id)}
							<li><FinishChoice compact showCost={false} name={finishName(item)} {tier} {era}
								appearance={appearanceFor(item.id, tier === 'gem' ? next.colorway : null)} finishId={item.id}
								selected={draft.itemId === item.id} cost={item.cost} status={owns(item.id) ? 'Owned' : null}
								disabled={busy} onChoose={() => choosePattern(item.id)} /></li>
						{/each}
					</ul>
				</fieldset>
			{:else}
				<fieldset disabled={busy}>
					<legend class="sr-only">Colorway</legend>
					<ul class="choices">
						<li><FinishChoice compact showCost={false} name="Film original" {tier} {era}
							appearance={appearanceFor(next.itemId)}
							selected={next.colorway === null} status="Free" disabled={busy}
							onChoose={() => chooseColorway(null)} /></li>
						{#each COLORWAYS as option (option.id)}
							<li><FinishChoice compact showCost={false} name={finishName(option)} {tier} {era}
								appearance={appearanceFor(next.itemId, option.id)} finishId={`colorway:${option.id}`}
								selected={next.colorway === option.id} status={owns(`colorway:${option.id}`) ? 'Owned' : null}
								disabled={busy} onChoose={() => chooseColorway(option.id)} /></li>
						{/each}
					</ul>
				</fieldset>
			{/if}
		</div>
		<p class="tray-note muted">Each new pattern or colorway costs 1 token; owned ones are free to reuse.</p>
	</div>
</section>

<style>
	.editor { display: grid; gap: var(--space-5); min-width: 0; }
	.editor-head { display: grid; gap: var(--space-1); justify-items: start; }
	.back { display: inline-flex; align-items: center; min-height: 2.75rem; color: var(--muted); font-weight: 650; text-decoration: none; }
	.back:hover { color: var(--text); }
	h2 { font-size: var(--text-xl); }
	.bench { display: grid; gap: var(--space-4); }
	.faces { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); max-width: 34rem; }
	.face { display: grid; gap: var(--space-2); margin: 0; min-width: 0; }
	.face:not(.live) { opacity: .82; }
	figcaption { display: grid; gap: 2px; min-width: 0; }
	.face-label { color: var(--muted); font-size: var(--text-xs); font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
	.live .face-label { color: var(--accent); }
	.face-name { font: 600 var(--text-sm)/1.3 system-ui, sans-serif; overflow-wrap: anywhere; }
	.commit { display: grid; gap: var(--space-2); justify-items: start; }
	.commit p { margin: 0; font-size: var(--text-sm); }
	.primary { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); }
	.tray { display: grid; gap: var(--space-3); min-width: 0; }
	.tabs { display: flex; flex-wrap: wrap; gap: var(--space-1); border-bottom: 1px solid var(--border); }
	[role='tab'] { display: grid; gap: 2px; justify-items: start; min-height: 2.75rem; padding: var(--space-2) var(--space-3); border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: transparent; color: var(--muted); text-align: left; }
	[role='tab'][aria-selected='true'] { border-bottom-color: var(--accent); color: var(--text); }
	.tab-value { font: 400 var(--text-xs)/1.2 system-ui, sans-serif; color: var(--muted); }
	fieldset { min-width: 0; border: 0; padding: 0; margin: 0; }
	legend { margin-bottom: var(--space-2); font-size: var(--text-sm); font-weight: 650; }
	.choices { display: grid; grid-template-columns: repeat(auto-fill, minmax(4.5rem, 1fr)); gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
	.tray-note { margin: 0; font-size: var(--text-xs); }
	@media (min-width: 40rem) { .choices { grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr)); } }
	@media (min-width: 64rem) {
		.editor { grid-template-columns: minmax(22rem, 34rem) minmax(0, 1fr); grid-template-areas: 'head head' 'bench tray'; align-items: start; column-gap: var(--space-6); }
		.editor-head { grid-area: head; }
		.bench { grid-area: bench; position: sticky; top: var(--space-6); }
		.tray { grid-area: tray; }
	}
</style>
