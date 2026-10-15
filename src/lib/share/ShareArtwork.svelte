<script lang="ts">
	import { onMount } from 'svelte';
	import GradeBadge from '../components/GradeBadge.svelte';
	import { gradeRange, seasonGrade } from '../game/grade.ts';
	import ShareFan from './ShareFan.svelte';
	import ShareField from './ShareField.svelte';
	import type { ShareFormat, ShareRenderModel } from './types.ts';

	/**
	 * The season share image at 1080×1920, sized so a phone shows every name legibly: the wordmark,
	 * the final record and grade, a line of season facts, then either the roster on the home park's
	 * field or a four-by-four grid of full fronts. The same component renders the local preview and
	 * the published capture.
	 */
	let { model, format = 'field' }: { model: ShareRenderModel; format?: ShareFormat } = $props();
	let hydrated = $state(false);
	const record = $derived(model.record);
	const grade = $derived(seasonGrade(record.wins, record.losses));
	const facts = $derived([
		{ value: record.runsFor.toLocaleString('en-US'), label: 'Runs scored' },
		{ value: record.runsAgainst.toLocaleString('en-US'), label: 'Runs allowed' },
		{ value: record.firstLoss === null ? 'None' : `Game ${record.firstLoss}`, label: 'First loss' },
		{ value: String(record.longestWinningStreak), label: 'Longest win streak' }
	]);
	const expectedImages = $derived.by(() => {
		const urls = new Set<string>();
		for (const entry of model.cards) for (const url of [entry.card.photo, entry.card.logo]) if (url) urls.add(url);
		if (model.homeStadium.photo) urls.add(model.homeStadium.photo.url);
		return [...urls];
	});

	onMount(() => { hydrated = true; });
</script>

<section
	class="share-art"
	data-share-artwork
	data-share-format={format}
	data-share-hydrated={hydrated}
	data-share-ready="false"
	data-share-state="idle"
	role="img"
	aria-label={`${record.wins} wins, ${record.losses} losses${grade ? `, grade ${grade}` : ''} season share artwork`}
>
	<div class="expected-images" aria-hidden="true">
		{#each expectedImages as url}<img data-share-expected-image src={url} alt="" />{/each}
	</div>

	<header class="share-header">
		<div class="title">
			<strong class="wordmark"><i aria-hidden="true"></i>162-0</strong>
			<span class="park">{model.homeStadium.name}</span>
		</div>
		<div class="result">
			<div class="final"><small>Final record</small><div class="record" aria-label={`${record.wins} wins and ${record.losses} losses`}>
				<b>{record.wins}</b><span>–</span><b class="losses">{record.losses}</b>
			</div></div>
			{#if grade}<span class="grade"><span class="badge"><GradeBadge {grade} /></span><small>{gradeRange(grade)}</small></span>{/if}
		</div>
	</header>
	<dl class="facts">{#each facts as fact}<div><dd>{fact.value}</dd><dt>{fact.label}</dt></div>{/each}</dl>

	<div class="body">
		{#if format === 'fan'}<ShareFan {model} />{:else}<ShareField {model} />{/if}
	</div>

	<footer class="share-footer">
		<strong>Beat this at</strong>
		<span>162-0.dev</span>
	</footer>
</section>

<style>
	/* 1080×1920 frame; every length is a share of its width, so the preview scales exactly. */
	[data-share-artwork] { position:relative; box-sizing:border-box; width:100%; aspect-ratio:9/16; container-type:inline-size; overflow:hidden; display:flex; flex-direction:column; gap:2.2cqw; padding:4.4cqw 3.7cqw 3cqw; background:oklch(16% .009 255); color:oklch(97% .006 255); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-variant-numeric:tabular-nums; line-height:1; isolation:isolate; }
	.expected-images { position:absolute; inset:0; z-index:-1; pointer-events:none; opacity:0; }
	.expected-images img { position:absolute; width:1px; height:1px; }

	.share-header { flex:none; display:flex; align-items:center; justify-content:space-between; gap:3cqw; }
	.title { display:grid; gap:1.6cqw; min-width:0; }
	.wordmark { display:inline-flex; align-items:center; gap:1.9cqw; font-size:5.4cqw; font-weight:850; letter-spacing:-.04em; }
	.wordmark i { display:block; width:2.3cqw; height:2.3cqw; border:.4cqw solid currentColor; transform:rotate(45deg); }
	.park { color:oklch(76% .018 255); font:italic 800 4.2cqw / 1 'Barlow Condensed', sans-serif; text-transform:uppercase; letter-spacing:.02em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
	.result { flex:none; display:flex; align-items:center; gap:2.6cqw; }
	.final { display:grid; justify-items:end; gap:1cqw; }
	.final small { color:oklch(76% .018 255); font:700 2.8cqw / 1 'Barlow Condensed', sans-serif; letter-spacing:.08em; text-transform:uppercase; }
	.record { display:flex; align-items:baseline; gap:1.2cqw; font-size:13cqw; font-weight:850; letter-spacing:-.05em; line-height:.85; }
	.record span { color:oklch(52% .016 255); font-weight:600; }
	.record .losses { color:oklch(76% .018 255); }
	.grade { display:grid; justify-items:center; gap:1.2cqw; }
	.badge { font-size:10.5cqw; }
	.grade small { color:oklch(82% .016 255); font:700 2.8cqw / 1 'Barlow Condensed', sans-serif; letter-spacing:.04em; text-transform:uppercase; white-space:nowrap; }

	.facts { flex:none; margin:0; display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); padding:1.8cqw 0; border-block:.19cqw solid oklch(37% .016 255); }
	.facts div { display:flex; flex-direction:column-reverse; align-items:center; gap:1cqw; min-width:0; }
	.facts div + div { border-left:.19cqw solid oklch(37% .016 255); }
	.facts dd { margin:0; font-size:5.6cqw; font-weight:850; letter-spacing:-.03em; white-space:nowrap; }
	.facts dt { color:oklch(76% .018 255); font:700 2.7cqw / 1 'Barlow Condensed', sans-serif; letter-spacing:.06em; text-transform:uppercase; white-space:nowrap; }

	.body { flex:1; min-height:0; display:grid; place-items:center; container-type:size; }

	.share-footer { flex:none; display:flex; align-items:baseline; justify-content:center; gap:1.8cqw; padding-top:2.2cqw; border-top:.19cqw solid oklch(37% .016 255); }
	.share-footer strong { font-size:5.2cqw; letter-spacing:-.04em; white-space:nowrap; }
	.share-footer span { color:oklch(83% .16 120); font-size:5.2cqw; font-weight:850; letter-spacing:-.03em; white-space:nowrap; }
</style>
