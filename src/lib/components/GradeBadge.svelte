<script lang="ts">
	import { gradeRange, type SeasonGrade } from '../game/grade.ts';

	/** A season grade chip; it sizes from the surrounding font size so it fits any context. */
	let { grade }: { grade: SeasonGrade } = $props();
</script>

<span class="grade" data-grade={grade} title={`Grade ${grade}: ${gradeRange(grade)}`}>{grade}</span>

<style>
	.grade {
		--tone: oklch(68% .03 255);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.6em;
		padding: .1em .32em .06em;
		box-sizing: border-box;
		border-radius: .18em;
		background: var(--tone);
		color: oklch(16% .009 255);
		font: italic 900 1em / 1 'Barlow Condensed', sans-serif;
		letter-spacing: .01em;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.grade[data-grade='Perfect'] { background: linear-gradient(110deg, oklch(88% .15 95), oklch(83% .16 120) 45%, oklch(85% .12 230)); }
	.grade[data-grade='S+'] { --tone: oklch(86% .16 88); }
	.grade[data-grade='S'] { --tone: oklch(79% .15 68); }
	.grade[data-grade='AA'] { --tone: oklch(74% .14 305); }
	.grade[data-grade='A'] { --tone: oklch(76% .12 240); }
	.grade[data-grade='B'] { --tone: oklch(78% .13 155); }
	.grade[data-grade='C'] { --tone: oklch(72% .04 230); }
	.grade[data-grade='D'] { --tone: oklch(66% .06 55); }
	.grade[data-grade='F'] { --tone: oklch(68% .15 25); }
</style>
