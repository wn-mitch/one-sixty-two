<script module lang="ts">
	import type { CardViewModel } from '../../cards/view-model.ts';

	export interface SeriesRosterCard {
		seasonId: string;
		slot: string;
		view: CardViewModel;
	}
</script>

<script lang="ts">
	import { tableScroll } from '../table-scroll.ts';
	import InspectableCard from './InspectableCard.svelte';

	let { title, items }: { title: string; items: readonly SeriesRosterCard[] } = $props();
</script>

<section class="roster" aria-label={`${title} roster`}>
	<header>
		<h3>{title}</h3>
		<p>{items.length} exact seasons</p>
	</header>
	<div class="rail" role="list" aria-label={`${title} player cards`} use:tableScroll>
		{#each items as item (item.seasonId)}
			<div class="player" role="listitem">
				<InspectableCard s={item.view} compact caption={item.view.full} meta={`${item.slot} · ${item.view.year}`} />
			</div>
		{/each}
	</div>
</section>

<style>
	.roster { display: grid; gap: var(--space-3); min-width: 0; }
	header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: var(--space-1) var(--space-3); }
	h3, p { margin: 0; }
	h3 { font-size: var(--text-base); }
	p { color: var(--muted); font-size: var(--text-xs); }
	.rail { display: flex; gap: var(--space-3); width: 100%; min-width: 0; padding: var(--space-1) var(--space-1) var(--space-3); overflow-x: auto; overscroll-behavior-inline: contain; scroll-snap-type: x proximity; scrollbar-gutter: stable; }
	.rail:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
	.player { flex: 0 0 clamp(6.5rem, 21vw, 8rem); min-width: 0; scroll-snap-align: start; }
	@media (min-width: 48rem) {
		.player { flex-basis: 7.25rem; }
	}
</style>
