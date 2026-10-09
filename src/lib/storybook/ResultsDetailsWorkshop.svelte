<script module lang="ts">
	export interface ResultsDetailsWorkshopProps {
		initial?: 'game' | 'turningPoints' | 'noTurningPoints';
	}
</script>

<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import CardInspection from '#lib/cards/CardInspection.svelte';
	import type { CardViewModel } from '#lib/cards/view-model.ts';
	import GameDetails from '#lib/components/GameDetails.svelte';
	import SeasonMoments from '#lib/components/SeasonMoments.svelte';
	import { createResultsModel } from '#lib/game/results-model.ts';
	import type { ResultsCard } from '#lib/game/results-types.ts';
	import { loadMedia } from '#lib/media/client.ts';
	import type { MediaManifest } from '#lib/media/types.ts';
	import { createShareRenderModel } from '#lib/share/model.ts';
	import { getExampleSeason, type ExampleSeason } from './season-fixtures.ts';
	import StoryFrame from './StoryFrame.svelte';

	let { initial = 'game' }: ResultsDetailsWorkshopProps = $props();

	let season = $state<ExampleSeason | null>(null);
	let cards = $state<readonly ResultsCard[]>([]);
	let cardViews = $state<ReadonlyMap<string, CardViewModel>>(new Map());
	let loading = $state(true);
	let error = $state('');
	let inspectedSeasonId = $state<string | null>(null);
	let inspection = $state<CardInspection>();
	let detailsHeading = $state<HTMLHeadingElement>();
	let instance = $state(0);
	let request = 0;
	let observedInitial = untrack(() => initial);

	let momentResult = $derived(
		season && initial === 'noTurningPoints'
			? { ...season.result, highlight: null, lowlight: null }
			: season?.result ?? null
	);
	let inspectedCard = $derived(
		inspectedSeasonId ? cards.find((card) => card.seasonId === inspectedSeasonId) ?? null : null
	);
	let inspectedView = $derived(inspectedSeasonId ? cardViews.get(inspectedSeasonId) ?? null : null);

	function prepareCards(value: ExampleSeason, media: MediaManifest): void {
		const resultsModel = createResultsModel({
			result: value.result,
			draft: value.draft,
			profiles: value.profiles,
			manifest: value.manifest,
			rankings: value.rankings
		});
		const shareModel = createShareRenderModel({
			result: value.result,
			draft: value.draft,
			profiles: value.profiles,
			manifest: value.manifest,
			media,
			rankings: value.rankings
		});
		cards = resultsModel.cards;
		cardViews = new Map(shareModel.cards.map((card) => [card.seasonId, card.card]));
	}

	function loadDetails(): void {
		const currentRequest = ++request;
		loading = true;
		error = '';
		season = null;
		cards = [];
		cardViews = new Map();
		inspectedSeasonId = null;
		void Promise.all([getExampleSeason(), loadMedia()])
			.then(([value, media]) => {
				if (currentRequest !== request) return;
				prepareCards(value, media);
				season = value;
				loading = false;
			})
			.catch((reason: unknown) => {
				if (currentRequest !== request) return;
				loading = false;
				error = reason instanceof Error ? reason.message : 'Unable to prepare the example details.';
			});
	}

	function inspectCard(seasonId: string, trigger: HTMLElement): void {
		if (!cards.some((card) => card.seasonId === seasonId) || !cardViews.has(seasonId)) return;
		inspectedSeasonId = seasonId;
		void tick().then(() => inspection?.open(trigger));
	}

	function reset(): void {
		instance += 1;
		loadDetails();
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
		loadDetails();
		return () => { request += 1; };
	});
</script>

<StoryFrame onReset={reset}>
	{#key instance}
		<section aria-labelledby="result-details-heading">
			<h2 id="result-details-heading" bind:this={detailsHeading} tabindex="-1">
				{initial === 'game' ? 'Game box' : 'Season moments'}
			</h2>
			{#if loading}
				<p role="status">Preparing the 162-game synthetic example season…</p>
			{:else if error}
				<p role="alert">Unable to render the example details: {error}</p>
			{:else if season && initial === 'game'}
				<GameDetails game={season.result.games[0]} />
			{:else if momentResult}
				<SeasonMoments result={momentResult} cards={cards} {cardViews} onInspect={inspectCard} />
			{/if}
		</section>

		{#if inspectedCard && inspectedView}
			<CardInspection
				bind:this={inspection}
				s={inspectedView}
				inspection={inspectedCard.inspection}
				returnFocus={detailsHeading}
				onClose={() => inspectedSeasonId = null}
			/>
		{/if}
	{/key}
</StoryFrame>
