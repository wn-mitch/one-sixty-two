<script lang="ts">
	import { onMount } from 'svelte';
	import Card from '../cards/Card.svelte';
	import type { Slot } from '../game/types.ts';
	import type { ShareFormat, ShareRenderModel } from './types.ts';

	let { model, format = 'scorecard' }: { model: ShareRenderModel; format?: ShareFormat } = $props();
	let root = $state<HTMLElement>();
	let hydrated = $state(false);
	const field = $derived(model.cards.slice(0, 9));
	const staff = $derived(model.cards.slice(9));
	const firstLoss = $derived(model.record.firstLoss === null ? 'No losses' : `First loss: Game ${model.record.firstLoss}`);
	const difference = $derived(model.record.runsFor - model.record.runsAgainst);
	const differenceLabel = $derived(`${difference > 0 ? '+' : ''}${difference}`);
	const replayLabel = $derived(model.replayUrl ? model.replayUrl.replace(/^https?:\/\//, '') : 'Replay link prepared when shared');
	const expectedImages = $derived.by(() => {
		const urls: string[] = [];
		const seen = new Set<string>();
		const renderedCards = format === 'wide' ? 9 : model.cards.length;
		for (let index = 0; index < renderedCards; index++) {
			const entry = model.cards[index];
			for (const url of [entry.card.photo, entry.card.logo]) {
				if (!url || seen.has(url)) continue;
				seen.add(url);
				urls.push(url);
			}
		}
		return urls;
	});
	const fieldPosition: Record<Slot, { x: number; y: number }> = {
		C: { x: 50, y: 77 }, '1B': { x: 75.5, y: 62 }, '2B': { x: 63.4, y: 43.4 },
		SS: { x: 36.6, y: 43.4 }, '3B': { x: 24.5, y: 62 }, LF: { x: 17.5, y: 25 },
		CF: { x: 50, y: 17 }, RF: { x: 82.5, y: 25 }, DH: { x: 91, y: 82 },
		SP1: { x: 0, y: 0 }, SP2: { x: 0, y: 0 }, SP3: { x: 0, y: 0 }, CL: { x: 0, y: 0 }, BP: { x: 0, y: 0 }
	};

	onMount(() => { hydrated = true; });
	function ignoreCardDetails(): void { /* Front-only export has no details action. */ }
</script>

<section
	bind:this={root}
	class:scorecard={format === 'scorecard'}
	class:diamond={format === 'diamond'}
	class:wide={format === 'wide'}
	data-share-artwork
	data-share-format={format}
	data-share-hydrated={hydrated}
	data-share-ready="false"
	data-share-state="idle"
	role="img"
	aria-label={`${model.record.wins} wins, ${model.record.losses} losses season share artwork`}
>
	<div class="expected-images" aria-hidden="true">
		{#each expectedImages as url}<img data-share-expected-image src={url} alt="" />{/each}
	</div>

	{#if format === 'scorecard'}
		<header class="brand score-brand"><strong><i aria-hidden="true"></i>162-0</strong><span>My roster · Season final</span></header>
		<section class="score-record" aria-label={`${model.record.wins} wins and ${model.record.losses} losses`}>
			<div class="wins"><b>{model.record.wins}</b><span>W</span></div>
			<div class="losses"><b>{model.record.losses} <small>L</small></b><span>{firstLoss}</span></div>
		</section>
		<section class="text-diamond" aria-label="Starting field">
			<div class="diamond-lines" aria-hidden="true"></div>
			{#each field as entry (entry.seasonId)}
				<div class="text-player" style={`--x:${fieldPosition[entry.slot].x}%;--y:${fieldPosition[entry.slot].y}%`}>
					<strong>{entry.slot}</strong><b>{entry.card.family}</b><span>{entry.card.year} {entry.card.abbr}</span>
				</div>
			{/each}
		</section>
		<section class="score-cards" aria-label="Complete roster">
			{#each model.cards as entry (entry.seasonId)}
				<div class="score-card"><Card s={entry.card} capture onDetails={ignoreCardDetails} /></div>
			{/each}
		</section>
		<footer class="score-footer"><strong>Beat {model.record.wins}–{model.record.losses}.</strong><span>{replayLabel} <b aria-hidden="true">↗</b></span></footer>
	{:else if format === 'diamond'}
		<header class="brand diamond-brand"><strong><i aria-hidden="true"></i>162-0</strong><span>Season final</span></header>
		<section class="diamond-record">
			<div class="record"><b>{model.record.wins}</b><span>–</span><b>{model.record.losses}</b></div>
			<div class="ledger"><span>{firstLoss}</span><span>Longest streak: <b>{model.record.longestWinningStreak} W</b></span><span>Run difference: <b>{differenceLabel}</b></span></div>
		</section>
		<section class="card-diamond" aria-label="Starting field">
			<div class="diamond-lines" aria-hidden="true"></div>
			{#each field as entry (entry.seasonId)}
				<div class="diamond-player" style={`--x:${fieldPosition[entry.slot].x}%;--y:${fieldPosition[entry.slot].y}%`}>
					<div class="diamond-card"><Card s={entry.card} capture onDetails={ignoreCardDetails} /></div><strong>{entry.slot}</strong>
				</div>
			{/each}
		</section>
		<section class="staff" aria-label="Pitching staff">
			{#each staff as entry (entry.seasonId)}
				<div class="staff-player"><div><Card s={entry.card} capture onDetails={ignoreCardDetails} /></div><strong>{entry.slot}</strong></div>
			{/each}
		</section>
		<footer class="diamond-footer"><strong>Can you beat {model.record.wins}–{model.record.losses}?</strong><span>Same roster, same season<br />{replayLabel}</span></footer>
	{:else}
		<section class="wide-field" aria-label="Starting field">
			<div class="diamond-lines" aria-hidden="true"></div>
			{#each field as entry (entry.seasonId)}
				<div class="wide-card" style={`--x:${fieldPosition[entry.slot].x}%;--y:${fieldPosition[entry.slot].y}%`}><Card s={entry.card} capture onDetails={ignoreCardDetails} /></div>
			{/each}
		</section>
		<section class="wide-copy">
			<div class="wide-brand"><i aria-hidden="true"></i><strong>162-0</strong></div>
			<span class="wide-kicker">Season final</span>
			<div class="wide-record"><b>{model.record.wins}</b><span>–</span><b>{model.record.losses}</b></div>
			<span class="wide-detail">{firstLoss} · {model.record.longestWinningStreak}-game win streak</span>
			<div class="wide-challenge"><strong>Can you beat my roster?</strong><span>{replayLabel}</span></div>
		</section>
	{/if}
</section>

<style>
	[data-share-artwork] { position:relative; box-sizing:border-box; width:100%; container-type:inline-size; overflow:hidden; background:oklch(16% .009 255); color:oklch(97% .006 255); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-variant-numeric:tabular-nums; line-height:1; isolation:isolate; }
	.scorecard,.diamond { aspect-ratio:4/5; }
	.wide { aspect-ratio:40/21; display:grid; grid-template-columns:53.333% 46.667%; }
	.expected-images { position:absolute; inset:0; z-index:-1; pointer-events:none; opacity:0; }
	.expected-images img { position:absolute; width:1px; height:1px; }
	.brand { display:flex; justify-content:space-between; align-items:center; }
	.brand strong,.wide-brand { display:inline-flex; align-items:center; font-weight:850; letter-spacing:-.04em; }
	.brand i,.wide-brand i { display:block; border:solid currentColor; transform:rotate(45deg); }
	.brand > span,.wide-kicker { color:oklch(76% .018 255); font-weight:700; letter-spacing:.12em; text-transform:uppercase; }
	.diamond-lines { position:absolute; inset:0; pointer-events:none; }
	.diamond-lines::before { content:''; position:absolute; left:3%; right:3%; top:5%; height:17%; border-top:.18cqw solid oklch(37% .016 255); border-radius:50%; }
	.diamond-lines::after { content:''; position:absolute; left:39%; top:41%; width:22%; aspect-ratio:1; border:.16cqw solid oklch(37% .016 255); background:oklch(27% .016 255 / .58); transform:rotate(45deg); }

	.scorecard { padding:3.7cqw 5.93cqw 0; display:flex; flex-direction:column; }
	.score-brand { flex:none; height:4.45cqw; padding-bottom:2.59cqw; border-bottom:.19cqw solid oklch(37% .016 255); }
	.score-brand strong { gap:1.85cqw; font-size:4.08cqw; }
	.score-brand i { width:1.85cqw; height:1.85cqw; border-width:.32cqw; }
	.score-brand > span { font-size:2.04cqw; }
	.score-record { flex:none; height:25.28cqw; display:grid; grid-template-columns:auto 1fr; align-items:end; gap:3.7cqw; padding:3.33cqw 0 2.78cqw; }
	.wins { display:flex; align-items:baseline; gap:1.3cqw; font-weight:850; letter-spacing:-.05em; line-height:.85; }
	.wins b { font-size:23.15cqw; }
	.wins span { color:oklch(76% .018 255); font-size:5.56cqw; letter-spacing:0; }
	.losses { display:grid; gap:.55cqw; padding-bottom:1.48cqw; color:oklch(76% .018 255); }
	.losses b { font-size:8.9cqw; font-weight:850; letter-spacing:-.05em; }
	.losses small { font-size:3.7cqw; font-weight:650; letter-spacing:0; }
	.losses span { font-size:2.41cqw; }
	.text-diamond { flex:none; position:relative; height:43cqw; border-block:.19cqw solid oklch(37% .016 255); }
	.text-player { position:absolute; left:var(--x); top:var(--y); width:18cqw; transform:translate(-50%,-50%); display:grid; justify-items:center; gap:.25cqw; text-align:center; overflow-wrap:anywhere; }
	.text-player strong { color:oklch(83% .16 120); font-family:'Barlow Condensed',sans-serif; font-style:italic; font-size:2.04cqw; letter-spacing:.06em; }
	.text-player b { font-family:'Barlow Condensed',sans-serif; font-size:3.7cqw; text-transform:uppercase; line-height:.88; }
	.text-player span { color:oklch(76% .018 255); font-size:1.85cqw; }
	.score-cards { flex:none; display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:.9cqw 1.11cqw; padding:2cqw 0; }
	.score-card { width:10.6cqw; justify-self:center; }
	.score-footer { flex:1; min-height:10.1cqw; margin:0 -5.93cqw; padding:2.3cqw 5.93cqw; border-top:.19cqw solid oklch(37% .016 255); display:flex; align-items:center; justify-content:space-between; gap:2cqw; }
	.score-footer strong { font-size:4.81cqw; letter-spacing:-.04em; white-space:nowrap; }
	.score-footer span { max-width:44cqw; padding:1.48cqw 2.41cqw; border-radius:.74cqw; background:oklch(83% .16 120); color:oklch(16% .009 255); font-size:2.35cqw; font-weight:750; overflow-wrap:anywhere; text-align:right; }

	.diamond { display:flex; flex-direction:column; }
	.diamond-brand { flex:none; padding:4.81cqw 5.93cqw 0; }
	.diamond-brand strong { gap:1.85cqw; font-size:4.08cqw; }
	.diamond-brand i { width:1.85cqw; height:1.85cqw; border-width:.32cqw; }
	.diamond-brand > span { font-size:2.04cqw; }
	.diamond-record { flex:none; display:flex; align-items:flex-end; justify-content:space-between; padding:2.78cqw 5.93cqw 0; }
	.record { display:flex; align-items:baseline; gap:1.67cqw; font-weight:850; letter-spacing:-.05em; line-height:.9; }
	.record b { font-size:17.04cqw; }
	.record span { color:oklch(76% .018 255); font-size:8.33cqw; font-weight:500; }
	.ledger { display:grid; gap:.93cqw; padding-bottom:1.67cqw; color:oklch(76% .018 255); font-size:2.41cqw; text-align:right; white-space:nowrap; }
	.ledger b { color:oklch(97% .006 255); }
	.card-diamond { flex:1; min-height:55cqw; position:relative; margin:2cqw 3.7cqw 0; border:.19cqw solid oklch(37% .016 255); border-radius:1.48cqw; background:oklch(21% .012 255); overflow:hidden; }
	.diamond-player { position:absolute; left:var(--x); top:var(--y); transform:translate(-50%,-50%); display:grid; justify-items:center; gap:.56cqw; }
	.diamond-card { width:9.6cqw; }
	.diamond-player strong,.staff-player strong { color:oklch(76% .018 255); font-family:'Barlow Condensed',sans-serif; font-style:italic; font-size:2.22cqw; letter-spacing:.04em; }
	.staff { flex:none; display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:1.67cqw; padding:2.41cqw 5.93cqw 0; }
	.staff-player { display:grid; justify-items:center; gap:.56cqw; }
	.staff-player > div { width:9.6cqw; }
	.diamond-footer { flex:none; min-height:10.8cqw; margin-top:2.3cqw; padding:2.3cqw 5.93cqw; background:oklch(83% .16 120); color:oklch(16% .009 255); display:flex; justify-content:space-between; align-items:center; gap:2.22cqw; }
	.diamond-footer strong { font-size:5cqw; letter-spacing:-.04em; white-space:nowrap; }
	.diamond-footer span { max-width:42cqw; font-size:2.22cqw; font-weight:700; line-height:1.25; text-align:right; overflow-wrap:anywhere; }

	.wide-field { position:relative; background:oklch(21% .012 255); border-right:.17cqw solid oklch(37% .016 255); overflow:hidden; }
	.wide-card { position:absolute; left:var(--x); top:var(--y); width:7.67cqw; transform:translate(-50%,-50%); }
	.wide-copy { display:flex; flex-direction:column; min-width:0; padding:3.67cqw 4cqw 3.33cqw; }
	.wide-brand { gap:1.17cqw; font-size:2.5cqw; }
	.wide-brand i { width:1.08cqw; height:1.08cqw; border-width:.21cqw; }
	.wide-kicker { margin-top:3cqw; font-size:1.5cqw; }
	.wide-record { display:flex; align-items:baseline; gap:.83cqw; font-weight:850; letter-spacing:-.05em; }
	.wide-record b { font-size:9.67cqw; }
	.wide-record span { color:oklch(76% .018 255); font-size:4.67cqw; font-weight:500; }
	.wide-detail { margin-top:.67cqw; color:oklch(76% .018 255); font-size:1.83cqw; line-height:1.2; }
	.wide-challenge { margin-top:auto; display:grid; gap:.83cqw; min-width:0; }
	.wide-challenge strong { font-size:3.33cqw; letter-spacing:-.035em; line-height:1.05; }
	.wide-challenge span { color:oklch(83% .16 120); font-size:1.67cqw; font-weight:650; overflow-wrap:anywhere; }
</style>
