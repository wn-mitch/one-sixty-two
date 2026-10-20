<script lang="ts">
	import { onMount } from 'svelte';
	import DailyCurve from '#lib/components/DailyCurve.svelte';
	import { dailyLabel } from '#lib/game/daily.ts';
	import { dailyEntry, loadDailyBoard, reportDailyName, type DailyBoardView } from '#lib/game/standings.ts';
	import { deviceDb } from '#lib/storage/db.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const label = $derived(dailyLabel(data.date));
	const title = $derived(`Daily ${label} board | 162-0`);
	const description = $derived(`The best verified runs of the ${label} daily on 162-0, and how every run that day finished.`);
	const canonical = $derived(`https://162-0.dev/daily/${data.date}`);

	let view = $state<DailyBoardView | null>(null);
	let error = $state('');
	/** This device's own entry that day; only a device with a counted run may report names. */
	let mine = $state<string | null>(null);
	let reported = $state(new Set<string>());
	let reportError = $state('');
	let request = 0;
	const count = (value: number) => value.toLocaleString('en-US');
	const signed = (value: number) => value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '±0';

	async function load(): Promise<void> {
		const current = ++request;
		error = '';
		try {
			const [board, entry] = await Promise.all([
				loadDailyBoard(data.date, location.origin),
				deviceDb().then(({ db }) => dailyEntry(db, data.date)).catch(() => null)
			]);
			if (current !== request) return;
			view = board;
			mine = entry;
		} catch (caught) {
			if (current === request) error = caught instanceof Error ? caught.message : 'The board could not be loaded.';
		}
	}

	async function report(entry: string): Promise<void> {
		reportError = '';
		try {
			await reportDailyName((await deviceDb()).db, data.date, entry, location.origin);
			reported = new Set([...reported, entry]);
		} catch (caught) {
			reportError = caught instanceof Error ? caught.message : 'The report could not be sent. Please retry.';
		}
	}

	onMount(() => {
		void load();
		return () => { request++; };
	});
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonical} />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={canonical} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
</svelte:head>

<main class="board-page">
	<header>
		<h1>Daily <span>{label}</span> board</h1>
		{#if view}
			<p class="lede">{view.total === 0 ? 'No runs yet.' : `${count(view.total)} daily ${view.total === 1 ? 'run' : 'runs'}${view.final ? '' : ' so far'}.`} The board lists only runs the server has replayed.</p>
		{/if}
	</header>

	{#if error}
		<p class="error" role="alert">{error}</p>
		<button class="secondary" type="button" onclick={load}>Retry</button>
	{:else if !view}
		<p class="muted" role="status">Loading the board…</p>
	{:else}
		{#if view.total > 1}
			<section aria-label="How every run finished"><DailyCurve distribution={view.distribution} /></section>
		{/if}
		{#if view.board.length}
			<ol class="board" aria-label={`Daily ${label} board`}>
				{#each view.board as row, index (row.entry)}
					<li class:mine={row.entry === mine}>
						<span class="place">{index + 1}</span>
						<span class="who">
							<span class="name" class:anonymous={!row.name}>{row.name ?? 'Anonymous'}</span>{#if row.entry === mine}<span class="you">You</span>{/if}
							{#if row.copies > 1}<span class="copies">{row.copies} runs with this roster</span>{/if}
						</span>
						<span class="record" aria-label={`${row.wins} wins, ${row.losses} losses, run difference ${signed(row.runDiff)}`}>{row.wins}–{row.losses} <small>{signed(row.runDiff)}</small></span>
						<span class="row-actions">
							<a href={`/r/${row.replayId}`} aria-label={`Replay ${row.name ?? 'Anonymous'}’s season`}>Replay</a>
							{#if row.name && mine && row.entry !== mine && !view.final}
								{#if reported.has(row.entry)}<span class="muted">Reported</span>
								{:else}<button class="report" type="button" aria-label={`Report the name ${row.name}`} onclick={() => void report(row.entry)}>Report</button>{/if}
							{/if}
						</span>
					</li>
				{/each}
			</ol>
			{#if reportError}<p class="error" role="alert">{reportError}</p>{/if}
		{:else}
			<p class="muted">{view.total ? 'No run has been checked yet. Runs join the board once the server has replayed them.' : 'Nobody has finished this daily yet.'}</p>
		{/if}
		<p class="rules muted">Names follow the <a href="/conduct">board name rules</a>.</p>
	{/if}
</main>

<style>
	.board-page { width: min(100%, 44rem); margin-inline: auto; padding: var(--space-8) 0 var(--space-16); display: grid; gap: var(--space-6); }
	h1 { margin: 0; font-size: clamp(var(--text-2xl), 7vw, var(--text-3xl)); }
	h1 span { color: var(--accent); }
	.lede { margin: var(--space-2) 0 0; color: var(--muted); }
	.board { list-style: none; margin: 0; padding: 0; display: grid; border-top: 1px solid var(--border); }
	li { display: grid; grid-template-columns: 2rem minmax(0, 1fr) auto; grid-template-areas: 'place who record' 'place actions actions'; gap: var(--space-1) var(--space-3); align-items: center; padding: var(--space-3) var(--space-2); border-bottom: 1px solid var(--border); }
	li.mine { background: color-mix(in oklch, var(--accent) 10%, transparent); }
	.place { grid-area: place; align-self: start; font-weight: 800; font-variant-numeric: tabular-nums; color: var(--muted); }
	.who { grid-area: who; display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 var(--space-2); min-width: 0; }
	.name { font-weight: 700; overflow-wrap: anywhere; }
	.name.anonymous { color: var(--muted); font-weight: 500; }
	.you { font-size: var(--text-xs); font-weight: 750; color: var(--accent); text-transform: uppercase; letter-spacing: .06em; }
	.copies { flex-basis: 100%; font-size: var(--text-xs); color: var(--muted); }
	.record { grid-area: record; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
	.record small { color: var(--muted); font-weight: 600; }
	.row-actions { grid-area: actions; display: flex; gap: var(--space-4); align-items: center; font-size: var(--text-sm); }
	.row-actions a, .report { display: inline-flex; min-height: 2.75rem; align-items: center; }
	.report { padding: 0; border: 0; background: none; color: var(--muted); text-decoration: underline; font: inherit; cursor: pointer; }
	.rules { margin: 0; font-size: var(--text-sm); }
	.error { color: var(--error); }
	@media (min-width: 40rem) {
		li { grid-template-columns: 2.5rem minmax(0, 1fr) auto auto; grid-template-areas: 'place who record actions'; }
	}
</style>
