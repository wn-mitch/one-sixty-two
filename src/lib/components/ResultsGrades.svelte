<script lang="ts">
	import { backOut } from 'svelte/easing';
	import { gradeRange, type SeasonGrade } from '../game/grade.ts';
	import { scoutEdgeText, type ScoutingReport } from '../game/scouting.ts';
	import { appSettings } from '../game/settings.svelte.ts';
	import GradeBadge from './GradeBadge.svelte';

	/**
	 * The season's grades beside the record: what the season earned, what the roster was built for
	 * with the gap between them as the season's luck, and how the draft's picks compare with the
	 * card the list showed first. Each grade stamps down like a sticker pressed onto the scoreboard.
	 */
	let { wins, grade, rosterGrade, expected, scouting = null }: {
		wins: number; grade: SeasonGrade | null; rosterGrade: SeasonGrade | null; expected: number | null; scouting?: ScoutingReport | null;
	} = $props();
	const luck = $derived(expected === null ? null : Math.round(wins - expected));

	/** `swell` is how far past full size the stamp starts: a letter grade lands from far above, the scouting word from closer, so it stays on screen. */
	function stamp(_: Element, { order, swell = .9 }: { order: number; swell?: number }) {
		const motion = appSettings.effectiveEnabled;
		const tilt = order ? 7 : -7;
		return {
			delay: motion ? 220 + order * 140 : 0,
			duration: motion ? 420 : 0,
			easing: backOut,
			css: (t: number, u: number) => `transform: scale(${1 + swell * u}) rotate(${tilt * u}deg); opacity: ${Math.min(1, t * 3)};`
		};
	}
</script>

{#if grade || (rosterGrade && expected !== null)}
	<div class="grades">
		{#if grade}
			<p class="grade season-grade">
				<span class="badge" aria-hidden="true" in:stamp|global={{ order: 0 }}><GradeBadge {grade} /></span>
				<span class="label" aria-hidden="true">Season</span>
				<span class="detail" aria-hidden="true">{gradeRange(grade)}</span>
				<span class="sr-only">Season {grade} · {gradeRange(grade)}</span>
			</p>
		{/if}
		{#if rosterGrade && expected !== null}
			<p class="grade draft-grade" title="The roster's average over many seasons, before this season's luck">
				<span class="badge" aria-hidden="true" in:stamp|global={{ order: 1 }}><GradeBadge grade={rosterGrade} /></span>
				<span class="label" aria-hidden="true">Draft</span>
				<span class="detail" aria-hidden="true">Built for {Math.round(expected)}{#if luck}<span class="sep">{' · '}</span><span class="luck" class:up={luck > 0}>{luck > 0 ? '+' : '−'}{Math.abs(luck)} luck</span>{/if}</span>
				<span class="sr-only">Draft {rosterGrade} · built for about {Math.round(expected)} wins</span>
			</p>
		{/if}
		{#if scouting}
			<p class="grade scouting" title={`Picks compared with the card the list showed first by WAR/162. ${scouting.chalk} of 16 picks took it.`}>
				<span class="badge scout-name" in:stamp|global={{ order: 2, swell: .3 }}>{scouting.label}</span>
				<span class="label" aria-hidden="true">Scouting</span>
				<span class="detail">{scoutEdgeText(scouting.edge)}</span>
			</p>
		{/if}
	</div>
{/if}

<style>
	.grades { display: flex; gap: var(--space-3); min-width: 0; }
	.grade {
		position: relative;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		grid-template-areas: 'badge label' 'badge detail';
		align-items: center;
		column-gap: var(--space-3);
		min-width: 0;
		margin: 0;
		padding: var(--space-2) var(--space-4) var(--space-2) var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--background);
	}
	.badge { grid-area: badge; display: block; font-size: var(--text-3xl); transform-origin: 50% 60%; }
	.label { grid-area: label; align-self: end; color: var(--muted); font-size: var(--text-xs); font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
	.detail { grid-area: detail; align-self: start; font-size: var(--text-sm); font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
	/* The draft grade is the expectation, so it sits a step quieter than the season it set up. */
	.draft-grade .badge { font-size: var(--text-2xl); }
	.draft-grade { border-style: dashed; }
	.scouting { grid-template-areas: 'label' 'badge' 'detail'; grid-template-columns: minmax(0, 1fr); padding-inline: var(--space-4); }
	.scout-name { font-family: var(--font-control); font-size: var(--text-xl); font-weight: 750; letter-spacing: var(--control-tracking); line-height: 1.1; transform-origin: 0 60%; }
	.luck { color: var(--error); }
	.luck.up { color: var(--success); }
	/* Phones read the grades as one compact table: label, grade, detail on each row. */
	@media (max-width: 40rem) {
		/* The table clips its stamps, so a swelling badge never widens the phone page. */
		.grades { display: grid; gap: 0; overflow: clip; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--background); }
		.grade {
			grid-template-columns: 4.75rem auto minmax(0, 1fr);
			grid-template-areas: 'label badge detail';
			column-gap: var(--space-3);
			padding: 6px var(--space-3);
			border: 0;
			border-radius: 0;
			background: none;
		}
		.grade + .grade { border-top: 1px solid var(--border); }
		.draft-grade { border-style: solid; }
		.badge, .draft-grade .badge { font-size: var(--text-base); }
		.label, .detail { align-self: center; }
		.detail { white-space: normal; font-size: var(--text-xs); }
		.grade.scouting { grid-template-columns: 4.75rem minmax(0, 1fr); grid-template-areas: 'label badge' 'label detail'; padding-inline: var(--space-3); }
		.scout-name { font-size: var(--text-base); }
	}
</style>
