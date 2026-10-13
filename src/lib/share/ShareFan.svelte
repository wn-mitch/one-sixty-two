<script lang="ts">
	import Card from '../cards/Card.svelte';
	import { STOCK, roles } from '../cards/tokens.ts';
	import { seasonGrade } from '../game/grade.ts';
	import ShareGradeLadder from './ShareGradeLadder.svelte';
	import { RELIEF_SLOTS } from '../game/types.ts';
	import type { ShareRenderCard, ShareRenderModel } from './types.ts';

	/**
	 * The roster as large cards in four columns: the lineup in batting order, then the rotation in
	 * order, the closer and named relievers, the home park, and the grade ladder across the last
	 * row. Each card carries its draft pick number. Captions are sized for a phone screen.
	 */
	let { model }: { model: ShareRenderModel } = $props();
	const bySeason = $derived(new Map(model.cards.map(entry => [entry.seasonId, entry])));
	const bySlot = $derived(new Map(model.cards.map(entry => [entry.slot, entry])));
	const cells = $derived<{ entry: ShareRenderCard; label: string }[]>([
		...model.battingOrder.map((seasonId, index) => ({ entry: bySeason.get(seasonId)!, label: `${index + 1} · ${bySeason.get(seasonId)!.slot}` })),
		...model.starterOrder.map((seasonId, index) => ({ entry: bySeason.get(seasonId)!, label: `SP${index + 1}` })),
		...(['CL', ...RELIEF_SLOTS] as const).map(slot => ({ entry: bySlot.get(slot)!, label: slot }))
	]);
	const stadium = $derived(model.homeStadium);
	const palette = $derived(stadium.color ? roles({ primary: stadium.color, secondary: STOCK }) : null);
	const parkStyle = $derived(palette ? `--stock: ${palette.field}; --stock-ink: ${palette.onField};` : undefined);
	/** "M. Schmidt". */
	const caption = (entry: ShareRenderCard) => `${entry.card.given.slice(0, 1)}. ${entry.card.family}`;
	const grade = $derived(seasonGrade(model.record.wins, model.record.losses));
	function ignoreCardDetails(): void { /* Front-only export has no details action. */ }
</script>

<div class="fan">
	{#each cells as { entry, label } (entry.seasonId)}
		<figure class="cell">
			<span class="card"><Card s={entry.card} face="front" compact capture interactive={false} onDetails={ignoreCardDetails} /><b class="pick" aria-label={`Pick ${entry.pickNumber}`}>#{entry.pickNumber}</b></span>
			<figcaption><strong>{caption(entry)}</strong><span>{label} · {entry.card.year}</span></figcaption>
		</figure>
	{/each}
	<figure class="cell">
		<span class="park" style={parkStyle}>
			{#if stadium.photo}<img src={stadium.photo.url} alt="" width={stadium.photo.width} height={stadium.photo.height} />{/if}
			<b>{stadium.name}</b>
		</span>
		<figcaption><strong>Home park</strong><span>{stadium.dimensions.filter(item => item.bearingDeg === 0).map(item => `CF ${Math.round(item.distanceFt)}`).join('')}</span></figcaption>
	</figure>
	<figure class="cell ladder" aria-label="Season grades">
		<ShareGradeLadder {grade} layout="grid" />
		<figcaption><strong>Season grade</strong><span>Wins</span></figcaption>
	</figure>
</div>

<style>
	/* Four columns and five rows that fill the body; the grade ladder spans the last row. */
	.fan { width:100cqw; height:100cqh; display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); grid-template-rows:repeat(5, minmax(0, 1fr)); gap:1.6cqh 2.4cqw; }
	.cell { margin:0; min-width:0; min-height:0; display:grid; grid-template-rows:minmax(0, 1fr) auto; justify-items:center; gap:.8cqh; }
	.card { position:relative; display:block; height:100%; aspect-ratio:5 / 7; max-width:100%; }
	/* Draft order, stamped on the card's top-left corner. */
	.pick { position:absolute; z-index:5; top:-.8cqw; left:-.8cqw; min-width:4.6cqw; padding:.5cqw .8cqw; border-radius:.8cqw; background:oklch(97% .006 255); color:oklch(16% .009 255); font:800 2.6cqw / 1 'Barlow Condensed', sans-serif; text-align:center; box-shadow:0 .3cqw .8cqw oklch(0% 0 0 / .45); }
	.card :global([data-card]) { width:100%; }
	figcaption { display:grid; justify-items:center; gap:.4cqh; width:100%; text-align:center; }
	figcaption strong, figcaption span { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	figcaption strong { font:800 3.4cqw / 1 'Barlow Condensed', sans-serif; letter-spacing:.01em; }
	figcaption span { color:oklch(82% .016 255); font:700 2.5cqw / 1 'Barlow Condensed', sans-serif; letter-spacing:.06em; }
	.park { position:relative; display:grid; grid-template-rows:minmax(0, 1fr) auto; gap:.6cqw; height:100%; aspect-ratio:5 / 7; max-width:100%; padding:1cqw; box-sizing:border-box; overflow:hidden; border-radius:1cqw; background:var(--stock, oklch(27% .016 255)); color:var(--stock-ink, oklch(97% .006 255)); }
	.park img { display:block; width:100%; height:100%; min-height:0; object-fit:cover; border-radius:.6cqw; }
	.ladder { grid-column:span 3; grid-template-rows:minmax(0, 1fr) auto; }
	.park b { font:italic 900 2.6cqw / .95 'Barlow Condensed', sans-serif; text-transform:uppercase; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; line-clamp:2; -webkit-box-orient:vertical; }
</style>
