<script lang="ts">
	import { tick } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { fade, slide } from 'svelte/transition';
	import { candidateGridMotion, createCandidateGridMotion } from '../../cards/grid-motion.ts';
	import CardBrowser from '../CardBrowser.svelte';
	import { tableScroll } from '../table-scroll.ts';
	import Card from '../../cards/Card.svelte';
	import type { CardViewModel } from '../../cards/view-model.ts';
	import { bestWar, type CollectedCard } from '../../collection/collection.ts';
	import { holds, stickerAlbum } from '../../collection/album.ts';
	import { faceStickers, familyStickers, STICKER_BY_KIND, STICKERS, type StickerFamily } from '../../collection/stickers.ts';
	import { completionPercent, shelveCollection, stackCollection, type CollectionStack, type Grouping } from '../../collection/shelves.ts';
	import { loadStackCoverPreferences, saveStackCoverPreferences } from '../../collection/stack-preferences.ts';
	import { BULLPEN_SLOTS, HITTER_SLOTS, STARTER_SLOTS, type Candidate, type Franchise, type RosterSlot } from '../../game/types.ts';
	import { toasts } from '../../toast.svelte.ts';
	import { appSettings } from '../../game/settings.svelte.ts';
	import { MOTION } from '../../motion-timing.ts';
	import CollectionDetail from './CollectionDetail.svelte';
	import StickerAlbum from './StickerAlbum.svelte';

	interface Props {
		cards: readonly CollectedCard[];
		/** Card faces by player-season, for cards whose profiles have loaded. */
		views: ReadonlyMap<string, CardViewModel>;
		/** Historical WAR/162 in each card's role, by player-season; cards without one sort last. */
		war?: ReadonlyMap<string, number>;
		/** The game data's player-seasons and clubs, for grouping and completion. */
		candidates: readonly Candidate[];
		franchises: readonly Franchise[];
		status: string;
		/** Sticker kinds earned since the player last opened the collection, by player-season. */
		fresh?: ReadonlyMap<string, ReadonlySet<string>>;
		onMove: (seasonId: string, family: StickerFamily, x: number, y: number) => void | Promise<void>;
		onHide: (seasonId: string, family: StickerFamily, hidden: boolean) => void | Promise<void>;
	}
	let { cards, views, war = new Map(), candidates, franchises, status, fresh = new Map(), onMove, onHide }: Props = $props();
	$effect(() => { if (status) toasts.show(status, { id: 'collection', tone: /blocked|full|not saved|off in this tab/i.test(status) ? 'error' : 'info' }); });

	/** A hitter position, the whole rotation (SP), the whole relief corps (RP), team bullpens (BP), or every card. */
	const POSITIONS: Record<string, readonly RosterSlot[]> = {
		...Object.fromEntries(HITTER_SLOTS.map(slot => [slot, [slot]])), SP: STARTER_SLOTS, RP: BULLPEN_SLOTS, BP: ['BP']
	};
	/** WAR sorts by historical WAR/162; Best WAR by the most WAR the card produced in one season on your teams. */
	type Sort = 'recent' | 'drafted' | 'year' | 'war' | 'bestWar';
	const SORTS: readonly { value: Sort; label: string }[] = [
		{ value: 'recent', label: 'Recent' }, { value: 'drafted', label: 'Drafted' }, { value: 'year', label: 'Year' }, { value: 'war', label: 'WAR' }, { value: 'bestWar', label: 'Best WAR' }
	];
	let view = $state<'cards' | 'stickers'>('cards');
	let display = $state<'players' | 'seasons'>('players');
	let position = $state('All');
	let query = $state('');
	let stickeredOnly = $state(false);
	/** A sticker kind chosen in the album: only cards holding it (or a higher tier) show. */
	let stickerKind = $state<string | null>(null);
	let sort = $state<Sort>('recent');
	let descending = $state(true);
	let grouping = $state<Grouping>('none');
	let chosen = $state<string | null>(null);
	let stackKey = $state<string | null>(null);
	let detail = $state<HTMLElement>();
	let coverPreferences = $state(loadStackCoverPreferences());
	let preferenceStatus = $state('');
	/** Fresh stickers for the open panel: each card's slap on and sparkle once per visit. */
	let panelFresh = $state<ReadonlySet<string> | undefined>(undefined);
	const slapped = new Set<string>();
	const gridMotion = createCandidateGridMotion();

	const playsAt = (card: CollectedCard, option: string) => option === 'All' || POSITIONS[option].some(slot => card.slots.includes(slot));
	const year = (card: CollectedCard) => Number(card.seasonId.split(':')[1]) || 0;
	const topTier = (family: StickerFamily) => Math.max(...STICKERS.filter(item => item.family === family).map(item => item.tier));
	const stickerFilter = $derived(stickerKind ? STICKER_BY_KIND.get(stickerKind) ?? null : null);
	const searched = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		return cards.filter(card => (!needle || card.label.toLowerCase().includes(needle))
			&& (!stickeredOnly || faceStickers(card.stickers).length > 0)
			&& (!stickerFilter || holds(card, stickerFilter)));
	});
	const positions = $derived([
		{ value: 'All', count: searched.length },
		...Object.keys(POSITIONS).map(value => ({ value, count: searched.filter(card => playsAt(card, value)).length })).filter(option => option.count > 0)
	]);
	const activePosition = $derived(positions.some(option => option.value === position) ? position : 'All');
	const peaks = $derived(new Map(cards.map(card => [card.seasonId, bestWar(card)])));
	/** The WAR sorts' value for a card, where it has one; cards without one stay last in either direction. */
	const metric = (card: CollectedCard): number | undefined => sort === 'war' ? war.get(card.seasonId) : sort === 'bestWar' ? peaks.get(card.seasonId) ?? undefined : undefined;
	const byMetric = $derived(sort === 'war' || sort === 'bestWar');
	/** Natural order first (newest, most, latest, highest); the toggle reverses it. */
	const compare = (a: CollectedCard, b: CollectedCard): number => {
		if (byMetric) {
			const left = metric(a), right = metric(b);
			if (left === undefined || right === undefined) return Number(left === undefined) - Number(right === undefined);
			return right - left;
		}
		return sort === 'drafted' ? b.times - a.times : sort === 'year' ? year(b) - year(a) : b.lastAt.localeCompare(a.lastAt);
	};
	const shown = $derived(searched
		.filter(card => playsAt(card, activePosition))
		.toSorted((a, b) => {
			const order = compare(a, b);
			const missing = byMetric && (metric(a) === undefined || metric(b) === undefined);
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
		if (dealt || !cards.length || view !== 'cards') return;
		dealt = true;
		void tick().then(() => gridMotion.enter());
	});
	const chooseSort = (value: string) => reshuffle(() => {
		if (value === sort) descending = !descending;
		else { sort = value as Sort; descending = true; }
	});
	const progress = $derived(shelveCollection(cards, shown, candidates, franchises, grouping));
	const stacks = $derived(stackCollection(shown, candidates));
	const album = $derived(stickerAlbum(cards));
	const selected = $derived(shown.find(card => card.seasonId === chosen) ?? null);
	const selectedStack = $derived(stackKey ? stacks.find(stack => stack.key === stackKey) ?? null : null);
	const stackCover = (stack: CollectionStack): CollectedCard => {
		const preferred = coverPreferences[stack.key];
		return stack.cards.find(card => card.seasonId === preferred) ?? stack.cards[0];
	};
	$effect(() => {
		if (chosen && !shown.some(card => card.seasonId === chosen)) {
			chosen = null;
			stackKey = null;
		}
		if (stackKey && !stacks.some(stack => stack.key === stackKey)) stackKey = null;
	});
	const noDetails = () => {};
	/** The detail panel unfolds above the grid and folds away on close; a different card fades in within the open panel. */
	const motion = $derived(appSettings.effectiveEnabled);
	const stickerCount = (card: CollectedCard) => familyStickers(card.stickers).length;

	async function open(seasonId: string): Promise<void> {
		panelFresh = slapped.has(seasonId) ? undefined : fresh.get(seasonId);
		slapped.add(seasonId);
		chosen = seasonId;
		const candidate = candidates.find(item => item.seasonId === seasonId);
		if (display === 'players' && grouping === 'none') {
			stackKey = candidate?.eligibleSlots.includes('BP') ? `bullpen:${seasonId}` : candidate?.playerId ?? `season:${seasonId}`;
		}
		await tick();
		detail?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
		detail?.querySelector<HTMLElement>('h2')?.focus();
	}

	function setCover(stack: CollectionStack, seasonId: string): void {
		const next = { ...coverPreferences, [stack.key]: seasonId };
		coverPreferences = next;
		if (!saveStackCoverPreferences(next)) {
			preferenceStatus = 'Cover choice is active for this visit, but browser storage is unavailable, so it will not survive reload.';
			toasts.show(preferenceStatus, { id: 'collection-cover', tone: 'error' });
		} else {
			preferenceStatus = 'Cover choice saved on this device.';
		}
	}

	async function chooseSticker(kind: string): Promise<void> {
		stickerKind = kind;
		position = 'All';
		query = '';
		chosen = null;
		view = 'cards';
		await tick();
		document.getElementById('collection-views')?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
	}
</script>

{#if !cards.length}
	<section class="empty">
		<h2>No cards yet</h2>
		<p class="muted">Finish a season and every card on that roster joins your collection, with the stickers its season earned.</p>
		<a class="button" href="/">Start a draft</a>
	</section>
{:else}
	<div class="summary" id="collection-views">
		<p class="count">
			<span><strong>{cards.length}</strong> {cards.length === 1 ? 'card' : 'cards'} · <strong>{progress.owned.toLocaleString('en-US')}</strong> of {progress.total.toLocaleString('en-US')} player-seasons, <strong>{completionPercent(progress.owned, progress.total)}</strong></span>
			<span><strong>{album.earned}</strong> of {album.total} sticker kinds · <strong>{album.held}</strong> on your cards</span>
		</p>
		<div class="views" role="group" aria-label="Show">
			<button type="button" aria-pressed={view === 'cards'} onclick={() => { view = 'cards'; }}>Cards</button>
			<button type="button" aria-pressed={view === 'stickers'} onclick={() => { view = 'stickers'; chosen = null; stackKey = null; }}>Stickers</button>
		</div>
		{#if view === 'cards'}
			<div class="modes" role="group" aria-label="Card layout">
				<button type="button" aria-pressed={display === 'players'} onclick={() => { display = 'players'; grouping = 'none'; chosen = null; stackKey = null; }}>Player stacks</button>
				<button type="button" aria-pressed={display === 'seasons'} onclick={() => { display = 'seasons'; chosen = null; stackKey = null; }}>All seasons</button>
			</div>
		{/if}
	</div>

	{#if view === 'stickers'}
		<StickerAlbum {album} onChoose={kind => void chooseSticker(kind)} />
	{:else}
	<CardBrowser label="Your collection" bind:query searchLabel="Find a card" onBeforeSearch={beforeSearch} onSearch={afterSearch}
		sorts={SORTS} {sort} {descending} onSort={chooseSort}
		filters={positions} filter={activePosition} filterLegend="Played at" filterToggle="Filters" onFilter={value => reshuffle(() => position = value)}>
		{#snippet filterExtras()}
			<div class="extras">
				{#if display === 'seasons'}
				<label class="rail-control">Group
					<select bind:value={grouping}>
						<option value="none">No grouping</option>
						<option value="team">Team</option>
						<option value="era">Era</option>
					</select>
				</label>
				{/if}
				<label class="check"><input type="checkbox" checked={stickeredOnly} onchange={event => { const checked = event.currentTarget.checked; void reshuffle(() => stickeredOnly = checked); }} /> With stickers</label>
			</div>
		{/snippet}
		<div class="results" use:candidateGridMotion={gridMotion}>
		{#if stickerFilter}
			<p class="holding">
				<span>Cards holding <strong>{stickerFilter.title}</strong>{#if stickerFilter.family !== 'grade' && stickerFilter.tier < topTier(stickerFilter.family)}, or better{/if}</span>
				<button type="button" class="clear" onclick={() => reshuffle(() => { stickerKind = null; })}>Show all cards</button>
			</p>
		{/if}
		{#if display === 'players' && grouping === 'none' && selectedStack && selected}
			<section class="stack-panel" bind:this={detail} aria-labelledby="stack-heading">
				<header class="stack-head">
					<div>
						<h2 id="stack-heading" tabindex="-1">{views.get(selectedStack.cards[0].seasonId)?.full ?? selectedStack.label}</h2>
						<p class="muted">{selectedStack.cards.length} {selectedStack.cards.length === 1 ? 'season' : 'seasons'} in this filtered view</p>
					</div>
					<button type="button" class="quiet close" onclick={() => { chosen = null; stackKey = null; }}>Close</button>
				</header>
				<div class="season-rail" role="region" aria-label="Owned seasons" use:tableScroll>
					{#each selectedStack.cards as card (card.seasonId)}
						{@const face = views.get(card.seasonId)}
						<article class="season-item" class:current={selected.seasonId === card.seasonId}>
							<button type="button" class="season-card" aria-label={`Open ${card.label}`} aria-pressed={selected.seasonId === card.seasonId} onclick={() => void open(card.seasonId)}>
								{#if face}<Card s={face} face="front" stickers={card.stickers} onDetails={noDetails} />{:else}<span class="placeholder"></span>{/if}
								<strong>{year(card)}</strong>
							</button>
							<button type="button" class="cover-button" onclick={() => setCover(selectedStack, card.seasonId)}>{coverPreferences[selectedStack.key] === card.seasonId ? 'Cover' : 'Set as cover'}</button>
						</article>
					{/each}
				</div>
				{#if preferenceStatus}<p class="preference-status" role="status">{preferenceStatus}</p>{/if}
				<div class="detail-slot">
					{#key selected.seasonId}
						<div in:fade={{ duration: motion ? MOTION.gridEnter : 0 }}>
							<CollectionDetail card={selected} view={views.get(selected.seasonId) ?? null} fresh={panelFresh} {onMove} {onHide} onClose={() => { chosen = null; stackKey = null; }} />
						</div>
					{/key}
				</div>
			</section>
		{:else if selected}
			<div class="detail-slot" bind:this={detail} transition:slide={{ duration: motion ? MOTION.screenRise : 0, easing: cubicOut }}>
				{#key selected.seasonId}
					<div in:fade={{ duration: motion ? MOTION.gridEnter : 0 }}>
						<CollectionDetail card={selected} view={views.get(selected.seasonId) ?? null} fresh={panelFresh} {onMove} {onHide} onClose={() => { chosen = null; stackKey = null; }} />
					</div>
				{/key}
			</div>
		{/if}

		{#snippet stackGrid(list: readonly CollectionStack[], label: string)}
			<ul class="grid" aria-label={label}>
				{#each list as stack (stack.key)}
					{@const cover = stackCover(stack)}
					{@const face = views.get(cover.seasonId)}
					{@const count = stickerCount(cover)}
					<li data-candidate-group={stack.key}>
						<button type="button" class="tile stack-tile" aria-pressed={stackKey === stack.key} onclick={() => void open(cover.seasonId)}>
							<span class="art" aria-hidden="true">
								{#if face}<Card s={face} face="front" stickers={cover.stickers} onDetails={noDetails} />{:else}<span class="placeholder"></span>{/if}
							</span>
							<span class="name">{face?.full ?? stack.label}</span>
							<span class="meta">{stack.cards.length} {stack.cards.length === 1 ? 'season' : 'seasons'} · drafted {cover.times}×{#if count}<span class="chip">{count} {count === 1 ? 'sticker' : 'stickers'}</span>{/if}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/snippet}

		{#snippet grid(list: readonly CollectedCard[], label: string)}
			<ul class="grid" aria-label={label}>
				{#each list as card (card.seasonId)}
					{@const face = views.get(card.seasonId)}
					{@const count = stickerCount(card)}
					<li data-candidate-group={card.seasonId}>
						<button type="button" class="tile" aria-pressed={chosen === card.seasonId} onclick={() => void open(card.seasonId)}>
							<span class="art" aria-hidden="true">
								{#if face}<Card s={face} face="front" stickers={card.stickers} onDetails={noDetails} />{:else}<span class="placeholder"></span>{/if}
							</span>
							<span class="name">{card.label}</span>
							<span class="meta">Drafted {card.times}× · best {card.best.wins}–{card.best.losses}{#if count}<span class="chip">{count} {count === 1 ? 'sticker' : 'stickers'}</span>{/if}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/snippet}

		{#if !shown.length}
			<p class="muted">No cards match these filters.</p>
		{:else if grouping === 'none' && display === 'players'}
			{@render stackGrid(stacks, 'Collected players')}
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
{/if}

<style>
	.empty { display: grid; justify-items: start; gap: var(--space-3); padding: var(--space-8) 0; }
	.empty h2 { margin: 0; }
	.empty p { margin: 0; }
	.button { min-height: 2.75rem; display: inline-flex; align-items: center; padding-inline: var(--space-4); border-radius: var(--radius, .5rem); background: var(--accent); color: var(--background); font-weight: 750; text-decoration: none; }
	.summary { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3) var(--space-6); margin-bottom: var(--space-4); scroll-margin-top: 72px; }
	.count { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); margin: 0; color: var(--muted); font-size: var(--text-sm); }
	.count strong { color: var(--text); }
	.views { display: inline-flex; gap: 3px; padding: 2px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--background); }
	.views button { min-height: 2.75rem; padding: 0 var(--space-4); border: 0; background: transparent; color: var(--muted); font-weight: 700; }
	.views button[aria-pressed='true'], .modes button[aria-pressed='true'] { background: var(--text); color: var(--background); }
	.modes { display: inline-flex; gap: 3px; padding: 2px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--background); }
	.modes button { min-height: 2.75rem; padding: 0 var(--space-3); border: 0; background: transparent; color: var(--muted); font-weight: 700; }
	.extras { display: grid; gap: var(--space-2); margin-top: var(--space-3); }
	.rail-control select { width: 100%; }
	label { display: grid; gap: var(--space-1); color: var(--muted); font-size: var(--text-xs); }
	label.check { display: inline-flex; align-items: center; gap: var(--space-2); min-height: 2.75rem; font-size: var(--text-sm); color: var(--text); }
	select { min-height: 2.75rem; padding-inline: var(--space-3); border: 1px solid var(--border); border-radius: .5rem; background: var(--surface); color: var(--text); font: inherit; font-size: var(--text-sm); }
	@media (max-width: 47.99rem) { .extras { grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: var(--space-4); } }
	.holding { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-4); margin: 0 0 var(--space-4); padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4); border: 1px solid var(--border); border-radius: .5rem; background: var(--surface); font-size: var(--text-sm); }
	.clear { min-height: 2.75rem; }
	.results, .stack-panel, .detail-slot { min-width: 0; }
	.stack-panel { display: grid; gap: var(--space-4); margin-bottom: var(--space-6); padding: var(--space-4); border: 1px solid var(--border); border-radius: .75rem; background: var(--surface); }
	.stack-head { display: flex; align-items: start; justify-content: space-between; gap: var(--space-3); min-width: 0; }
	.stack-head h2 { margin: 0; font-size: var(--text-xl); overflow-wrap: anywhere; }
	.stack-head p { margin: var(--space-1) 0 0; }
	.season-rail { display: flex; gap: var(--space-3); min-width: 0; overflow-x: auto; padding: 0 0 var(--space-2); scroll-snap-type: x proximity; }
	.season-item { display: grid; flex: 0 0 min(10rem, 40vw); gap: var(--space-1); min-width: 0; scroll-snap-align: start; }
	.season-card { display: grid; gap: var(--space-1); min-width: 0; padding: var(--space-2); border: 1px solid transparent; border-radius: .5rem; background: transparent; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
	.season-card:hover, .season-item.current .season-card { border-color: var(--focus); background: var(--surface-raised); }
	.season-card:focus-visible, .cover-button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
	.season-card :global(.card), .stack-tile :global(.card) { min-width: 0; }
	.season-card strong { font-size: var(--text-sm); }
	.cover-button { min-height: 2.75rem; padding: 0 var(--space-2); border: 1px solid var(--border); border-radius: var(--radius); background: transparent; color: var(--muted); font: inherit; font-size: var(--text-sm); font-weight: 700; cursor: pointer; }
	.cover-button:hover { background: var(--surface-raised); color: var(--text); }
	.preference-status { margin: 0; color: var(--muted); font-size: var(--text-xs); }
	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(10.5rem, 42vw), 1fr)); gap: var(--space-5) var(--space-4); margin: 0; padding: 0; list-style: none; }
	.tile { display: grid; gap: var(--space-2); width: 100%; padding: var(--space-2); border: 1px solid transparent; border-radius: .75rem; background: none; color: var(--text); text-align: left; font: inherit; cursor: pointer; }
	.tile:hover { background: var(--surface); }
	.tile[aria-pressed='true'] { border-color: var(--focus); background: var(--surface); }
	.tile:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
	.art { display: block; }
	.stack-tile .art { position: relative; isolation: isolate; margin: var(--space-2) var(--space-2) 0 0; }
	.stack-tile .art::before, .stack-tile .art::after { content: ''; position: absolute; inset: 0; z-index: -1; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
	.stack-tile .art::before { transform: translate(8px, -8px); }
	.stack-tile .art::after { transform: translate(4px, -4px); }
	.placeholder { display: block; aspect-ratio: 5 / 7; border-radius: .5rem; background: var(--surface-raised); }
	.name { font-weight: 750; font-size: var(--text-sm); line-height: 1.25; overflow-wrap: anywhere; }
	.meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-2); color: var(--muted); font-size: var(--text-xs); }
	.chip { padding: .05rem .4rem; border: 1px solid var(--border); border-radius: 999px; color: var(--text); font-variant-numeric: tabular-nums; }
	.shelf { display: grid; gap: var(--space-3); }
	.shelf h2 { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-1) var(--space-3); margin: var(--space-2) 0 0; padding-bottom: var(--space-2); border-bottom: 1px solid var(--border); font-size: var(--text-lg); }
	.shelf-count { color: var(--muted); font-size: var(--text-sm); font-weight: 650; font-variant-numeric: tabular-nums; }
</style>
