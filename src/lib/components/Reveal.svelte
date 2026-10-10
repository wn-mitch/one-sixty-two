<script lang="ts">
	import { STOCK, roles } from '../cards/tokens.ts';
	import type { Manifest, ReplaySchemaVersion, Roll } from '../game/types.ts';
	import { rollYears } from '../game/draft.ts';
	import { draftRules } from '../game/rules.ts';
	import TeamLogo from './TeamLogo.svelte';

	let { roll, manifest, revealing, pickNumber, schemaVersion, teamColor, lastPick, concealed = false, compact = false }: {
		roll: Roll | null;
		manifest: Manifest;
		revealing: boolean;
		pickNumber: number;
		schemaVersion: ReplaySchemaVersion;
		teamColor?: string;
		/** Summary of the previous pick, shown while no roll is pending. */
		lastPick?: string;
		/** Holds the roll's space without showing it while the pack deals it. */
		concealed?: boolean;
		compact?: boolean;
	} = $props();

	const franchise = $derived(manifest.franchises.find(item => item.id === roll?.franchiseId));
	const years = $derived(roll ? rollYears(roll, manifest, schemaVersion) : null);
	const policy = $derived(draftRules(schemaVersion));
	const palette = $derived(teamColor && !concealed ? roles({ primary: teamColor, secondary: STOCK }) : null);
	// The roll copy grows sideways out of the team mark when a concealed roll lands, on the foil pack's deal tempo.
	let unveiling = $state(false);
	let wasConcealed = false;
	$effect(() => {
		if (wasConcealed && !concealed && roll) unveiling = true;
		wasConcealed = concealed;
	});
	const bannerStyle = $derived(
		palette ? `--reveal-ground: ${palette.field}; --reveal-ink: ${palette.onField};` : undefined
	);
</script>

<section
	class="reveal"
	class:team-colored={palette !== null}
	class:revealing
	class:compact
	class:concealed
	class:unveiling
	style={bannerStyle}
	aria-label="Current draft roll"
	aria-busy={revealing || concealed}
	aria-live="polite"
	aria-atomic="true"
>
	{#if roll}
		<div class="team-mark" data-roll-mark>
			<TeamLogo franchiseId={roll.franchiseId} label={franchise?.name ?? roll.franchiseId} size={compact ? 'small' : 'medium'} />
		</div>
	{/if}
	<div class="reveal-copy" onanimationend={event => { if (event.animationName.endsWith('grow-sideways')) unveiling = false; }}>
		<p class="eyebrow">Pick {pickNumber} of {policy.slots.length}</p>
		{#if roll}
			<div class="roll-copy">
				<h2>{franchise?.name ?? roll.franchiseId}</h2>
				<p class="era">{years?.first}–{years?.last}</p>
			</div>
			<p class="status">{concealed ? 'Dealing a franchise…' : revealing ? 'Revealing your player pool…' : 'Choose one exact season from this franchise.'}</p>
		{:else}
			<h2>Your next great pick.</h2>
			<p class="status">{lastPick ? `Last pick: ${lastPick}` : 'Open a pack to deal a franchise and an era.'}</p>
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
	.reveal.compact { padding: 0; gap: .625rem; border: 0; border-radius: var(--radius); background: transparent; color: var(--text); }
	.compact .team-mark { display: flex; align-items: center; padding: .375rem; background: var(--reveal-ground, var(--surface)); border-radius: var(--radius) 0 0 var(--radius); }
	.compact .reveal-copy { display: flex; align-items: center; gap: .875rem; }
	.compact .roll-copy { order: -1; align-items: center; justify-content: start; gap: .75rem; min-height: 44px; box-sizing: border-box; padding: .5rem .75rem .5rem 0; color: var(--reveal-ink, var(--text)); background: var(--reveal-ground, var(--surface)); border-radius: 0 var(--radius) var(--radius) 0; }
	.compact .team-mark + .reveal-copy { margin-left: -.625rem; }
	.compact h2 { font-size: 1.375rem; text-wrap: nowrap; }
	.compact .era { font-size: 1.25rem; }
	.compact .eyebrow { margin: 0; color: var(--muted); font-size: .75rem; white-space: nowrap; }
	.compact .status { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
	.concealed .team-mark, .concealed .roll-copy { visibility: hidden; }
	.unveiling .roll-copy { animation: grow-sideways var(--motion-deal) var(--ease-out) both; }
	.unveiling .roll-copy > * { animation: slide-in var(--motion-deal) var(--ease-out) both; }
	@keyframes grow-sideways {
		from { clip-path: inset(0 100% 0 0); }
		to { clip-path: inset(0 0 0 0); }
	}
	@keyframes slide-in {
		from { opacity: 0; transform: translateX(-1.5rem); }
		to { opacity: 1; transform: none; }
	}
	:global([data-motion='off']) .unveiling .roll-copy, :global([data-motion='off']) .unveiling .roll-copy > * { animation: none; }
	@media (prefers-reduced-motion: reduce) {
		.revealing .roll-copy, .unveiling .roll-copy, .unveiling .roll-copy > * { animation: none; }
	}
</style>
