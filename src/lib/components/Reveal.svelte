<script lang="ts">
	import { STOCK, roles } from '../cards/tokens.ts';
	import { isJackpot, type Manifest, type ReplaySchemaVersion, type Roll } from '../game/types.ts';
	import { GEMHOLO } from '../cards/finish.ts';
	import { rollYears } from '../game/draft.ts';
	import { draftRules } from '../game/rules.ts';
	import TeamLogo from './TeamLogo.svelte';

	let { roll, manifest, revealing, pickNumber, schemaVersion, teamColor, concealed = false, compact = false, bar = false }: {
		roll: Roll | null;
		manifest: Manifest;
		revealing: boolean;
		pickNumber: number;
		schemaVersion: ReplaySchemaVersion;
		teamColor?: string;
		/** Summary of the previous pick, shown while no roll is pending. */
		/** Holds the roll's space without showing it while the pack deals it. */
		concealed?: boolean;
		compact?: boolean;
		/** One-line phone toolbar form: the pick count over a truncating franchise name and era. */
		bar?: boolean;
	} = $props();

	const team = $derived(roll && !isJackpot(roll) ? roll : null);
	const jackpot = $derived(roll && isJackpot(roll) ? roll : null);
	const franchise = $derived(manifest.franchises.find(item => item.id === team?.franchiseId));
	const years = $derived(team ? rollYears(team, manifest, schemaVersion) : null);
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
	class:bar
	class:concealed
	class:unveiling
	style={bannerStyle}
	aria-label="Current draft roll"
	aria-busy={revealing || concealed}
	aria-live="polite"
	aria-atomic="true"
>
	{#if team}
		<div class="team-mark" data-roll-mark>
			<TeamLogo franchiseId={team.franchiseId} label={franchise?.name ?? team.franchiseId} size={compact || bar ? 'small' : 'medium'} />
		</div>
	{:else if jackpot}
		<div class="team-mark jackpot-mark" data-roll-mark style:--foil={GEMHOLO}><span aria-hidden="true"></span></div>
	{/if}
	<div class="reveal-copy" onanimationend={event => { if (event.animationName.endsWith('grow-sideways')) unveiling = false; }}>
		<!-- The wide header shows a rolled pick's count beside its controls instead. -->
		{#if !(compact && roll)}<p class="eyebrow">Pick {pickNumber} of {policy.slots.length}</p>{/if}
		{#if jackpot}
			<div class="roll-copy">
				<h2>Jackpot</h2>
				<p class="era">{jackpot.jackpot.length} elite seasons</p>
			</div>
			<p class="status">{concealed ? 'Dealing a pack…' : revealing ? 'Revealing your player pool…' : 'Choose one elite season from any franchise.'}</p>
		{:else if team}
			<div class="roll-copy">
				<h2>{franchise?.name ?? team.franchiseId}</h2>
				<p class="era">{years?.first}–{years?.last}</p>
			</div>
			<p class="status">{concealed ? 'Dealing a franchise…' : revealing ? 'Revealing your player pool…' : 'Choose one exact season from this franchise.'}</p>
		{:else}
			<h2>Your next great pick.</h2>
			<p class="status">Open a pack to deal a franchise and an era.</p>
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
	/* A jackpot has no franchise mark: a gem-foil tile with a star stands in at the logo's size. */
	.jackpot-mark { --mx: 50%; --my: 50%; display: grid; place-items: center; width: 3rem; height: 3rem; background: var(--foil); border-radius: var(--radius); }
	.compact .team-mark.jackpot-mark, .bar .team-mark.jackpot-mark { display: grid; width: 2.25rem; height: 2.25rem; padding: 0; background: var(--foil); border-radius: var(--radius); }
	.jackpot-mark span { width: 62%; height: 62%; background: oklch(22% .03 280); clip-path: polygon(50% 0, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%); }
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
	.reveal.bar { flex: 1; gap: .5rem; min-height: 3rem; box-sizing: border-box; padding: .25rem .75rem .25rem .25rem; border-radius: var(--radius); }
	.reveal.bar:not(:has(.team-mark)) { padding-left: .75rem; }
	.bar .team-mark { display: flex; }
	/* The franchise name takes the whole first line; the era and pick count share the second. */
	.bar .reveal-copy { display: flex; flex-wrap: wrap; align-items: baseline; gap: .125rem .5rem; }
	.bar .roll-copy { display: contents; }
	.bar h2 { order: -1; flex: 1 0 100%; min-width: 0; overflow: hidden; font-size: 1.25rem; overflow-wrap: normal; text-overflow: ellipsis; white-space: nowrap; }
	.bar .era { order: -1; margin: 0; font-size: .9375rem; }
	.bar .eyebrow { margin: 0; font-size: .6875rem; line-height: 1; letter-spacing: .04em; text-transform: uppercase; }
	.team-colored.bar .eyebrow { opacity: .8; }
	.bar .status { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
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
