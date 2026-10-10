<script lang="ts">
	import type { LibraryView } from '../game/library.ts';
	import type { SeriesField } from '../game/replay-link.ts';
	import type { SeriesTeamId } from '../sim/series-types.ts';

	/** The head-to-head setup: two replay links (or saved seasons), optional names, and run progress. */
	let { fields, fieldErrors, library, running, loading, error, stage, progress, onChoose, onSubmit, onCancel }: {
		fields: Record<SeriesTeamId, SeriesField>;
		fieldErrors: Record<SeriesTeamId, string>;
		library: readonly LibraryView[];
		running: boolean;
		loading: boolean;
		error: string;
		stage: string;
		progress: Record<SeriesTeamId | 'series', number>;
		onChoose: (id: SeriesTeamId, entry: LibraryView) => void;
		onSubmit: (event: SubmitEvent) => void;
		onCancel: () => void;
	} = $props();

	const TEAMS: { id: SeriesTeamId; label: string }[] = [{ id: 'team-a', label: 'Team A' }, { id: 'team-b', label: 'Team B' }];
	const entryLabel = (entry: LibraryView) =>
		`${entry.nickname ? `${entry.nickname} · ` : ''}${entry.record.wins}–${entry.record.losses}${entry.stadium ? ` · ${entry.stadium.name}` : ''}`;

	function choose(id: SeriesTeamId, event: Event): void {
		const select = event.currentTarget as HTMLSelectElement;
		const entry = library.find(item => item.key === select.value);
		if (entry) onChoose(id, entry);
		select.value = '';
	}
</script>

{#if error}<p class="error" role="alert">{error}</p>{/if}
<form class="setup" onsubmit={onSubmit} novalidate>
	{#each TEAMS as team (team.id)}
		<fieldset disabled={running || loading}>
			<legend>{team.label}</legend>
			<label for={`${team.id}-link`}>{team.label} replay link</label>
			<input
				id={`${team.id}-link`}
				type="url"
				inputmode="url"
				autocomplete="off"
				placeholder="https://…/r/…"
				bind:value={fields[team.id].link}
				aria-invalid={fieldErrors[team.id] ? 'true' : undefined}
				aria-describedby={fieldErrors[team.id] ? `${team.id}-error` : undefined}
			/>
			{#if fieldErrors[team.id]}<p id={`${team.id}-error`} class="field-error">{fieldErrors[team.id]}</p>{/if}
			{#if library.length}
				<label for={`${team.id}-library`}>Choose from my seasons</label>
				<select id={`${team.id}-library`} onchange={event => choose(team.id, event)}>
					<option value="">Pick a saved season…</option>
					{#each library as entry (entry.key)}<option value={entry.key}>{entryLabel(entry)}</option>{/each}
				</select>
			{/if}
			<label for={`${team.id}-name`}>Team name <span class="muted">(optional)</span></label>
			<input id={`${team.id}-name`} maxlength="40" placeholder={team.label} bind:value={fields[team.id].name} />
		</fieldset>
	{/each}
	<div class="actions">
		<button class="primary" type="submit" disabled={running || loading}>Play best-of-five</button>
		{#if running}<button type="button" onclick={onCancel}>Cancel</button>{/if}
	</div>
</form>
<div class="progress" role="status" aria-live="polite">
	{#if running}
		<p>{stage}</p>
		<p class="muted">Team A season {progress['team-a']}/162 · Team B season {progress['team-b']}/162{#if progress.series} · Series game {progress.series}{/if}</p>
	{:else if stage}
		<p class="muted">{stage}</p>
	{/if}
</div>

<style>
	.error { margin: 0; color: var(--error); }
	.setup { display: grid; gap: var(--space-4); }
	fieldset { display: grid; gap: var(--space-2); margin: 0; padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); min-width: 0; }
	legend { padding-inline: var(--space-2); font-weight: 800; }
	label { font-size: var(--text-sm); font-weight: 650; }
	label:not(:first-of-type) { margin-top: var(--space-2); }
	input, select { width: 100%; }
	.field-error { margin: 0; color: var(--error); font-size: var(--text-sm); }
	.actions { display: flex; flex-wrap: wrap; gap: var(--space-3); }
	.progress p { margin: var(--space-1) 0; }
	@media (min-width: 48rem) {
		.setup { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.actions { grid-column: 1 / -1; }
	}
</style>
