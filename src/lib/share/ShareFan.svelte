<script lang="ts">
	import Card from '../cards/Card.svelte';
	import { RELIEF_SLOTS } from '../game/types.ts';
	import type { ShareRenderCard, ShareRenderModel } from './types.ts';

	/**
	 * Sixteen full fronts in four columns and four rows, in batting order followed by the staff.
	 * The artwork carries identity, season and statistics; the surrounding share header carries
	 * the park and season grade. Each card retains its small draft-pick stamp.
	 */
	let { model }: { model: ShareRenderModel } = $props();
	const bySeason = $derived(new Map(model.cards.map(entry => [entry.seasonId, entry])));
	const bySlot = $derived(new Map(model.cards.map(entry => [entry.slot, entry])));
	const cells = $derived<{ entry: ShareRenderCard; label: string }[]>([
		...model.battingOrder.map((seasonId, index) => ({ entry: bySeason.get(seasonId)!, label: `${index + 1} · ${bySeason.get(seasonId)!.slot}` })),
		...model.starterOrder.map((seasonId, index) => ({ entry: bySeason.get(seasonId)!, label: `SP${index + 1}` })),
		...(['CL', ...RELIEF_SLOTS] as const).map(slot => ({ entry: bySlot.get(slot)!, label: slot }))
	]);
	function ignoreCardDetails(): void { /* Front-only export has no details action. */ }
</script>

<div class="fan">
	{#each cells as { entry, label } (entry.seasonId)}
		<figure class="cell" aria-label={`${entry.card.full}, ${entry.card.year}, ${label}`}>
			<span class="card"><Card s={entry.card} face="front" capture interactive={false} onDetails={ignoreCardDetails} /><b class="pick" aria-label={`Pick ${entry.pickNumber}`}>#{entry.pickNumber}</b></span>
		</figure>
	{/each}
</div>

<style>
	.fan { width:100cqw; height:100cqh; display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); grid-template-rows:repeat(4, minmax(0, 1fr)); gap:1.2cqh 1.6cqw; align-content:center; }
	.cell { margin:0; min-width:0; min-height:0; display:grid; place-items:center; }
	.card { position:relative; display:block; width:min(100%, calc((100cqh - 3.6cqh) / 4 * 5 / 7)); aspect-ratio:5 / 7; }
	/* Draft order, stamped on the card's top-left corner. */
	.pick { position:absolute; z-index:5; top:-.8cqw; left:-.8cqw; min-width:4.6cqw; padding:.5cqw .8cqw; border-radius:.8cqw; background:oklch(97% .006 255); color:oklch(16% .009 255); font:800 2.6cqw / 1 'Barlow Condensed', sans-serif; text-align:center; box-shadow:0 .3cqw .8cqw oklch(0% 0 0 / .45); }
	.card :global([data-card]) { width:100%; }
</style>
