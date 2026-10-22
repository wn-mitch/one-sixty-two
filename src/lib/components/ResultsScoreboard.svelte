<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The season's final record with its facts and the actions beside it, as Results opens. The record
	 * snippet follows the score (a `.season-ledger` list of label and value pairs is styled here), and
	 * the actions snippet fills the side column (`.more-actions` holds its secondary pair).
	 */
	let { wins, losses, heading = $bindable(), busy = false, record, actions }: {
		wins: number;
		losses: number;
		heading?: HTMLHeadingElement;
		busy?: boolean;
		record?: Snippet;
		actions: Snippet;
	} = $props();
</script>

<header class="scoreboard">
	<div class="record-block">
		<h2 id="results-heading" bind:this={heading} tabindex="-1" aria-label={`Final record: ${wins} wins and ${losses} losses`}>
			<span>{wins}<small>W</small></span>
			<i aria-hidden="true">–</i>
			<span>{losses}<small>L</small></span>
		</h2>
		{@render record?.()}
	</div>
	<div class="score-actions" aria-busy={busy}>{@render actions()}</div>
</header>

<style>
	.scoreboard {
		display: grid;
		gap: var(--space-5);
		padding: var(--space-5) var(--space-6);
		background: var(--surface);
		border-block: 1px solid var(--border);
	}
	/* The score and its headline share the first line; the grades and the season's facts follow on one line when they fit. */
	.record-block { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-4) var(--space-6); min-width: 0; }
	.record-block > :global(.clipping) { flex: 1 1 16rem; }
	h2 {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-score);
		font-weight: 850;
		line-height: 1;
		letter-spacing: -.05em;
	}
	h2 > span { display: inline-flex; align-items: baseline; gap: var(--space-2); }
	h2 small {
		color: var(--muted);
		font-size: var(--text-sm);
		font-weight: 650;
		letter-spacing: 0;
	}
	h2 i {
		color: var(--muted);
		font-size: var(--text-2xl);
		font-style: normal;
		font-weight: 500;
	}
	/* One compact line under the record: label and value pairs, separated by thin rules. */
	.record-block :global(.season-ledger) { display: flex; flex-wrap: wrap; gap: var(--space-1) 0; margin: 0; }
	/* Each label sits over its value, so the three facts fit beside the grades on wide screens. */
	.record-block :global(.season-ledger > div) { display: grid; gap: 2px; padding-inline: var(--space-4); border-left: 1px solid var(--border); }
	.record-block :global(.season-ledger > div:first-child) { padding-left: 0; border-left: 0; }
	.record-block :global(.season-ledger dt) { color: var(--muted); font-size: var(--text-xs); }
	.record-block :global(.season-ledger dd) { margin: 0; font-size: var(--text-base); font-weight: 750; font-variant-numeric: tabular-nums; }
	.record-block :global(.season-ledger dd.perfect) { color: var(--success); }
	.record-block :global(.run-difference) { color: var(--muted); font-size: var(--text-sm); }
	.record-block :global(.run-difference.up) { color: var(--success); }
	.record-block :global(.run-difference.down) { color: var(--error); }
	/* Two equal columns: the share pair at full size, then the smaller head-to-head / new-draft pair. */
	.score-actions { display: grid; align-content: center; gap: var(--space-2); width: min(100%, 24rem); }
	.score-actions :global(.more-actions) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); }
	.score-actions :global(:is(button, .button)) { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); white-space: nowrap; }
	.score-actions :global(svg) { flex: none; width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
	.score-actions :global(.more-actions :is(.button, button)) { min-height: 2.75rem; padding-inline: var(--space-3); border-color: var(--border); background: transparent; color: var(--muted); font-size: var(--text-sm); }
	.score-actions :global(.more-actions :is(.button, button):hover) { color: var(--text); background: var(--surface-raised); }
	@media (min-width: 48rem) {
		.scoreboard {
			grid-template-columns: minmax(15rem, 1fr) auto;
			align-items: center;
			gap: var(--space-6) var(--space-8);
		}
		/* The actions shrink to a compact stack so the record, grades and facts keep the width. */
		.score-actions { justify-self: end; width: auto; }
		.score-actions :global(.more-actions :is(.button, button)) { min-height: 2.25rem; padding-inline: var(--space-2); font-size: var(--text-xs); }
		.record-block :global(.season-ledger > div) { padding-inline: var(--space-3); }
	}
	@media (max-width: 40rem) {
		.scoreboard { padding: var(--space-4); }
		h2 { font-size: var(--text-3xl); }
		/* Phones stack each label over its value so the three facts share one row. */
		.record-block :global(.season-ledger) { display: grid; grid-template-columns: repeat(3, minmax(0, max-content)); justify-content: start; }
		.record-block :global(.season-ledger dd) { overflow-wrap: anywhere; }
		.record-block :global(.season-ledger > div) { display: grid; gap: 0; padding-inline: var(--space-3); }
		.score-actions :global(:is(button, .button)) { white-space: normal; text-align: center; line-height: 1.15; }
	}
</style>
