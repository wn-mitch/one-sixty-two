<script lang="ts">
	import type { SeasonResult } from '#lib/sim/types.ts';
	import TeamLogo from './TeamLogo.svelte';

	interface Props {
		completed: number;
		revealed: number;
		result: SeasonResult | null;
		onskip: () => void;
	}

	let { completed, revealed, result, onskip }: Props = $props();

	let shown = $derived(Math.max(0, Math.min(162, result ? revealed : completed)));
	let record = $derived.by(() => {
		if (!result) return null;
		let wins = 0;
		for (let index = 0; index < shown; index++) if (result.games[index]?.win) wins++;
		return { wins, losses: shown - wins };
	});
	let phase = $derived(result ? 'Revealing the season' : 'Playing the season');
	let progressText = $derived(`${shown} of 162 games ${result ? 'revealed' : 'simulated'}`);
	let latestGame = $derived(result && shown > 0 ? result.games[shown - 1] : null);
</script>

<section class="progress-shell" aria-labelledby="simulation-heading">
	<div class="broadcast-status"><span aria-hidden="true"></span>162-0 / Season broadcast</div>

	<p class="eyebrow">Simulation in progress</p>
	<h2 id="simulation-heading" tabindex="-1">{phase}</h2>
	<p class="game-count"><strong>{shown}</strong><span>/ 162</span></p>
	{#if record}
		<p class="record"><span class="win">{record.wins} W</span><span aria-hidden="true">·</span><span class="loss">{record.losses} L</span></p>
	{:else}
		<p class="record muted">The worker is computing every game independently.</p>
	{/if}
	{#if latestGame}
		<div class="latest-game">
			<TeamLogo franchiseId={latestGame.opponentId} year={2025} label={latestGame.opponentName} size="small" />
			<div><span class="eyebrow">Game {latestGame.number} · Final</span><p>{latestGame.isHome ? 'vs.' : 'at'} {latestGame.opponentName}</p></div>
			<strong class:win={latestGame.win} class:loss={!latestGame.win}>{latestGame.win ? 'W' : 'L'} {latestGame.challengeRuns}–{latestGame.opponentRuns}</strong>
		</div>
	{/if}

	<div class="progress-track">
		<progress value={shown} max="162" aria-label="Season simulation progress" aria-valuetext={progressText}>{progressText}</progress>
	</div>
	<p class="muted explanation">
		{result
			? 'The full result is locked. This replay only reveals the completed games.'
			: 'All 162 games continue, even after a loss.'}
	</p>

	<button class="secondary" type="button" onclick={onskip}>Skip animation</button>
</section>

<style>
	.progress-shell { max-width: 48rem; margin: var(--space-8) auto var(--space-12); }
	.broadcast-status { display: flex; align-items: center; gap: var(--space-2); padding-bottom: var(--space-4); margin-bottom: var(--space-8); border-bottom: 1px solid var(--border); color: var(--muted); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: .1em; }
	.broadcast-status > span { width: var(--space-2); height: var(--space-2); background: var(--accent); border-radius: 50%; }
	h2 { font-size: var(--text-2xl); }
	.game-count { display: flex; align-items: baseline; gap: var(--space-3); margin: var(--space-6) 0 0; }
	.game-count strong { font-size: var(--text-score); font-weight: 850; line-height: 1; letter-spacing: -.05em; }
	.game-count > span { color: var(--muted); font-size: var(--text-xl); font-weight: 650; }
	.record { display: flex; align-items: center; gap: var(--space-2); margin: var(--space-3) 0 var(--space-6); font-size: var(--text-lg); font-weight: 750; }
	.record.muted { font-weight: 500; font-size: var(--text-sm); }
	.win { color: var(--success); }
	.loss { color: var(--error); }
	.latest-game { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-4); background: var(--surface); border-block: 1px solid var(--border); }
	.latest-game > div { flex: 1; min-width: 0; }
	.latest-game p { margin: var(--space-1) 0 0; font-size: var(--text-sm); }
	.latest-game > strong { white-space: nowrap; }
	.progress-track { width: 100%; margin-top: var(--space-6); }
	progress { display: block; width: 100%; height: var(--space-2); border: 0; background: var(--surface-raised); overflow: hidden; }
	progress::-webkit-progress-bar { background: var(--surface-raised); }
	progress::-webkit-progress-value { background: var(--accent); }
	progress::-moz-progress-bar { background: var(--accent); }
	.explanation { max-width: 52ch; margin: var(--space-3) 0 var(--space-6); font-size: var(--text-sm); }
</style>
