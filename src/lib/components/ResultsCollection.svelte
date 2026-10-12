<script lang="ts">
	import { onMount } from 'svelte';
	import Card from '../cards/Card.svelte';
	import type { CardViewModel } from '../cards/view-model.ts';
	import StickerBadge from '../collection/StickerBadge.svelte';
	import { STICKER_BY_KIND, STICKER_SPOTS, type PlacedSticker } from '../collection/stickers.ts';
	import { cardStickers } from '../collection/store.svelte.ts';
	import type { NewCard, NewSticker } from '../collection/collection.ts';
	import { appSettings } from '../game/settings.svelte.ts';
	import { MOTION } from '../motion-timing.ts';

	/** What this season added to the collection: new cards and new stickers, shown on the cards themselves. */
	let { newStickers, newCards, cardViews, selectedSeasonId, reviewId, onInspect }: {
		newStickers: readonly NewSticker[];
		newCards: readonly NewCard[];
		cardViews: ReadonlyMap<string, CardViewModel>;
		selectedSeasonId: string | null;
		reviewId: string;
		onInspect: (seasonId: string, trigger: HTMLButtonElement) => void;
	} = $props();

	const freshCards = $derived(new Set(newCards.map(card => card.seasonId)));
	const earned = $derived(Map.groupBy(newStickers, item => item.seasonId));
	/** Cards with new stickers first, then cards that are only new to the collection. */
	const entries = $derived([
		...[...earned.keys()].map(seasonId => ({ seasonId, label: earned.get(seasonId)![0].label })),
		...newCards.filter(card => !earned.has(card.seasonId))
	].filter(entry => cardViews.has(entry.seasonId)));
	const summary = $derived([
		newCards.length ? `${newCards.length} new ${newCards.length === 1 ? 'card' : 'cards'}` : '',
		newStickers.length ? `${newStickers.length} new ${newStickers.length === 1 ? 'sticker' : 'stickers'}` : ''
	].filter(Boolean).join(' · '));

	let open = $state(false);
	onMount(() => {
		// The drawer slides open once the record has landed, so it adds to the moment rather than competing with it.
		const timer = setTimeout(() => open = true, appSettings.effectiveEnabled ? MOTION.screenRise * 2 : 0);
		return () => clearTimeout(timer);
	});
	const noCardDetails = () => {};
	/** The card's saved stickers, plus any just earned that the sticker store has not loaded yet, at their default spots. */
	function shownStickers(seasonId: string, kinds: readonly string[]): PlacedSticker[] {
		const saved = cardStickers(seasonId);
		const pending = kinds.filter(kind => !saved.some(sticker => sticker.kind === kind)).map(kind => {
			const spot = STICKER_SPOTS[STICKER_BY_KIND.get(kind)!.family];
			return { kind, x: spot.x, y: spot.y, hidden: false, earnedAt: '' };
		});
		return [...saved, ...pending];
	}
</script>

{#if entries.length}
	<section class="collection-drawer" class:open aria-labelledby="collection-drawer-heading">
		<button type="button" class="drawer-toggle" aria-expanded={open} aria-controls="collection-drawer-body" onclick={() => open = !open}>
			<h3 id="collection-drawer-heading">Added to your collection</h3>
			<span class="muted">{summary}</span>
		</button>
		<div class="drawer-body" id="collection-drawer-body" inert={!open}>
			<div class="drawer-inner">
				<ul class="drawer-cards">
					{#each entries as entry, index (entry.seasonId)}
						{@const stickers = earned.get(entry.seasonId) ?? []}
						<li style:--sparkle-delay="{MOTION.screenRise * 2 + MOTION.deal + index * 140}ms">
							<button
								type="button"
								class="drawer-card"
								aria-label={`Inspect ${entry.label} card`}
								aria-expanded={selectedSeasonId === entry.seasonId}
								aria-controls={reviewId}
								onclick={event => onInspect(entry.seasonId, event.currentTarget)}
							>
								<span aria-hidden="true">
									<Card s={cardViews.get(entry.seasonId)!} face="front" stickers={shownStickers(entry.seasonId, stickers.map(item => item.kind))} freshStickers={new Set(stickers.map(item => item.kind))} onDetails={noCardDetails} />
								</span>
								{#if freshCards.has(entry.seasonId)}<span class="new-tag">New card</span>{/if}
							</button>
							<p class="caption"><strong>{entry.label}</strong></p>
							{#if stickers.length}
								<ul class="earned" aria-label={`New stickers for ${entry.label}`}>
									{#each stickers as item (item.kind)}
										<li><span class="badge" aria-hidden="true"><StickerBadge definition={STICKER_BY_KIND.get(item.kind)!} /></span>{item.title}</li>
									{/each}
								</ul>
							{:else}
								<p class="muted first">First time in your collection</p>
							{/if}
						</li>
					{/each}
				</ul>
				<a href="/collection">Open your collection</a>
			</div>
		</div>
	</section>
{/if}

<style>
	.collection-drawer { border-block: 1px solid var(--border); }
	.drawer-toggle { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-1) var(--space-3); width: 100%; min-height: 3rem; padding: var(--space-2) 0; border: 0; border-radius: 0; background: none; color: var(--text); text-align: left; }
	.drawer-toggle:hover { background: none; }
	.drawer-toggle::after { content: '›'; margin-left: auto; color: var(--muted); font-size: var(--text-lg); transition: rotate .15s; }
	.open .drawer-toggle::after { rotate: 90deg; }
	.drawer-toggle h3 { margin: 0; font-size: var(--text-lg); }
	.drawer-toggle .muted { font-size: var(--text-xs); }
	/* Grid rows animate from 0fr to 1fr, so the drawer slides to its content's height. */
	.drawer-body { display: grid; grid-template-rows: 0fr; transition: grid-template-rows var(--motion-deal) var(--ease-out); }
	.open .drawer-body { grid-template-rows: 1fr; }
	.drawer-inner { min-height: 0; overflow: hidden; }
	.drawer-cards { display: flex; gap: var(--space-5, 1.25rem); margin: 0; padding: var(--space-2) 0 var(--space-4); overflow-x: auto; list-style: none; scroll-snap-type: x proximity; }
	.drawer-cards > li { flex: none; display: grid; align-content: start; gap: var(--space-2); width: 9.5rem; scroll-snap-align: start; }
	.drawer-card { position: relative; display: block; width: 100%; padding: 0; border: 0; background: none; color: inherit; }
	.drawer-card:hover { background: none; }
	.drawer-card:focus-visible { outline: 3px solid var(--focus); outline-offset: 4px; }
	.new-tag { position: absolute; z-index: 5; top: -.5rem; left: 50%; translate: -50% 0; padding: .15rem .5rem; border-radius: 999px; background: var(--accent); color: var(--background); font-size: var(--text-xs); font-weight: 800; letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; }
	.caption { margin: 0; font-size: var(--text-sm); line-height: 1.25; }
	.earned { display: grid; gap: var(--space-1); margin: 0; padding: 0; list-style: none; color: var(--muted); font-size: var(--text-xs); }
	.earned li { display: flex; align-items: center; gap: var(--space-2); }
	.badge { flex: none; font-size: .08rem; padding: .15rem; line-height: 0; }
	.first { margin: 0; font-size: var(--text-xs); }
	.drawer-inner > a { display: inline-flex; align-items: center; min-height: 2.75rem; margin-bottom: var(--space-2); color: var(--accent); font-size: var(--text-sm); }
	:global([data-motion='off']) .drawer-body { transition: none; }
	@media (prefers-reduced-motion: reduce) { .drawer-body { transition: none; } }
</style>
