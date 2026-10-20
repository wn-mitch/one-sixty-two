<script lang="ts">
	import { onMount } from 'svelte';
	import Card from '../cards/Card.svelte';
	import GradeBadge from '../components/GradeBadge.svelte';
	import { dailyLabel } from '../game/daily.ts';
	import { gradeRange, seasonGrade } from '../game/grade.ts';
	import { previewCards } from './og-cards.ts';
	import type { ShareRenderModel } from './types.ts';

	/**
	 * The season's 1200×630 link preview, published only as `og:image`: the record large enough to
	 * read in a chat thumbnail, the grade and two season facts, the daily stamp on a daily run, and the
	 * roster's best cards fanned on the right. Every length is a share of the frame's width, like the site preview it stands beside.
	 */
	let { model }: { model: ShareRenderModel } = $props();
	let hydrated = $state(false);
	const record = $derived(model.record);
	const grade = $derived(seasonGrade(record.wins, record.losses));
	const fan = $derived(previewCards(model.cards));
	const facts = $derived([
		record.firstLoss === null ? 'No losses' : `First loss: Game ${record.firstLoss}`,
		`${record.longestWinningStreak}-game win streak`
	]);
	function ignoreCardDetails(): void { /* Front-only capture has no details action. */ }

	onMount(() => { hydrated = true; });
</script>

<section
	class="og"
	data-share-artwork
	data-share-format="og"
	data-share-hydrated={hydrated}
	data-share-cards={fan.length}
	data-share-ready="false"
	data-share-state="idle"
	role="img"
	aria-label={`${model.daily ? `Daily ${dailyLabel(model.daily)}: ` : ''}${record.wins} wins, ${record.losses} losses${grade ? `, grade ${grade}` : ''} season link preview`}
>
	<div class="copy">
		<div class="masthead">
			<strong class="wordmark"><i aria-hidden="true"></i>162-0</strong>
			{#if model.daily}<span class="daily">Daily <b>{dailyLabel(model.daily)}</b></span>{/if}
		</div>
		<div class="final">
			<small>Final record</small>
			<div class="record" class:long={record.wins >= 100 || record.losses >= 100} aria-label={`${record.wins} wins and ${record.losses} losses`}><b>{record.wins}</b><span>–</span><b class="losses">{record.losses}</b></div>
		</div>
		{#if grade}<span class="grade"><span class="badge"><GradeBadge {grade} /></span><small>{gradeRange(grade)}</small></span>{/if}
		<ul class="facts">{#each facts as fact}<li>{fact}</li>{/each}</ul>
		<span class="cta">Beat this at <em>162-0.dev</em></span>
	</div>
	<div class="fan" aria-hidden="true"><div class="fan-cards">
		{#each fan as entry, index (entry.seasonId)}
			<span class="fan-card" style={`--i:${index};--n:${fan.length};z-index:${fan.length - Math.abs(index - (fan.length - 1) / 2) * 2}`}>
				<Card s={entry.card} face="front" capture interactive={false} onDetails={ignoreCardDetails} />
			</span>
		{/each}
	</div></div>
</section>

<style>
	.og { position:relative; box-sizing:border-box; width:100%; aspect-ratio:1200/630; container-type:inline-size; overflow:hidden; background:radial-gradient(120% 140% at 85% 30%, oklch(26% .02 255), oklch(14% .009 255) 60%); color:oklch(97% .006 255); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-variant-numeric:tabular-nums; line-height:1; isolation:isolate; }
	.copy { position:absolute; z-index:2; left:5cqw; top:4.6cqw; bottom:4.6cqw; width:44cqw; display:flex; flex-direction:column; align-items:flex-start; gap:2cqw; }
	.wordmark { display:inline-flex; align-items:center; gap:1.3cqw; font-size:4.4cqw; font-weight:850; letter-spacing:-.04em; }
	.masthead { display:flex; align-items:center; gap:2.4cqw; }
	/* The daily run's stamp, as on results, the share images and the site preview. */
	.daily { padding:.8cqw 1.6cqw; border:.3cqw solid oklch(83% .16 120); color:oklch(83% .16 120); font:italic 800 2.6cqw / 1 'Barlow Condensed', sans-serif; letter-spacing:.06em; text-transform:uppercase; white-space:nowrap; transform:rotate(-3deg); }
	.daily b { color:oklch(97% .006 255); font-weight:800; }
	.wordmark i { display:block; width:1.7cqw; height:1.7cqw; border:.35cqw solid currentColor; transform:rotate(45deg); }
	.final { display:grid; gap:.9cqw; }
	.final small { color:oklch(76% .018 255); font:700 2.2cqw / 1 'Barlow Condensed', sans-serif; letter-spacing:.08em; text-transform:uppercase; }
	.record { display:flex; align-items:baseline; gap:1cqw; font-size:13.5cqw; font-weight:850; letter-spacing:-.05em; line-height:.82; white-space:nowrap; }
	/* A three-digit total steps down so the record never runs under the fan. */
	.record.long { font-size:11.4cqw; }
	.record span { color:oklch(52% .016 255); font-weight:600; }
	.record .losses { color:oklch(76% .018 255); }
	.grade { display:inline-flex; align-items:center; gap:1.4cqw; }
	.badge { font-size:4.6cqw; }
	.grade small { color:oklch(82% .016 255); font:700 2.3cqw / 1 'Barlow Condensed', sans-serif; letter-spacing:.04em; text-transform:uppercase; white-space:nowrap; }
	.facts { margin:0; padding:0; list-style:none; display:grid; gap:.8cqw; color:oklch(86% .014 255); font-size:2.5cqw; font-weight:650; }
	.cta { margin-top:auto; font-size:2.8cqw; font-weight:800; letter-spacing:-.02em; white-space:nowrap; }
	.cta em { font-style:normal; color:oklch(83% .16 120); }
	/* Cards fan in the plane from a pivot below the frame, the best card on top in the middle; captures stay flat, so no perspective tilt. */
	/* The fan clips at the frame's edge itself, so a card tipping past it never counts as overflow that fails the capture. */
	.fan { position:absolute; inset:0 0 0 49cqw; overflow:hidden; }
	.fan-cards { position:absolute; inset:0 2cqw 0 0; }
	.fan-card { --w:20cqw; position:absolute; left:calc(50% - var(--w) / 2); top:6.5cqw; width:var(--w); transform-origin:50% 200%; transform:rotate(calc((var(--i) - (var(--n) - 1) / 2) * 8deg)); filter:drop-shadow(0 1cqw 1.4cqw oklch(0% 0 0 / .55)); }
	.fan-card :global([data-card]) { width:100%; }
</style>
