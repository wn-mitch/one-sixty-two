<script lang="ts">
	import type { Snippet } from 'svelte';
	import CardReview from '../../cards/CardReview.svelte';
	import Card from '../../cards/Card.svelte';
	import type { CardViewModel } from '../../cards/view-model.ts';
	import type { CollectedCard } from '../../collection/collection.ts';
	import { nextTier } from '../../collection/album.ts';
	import { faceStickers, STICKER_BY_KIND, STICKERS, type PlacedSticker, type StickerFamily } from '../../collection/stickers.ts';
	import type { SavedBatter, SavedPitcher } from '../../game/library.ts';
	import { innings, onBase, ra9, rate } from '../../game/library-stats.ts';
	import StickerBadge from '../../collection/StickerBadge.svelte';
	import { seasonGrade } from '../../game/grade.ts';
	import GradeBadge from '../GradeBadge.svelte';

	interface Props {
		card: CollectedCard;
		view: CardViewModel | null;
		/** Sticker kinds earned since the last visit; they slap onto the card as it opens. */
		fresh?: ReadonlySet<string>;
		seasons?: Snippet;
		onMove: (seasonId: string, family: StickerFamily, x: number, y: number) => void | Promise<void>;
		onHide: (seasonId: string, family: StickerFamily, hidden: boolean) => void | Promise<void>;
		onClose: () => void;
	}
	let { card, view, fresh, seasons, onMove, onHide, onClose }: Props = $props();

	/** Edit stickers shows every family with Hide/Show and puts move handles over the face stickers. */
	let editing = $state(false);
	/** Placements being dragged before they are saved, by family. */
	let drafts = $state<Partial<Record<StickerFamily, { x: number; y: number }>>>({});
	let surface = $state<HTMLElement>();
	let dragging: { family: StickerFamily; pointerId: number } | null = null;

	// A different card starts fresh; a refresh of the same card keeps the editing mode.
	const seasonId = $derived(card.seasonId);
	$effect(() => { void seasonId; drafts = {}; editing = false; });

	/** Each family's top tier, in sticker order, with progress toward its next tier. */
	const families = $derived.by(() => {
		const byFamily = new Map<StickerFamily, PlacedSticker[]>();
		for (const sticker of card.stickers) {
			const family = STICKER_BY_KIND.get(sticker.kind)?.family;
			if (family) byFamily.set(family, [...(byFamily.get(family) ?? []), sticker]);
		}
		return [...byFamily].map(([family, stickers]) => {
			const top = stickers.map(sticker => ({ sticker, definition: STICKER_BY_KIND.get(sticker.kind)! })).sort((a, b) => b.definition.tier - a.definition.tier)[0];
			return { family, definition: top.definition, hidden: top.sticker.hidden, earnedAt: top.sticker.earnedAt, next: nextTier(card, top.definition) };
		}).sort((a, b) => STICKERS.indexOf(a.definition) - STICKERS.indexOf(b.definition));
	});
	const shownFamilies = $derived(editing ? families : families.filter(item => !item.hidden));
	const hiddenCount = $derived(families.filter(item => item.hidden).length);
	const placed = $derived(card.stickers.map(sticker => {
		const family = STICKER_BY_KIND.get(sticker.kind)?.family;
		const moved = family ? drafts[family] : undefined;
		return moved ? { ...sticker, ...moved } : sticker;
	}));
	const handles = $derived(faceStickers(placed, { era: view?.era }));
	const isBatter = (value: SavedBatter | SavedPitcher): value is SavedBatter => 'PA' in value;
	const line = $derived(card.best.line);
	/** The best team's season line for this card, with its WAR where the save kept it. */
	const seasonLine = $derived.by(() => {
		if (!line) return '';
		const parts = isBatter(line)
			? [`${line.HR} HR`, `${line.H} H`, `${line.RBI} RBI`, `${line.SB} SB`, `${rate(onBase(line))} OBP`]
			: [`${line.SO} K`, `${ra9(line).toFixed(2)} RA9`, `${innings(line.outs)} IP`];
		if (Number.isFinite(line.war)) parts.push(`${line.war.toFixed(1)} WAR`);
		return parts.join(' · ');
	});
	const bestGrade = $derived(seasonGrade(card.best.wins, card.best.losses));
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
	<div class="art" class:has-seasons={!!seasons}>
		<!-- The card tilts like the real thing, so foil stickers catch the light; it holds still while stickers are being moved. -->
		<div class="surface" class:editing bind:this={surface}>
			{#if editing}
				{#if view}<Card s={view} face="front" interactive={false} stickers={placed} freshStickers={fresh} onDetails={noDetails} />{:else}<span class="placeholder"></span>{/if}
			{:else if view}
				<CardReview s={view} showHeading={false} flipInPlace pairFaces={false} stickers={placed} freshStickers={fresh} />
			{:else}<span class="placeholder"></span>{/if}
			{#if editing}
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
		{#if seasons}<div class="gallery-seasons">{@render seasons()}</div>{/if}
	</div>
	<div class="info">
		<div class="head">
			<h2 id="collection-detail-heading" tabindex="-1">{card.label}</h2>
			<button type="button" class="quiet close" onclick={onClose}>Close</button>
		</div>
		<p class="meta">
			<span>Drafted <strong>{card.times}×</strong> since {date(card.firstAt)}</span>
			<span class="best">Best team <strong>{card.best.wins}–{card.best.losses}</strong>{#if bestGrade}<GradeBadge grade={bestGrade} />{/if}</span>
		</p>
		{#if seasonLine}<p class="line">That season: {seasonLine}</p>{/if}

		{#if families.length}
			<ul class="stickers" aria-label="Stickers">
				{#each shownFamilies as item (item.family)}
					<li class:hidden={item.hidden}>
						<span class="badge" aria-hidden="true"><StickerBadge definition={item.definition} /></span>
						<span class="what">
							<strong>{item.definition.title}</strong>
							{#if editing}
								<small>Earned {date(item.earnedAt)}</small>
							{:else if item.next}
								<span class="bar" aria-hidden="true"><i style={`width:${(item.next.fraction * 100).toFixed(0)}%`}></i></span>
								<small>{item.next.value} of {item.next.target} {item.next.unit}</small>
							{/if}
						</span>
						{#if editing}
							<button type="button" class="toggle" aria-pressed={!item.hidden} aria-label={`${item.hidden ? 'Show' : 'Hide'} ${item.definition.title}`} onclick={() => void onHide(card.seasonId, item.family, !item.hidden)}>{item.hidden ? 'Show' : 'Hide'}</button>
						{/if}
					</li>
				{/each}
			</ul>
			<div class="actions">
				<button type="button" class="edit" aria-pressed={editing} onclick={() => { editing = !editing; }}>{editing ? 'Done' : 'Edit stickers'}</button>
				{#if editing}
					<span class="hint">{view && handles.length ? 'Drag a sticker on the card, or focus it and use the arrow keys.' : 'Hidden stickers stay off the card face.'}</span>
				{:else if hiddenCount}
					<span class="hint">{hiddenCount} hidden</span>
				{/if}
			</div>
		{:else}
			<p class="muted">No stickers yet. Seasons on your teams earn them; the Stickers view shows what each one takes.</p>
		{/if}
	</div>
</section>

<style>
	.detail { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: var(--space-6); }
	.art { display: grid; min-width: 0; gap: var(--space-4); align-items: start; }
	.art.has-seasons { grid-template-columns: minmax(0, 1fr) 6rem; }
	.surface { position: relative; width: min(100%, 18rem); justify-self: center; }
	.gallery-seasons { min-width: 0; }
	@media (max-width: 60rem) {
		.detail { grid-template-columns: minmax(0, 1fr); gap: var(--space-5); }
		.art.has-seasons { grid-template-columns: minmax(0, 1fr); }
		.surface { width: min(100%, 15rem); }
	}
	/* Dragging needs the touch gestures; browsing keeps page scroll over the card. */
	.surface.editing { touch-action: none; }
	.placeholder { display: block; aspect-ratio: 5 / 7; border-radius: .5rem; background: var(--surface-raised); }
	.handles { position: absolute; inset: 0; z-index: 6; }
	.handle { position: absolute; width: 19%; aspect-ratio: 1; translate: -50% -50%; border: 2px dashed var(--focus); border-radius: 50%; background: oklch(85% 0.12 230 / .12); cursor: grab; touch-action: none; }
	.handle:active { cursor: grabbing; }
	.handle:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
	.info { display: grid; align-content: start; gap: var(--space-4); min-width: 0; }
	.head { display: flex; align-items: start; justify-content: space-between; gap: var(--space-3); }
	h2 { margin: 0; font-size: var(--text-xl); line-height: 1.2; overflow-wrap: anywhere; }
	button { min-height: 2.75rem; padding-inline: var(--space-4); border: 1px solid var(--border); border-radius: .5rem; background: var(--surface-raised); color: var(--text); font: inherit; font-size: var(--text-sm); font-weight: 650; cursor: pointer; }
	button.quiet { border-color: transparent; background: transparent; color: var(--muted); }
	button:hover:not(:disabled) { background: var(--surface-hover); color: var(--text); }
	button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
	.meta { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-5); margin: 0; color: var(--muted); font-size: var(--text-sm); }
	.meta strong { color: var(--text); }
	.best { display: inline-flex; align-items: center; gap: var(--space-2); }
	.line { margin: 0; color: var(--muted); font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
	.stickers { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr)); gap: var(--space-4) var(--space-5); margin: 0; padding: 0; list-style: none; }
	.stickers li { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
	.stickers li.hidden .badge { opacity: .4; }
	.stickers li.hidden .what strong { color: var(--muted); }
	/* A badge is 21em of its font size: .19rem gives a sticker about 4rem across. */
	.badge { flex: none; font-size: .19rem; padding: .3rem; line-height: 0; }
	.what { display: grid; gap: var(--space-1); min-width: 0; flex: 1; font-size: var(--text-sm); line-height: 1.25; }
	.what small { color: var(--muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
	.bar { display: block; height: 3px; max-width: 9rem; border-radius: 2px; background: var(--surface-raised); overflow: hidden; }
	.bar i { display: block; height: 100%; background: var(--focus); }
	.toggle { flex: none; min-width: 4.5rem; }
	.actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); }
	.hint { color: var(--muted); font-size: var(--text-xs); }
</style>
