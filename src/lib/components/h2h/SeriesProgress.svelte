<script lang="ts">
	import type { SeriesTeamId } from '../../sim/series-types.ts';

	let { stage, progress, onCancel }: {
		stage: string;
		progress: Record<SeriesTeamId | 'series', number>;
		onCancel: () => void;
	} = $props();
</script>

<section class="run">
	<div class="run-status" role="status" aria-live="polite">
		<strong>{stage}</strong>
		<div class="meters">
			<label>Team A season <progress max="162" value={progress['team-a']}></progress><span>{progress['team-a']}/162</span></label>
			<label>Team B season <progress max="162" value={progress['team-b']}></progress><span>{progress['team-b']}/162</span></label>
			<label>Series <progress max="5" value={progress.series}></progress><span>{progress.series}/5</span></label>
		</div>
	</div>
	<button type="button" class="secondary" onclick={onCancel}>Cancel series</button>
</section>

<style>
	.run { display: grid; gap: var(--space-5); padding-block: var(--space-5); border-block: 1px solid var(--border); }
	.run-status { display: grid; gap: var(--space-3); min-width: 0; }
	.meters { display: grid; gap: var(--space-2); }
	.meters label { display: grid; grid-template-columns: 7rem minmax(0, 1fr) 3.5rem; align-items: center; gap: var(--space-2); color: var(--muted); font-size: var(--text-xs); }
	.meters progress { width: 100%; accent-color: var(--accent); }
	.meters span { text-align: right; font-variant-numeric: tabular-nums; }
	button { justify-self: start; }
</style>
