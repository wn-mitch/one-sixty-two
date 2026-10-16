<script lang="ts">
	import { onMount } from 'svelte';
	import Card from '../cards/Card.svelte';
	import type { CardViewModel } from '../cards/view-model.ts';
	import StickerBadge from '../collection/StickerBadge.svelte';
	import { stickerDefinition, STICKER_BY_KIND, STICKER_SPOTS, type PlacedSticker, type StickerDefinition, type StickerFamily } from '../collection/stickers.ts';
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
	/** Grade and team-record stickers go on every card the team rostered, so they read once for the whole team. */
	const teamWide = (item: NewSticker) => { const family = STICKER_BY_KIND.get(item.kind)?.family; return !!family && TEAM_FAMILIES.has(family); };
	const teamStickers = $derived([...Map.groupBy(newStickers.filter(teamWide), item => item.kind)]
		.map(([kind, items]) => ({ kind, count: items.length }))
		.sort((a, b) => (STICKER_BY_KIND.get(a.kind)?.family === 'grade' ? -1 : 0) - (STICKER_BY_KIND.get(b.kind)?.family === 'grade' ? -1 : 0)));
	const fresh = $derived(Map.groupBy(newStickers, item => item.seasonId));
	const earned = $derived(Map.groupBy(newStickers.filter(item => !teamWide(item)), item => item.seasonId));
	/** Cards with stickers of their own first, then cards that are only new to the collection. */
	const entries = $derived([
		...[...earned.keys()].map(seasonId => ({ seasonId, label: earned.get(seasonId)![0].label })),
		...newCards.filter(card => !earned.has(card.seasonId))
	].filter(entry => cardViews.has(entry.seasonId)));
	const personal = $derived(newStickers.length - newStickers.filter(teamWide).length);
	const summary = $derived([
		newCards.length ? `${newCards.length} new ${newCards.length === 1 ? 'card' : 'cards'}` : '',
		personal ? `${personal} new ${personal === 1 ? 'sticker' : 'stickers'}` : '',
		...teamStickers.map(({ kind }) => short(STICKER_BY_KIND.get(kind)!))
	].filter(Boolean).join(' · '));

	let open = $state(false);
	onMount(() => {
		// The drawer slides open once the record has landed, so it adds to the moment rather than competing with it.
		const timer = setTimeout(() => open = true, appSettings.effectiveEnabled ? MOTION.screenRise * 2 : 0);
		return () => clearTimeout(timer);
	});
	const noCardDetails = () => {};
	/** A sticker's short face text: "60 HR", "162–0". */
	const short = (definition: StickerDefinition) => { const [top, bottom] = definition.label; return bottom.startsWith('–') ? `${top}${bottom}` : `${top} ${bottom}`; };
	const TEAM_FAMILIES: ReadonlySet<StickerFamily> = new Set(['grade', 'team']);
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
				{#if teamStickers.length}
					<ul class="team-stickers" aria-label="Stickers for the whole team">
						{#each teamStickers as { kind, count } (kind)}
							{@const definition = STICKER_BY_KIND.get(kind)!}
							<li><span class="badge" aria-hidden="true"><StickerBadge {definition} /></span>{definition.family === 'grade' ? `${definition.label[0]} grade` : definition.title}<span class="muted">{` · on ${count} ${count === 1 ? 'card' : 'cards'}`}</span></li>
						{/each}
					</ul>
				{/if}
				<ul class="drawer-cards">
					{#each entries as entry, index (entry.seasonId)}
						{@const stickers = earned.get(entry.seasonId) ?? []}
						{@const freshKinds = (fresh.get(entry.seasonId) ?? []).map(item => item.kind)}
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
									<Card s={cardViews.get(entry.seasonId)!} face="front" stickers={shownStickers(entry.seasonId, freshKinds)} freshStickers={new Set(freshKinds)} onDetails={noCardDetails} />
								</span>
								{#if freshCards.has(entry.seasonId)}<span class="new-tag">New card</span>{/if}
							</button>
							<p class="caption"><strong>{entry.label}</strong></p>
							{#if stickers.length}
								<ul class="earned" aria-label={`New stickers for ${entry.label}`}>
									{#each stickers as item (item.kind)}
										{@const definition = stickerDefinition(cardStickers(entry.seasonId).find(sticker => sticker.kind === item.kind) ?? item)!}
										<li title={definition.title}><span class="badge" aria-hidden="true"><StickerBadge {definition} /></span><span aria-hidden="true">{short(definition)}</span><span class="sr-only">{definition.title}</span></li>
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
	.earned { display: flex; flex-wrap: wrap; gap: var(--space-1); margin: 0; padding: 0; list-style: none; font-size: var(--text-xs); font-weight: 650; }
	.earned .badge { font-size: .055rem; padding: 0; }
	/* Contains its screen-reader text, which would otherwise escape the drawer scroller and widen the page. */
	.earned li { position: relative; display: inline-flex; align-items: center; gap: var(--space-1); padding: .15rem .45rem .15rem .15rem; border: 1px solid var(--border); border-radius: 999px; line-height: 1; white-space: nowrap; }
	.team-stickers { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-5, 1.25rem); margin: var(--space-2) 0 var(--space-3); padding: 0; list-style: none; font-size: var(--text-sm); font-weight: 650; }
	.team-stickers li { display: flex; align-items: center; gap: var(--space-2); }
	.team-stickers .muted { font-weight: 500; }
	.badge { flex: none; font-size: .08rem; padding: .15rem; line-height: 0; }
	.first { margin: 0; font-size: var(--text-xs); }
	.drawer-inner > a { display: inline-flex; align-items: center; min-height: 2.75rem; margin-bottom: var(--space-2); color: var(--accent); font-size: var(--text-sm); }
	:global([data-motion='off']) .drawer-body { transition: none; }
	@media (prefers-reduced-motion: reduce) { .drawer-body { transition: none; } }
</style>
