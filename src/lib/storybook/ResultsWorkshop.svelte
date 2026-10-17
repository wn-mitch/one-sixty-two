<script module lang="ts">
	export interface ResultsWorkshopProps {
		initial?: 'complete' | 'shareLink' | 'shareUnavailable' | 'firstSeasonReward';
	}
</script>

<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import Results from '#lib/components/Results.svelte';
	import TokenAmount from '#lib/components/TokenAmount.svelte';
	import type { SeasonReward } from '#lib/cosmetics/ledger.ts';
	import type { ShareAction, ShareFormat, SharePublication } from '#lib/share/types.ts';
	import { createExamplePublication, getExampleSeason, type ExampleSeason } from './season-fixtures.ts';
	import DraftWorkshop from './DraftWorkshop.svelte';
	import StoryFrame from './StoryFrame.svelte';
	import { STICKER_BY_KIND } from '#lib/collection/stickers.ts';
	import type { NewSticker } from '#lib/collection/collection.ts';

	let { initial = 'complete' }: ResultsWorkshopProps = $props();

	const EXAMPLE_IMAGE = 'data:image/svg+xml,%3Csvg xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22 viewBox%3D%220 0 2 2%22%3E%3Crect width%3D%222%22 height%3D%222%22 fill%3D%22%23344a68%22%2F%3E%3C%2Fsvg%3E';
	const EXAMPLE_DIGEST = 'e'.repeat(64);
	const EXAMPLE_PUBLICATION = {
		replayId: 'example-replay',
		replayUrl: 'https://example.invalid/replay-link',
		imageUrl: EXAMPLE_IMAGE,
		imageDigest: EXAMPLE_DIGEST
	};

	let season = $state<ExampleSeason | null>(null);
	let screen = $state<'results' | 'draft'>('results');
	let loading = $state(true);
	let error = $state('');
	let publication = $state<SharePublication | null>(null);
	let shareStatus = $state('');
	let reward = $state.raw<SeasonReward | null>(null);
	let instance = $state(0);
	let request = 0;
	let observedInitial = untrack(() => initial);
	/** Example first-time stickers for the first three cards, so the list and its phone layout can be reviewed. */
	const exampleStickers = $derived<NewSticker[]>(season ? season.profiles.slice(0, 3).flatMap((profile, index) =>
		[['perfect', 'hr-60', 'rbi-130', 'obp-400', 'mvp', 'hits-200'], ['perfect', 'k-600', 'ace'], ['perfect']][index].map(kind => ({
			seasonId: profile.seasonId, label: `${profile.displayName} ${profile.year}`, kind, title: STICKER_BY_KIND.get(kind)!.title
		}))).concat(season.profiles.map(profile => ({
			seasonId: profile.seasonId, label: `${profile.displayName} ${profile.year}`, kind: 'grade-aa', title: STICKER_BY_KIND.get('grade-aa')!.title
		}))) : []);

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
		reward = initial === 'firstSeasonReward' ? { season: 1, bonus: 1, daily: 0 } : null;
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
			{#if reward}
				<nav class="reward-wallet" aria-label="Example Shop wallet"><a class="button" href="/shop">Shop <span data-token-wallet aria-hidden="true"><TokenAmount amount={2} /></span></a></nav>
			{/if}
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
				{reward}
				ownSeason={initial === 'firstSeasonReward'}
				newStickers={exampleStickers}
				newCards={season.profiles.slice(2, 5).map(profile => ({ seasonId: profile.seasonId, label: `${profile.displayName} ${profile.year}` }))}
			/>
		{:else if season}
			<DraftWorkshop initial="ready" embedded />
		{/if}
	{/key}
</StoryFrame>

<style>
	.reward-wallet { display: flex; justify-content: flex-end; padding-bottom: var(--space-4); }
	.reward-wallet a { gap: var(--space-2); }
	.reward-wallet span { color: var(--accent); }
</style>
