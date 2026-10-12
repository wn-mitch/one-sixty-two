<script lang="ts">
	import Card from '../cards/Card.svelte';
	import { STOCK, roles } from '../cards/tokens.ts';
	import GradeBadge from '../components/GradeBadge.svelte';
	import { gradeRange, SEASON_GRADES, seasonGrade } from '../game/grade.ts';
	import { RELIEF_SLOTS } from '../game/types.ts';
	import type { ShareRenderCard, ShareRenderModel } from './types.ts';

	/**
	 * The roster as large cards in four columns: the lineup in batting order, then the rotation in
	 * order, the closer and named relievers, the home park, and the grade ladder across the last
	 * row. Captions are sized for a phone screen.
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
			<span class="card"><Card s={entry.card} face="front" compact capture interactive={false} onDetails={ignoreCardDetails} /></span>
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
		<ol>
			{#each SEASON_GRADES as tier (tier)}
				<li class:current={tier === grade}><span class="tier"><GradeBadge grade={tier} /></span><span>{gradeRange(tier).replace(' wins or fewer', ' or fewer').replace(' wins', '')}</span></li>
			{/each}
		</ol>
		<figcaption><strong>Season grade</strong><span>Wins</span></figcaption>
	</figure>
</div>

<style>
	/* Four columns and five rows that fill the body; the grade ladder spans the last row. */
	.fan { width:100cqw; height:100cqh; display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); grid-template-rows:repeat(5, minmax(0, 1fr)); gap:1.6cqh 2.4cqw; }
	.cell { margin:0; min-width:0; min-height:0; display:grid; grid-template-rows:minmax(0, 1fr) auto; justify-items:center; gap:.8cqh; }
	.card { display:block; height:100%; aspect-ratio:5 / 7; max-width:100%; }
	.card :global([data-card]) { width:100%; }
	figcaption { display:grid; justify-items:center; gap:.4cqh; width:100%; text-align:center; }
	figcaption strong, figcaption span { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	figcaption strong { font:800 3.4cqw / 1 'Barlow Condensed', sans-serif; letter-spacing:.01em; }
	figcaption span { color:oklch(82% .016 255); font:700 2.5cqw / 1 'Barlow Condensed', sans-serif; letter-spacing:.06em; }
	.park { position:relative; display:grid; grid-template-rows:minmax(0, 1fr) auto; gap:.6cqw; height:100%; aspect-ratio:5 / 7; max-width:100%; padding:1cqw; box-sizing:border-box; overflow:hidden; border-radius:1cqw; background:var(--stock, oklch(27% .016 255)); color:var(--stock-ink, oklch(97% .006 255)); }
	.park img { display:block; width:100%; height:100%; min-height:0; object-fit:cover; border-radius:.6cqw; }
	.ladder { grid-column:span 3; grid-template-rows:minmax(0, 1fr) auto; }
	/* Three columns of three tiers, top grade first, so the short spanning row stays legible. */
	.ladder ol { list-style:none; margin:0; padding:.9cqw 2.4cqw; width:100%; height:100%; box-sizing:border-box; display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); grid-template-rows:repeat(3, minmax(0, 1fr)); grid-auto-flow:column; column-gap:2.4cqw; align-items:center; border:.19cqw solid oklch(37% .016 255); border-radius:1cqw; }
	.ladder li { display:grid; grid-template-columns:10cqw minmax(0, 1fr); align-items:center; gap:1cqw; color:oklch(72% .016 255); font:700 2.6cqw / 1 'Barlow Condensed', sans-serif; letter-spacing:.03em; white-space:nowrap; opacity:.5; }
	.ladder li.current { color:oklch(97% .006 255); font-size:2.9cqw; opacity:1; }
	.ladder .tier { font-size:2.5cqw; }
	.park b { font:italic 900 2.6cqw / .95 'Barlow Condensed', sans-serif; text-transform:uppercase; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; line-clamp:2; -webkit-box-orient:vertical; }
</style>
