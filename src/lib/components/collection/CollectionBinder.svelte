<script lang="ts">
	import { tick } from 'svelte';
	import Card from '../../cards/Card.svelte';
	import type { CardViewModel } from '../../cards/view-model.ts';
	import type { CollectedCard } from '../../collection/collection.ts';
	import { faceStickers, type StickerFamily } from '../../collection/stickers.ts';
	import { completionPercent, shelveCollection, type Grouping } from '../../collection/shelves.ts';
	import { HITTER_SLOTS, type Candidate, type Franchise } from '../../game/types.ts';
	import { seasonGrade } from '../../game/grade.ts';
	import GradeBadge from '../GradeBadge.svelte';
	import { toasts } from '../../toast.svelte.ts';
	import CollectionDetail from './CollectionDetail.svelte';

	interface Props {
		cards: readonly CollectedCard[];
		/** Card faces by player-season, for cards whose profiles have loaded. */
		views: ReadonlyMap<string, CardViewModel>;
		/** The game data's player-seasons and clubs, for grouping and completion. */
		candidates: readonly Candidate[];
		franchises: readonly Franchise[];
		status: string;
		onMove: (seasonId: string, family: StickerFamily, x: number, y: number) => void | Promise<void>;
		onHide: (seasonId: string, family: StickerFamily, hidden: boolean) => void | Promise<void>;
	}
	let { cards, views, candidates, franchises, status, onMove, onHide }: Props = $props();
	const bestGrade = (card: CollectedCard) => seasonGrade(card.best.wins, card.best.losses);
	$effect(() => { if (status) toasts.show(status, { id: 'collection', tone: /blocked|full|not saved|off in this tab/i.test(status) ? 'error' : 'info' }); });

	type Role = 'all' | 'hitters' | 'starters' | 'closers' | 'bullpens';
	let role = $state<Role>('all');
	let stickeredOnly = $state(false);
	let sort = $state<'recent' | 'drafted' | 'year'>('recent');
	let grouping = $state<Grouping>('none');
	let chosen = $state<string | null>(null);
	let detail = $state<HTMLElement>();

	const roleOf = (card: CollectedCard): Exclude<Role, 'all'> => {
		const slot = card.slots[0];
		return (HITTER_SLOTS as readonly string[]).includes(slot) ? 'hitters' : slot === 'CL' ? 'closers' : slot === 'BP' ? 'bullpens' : 'starters';
	};
	const year = (card: CollectedCard) => Number(card.seasonId.split(':')[1]) || 0;
	const shown = $derived(cards
		.filter(card => (role === 'all' || roleOf(card) === role) && (!stickeredOnly || faceStickers(card.stickers).length > 0))
		.toSorted((a, b) => sort === 'drafted' ? b.times - a.times || b.lastAt.localeCompare(a.lastAt)
			: sort === 'year' ? year(a) - year(b) || a.label.localeCompare(b.label)
			: b.lastAt.localeCompare(a.lastAt)));
	const progress = $derived(shelveCollection(cards, shown, candidates, franchises, grouping));
	const stickerTotal = $derived(cards.reduce((sum, card) => sum + faceStickers(card.stickers).length, 0));
	const selected = $derived(cards.find(card => card.seasonId === chosen) ?? null);
	const noDetails = () => {};

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
	<div class="toolbar">
		<p class="count"><strong>{cards.length}</strong> {cards.length === 1 ? 'card' : 'cards'} · <strong>{progress.owned.toLocaleString('en-US')}</strong> of {progress.total.toLocaleString('en-US')} player-seasons, <strong>{completionPercent(progress.owned, progress.total)}</strong> · <strong>{stickerTotal}</strong> {stickerTotal === 1 ? 'sticker' : 'stickers'}</p>
		<label>Group
			<select bind:value={grouping}>
				<option value="none">No grouping</option>
				<option value="team">Team</option>
				<option value="era">Era</option>
			</select>
		</label>
		<label>Role
			<select bind:value={role}>
				<option value="all">All roles</option>
				<option value="hitters">Hitters</option>
				<option value="starters">Starters</option>
				<option value="closers">Closers</option>
				<option value="bullpens">Bullpens</option>
			</select>
		</label>
		<label>Sort
			<select bind:value={sort}>
				<option value="recent">Recently drafted</option>
				<option value="drafted">Most drafted</option>
				<option value="year">Season year</option>
			</select>
		</label>
		<label class="check"><input type="checkbox" bind:checked={stickeredOnly} /> With stickers</label>
	</div>

	{#if selected}
		<div bind:this={detail}>
			<CollectionDetail card={selected} view={views.get(selected.seasonId) ?? null} {onMove} {onHide} onClose={() => { chosen = null; }} />
		</div>
	{/if}

	{#snippet grid(list: readonly CollectedCard[], label: string)}
		<ul class="grid" aria-label={label}>
			{#each list as card (card.seasonId)}
				{@const view = views.get(card.seasonId)}
				<li>
					<button type="button" class="tile" aria-pressed={chosen === card.seasonId} onclick={() => void open(card.seasonId)}>
						<span class="art" aria-hidden="true">
							{#if view}<Card s={view} face="front" interactive={false} stickers={card.stickers} onDetails={noDetails} />{:else}<span class="placeholder"></span>{/if}
						</span>
						<span class="name">{card.label}</span>
						<span class="meta">Drafted {card.times}× · best {card.best.wins}–{card.best.losses}{#if bestGrade(card)}<span class="grade"><GradeBadge grade={bestGrade(card)!} /></span>{/if}</span>
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
{/if}

<style>
	.empty { display: grid; justify-items: start; gap: var(--space-3); padding: var(--space-8) 0; }
	.empty h2 { margin: 0; }
	.empty p { margin: 0; }
	.button { min-height: 2.75rem; display: inline-flex; align-items: center; padding-inline: var(--space-4); border-radius: var(--radius, .5rem); background: var(--accent); color: var(--background); font-weight: 750; text-decoration: none; }
	.toolbar { display: flex; flex-wrap: wrap; align-items: end; gap: var(--space-3) var(--space-5); }
	.count { margin: 0 auto 0 0; color: var(--muted); font-size: var(--text-sm); }
	@media (max-width: 40rem) { .count { flex-basis: 100%; } }
	.count strong { color: var(--text); }
	label { display: grid; gap: var(--space-1); color: var(--muted); font-size: var(--text-xs); }
	label.check { display: inline-flex; align-items: center; gap: var(--space-2); min-height: 2.75rem; font-size: var(--text-sm); color: var(--text); }
	select { min-height: 2.75rem; padding-inline: var(--space-3); border: 1px solid var(--border); border-radius: .5rem; background: var(--surface); color: var(--text); font: inherit; font-size: var(--text-sm); }
	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(10.5rem, 42vw), 1fr)); gap: var(--space-5) var(--space-4); margin: 0; padding: 0; list-style: none; }
	.tile { display: grid; gap: var(--space-2); width: 100%; padding: var(--space-2); border: 1px solid transparent; border-radius: .75rem; background: none; color: var(--text); text-align: left; font: inherit; cursor: pointer; }
	.tile:hover { background: var(--surface); }
	.tile[aria-pressed='true'] { border-color: var(--focus); background: var(--surface); }
	.tile:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
	.art { display: block; }
	.placeholder { display: block; aspect-ratio: 5 / 7; border-radius: .5rem; background: var(--surface-raised); }
	.name { font-weight: 750; font-size: var(--text-sm); line-height: 1.25; overflow-wrap: anywhere; }
	.meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-2); color: var(--muted); font-size: var(--text-xs); }
	.meta .grade { font-size: var(--text-sm); line-height: 1; }
	.shelf { display: grid; gap: var(--space-3); }
	.shelf h2 { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-1) var(--space-3); margin: var(--space-2) 0 0; padding-bottom: var(--space-2); border-bottom: 1px solid var(--border); font-size: var(--text-lg); }
	.shelf-count { color: var(--muted); font-size: var(--text-sm); font-weight: 650; font-variant-numeric: tabular-nums; }
</style>
