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
	let running = $state(false);
	let stage = $state('');
	let progress = $state<Record<SeriesTeamId | 'series', number>>({ 'team-a': 0, 'team-b': 0, series: 0 });
	let copyStatus = $state('');
	const library = $derived(series && initial !== 'setup' ? series.library.filter(entry => entry.status === 'playable') : []);

	function reset(): void {
		screen = initial === 'results' ? 'results' : 'setup';
		fields = blank();
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
	}

	/** Checks for a link in each field, then shows the precomputed example series; nothing is fetched. */
	function submit(event: SubmitEvent): void {
		event.preventDefault();
		fieldErrors = {
			'team-a': fields['team-a'].link.trim() ? '' : 'Paste a replay link.',
			'team-b': fields['team-b'].link.trim() ? '' : 'Paste a replay link.'
		};
		if (fieldErrors['team-a'] || fieldErrors['team-b']) return;
		screen = 'results';
	}

	onMount(() => {
		reset();
		void getExampleSeries()
			.then(value => { series = value; })
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
			<p class="lede muted">Paste two replay links. Both regular seasons replay to set the seeds; the better record hosts games 1, 2 and 5 of a best-of-five in its home stadium.</p>
			<SeriesSetup {fields} {fieldErrors} {library} {running} loading={false} error={loadError} {stage} {progress} onChoose={choose} onSubmit={submit} onCancel={() => { running = false; stage = 'Series cancelled.'; }} />
		</div>
	{/if}
</StoryFrame>

<style>
	.page { display: grid; gap: var(--space-4); width: min(100%, 48rem); }
	h1 { margin: 0; font-size: clamp(2rem, 6vw, 3rem); letter-spacing: -.03em; }
	.lede { margin: 0; max-width: 60ch; }
	.error { margin: 0; color: var(--error); }
</style>
