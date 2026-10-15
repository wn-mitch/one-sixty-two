<script module lang="ts">
	export interface SeriesWorkshopProps {
		initial?: 'setup' | 'library' | 'errors' | 'running' | 'results';
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import SeriesResults from '#lib/components/SeriesResults.svelte';
	import SeriesSetup from '#lib/components/SeriesSetup.svelte';
	import type { LibraryView } from '#lib/game/library.ts';
	import type { SeriesClub, SeriesClubStatus } from '#lib/game/series-session.svelte.ts';
	import type { SeriesField } from '#lib/game/replay-link.ts';
	import type { SeriesTeamId } from '#lib/sim/series-types.ts';
	import { getExampleSeries, type ExampleSeries } from './series-fixtures.ts';
	import StoryFrame from './StoryFrame.svelte';

	let { initial = 'setup' }: SeriesWorkshopProps = $props();
	const EXAMPLE_LINK = 'https://example.invalid/r/';
	const blank = (): Record<SeriesTeamId, SeriesField> => ({ 'team-a': { link: '', name: '' }, 'team-b': { link: '', name: '' } });

	let series = $state.raw<ExampleSeries | null>(null);
	let loadError = $state('');
	let screen = $state<'setup' | 'results'>('setup');
	let fields = $state(blank());
	let fieldErrors = $state<Record<SeriesTeamId, string>>({ 'team-a': '', 'team-b': '' });
	let clubs = $state.raw<Record<SeriesTeamId, SeriesClub | null>>({ 'team-a': null, 'team-b': null });
	let clubStatus = $state<Record<SeriesTeamId, SeriesClubStatus>>({ 'team-a': 'empty', 'team-b': 'empty' });
	let running = $state(false);
	let stage = $state('');
	let progress = $state<Record<SeriesTeamId | 'series', number>>({ 'team-a': 0, 'team-b': 0, series: 0 });
	let copyStatus = $state('');
	const library = $derived(series && initial !== 'setup' ? series.library.filter(entry => entry.status === 'playable') : []);

	function reset(): void {
		screen = initial === 'results' ? 'results' : 'setup';
		fields = blank();
		clubs = { 'team-a': null, 'team-b': null };
		clubStatus = { 'team-a': 'empty', 'team-b': 'empty' };
		fieldErrors = initial === 'errors'
			? { 'team-a': 'Paste a replay link.', 'team-b': 'Replay links must come from this site.' }
			: { 'team-a': '', 'team-b': '' };
		if (initial === 'errors') fields['team-b'].link = 'https://example.invalid/not-a-replay';
		running = initial === 'running';
		stage = running ? 'Replaying both regular seasons for seeding…' : '';
		progress = running ? { 'team-a': 118, 'team-b': 96, series: 0 } : { 'team-a': 0, 'team-b': 0, series: 0 };
		copyStatus = '';
	}

	function choose(id: SeriesTeamId, entry: LibraryView): void {
		fields[id] = { link: `${EXAMPLE_LINK}${entry.key}`, name: entry.nickname ?? '' };
		fieldErrors[id] = '';
		if (!series) return;
		clubs = {
			...clubs,
			[id]: {
				source: 'saved',
				entry,
				draft: series.drafts[id],
				profiles: series.profiles[id],
				canonical: `${EXAMPLE_LINK}${entry.key}`,
				stadiumName: entry.stadium?.name ?? 'Home park unavailable'
			}
		};
		clubStatus[id] = 'ready';
	}

	function loadRunningClubs(value: ExampleSeries): void {
		const entries = value.library.filter(entry => entry.status === 'playable').slice(0, 2);
		if (entries[0]) choose('team-a', entries[0]);
		if (entries[1]) choose('team-b', entries[1]);
	}

	function validateReplay(id: SeriesTeamId): void {
		fieldErrors[id] = 'Example replay links are not fetched in Storybook. Choose a saved season.';
		clubStatus[id] = 'error';
	}

	function changeTeam(id: SeriesTeamId): void {
		clubs = { ...clubs, [id]: null };
		clubStatus[id] = 'empty';
	}

	/** Checks for a link in each field, then shows the precomputed example series; nothing is fetched. */
	function submit(event: SubmitEvent): void {
		event.preventDefault();
		fieldErrors = {
			'team-a': fields['team-a'].link.trim() ? '' : 'Paste a replay link.',
			'team-b': fields['team-b'].link.trim() ? '' : 'Paste a replay link.'
		};
		if (fieldErrors['team-a'] || fieldErrors['team-b'] || !clubs['team-a'] || !clubs['team-b']) return;
		screen = 'results';
	}

	onMount(() => {
		reset();
		void getExampleSeries()
			.then(value => {
				series = value;
				if (running) loadRunningClubs(value);
			})
			.catch((reason: unknown) => { loadError = reason instanceof Error ? reason.message : 'Unable to prepare the example series.'; });
	});
</script>

<StoryFrame onReset={reset} wide fixtureNotice="Two synthetic clubs played through a real best-of-five. Links are examples; nothing is fetched, copied, or uploaded.">
	{#if screen === 'results'}
		{#if series}
			<SeriesResults
				result={series.result}
				manifest={series.manifest}
				profiles={series.profiles}
				drafts={series.drafts}
				{copyStatus}
				onCopy={() => copyStatus = 'Example only: no series link copied.'}
				onAgain={() => { screen = 'setup'; copyStatus = ''; }}
			/>
		{:else if loadError}
			<p class="error" role="alert">{loadError}</p>
		{:else}
			<p class="muted" role="status">Playing the example best-of-five…</p>
		{/if}
	{:else}
		<div class="page">
			<h1>Head-to-head</h1>
			<p class="lede muted">Choose two drafted clubs. Their regular seasons replay for seeding, then the better record hosts Games 1, 2 and 5.</p>
			<SeriesSetup
				{fields}
				{fieldErrors}
				{clubs}
				{clubStatus}
				{library}
				manifest={series?.manifest ?? null}
				{running}
				loading={false}
				error={loadError}
				{stage}
				{progress}
				onChoose={choose}
				onValidate={validateReplay}
				onChange={changeTeam}
				onSubmit={submit}
				onCancel={() => { running = false; stage = 'Series cancelled.'; }}
			/>
		</div>
	{/if}
</StoryFrame>

<style>
	.page { display: grid; gap: var(--space-6); width: min(100%, 84rem); }
	h1 { margin: 0; font-size: var(--text-3xl); letter-spacing: -.03em; }
	.lede { margin: 0; max-width: 68ch; }
	.error { margin: 0; color: var(--error); }
</style>
