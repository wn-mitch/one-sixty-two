<script lang="ts">
	import { STOCK, roles } from '../cards/tokens.ts';
	import type { Manifest, ReplaySchemaVersion, Roll } from '../game/types.ts';
	import { draftRules } from '../game/rules.ts';
	import TeamLogo from './TeamLogo.svelte';

	let { roll, manifest, revealing, pickNumber, schemaVersion, teamColor }: {
		roll: Roll | null;
		manifest: Manifest;
		revealing: boolean;
		pickNumber: number;
		schemaVersion: ReplaySchemaVersion;
		teamColor?: string;
	} = $props();

	const franchise = $derived(manifest.franchises.find(item => item.id === roll?.franchiseId));
	const coverage = $derived(manifest.coverage.find(item => item.decade === roll?.decade));
	const policy = $derived(draftRules(schemaVersion));
	const palette = $derived(teamColor ? roles({ primary: teamColor, secondary: STOCK }) : null);
	const bannerStyle = $derived(
		palette ? `--reveal-ground: ${palette.field}; --reveal-ink: ${palette.onField};` : undefined
	);
</script>

<section
	class="reveal"
	class:team-colored={palette !== null}
	class:revealing
	style={bannerStyle}
	aria-label="Current draft roll"
	aria-busy={revealing}
	aria-live="polite"
	aria-atomic="true"
>
	{#if roll}
		<div class="team-mark">
			<TeamLogo franchiseId={roll.franchiseId} label={franchise?.name ?? roll.franchiseId} />
		</div>
	{/if}
	<div class="reveal-copy">
		<p class="eyebrow">Pick {pickNumber} of {policy.slots.length}</p>
		{#if roll}
			<div class="roll-copy">
				<h2>{franchise?.name ?? roll.franchiseId}</h2>
				<p class="era">{Math.max(policy.minYear, coverage?.firstYear ?? roll.decade)}–{Math.min(policy.maxYear, coverage?.lastYear ?? roll.decade + 9)}</p>
			</div>
			<p class="status">{revealing ? 'Revealing your player pool…' : 'Choose one exact season from this franchise.'}</p>
		{:else}
			<h2>Your next great pick.</h2>
			<p class="status">Roll a franchise and an era, then choose the exact season.</p>
		{/if}
	</div>
</section>

<style>
	.reveal {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		min-width: 0;
		padding: var(--space-4);
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
	}
	.reveal.team-colored {
		color: var(--reveal-ink);
		background: var(--reveal-ground);
		border-color: var(--reveal-ground);
	}
	.reveal-copy { min-width: 0; flex: 1; }
	.eyebrow { margin: 0 0 var(--space-1); color: var(--muted); }
	.team-colored .eyebrow { color: var(--reveal-ink); }
	.team-mark { flex: none; }
	h2 {
		margin: 0;
		font: italic 900 2rem/1 'Barlow Condensed', sans-serif;
		letter-spacing: -.015em;
		text-transform: uppercase;
		overflow-wrap: anywhere;
	}
	.roll-copy { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); min-width: 0; }
	.era { flex: none; margin: 0; color: currentColor; font: italic 800 1.5rem/1 'Barlow Condensed', sans-serif; }
	.status { margin: var(--space-2) 0 0; color: var(--muted); font-size: var(--text-sm); }
	.team-colored .status { color: var(--reveal-ink); }
	.revealing .roll-copy { animation: reveal-in 400ms var(--ease-out) both; }
	@keyframes reveal-in {
		from { opacity: 0; transform: translateY(.35rem); }
		to { opacity: 1; transform: translateY(0); }
	}
	@media (min-width: 768px) { h2 { font-size: 3rem; } .era { font-size: 2rem; } }
	@media (max-width: 767px) {
		.reveal { gap: var(--space-3); padding: var(--space-3); }
		.roll-copy { flex-wrap: wrap; gap: .3rem .75rem; }
		.era { margin-top: var(--space-1); }
		.status { font-size: .75rem; }
	}
	@media (prefers-reduced-motion: reduce) {
		.revealing .roll-copy { animation: none; }
	}
</style>
