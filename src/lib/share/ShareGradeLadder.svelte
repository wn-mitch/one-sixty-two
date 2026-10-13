<script lang="ts">
	import GradeBadge from '../components/GradeBadge.svelte';
	import { gradeRange, SEASON_GRADES, type SeasonGrade } from '../game/grade.ts';

	/**
	 * Every season grade with its win range, the earned one lit. `grid` fills three columns of three
	 * tiers, best first; `column` stacks all nine, best on top, in one card-wide slot of the field.
	 */
	let { grade, layout }: { grade: SeasonGrade | null; layout: 'grid' | 'column' } = $props();
	const tiers = SEASON_GRADES;
	const range = (tier: SeasonGrade) => gradeRange(tier).replace(' wins or fewer', ' or fewer').replace(' wins', '');
</script>

<ol class="ladder {layout}" aria-label="Season grades">
	{#each tiers as tier (tier)}
		<li class:current={tier === grade} aria-current={tier === grade ? 'true' : undefined}><span class="tier"><GradeBadge grade={tier} /></span><span>{range(tier)}</span></li>
	{/each}
</ol>

<style>
	.ladder { list-style:none; margin:0; box-sizing:border-box; display:grid; align-items:center; border:.19cqw solid oklch(37% .016 255); border-radius:1cqw; }
	li { display:grid; align-items:center; color:oklch(72% .016 255); font:700 2.6cqw / 1 'Barlow Condensed', sans-serif; letter-spacing:.03em; white-space:nowrap; opacity:.5; }
	li.current { color:oklch(97% .006 255); opacity:1; }
	.tier { font-size:2.5cqw; }
	.grid { padding:.9cqw 2.4cqw; width:100%; height:100%; grid-template-columns:repeat(3, minmax(0, 1fr)); grid-template-rows:repeat(3, minmax(0, 1fr)); grid-auto-flow:column; column-gap:2.4cqw; }
	.grid li { grid-template-columns:10cqw minmax(0, 1fr); gap:1cqw; }
	.grid li.current { font-size:2.9cqw; }
	/* Inside the field card, cqw is the card's own width: 1cqw is 4.24 field units. */
	.column { width:100%; height:100%; grid-template-rows:repeat(9, minmax(0, 1fr)); padding:.6cqw 1.4cqw; border-width:.25cqw; border-radius:1.4cqw; }
	.column li { grid-template-columns:8cqw minmax(0, 1fr); gap:1cqw; font-size:2.1cqw; }
	.column .tier { font-size:1.9cqw; }
	.column li.current { font-size:2.4cqw; }
</style>
