<script lang="ts">
	import { tick } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { fade, slide } from 'svelte/transition';
	import { candidateGridMotion, createCandidateGridMotion } from '../../cards/grid-motion.ts';
	import CardBrowser from '../CardBrowser.svelte';
	import Card from '../../cards/Card.svelte';
	import type { CardViewModel } from '../../cards/view-model.ts';
	import type { CollectedCard } from '../../collection/collection.ts';
	import { faceStickers, type StickerFamily } from '../../collection/stickers.ts';
	import { completionPercent, shelveCollection, type Grouping } from '../../collection/shelves.ts';
	import { BULLPEN_SLOTS, HITTER_SLOTS, STARTER_SLOTS, type Candidate, type Franchise, type RosterSlot } from '../../game/types.ts';
	import { toasts } from '../../toast.svelte.ts';
	import { appSettings } from '../../game/settings.svelte.ts';
	import { MOTION } from '../../motion-timing.ts';
	import CollectionDetail from './CollectionDetail.svelte';

	interface Props {
		cards: readonly CollectedCard[];
		/** Card faces by player-season, for cards whose profiles have loaded. */
		views: ReadonlyMap<string, CardViewModel>;
		/** WAR/162 in each card's role, by player-season; cards without one sort last. */
		war?: ReadonlyMap<string, number>;
		/** The game data's player-seasons and clubs, for grouping and completion. */
		candidates: readonly Candidate[];
		franchises: readonly Franchise[];
		status: string;
		onMove: (seasonId: string, family: StickerFamily, x: number, y: number) => void | Promise<void>;
		onHide: (seasonId: string, family: StickerFamily, hidden: boolean) => void | Promise<void>;
	}
	let { cards, views, war = new Map(), candidates, franchises, status, onMove, onHide }: Props = $props();
	$effect(() => { if (status) toasts.show(status, { id: 'collection', tone: /blocked|full|not saved|off in this tab/i.test(status) ? 'error' : 'info' }); });

	/** A hitter position, the whole rotation (SP), the whole relief corps (RP), team bullpens (BP), or every card. */
	const POSITIONS: Record<string, readonly RosterSlot[]> = {
		...Object.fromEntries(HITTER_SLOTS.map(slot => [slot, [slot]])), SP: STARTER_SLOTS, RP: BULLPEN_SLOTS, BP: ['BP']
	};
	type Sort = 'recent' | 'drafted' | 'year' | 'war';
	const SORTS: readonly { value: Sort; label: string }[] = [
		{ value: 'recent', label: 'Recent' }, { value: 'drafted', label: 'Drafted' }, { value: 'year', label: 'Year' }, { value: 'war', label: 'WAR' }
	];
	let position = $state('All');
	let query = $state('');
	let stickeredOnly = $state(false);
	let sort = $state<Sort>('recent');
	let descending = $state(true);
	let grouping = $state<Grouping>('none');
	let chosen = $state<string | null>(null);
	let detail = $state<HTMLElement>();
	const gridMotion = createCandidateGridMotion();

	const playsAt = (card: CollectedCard, option: string) => option === 'All' || POSITIONS[option].some(slot => card.slots.includes(slot));
	const year = (card: CollectedCard) => Number(card.seasonId.split(':')[1]) || 0;
	const searched = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		return cards.filter(card => (!needle || card.label.toLowerCase().includes(needle)) && (!stickeredOnly || faceStickers(card.stickers).length > 0));
	});
	const positions = $derived([
		{ value: 'All', count: searched.length },
		...Object.keys(POSITIONS).map(value => ({ value, count: searched.filter(card => playsAt(card, value)).length })).filter(option => option.count > 0)
	]);
	const activePosition = $derived(positions.some(option => option.value === position) ? position : 'All');
	/** Natural order first (newest, most, latest, highest); the toggle reverses it. Cards without WAR stay last. */
	const compare = (a: CollectedCard, b: CollectedCard): number => {
		if (sort === 'war') {
			const left = war.get(a.seasonId), right = war.get(b.seasonId);
			if (left === undefined || right === undefined) return Number(left === undefined) - Number(right === undefined);
			return right - left;
		}
		return sort === 'drafted' ? b.times - a.times : sort === 'year' ? year(b) - year(a) : b.lastAt.localeCompare(a.lastAt);
	};
	const shown = $derived(searched
		.filter(card => playsAt(card, activePosition))
		.toSorted((a, b) => {
			const order = compare(a, b);
			const missing = sort === 'war' && (war.get(a.seasonId) === undefined || war.get(b.seasonId) === undefined);
			return (descending || missing ? order : -order) || b.lastAt.localeCompare(a.lastAt) || a.label.localeCompare(b.label);
		}));

	/** Cards slide to their new places when the order or the filter changes, like a hand being re-sorted. */
	async function reshuffle(change: () => void, style: 'gather' | 'reflow' = 'gather'): Promise<void> {
		const revision = gridMotion.capture();
		change();
		await tick();
		gridMotion.play(revision, style);
	}
	/** Search reflows from the order before the keystroke; the input has already changed the query. */
	let searchRevision = 0;
	const beforeSearch = () => { searchRevision = gridMotion.capture(); };
	const afterSearch = () => void tick().then(() => gridMotion.play(searchRevision, 'reflow'));
	/** The binder opens by dealing its first screen of cards onto the table. */
	let dealt = false;
	$effect(() => {
		if (dealt || !cards.length) return;
		dealt = true;
		void tick().then(() => gridMotion.enter());
	});
	const chooseSort = (value: string) => reshuffle(() => {
		if (value === sort) descending = !descending;
		else { sort = value as Sort; descending = true; }
	});
	const progress = $derived(shelveCollection(cards, shown, candidates, franchises, grouping));
	const stickerTotal = $derived(cards.reduce((sum, card) => sum + faceStickers(card.stickers).length, 0));
	const selected = $derived(cards.find(card => card.seasonId === chosen) ?? null);
	const noDetails = () => {};
	/** The detail panel unfolds above the grid and folds away on close; a different card fades in within the open panel. */
	const motion = $derived(appSettings.effectiveEnabled);

	async function open(seasonId: string): Promise<void> {
		chosen = seasonId;
		await tick();
		detail?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
		detail?.querySelector<HTMLElement>('h2')?.focus();
	}
