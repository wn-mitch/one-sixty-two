<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { ScheduledGame } from '#lib/game/season-calendar.ts';
	import { arriveAtTop, riseIn, take } from './phase-motion.ts';
	import SeasonReel from './SeasonReel.svelte';

	interface Props {
		/** Games simulated, or revealed once the result exists, for the count and the bar. */
		count: number;
		/** The season's games in order, played or not; null until any exist. */
		games: readonly ScheduledGame[] | null;
		seed: number;
		/** Games lit on the reel and counted in the record. */
		revealed: number;
		/** The result exists and is being revealed. */
		revealing: boolean;
		heading?: string;
		note?: string;
		onskip: () => void;
	}

	let { count, games, seed, revealed, revealing, heading, note, onskip }: Props = $props();

	let shown = $derived(Math.max(0, Math.min(162, count)));
	let lit = $derived(Math.max(0, Math.min(162, revealed)));
	let record = $derived.by(() => {
		if (!games) return null;
		let wins = 0;
		for (let index = 0; index < lit; index++) if (games[index]?.win) wins++;
		return { wins, losses: lit - wins };
	});
	let phase = $derived(heading ?? (revealing ? 'Revealing the season' : 'Playing the season'));
	let progressText = $derived(`${shown} of 162 games ${revealing ? 'revealed' : 'simulated'}`);
	let shell = $state<HTMLElement>();

	onMount(() => {
		// Arriving from the lineup, the broadcast builds up line by line.
		if (take('lineup')) void tick().then(() => { if (shell) { arriveAtTop(); riseIn(shell.children as HTMLCollectionOf<HTMLElement>); } });
	});
</script>

<section bind:this={shell} class="progress-shell" aria-labelledby="simulation-heading">
	<div class="broadcast-status"><span aria-hidden="true"></span>162-0 / Season broadcast</div>

	<h2 id="simulation-heading" tabindex="-1">{phase}</h2>
	<!-- Fixed-height lines and the reel's fixed window keep everything below in place for the whole reveal. -->
	<div class="tally">
		<p class="game-count"><strong>{shown}</strong><span>/ 162</span></p>
		{#if record}
			<p class="record"><span class="win">{record.wins} W</span><span aria-hidden="true">·</span><span class="loss">{record.losses} L</span></p>
		{:else}
			<p class="record muted">Every game is computed independently.</p>
		{/if}
	</div>
	<SeasonReel {games} {seed} shown={lit} />

	<div class="progress-track">
		<progress value={shown} max="162" aria-label="Season simulation progress" aria-valuetext={progressText}>{progressText}</progress>
	</div>
	<p class="muted explanation">
		{note ?? (revealing
			? 'The full result is locked. This replay only reveals the completed games.'
			: 'All 162 games continue, even after a loss.')}
	</p>

	<button class="secondary" type="button" onclick={onskip}>Skip animation</button>
</section>

<style>
	.progress-shell { max-width: 48rem; margin: var(--space-8) auto var(--space-12); }
	.broadcast-status { display: flex; align-items: center; gap: var(--space-2); padding-bottom: var(--space-3); margin-bottom: var(--space-4); border-bottom: 1px solid var(--border); color: var(--muted); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: .1em; }
	.broadcast-status > span { width: var(--space-2); height: var(--space-2); background: var(--accent); border-radius: 50%; }
	h2 { font-size: var(--text-2xl); }
	/* Count and record share one row of fixed height; the record wraps within its column, never under the count. */
	.tally { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: var(--space-4); min-height: calc(var(--text-score) * 1.1); margin: var(--space-3) 0; }
	.tally .record { justify-self: end; text-align: right; }
	.game-count { display: flex; align-items: baseline; gap: var(--space-3); margin: 0; }
	.game-count strong { font-size: var(--text-score); font-weight: 850; line-height: 1; letter-spacing: -.05em; }
	.game-count > span { color: var(--muted); font-size: var(--text-xl); font-weight: 650; }
	.record { display: flex; align-items: center; gap: var(--space-2); margin: 0; font-size: var(--text-lg); font-weight: 750; }
	.record.muted { display: block; font-weight: 500; font-size: var(--text-sm); }
	.win { color: var(--success); }
	.loss { color: var(--error); }
	.progress-track { width: 100%; margin-top: var(--space-3); }
	progress { display: block; width: 100%; height: var(--space-2); border: 0; background: var(--surface-raised); overflow: hidden; }
	progress::-webkit-progress-bar { background: var(--surface-raised); }
	progress::-webkit-progress-value { background: var(--accent); }
	progress::-moz-progress-bar { background: var(--accent); }
	.explanation { max-width: 52ch; margin: var(--space-2) 0 var(--space-3); font-size: var(--text-sm); }
	/* Short phones keep Skip animation on the first screen. */
	@media (max-width: 47.999rem) {
		.progress-shell { margin-top: var(--space-3); }
		.game-count strong { font-size: 3rem; }
		.tally { min-height: 3.3rem; margin-block: var(--space-2); }
	}
</style>
