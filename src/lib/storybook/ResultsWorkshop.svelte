<script module lang="ts">
	export interface ResultsWorkshopProps {
		initial?: 'complete' | 'shareLink' | 'shareUnavailable';
	}
</script>

<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import Results from '#lib/components/Results.svelte';
	import type { ShareAction, ShareFormat, SharePublication } from '#lib/share/types.ts';
	import { createExamplePublication, getExampleSeason, type ExampleSeason } from './season-fixtures.ts';
	import DraftWorkshop from './DraftWorkshop.svelte';
	import StoryFrame from './StoryFrame.svelte';

	let { initial = 'complete' }: ResultsWorkshopProps = $props();

	const EXAMPLE_IMAGE = 'data:image/svg+xml,%3Csvg xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22 viewBox%3D%220 0 2 2%22%3E%3Crect width%3D%222%22 height%3D%222%22 fill%3D%22%23344a68%22%2F%3E%3C%2Fsvg%3E';
	const EXAMPLE_DIGEST = 'e'.repeat(64);
	const EXAMPLE_PUBLICATION = {
		replayId: 'example-replay',
		replayUrl: 'https://example.invalid/replay-link',
		modelDigest: EXAMPLE_DIGEST,
		imageUrl: EXAMPLE_IMAGE,
		imageDigest: EXAMPLE_DIGEST
	};

	let season = $state<ExampleSeason | null>(null);
	let screen = $state<'results' | 'draft'>('results');
	let loading = $state(true);
	let error = $state('');
	let publication = $state<SharePublication | null>(null);
	let shareStatus = $state('');
	let instance = $state(0);
	let request = 0;
	let observedInitial = untrack(() => initial);

	function applyInitial(value: ExampleSeason): void {
		if (initial === 'shareLink') {
			publication = createExamplePublication(value.result, EXAMPLE_PUBLICATION);
			shareStatus = 'Example link only. No upload performed.';
		} else if (initial === 'shareUnavailable') {
			shareStatus = 'Example publishing is unavailable. No upload performed.';
		}
	}

	function loadSeason(): void {
		const currentRequest = ++request;
		loading = true;
		error = '';
		season = null;
		publication = null;
		shareStatus = '';
		void getExampleSeason()
			.then((value) => {
				if (currentRequest !== request) return;
				season = value;
				loading = false;
				applyInitial(value);
			})
			.catch((reason: unknown) => {
				if (currentRequest !== request) return;
				loading = false;
				error = reason instanceof Error ? reason.message : 'Unable to prepare the example season.';
			});
	}

	function share(_action: ShareAction, _format: ShareFormat): void {
		if (!season) return;
		if (initial === 'shareUnavailable') {
			publication = null;
			shareStatus = 'Example publishing is unavailable. No upload performed.';
			return;
		}
		publication = createExamplePublication(season.result, EXAMPLE_PUBLICATION);
		shareStatus = 'Example link only. No upload performed.';
	}

	function newDraft(): void {
		publication = null;
		shareStatus = '';
		screen = 'draft';
	}

	function reset(): void {
		instance += 1;
		screen = 'results';
		loadSeason();
	}

	$effect(() => {
		const nextInitial = initial;
		untrack(() => {
			if (nextInitial !== observedInitial) {
				observedInitial = nextInitial;
				reset();
			}
		});
	});

	onMount(() => {
		loadSeason();
		return () => { request += 1; };
	});
</script>

<StoryFrame onReset={reset} wide>
	{#key instance}
		{#if loading}
			<p role="status">Preparing the 162-game synthetic example season…</p>
		{:else if error}
			<p role="alert">Unable to render the example results: {error}</p>
		{:else if season && screen === 'results'}
			<Results
				result={season.result}
				draft={season.draft}
				profiles={season.profiles}
				manifest={season.manifest}
				rankings={season.rankings}
				rankingLoading={false}
				rankingError={false}
				onNew={newDraft}
				onShare={share}
				{publication}
				sharing={false}
				shareStatus={shareStatus}
			/>
		{:else if season}
			<DraftWorkshop initial="ready" embedded />
		{/if}
	{/key}
</StoryFrame>