</script>

{#if !cards.length}
	<section class="empty">
		<h2>No cards yet</h2>
		<p class="muted">Finish a season and every card on that roster joins your collection.</p>
		<a class="button" href="/">Start a draft</a>
	</section>
{:else}
	<p class="count"><strong>{cards.length}</strong> {cards.length === 1 ? 'card' : 'cards'} · <strong>{progress.owned.toLocaleString('en-US')}</strong> of {progress.total.toLocaleString('en-US')} player-seasons, <strong>{completionPercent(progress.owned, progress.total)}</strong> · <strong>{stickerTotal}</strong> {stickerTotal === 1 ? 'sticker' : 'stickers'}</p>

	<CardBrowser label="Your collection" bind:query searchLabel="Find a card" onBeforeSearch={beforeSearch} onSearch={afterSearch}
		sorts={SORTS} {sort} {descending} onSort={chooseSort}
		filters={positions} filter={activePosition} filterLegend="Played at" filterToggle="Positions" onFilter={value => reshuffle(() => position = value)}>
		{#snippet rail()}
			<label class="rail-control">Group
				<select bind:value={grouping}>
					<option value="none">No grouping</option>
					<option value="team">Team</option>
					<option value="era">Era</option>
				</select>
			</label>
			<label class="check"><input type="checkbox" checked={stickeredOnly} onchange={event => { const checked = event.currentTarget.checked; void reshuffle(() => stickeredOnly = checked); }} /> With stickers</label>
		{/snippet}
		<div class="results" use:candidateGridMotion={gridMotion}>
		{#if selected}
			<div class="detail-slot" bind:this={detail} transition:slide={{ duration: motion ? MOTION.screenRise : 0, easing: cubicOut }}>
				{#key selected.seasonId}
					<div in:fade={{ duration: motion ? MOTION.gridEnter : 0 }}>
						<CollectionDetail card={selected} view={views.get(selected.seasonId) ?? null} {onMove} {onHide} onClose={() => { chosen = null; }} />
					</div>
				{/key}
			</div>
		{/if}

		{#snippet grid(list: readonly CollectedCard[], label: string)}
			<ul class="grid" aria-label={label}>
				{#each list as card (card.seasonId)}
					{@const view = views.get(card.seasonId)}
					<li data-candidate-group={card.seasonId}>
						<button type="button" class="tile" aria-pressed={chosen === card.seasonId} onclick={() => void open(card.seasonId)}>
							<span class="art" aria-hidden="true">
								{#if view}<Card s={view} face="front" interactive={false} stickers={card.stickers} onDetails={noDetails} />{:else}<span class="placeholder"></span>{/if}
							</span>
							<span class="name">{card.label}</span>
							<span class="meta">Drafted {card.times}× · best {card.best.wins}–{card.best.losses}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/snippet}

		{#if !shown.length}
			<p class="muted">No cards match these filters.</p>
		{:else if grouping === 'none'}
			{@render grid(shown, 'Collected cards')}
		{:else}
			{#each progress.shelves as shelf (shelf.key)}
				<section class="shelf" aria-labelledby="shelf-{shelf.key}">
					<h2 id="shelf-{shelf.key}">{shelf.label}{#if shelf.total}<span class="shelf-count">{shelf.owned} of {shelf.total.toLocaleString('en-US')} · {completionPercent(shelf.owned, shelf.total)}</span>{/if}</h2>
					{@render grid(shelf.cards, `${shelf.label} cards`)}
				</section>
			{/each}
		{/if}
		</div>
	</CardBrowser>
{/if}

<style>
	.empty { display: grid; justify-items: start; gap: var(--space-3); padding: var(--space-8) 0; }
	.empty h2 { margin: 0; }
	.empty p { margin: 0; }
	.button { min-height: 2.75rem; display: inline-flex; align-items: center; padding-inline: var(--space-4); border-radius: var(--radius, .5rem); background: var(--accent); color: var(--background); font-weight: 750; text-decoration: none; }
	.count { margin: 0 0 var(--space-4); color: var(--muted); font-size: var(--text-sm); }
	.rail-control { margin-bottom: var(--space-3); }
	.rail-control select { width: 100%; }
	.count strong { color: var(--text); }
	label { display: grid; gap: var(--space-1); color: var(--muted); font-size: var(--text-xs); }
	label.check { display: inline-flex; align-items: center; gap: var(--space-2); min-height: 2.75rem; font-size: var(--text-sm); color: var(--text); }
	select { min-height: 2.75rem; padding-inline: var(--space-3); border: 1px solid var(--border); border-radius: .5rem; background: var(--surface); color: var(--text); font: inherit; font-size: var(--text-sm); }
	/* The panel's breathing room above the grid lives inside it, so it folds away with the panel. */
	.detail-slot { padding-bottom: var(--space-6); }
	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(10.5rem, 42vw), 1fr)); gap: var(--space-5) var(--space-4); margin: 0; padding: 0; list-style: none; }
	.tile { display: grid; gap: var(--space-2); width: 100%; padding: var(--space-2); border: 1px solid transparent; border-radius: .75rem; background: none; color: var(--text); text-align: left; font: inherit; cursor: pointer; }
	.tile:hover { background: var(--surface); }
	.tile[aria-pressed='true'] { border-color: var(--focus); background: var(--surface); }
	.tile:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
	.art { display: block; }
	.placeholder { display: block; aspect-ratio: 5 / 7; border-radius: .5rem; background: var(--surface-raised); }
	.name { font-weight: 750; font-size: var(--text-sm); line-height: 1.25; overflow-wrap: anywhere; }
	.meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-2); color: var(--muted); font-size: var(--text-xs); }
	.shelf { display: grid; gap: var(--space-3); }
	.shelf h2 { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-1) var(--space-3); margin: var(--space-2) 0 0; padding-bottom: var(--space-2); border-bottom: 1px solid var(--border); font-size: var(--text-lg); }
	.shelf-count { color: var(--muted); font-size: var(--text-sm); font-weight: 650; font-variant-numeric: tabular-nums; }
</style>
