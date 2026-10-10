<script module lang="ts">
	export interface SeasonsWorkshopProps {
		initial?: 'leaders' | 'club' | 'compare' | 'empty' | 'blocked';
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import SeasonLibrary from '#lib/components/SeasonLibrary.svelte';
	import { STORAGE_NOTICE, type LibraryView } from '#lib/game/library.ts';
	import type { SeriesRecord } from '#lib/game/series-history.ts';
	import type { Manifest, Profile } from '#lib/game/types.ts';
	import { getExampleSeries } from './series-fixtures.ts';
	import StoryFrame from './StoryFrame.svelte';

	let { initial = 'leaders' }: SeasonsWorkshopProps = $props();
	let saved: LibraryView[] = [];
	let entries = $state.raw<LibraryView[]>([]);
	let history = $state.raw<SeriesRecord[]>([]);
	let profiles = $state.raw<ReadonlyMap<string, readonly Profile[]>>(new Map());
	let manifest = $state.raw<Manifest | null>(null);
	let instance = $state(0);
	const selection = $derived(initial === 'club' ? saved.slice(0, 1).map(entry => entry.key) : initial === 'compare' ? saved.slice(0, 2).map(entry => entry.key) : []);
	let status = $state('');
	let loading = $state(true);
	let error = $state('');

	function reset(): void {
		entries = initial === 'empty' || initial === 'blocked' ? [] : saved;
		status = initial === 'blocked' ? STORAGE_NOTICE : '';
		instance += 1;
	}

	function rename(entry: LibraryView, nickname: string): void {
		const trimmed = nickname.trim();
		entries = entries.map(item => {
			if (item.key !== entry.key) return item;
			const { nickname: _previous, ...rest } = item;
			return trimmed ? { ...rest, nickname: trimmed } : rest;
		});
		status = trimmed ? `Renamed to ${trimmed}.` : 'Nickname cleared.';
	}

	function remove(entry: LibraryView): void {
		entries = entries.filter(item => item.key !== entry.key);
		status = 'Season deleted.';
	}

	onMount(() => {
		void getExampleSeries()
			.then(value => {
				saved = value.library;
				history = value.history;
				profiles = value.libraryProfiles;
				manifest = value.manifest;
				reset();
			})
			.catch((reason: unknown) => { error = reason instanceof Error ? reason.message : 'Unable to prepare the example seasons.'; })
			.finally(() => { loading = false; });
	});
</script>

<StoryFrame onReset={reset} wide fixtureNotice="Two synthetic clubs from a real best-of-five run, plus a retired memento. Nothing is saved, copied, or uploaded.">
	<div class="page">
		<h1>My seasons</h1>
		<p class="lede muted">Every season you finish is saved in this browser. Pick a club for its cards and stats, or pick two for the tale of the tape and a best-of-five.</p>
		{#if loading}
			<p class="muted" role="status">Loading your seasons…</p>
		{:else if error}
			<p class="error" role="alert">{error}</p>
		{:else}
			{#key instance}
				<SeasonLibrary {entries} {history} {profiles} {manifest} {status} initialSelection={selection} onCopy={entry => status = `Example only: no challenge link copied for ${entry.nickname ?? 'this season'}.`} onRename={rename} onDelete={remove} />
			{/key}
		{/if}
	</div>
</StoryFrame>

<style>
	.page { display: grid; gap: var(--space-4); }
	h1 { margin: 0; font-size: clamp(2rem, 6vw, 3rem); letter-spacing: -.03em; }
	.lede { margin: 0; max-width: 52ch; }
	.error { margin: 0; color: var(--error); }
</style>
