<script lang="ts">
	import Card from '../../cards/Card.svelte';
	import type { CardViewModel } from '../../cards/view-model.ts';
	import type { CollectedCard } from '../../collection/collection.ts';
	import { faceStickers, STICKER_BY_KIND, type PlacedSticker, type StickerFamily } from '../../collection/stickers.ts';
	import type { SavedBatter, SavedPitcher } from '../../game/library.ts';
	import { innings, onBase, ra9, rate } from '../../game/library-stats.ts';
	import StickerBadge from '../../collection/StickerBadge.svelte';
	import { seasonGrade } from '../../game/grade.ts';
	import GradeBadge from '../GradeBadge.svelte';

	interface Props {
		card: CollectedCard;
		view: CardViewModel | null;
		onMove: (seasonId: string, family: StickerFamily, x: number, y: number) => void | Promise<void>;
		onHide: (seasonId: string, family: StickerFamily, hidden: boolean) => void | Promise<void>;
		onClose: () => void;
	}
	let { card, view, onMove, onHide, onClose }: Props = $props();

	let arranging = $state(false);
	/** Placements being dragged before they are saved, by family. */
	let drafts = $state<Partial<Record<StickerFamily, { x: number; y: number }>>>({});
	let surface = $state<HTMLElement>();
	let dragging: { family: StickerFamily; pointerId: number } | null = null;

	// A different card starts fresh; a refresh of the same card keeps the arranging mode.
	const seasonId = $derived(card.seasonId);
	$effect(() => { void seasonId; drafts = {}; arranging = false; });

	const families = $derived.by(() => {
		const byFamily = new Map<StickerFamily, PlacedSticker[]>();
		for (const sticker of card.stickers) {
			const family = STICKER_BY_KIND.get(sticker.kind)?.family;
			if (family) byFamily.set(family, [...(byFamily.get(family) ?? []), sticker]);
		}
		return [...byFamily].map(([family, stickers]) => {
			const top = stickers.map(sticker => ({ sticker, definition: STICKER_BY_KIND.get(sticker.kind)! })).sort((a, b) => b.definition.tier - a.definition.tier)[0];
			return { family, definition: top.definition, hidden: top.sticker.hidden, earnedAt: top.sticker.earnedAt };
		});
	});
	const placed = $derived(card.stickers.map(sticker => {
		const family = STICKER_BY_KIND.get(sticker.kind)?.family;
		const moved = family ? drafts[family] : undefined;
		return moved ? { ...sticker, ...moved } : sticker;
	}));
	const handles = $derived(faceStickers(placed));
	const line = $derived(card.best.line);
	const bestGrade = $derived(seasonGrade(card.best.wins, card.best.losses));
	const isBatter = (value: SavedBatter | SavedPitcher): value is SavedBatter => 'PA' in value;
	const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	const noDetails = () => {};

	function point(event: PointerEvent): { x: number; y: number } {
		const box = surface!.getBoundingClientRect();
		const clamp = (value: number) => Math.min(0.92, Math.max(0.08, value));
		return { x: clamp((event.clientX - box.left) / box.width), y: clamp((event.clientY - box.top) / box.height) };
	}
	function down(event: PointerEvent, family: StickerFamily): void {
		dragging = { family, pointerId: event.pointerId };
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		drafts[family] = point(event);
	}
	function move(event: PointerEvent): void {
		if (dragging?.pointerId === event.pointerId) drafts[dragging.family] = point(event);
	}
	function up(event: PointerEvent): void {
		if (dragging?.pointerId !== event.pointerId) return;
		const { family } = dragging;
		dragging = null;
		const spot = drafts[family];
		if (spot) void onMove(card.seasonId, family, spot.x, spot.y);
	}
	function nudge(event: KeyboardEvent, family: StickerFamily, x: number, y: number): void {
		const step = event.shiftKey ? 0.08 : 0.02;
		const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
		if (!delta) return;
		event.preventDefault();
		const spot = { x: Math.min(0.92, Math.max(0.08, x + delta[0])), y: Math.min(0.92, Math.max(0.08, y + delta[1])) };
		drafts[family] = spot;
		void onMove(card.seasonId, family, spot.x, spot.y);
	}
</script>

