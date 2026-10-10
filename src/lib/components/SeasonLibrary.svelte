<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { createCardViewModel, type CardMediaStatus, type CardViewModel } from '../cards/view-model.ts';
	import type { LibraryView } from '../game/library.ts';
	import { libraryLeaders, stars } from '../game/library-stats.ts';
	import { seriesTally, type SeriesRecord } from '../game/series-history.ts';
	import type { Manifest, Profile } from '../game/types.ts';
	import { loadMedia } from '../media/client.ts';
	import type { MediaManifest } from '../media/types.ts';
	import LibraryCompare from './library/LibraryCompare.svelte';
	import LibraryLeaders from './library/LibraryLeaders.svelte';
	import LibraryTeam from './library/LibraryTeam.svelte';
	import LibraryTile from './library/LibraryTile.svelte';

	interface Props {
		entries: readonly LibraryView[];
		history: readonly SeriesRecord[];
		/** Profiles by entry key, for playable clubs whose seasons have loaded. */
		profiles: ReadonlyMap<string, readonly Profile[]>;
		manifest: Manifest | null;
		status: string;
		onCopy: (entry: LibraryView) => void;
		onRename: (entry: LibraryView, nickname: string) => void;
		onDelete: (entry: LibraryView) => void;
		/** Clubs selected on first render; one shows that club, two compare them. */
		initialSelection?: readonly string[];
	}
	let { entries, history, profiles, manifest, status, onCopy, onRename, onDelete, initialSelection = [] }: Props = $props();

	let sort = $state<'wins' | 'date'>('wins');
	let comparing = $state(false);
	let chosen = $state<string[]>(untrack(() => initialSelection.slice(0, 2)));
	let panel = $state<HTMLElement>();
	let media = $state.raw<MediaManifest | null>(null);
	let mediaStatus = $state<CardMediaStatus>('loading');

	onMount(() => {
		let live = true;
		loadMedia().then(value => { if (live) { media = value; mediaStatus = 'ready'; } }).catch(() => { if (live) mediaStatus = 'unavailable'; });
		return () => { live = false; };
	});

	const sorted = $derived([...entries].sort((a, b) => sort === 'wins'
		? b.record.wins - a.record.wins || b.savedAt.localeCompare(a.savedAt)
		: b.savedAt.localeCompare(a.savedAt)));
	const selected = $derived(chosen.map(key => entries.find(entry => entry.key === key)).filter((entry): entry is LibraryView => !!entry));
	const leaders = $derived(libraryLeaders(entries));
	const cards = $derived.by(() => {
		const byEntry = new Map<string, Map<string, CardViewModel>>();
		for (const entry of entries) {
			const loaded = profiles.get(entry.key);
			if (!loaded) continue;
			const slots = new Map(entry.roster.map(pick => [pick.seasonId, pick.slot]));
			byEntry.set(entry.key, new Map(loaded.map(profile => [profile.seasonId, createCardViewModel({ profile, slot: slots.get(profile.seasonId) ?? null, media, manifest, mediaStatus })])));
		}
		return byEntry;
	});
	const fan = (entry: LibraryView) => {
		const views = cards.get(entry.key);
		if (!views) return [];
		return stars(entry, 6).flatMap(seasonId => { const view = views.get(seasonId); return view ? [{ seasonId, view }] : []; });
	};

	/** Plain click shows one club; Ctrl/Cmd-click, or any click while comparing, builds a pair. */
	async function select(key: string, event: MouseEvent | KeyboardEvent): Promise<void> {
		const additive = comparing || event.ctrlKey || event.metaKey;
		const current = selected.map(entry => entry.key);
		if (additive) chosen = current.includes(key) ? current.filter(item => item !== key) : [...current, key].slice(-2);
		else chosen = current.length === 1 && current[0] === key ? [] : [key];
		await tick();
		// Single-column layouts put the panel below the tiles.
		if (panel && chosen.length && panel.getBoundingClientRect().top > innerHeight) panel.scrollIntoView({ block: 'start' });
	}
	function pick(key: string): void {
		chosen = [key];
		panel?.scrollIntoView({ block: 'nearest' });
	}
	function remove(entry: LibraryView): void {
		chosen = chosen.filter(key => key !== entry.key);
		onDelete(entry);
	}
</script>

<div class="library">
	<div class="toolbar">
		<div class="toggle" role="group" aria-label="Sort clubs">
			<button type="button" aria-pressed={sort === 'wins'} onclick={() => sort = 'wins'}>Most wins</button>
			<button type="button" aria-pressed={sort === 'date'} onclick={() => sort = 'date'}>Most recent</button>
		</div>
		<button type="button" class="compare-toggle" aria-pressed={comparing} onclick={() => comparing = !comparing}>Compare</button>
		<p class="hint">{comparing ? 'Choose two clubs to compare.' : 'Ctrl- or ⌘-click two clubs to compare.'}</p>
	</div>
	<p class="status muted" role="status">{status}</p>

	{#if !sorted.length}
		<p class="empty muted">Finish a season and it is saved here automatically, on this device only.</p>
	{:else}
		<div class="columns">
			<ol class="tiles" aria-label="Saved clubs">
				{#each sorted as entry (entry.key)}
					<li>
						<LibraryTile {entry} stars={fan(entry)} tally={seriesTally(history, entry.key)} selected={chosen.includes(entry.key)} onSelect={event => void select(entry.key, event)} />
					</li>
				{/each}
			</ol>
			<div class="panel" bind:this={panel}>
				{#if selected.length === 2}
					<LibraryCompare a={selected[0]} b={selected[1]} {cards} {history} onClose={() => chosen = []} />
				{:else if selected.length === 1}
					{@const entry = selected[0]}
					<LibraryTeam
						{entry}
						cards={cards.get(entry.key) ?? new Map()}
						history={history.filter(record => record.teams.some(side => side.libraryKey === entry.key))}
						tally={seriesTally(history, entry.key)}
						{onCopy}
						{onRename}
						onDelete={remove}
						onClose={() => chosen = []}
					/>
				{:else}
					<LibraryLeaders groups={leaders} onPick={pick} />
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.library { display: grid; gap: var(--space-3); }
	.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); }
	.toggle { display: inline-flex; padding: 3px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); }
	.toggle button, .compare-toggle { min-height: 2.25rem; padding: .25rem .9rem; border: 0; border-radius: 999px; background: transparent; color: var(--muted); font-size: var(--text-sm); }
	.toggle button[aria-pressed='true'] { background: var(--surface-raised); color: var(--text); box-shadow: 0 1px 0 color-mix(in oklch, var(--text) 12%, transparent); }
	.compare-toggle { border: 1px solid var(--border); }
	.compare-toggle[aria-pressed='true'] { border-color: var(--accent); color: var(--accent); }
	.hint { margin: 0; color: var(--muted); font-size: var(--text-xs); }
	.status { min-height: 1.25rem; margin: 0; font-size: var(--text-xs); }
	.empty { margin: 0; }
	.columns { display: grid; gap: var(--space-6); align-items: start; }
	.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(12.5rem, 1fr)); gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
	.panel { min-width: 0; padding: var(--space-5); border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); scroll-margin-top: var(--space-4); }
	@media (min-width: 64rem) {
		.columns { grid-template-columns: minmax(0, 1fr) minmax(24rem, 30rem); }
		.panel { position: sticky; top: var(--space-4); max-height: calc(100dvh - 2 * var(--space-4)); overflow-y: auto; }
	}
	@media (max-width: 40rem) {
		.tiles { grid-template-columns: 1fr 1fr; gap: var(--space-2); }
		.panel { padding: var(--space-4); }
	}
</style>
