<script lang="ts">
	import type { LibraryView } from '../../game/library.ts';
	import { winsAtShare } from '../../game/win-distribution.ts';
	import WinChart from '../WinChart.svelte';

	/** Every saved season's record drawn as a curve, for all parks or one home park. */
	let { entries }: { entries: readonly LibraryView[] } = $props();
	const ALL = '';
	let park = $state(ALL);
	const parks = $derived.by(() => {
		const names = new Map<string, { name: string; seasons: number }>();
		for (const entry of entries) {
			if (!entry.stadium) continue;
			const seen = names.get(entry.stadium.id);
			names.set(entry.stadium.id, { name: entry.stadium.name, seasons: (seen?.seasons ?? 0) + 1 });
		}
		return [...names].map(([id, value]) => ({ id, ...value })).sort((a, b) => a.name.localeCompare(b.name));
	});
	// A park whose last season was deleted falls back to every park.
	const chosen = $derived(parks.find(item => item.id === park) ?? null);
	const shown = $derived(chosen ? entries.filter(entry => entry.stadium?.id === chosen.id) : entries);
	const distribution = $derived.by(() => {
		const counts = new Map<number, number>();
		for (const entry of shown) counts.set(entry.record.wins, (counts.get(entry.record.wins) ?? 0) + 1);
		return [...counts];
	});
	const best = $derived(shown.reduce<LibraryView | null>((top, entry) => !top || entry.record.wins > top.record.wins ? entry : top, null));
	const typical = $derived(winsAtShare(distribution, 0.5));
	const where = $derived(chosen ? `at ${chosen.name}` : 'at every park');
</script>

{#if entries.length}
	<section class="records" aria-labelledby="records-heading">
		<div class="head">
			<h2 id="records-heading">Your records</h2>
			{#if parks.length > 1}
				<label><span class="sr-only">Home park</span>
					<select bind:value={park}>
						<option value={ALL}>All parks</option>
						{#each parks as item (item.id)}<option value={item.id}>{item.name} ({item.seasons})</option>{/each}
					</select>
				</label>
			{/if}
		</div>
		{#if best}
			<dl class="figures">
				<div><dt>Seasons</dt><dd>{shown.length}</dd></div>
				<div><dt>Best</dt><dd>{best.record.wins}–{best.record.losses}</dd></div>
				<div><dt>Typical</dt><dd>{typical} W</dd></div>
			</dl>
			{#if shown.length > 1}<WinChart {distribution} subject={`Your seasons ${where}`} />{/if}
		{/if}
	</section>
{/if}

<style>
	.records { display: grid; gap: var(--space-3); min-width: 0; margin-bottom: var(--space-5); padding-bottom: var(--space-5); border-bottom: 1px solid var(--border); }
	.head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-3); }
	h2 { margin: 0; font-size: var(--text-xl); }
	select { min-height: 2.75rem; max-width: 100%; }
	.figures { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); margin: 0; }
	.figures div { display: grid; gap: 2px; }
	dt { color: var(--muted); font-size: var(--text-xs); }
	dd { margin: 0; font-size: var(--text-xl); font-weight: 750; }
</style>
