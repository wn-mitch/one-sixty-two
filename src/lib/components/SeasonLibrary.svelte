<script lang="ts">
	import type { LibraryView } from '../game/library.ts';

	interface Props {
		entries: readonly LibraryView[];
		status: string;
		onCopy: (entry: LibraryView) => void;
		onRename: (entry: LibraryView, nickname: string) => void;
		onDelete: (entry: LibraryView) => void;
	}
	let { entries, status, onCopy, onRename, onDelete }: Props = $props();

	let sort = $state<'wins' | 'date'>('wins');
	let editing = $state<string | null>(null);
	let draftName = $state('');
	let sorted = $derived([...entries].sort((a, b) => sort === 'wins'
		? b.record.wins - a.record.wins || b.savedAt.localeCompare(a.savedAt)
		: b.savedAt.localeCompare(a.savedAt)));

	const title = (entry: LibraryView) => entry.nickname ?? `${entry.record.wins}–${entry.record.losses}${entry.stadium ? ` at ${entry.stadium.name}` : ''}`;
	const meta = (entry: LibraryView) => [
		...(entry.nickname ? [`${entry.record.wins}–${entry.record.losses}`, ...(entry.stadium ? [entry.stadium.name] : [])] : []),
		`Saved ${date(entry.savedAt)}`,
		...(entry.mvp ? [`MVP ${entry.mvp.label}`] : [])
	].join(' · ');
	const date = (value: string) => new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

	function startRename(entry: LibraryView): void {
		editing = entry.key;
		draftName = entry.nickname ?? '';
	}
	function submitRename(event: SubmitEvent, entry: LibraryView): void {
		event.preventDefault();
		onRename(entry, draftName);
		editing = null;
	}
</script>

<div class="library">
	<fieldset class="sort">
		<legend>Sort by</legend>
		<label><input type="radio" bind:group={sort} value="wins" /> Wins</label>
		<label><input type="radio" bind:group={sort} value="date" /> Date</label>
	</fieldset>
	<p class="status muted" role="status">{status}</p>
	{#if !sorted.length}
		<p class="muted">Finish a season and it is saved here automatically, on this device only.</p>
	{:else}
		<ol class="entries">
			{#each sorted as entry (entry.key)}
				<li class:retired={entry.status === 'retired'}>
					<div class="summary">
						<h2>{title(entry)}</h2>
						<p class="muted">{meta(entry)}</p>
						{#if entry.status === 'retired'}
							<p class="badge">Retired: made with an older version of the game. It can no longer play head-to-head.</p>
						{/if}
						<details>
							<summary>Roster</summary>
							<ul class="roster">
								{#each entry.roster as pick (pick.seasonId)}<li><span class="slot">{pick.slot}</span> {pick.label}</li>{/each}
							</ul>
						</details>
					</div>
					{#if editing === entry.key}
						<form class="rename" onsubmit={event => submitRename(event, entry)}>
							<label for={`name-${entry.key}`}>Nickname</label>
							<input id={`name-${entry.key}`} bind:value={draftName} maxlength="60" />
							<button class="primary" type="submit">Save</button>
							<button type="button" onclick={() => { editing = null; }}>Cancel</button>
						</form>
					{:else}
						<div class="actions">
							{#if entry.status === 'playable'}
								<a class="button primary" href={`/h2h#a=${encodeURIComponent(`/#replay=${entry.token}`)}${entry.nickname ? `&an=${encodeURIComponent(entry.nickname)}` : ''}`}>Play head-to-head</a>
								<button class="secondary" type="button" onclick={() => onCopy(entry)}>Copy challenge link</button>
							{/if}
							<button type="button" onclick={() => startRename(entry)} aria-label={`Rename ${title(entry)}`}>Rename</button>
							<button type="button" onclick={() => onDelete(entry)} aria-label={`Delete ${title(entry)}`}>Delete</button>
						</div>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</div>

<style>
	.library { display: grid; gap: var(--space-4); }
	.sort { display: flex; gap: var(--space-4); align-items: center; margin: 0; padding: 0; border: 0; }
	.sort legend { float: left; margin-right: var(--space-3); color: var(--muted); font-size: var(--text-sm); }
	.sort label { display: inline-flex; gap: var(--space-2); align-items: center; min-height: 2.75rem; }
	.sort input { min-height: 0; }
	.status { min-height: 1.25rem; margin: 0; font-size: var(--text-xs); }
	.entries { display: grid; gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
	.entries > li { display: grid; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); min-width: 0; }
	.retired { opacity: .75; }
	h2 { margin: 0; font-size: var(--text-lg); overflow-wrap: anywhere; }
	.summary p { margin: var(--space-1) 0; font-size: var(--text-sm); }
	.badge { color: var(--muted); font-size: var(--text-xs) !important; font-weight: 650; }
	summary { min-height: 2.75rem; display: flex; align-items: center; cursor: pointer; color: var(--muted); font-size: var(--text-sm); }
	.roster { columns: 2 12rem; margin: 0; padding: 0; list-style: none; font-size: var(--text-sm); }
	.slot { display: inline-block; min-width: 2.5rem; color: var(--muted); font-size: var(--text-xs); font-weight: 700; }
	.actions, .rename { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
	.button { display: inline-flex; align-items: center; text-decoration: none; }
	.rename label { width: 100%; font-size: var(--text-sm); }
	.rename input { flex: 1 1 12rem; }
</style>