<section class="detail" aria-labelledby="collection-detail-heading">
	<div class="art">
		<div class="surface" bind:this={surface}>
			{#if view}<Card s={view} face="front" interactive={false} stickers={placed} onDetails={noDetails} />{:else}<span class="placeholder"></span>{/if}
			{#if arranging}
				<div class="handles">
					{#each handles as handle (handle.definition.family)}
						<button
							type="button"
							class="handle"
							style={`left:${handle.x * 100}%;top:${handle.y * 100}%`}
							aria-label={`Move ${handle.definition.title} sticker. Drag, or use the arrow keys.`}
							onpointerdown={event => down(event, handle.definition.family)}
							onpointermove={move}
							onpointerup={up}
							onpointercancel={up}
							onkeydown={event => nudge(event, handle.definition.family, handle.x, handle.y)}
						></button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
	<div class="info">
		<div class="head">
			<h2 id="collection-detail-heading" tabindex="-1">{card.label}</h2>
			<button type="button" class="close" onclick={onClose}>Close</button>
		</div>
		<dl>
			<div><dt>Drafted</dt><dd>{card.times}×</dd></div>
			<div><dt>First</dt><dd>{date(card.firstAt)}</dd></div>
			<div><dt>Latest</dt><dd>{date(card.lastAt)}</dd></div>
			<div><dt>Best team</dt><dd>{card.best.wins}–{card.best.losses}{#if bestGrade} <GradeBadge grade={bestGrade} />{/if}</dd></div>
		</dl>
		{#if line}
			<p class="line">
				{#if isBatter(line)}
					That season: {line.HR} HR · {line.H} H · {line.RBI} RBI · {line.SB} SB · {rate(onBase(line))} OBP
				{:else}
					That season: {line.SO} K · {ra9(line).toFixed(2)} RA9 · {innings(line.outs)} IP
				{/if}
			</p>
		{/if}

		<h3>Stickers</h3>
		{#if families.length}
			<ul class="stickers">
				{#each families as item (item.family)}
					<li>
						<span class="badge" aria-hidden="true"><StickerBadge definition={item.definition} /></span>
						<span class="what"><strong>{item.definition.title}</strong><small>Earned {date(item.earnedAt)}</small></span>
						<button type="button" class="toggle" aria-pressed={!item.hidden} onclick={() => void onHide(card.seasonId, item.family, !item.hidden)}>{item.hidden ? 'Show' : 'Hide'}</button>
					</li>
				{/each}
			</ul>
			<button type="button" class="arrange" aria-pressed={arranging} disabled={!view || !handles.length} onclick={() => { arranging = !arranging; }}>{arranging ? 'Done arranging' : 'Arrange stickers'}</button>
		{:else}
			<p class="muted">No stickers yet. Big seasons, team MVPs, 100-win teams, and drafting a card again earn them.</p>
		{/if}
	</div>
</section>

<style>
	.detail { display: grid; grid-template-columns: minmax(0, 18rem) minmax(0, 1fr); gap: var(--space-6); padding: var(--space-5); border: 1px solid var(--border); border-radius: .75rem; background: var(--surface); }
	@media (max-width: 40rem) { .detail { grid-template-columns: minmax(0, 1fr); } .art { width: min(100%, 18rem); justify-self: center; } }
	.surface { position: relative; touch-action: none; }
	.placeholder { display: block; aspect-ratio: 5 / 7; border-radius: .5rem; background: var(--surface-raised); }
	.handles { position: absolute; inset: 0; z-index: 6; }
	.handle { position: absolute; width: 19%; aspect-ratio: 1; translate: -50% -50%; border: 2px dashed var(--focus); border-radius: 50%; background: oklch(85% 0.12 230 / .12); cursor: grab; touch-action: none; }
	.handle:active { cursor: grabbing; }
	.handle:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
	.info { display: grid; align-content: start; gap: var(--space-3); min-width: 0; }
	.head { display: flex; align-items: start; justify-content: space-between; gap: var(--space-3); }
	h2 { margin: 0; font-size: var(--text-2xl); line-height: 1.1; overflow-wrap: anywhere; }
	h3 { margin: var(--space-2) 0 0; font-size: var(--text-lg); }
	button { min-height: 2.75rem; padding-inline: var(--space-4); border: 1px solid var(--border); border-radius: .5rem; background: var(--surface-raised); color: var(--text); font: inherit; font-size: var(--text-sm); font-weight: 650; cursor: pointer; }
	button:hover:not(:disabled) { background: var(--surface-hover); }
	button:disabled { color: var(--muted); cursor: not-allowed; }
	button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
	dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr)); gap: var(--space-3); margin: 0; }
	dt { color: var(--muted); font-size: var(--text-xs); }
	dd { margin: var(--space-1) 0 0; font-weight: 750; }
	.line { margin: 0; color: var(--muted); font-size: var(--text-sm); }
	.stickers { display: grid; gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
	.stickers li { display: flex; align-items: center; gap: var(--space-3); }
	.badge { flex: none; font-size: .15rem; padding: .2rem; line-height: 0; }
	.what { display: grid; min-width: 0; flex: 1; font-size: var(--text-sm); }
	.what small { color: var(--muted); font-size: var(--text-xs); }
	.arrange { justify-self: start; }
</style>
