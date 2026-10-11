<script lang="ts">
	import { tick } from 'svelte';
	import Card from '../../cards/Card.svelte';
	import type { CardViewModel } from '../../cards/view-model.ts';
	import type { CollectedCard } from '../../collection/collection.ts';
	import { faceStickers, type StickerFamily } from '../../collection/stickers.ts';
	import { HITTER_SLOTS } from '../../game/types.ts';
	import { toasts } from '../../toast.svelte.ts';
	import CollectionDetail from './CollectionDetail.svelte';

	interface Props {
		cards: readonly CollectedCard[];
		/** Card faces by player-season, for cards whose profiles have loaded. */
		views: ReadonlyMap<string, CardViewModel>;
		status: string;
		onMove: (seasonId: string, family: StickerFamily, x: number, y: number) => void | Promise<void>;
		onHide: (seasonId: string, family: StickerFamily, hidden: boolean) => void | Promise<void>;
	}
	let { cards, views, status, onMove, onHide }: Props = $props();
	$effect(() => { if (status) toasts.show(status, { id: 'collection', tone: /blocked|full|not saved|off in this tab/i.test(status) ? 'error' : 'info' }); });

	type Role = 'all' | 'hitters' | 'starters' | 'closers' | 'bullpens';
	let role = $state<Role>('all');
	let stickeredOnly = $state(false);
	let sort = $state<'recent' | 'drafted' | 'year'>('recent');
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
		<p class="count"><strong>{cards.length}</strong> {cards.length === 1 ? 'card' : 'cards'} · <strong>{stickerTotal}</strong> {stickerTotal === 1 ? 'sticker' : 'stickers'}</p>
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

	{#if shown.length}
		<ul class="grid" aria-label="Collected cards">
			{#each shown as card (card.seasonId)}
				{@const view = views.get(card.seasonId)}
				<li>
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
	{:else}
		<p class="muted">No cards match these filters.</p>
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
	.meta { color: var(--muted); font-size: var(--text-xs); }
</style>
