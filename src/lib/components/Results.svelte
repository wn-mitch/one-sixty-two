<script lang="ts">
	import { onMount, tick } from 'svelte';
	import CardReview from '../cards/CardReview.svelte';
	import Card from '../cards/Card.svelte';
	import InspectionBack from '../cards/InspectionBack.svelte';
	import type { CardViewModel } from '../cards/view-model.ts';
	import { challengeSeriesPath, type Challenge } from '../game/challenge.ts';
	import { createResultsModel } from '../game/results-model.ts';
	import { encodeReplay } from '../game/share.ts';
	import { seriesHash } from '../game/replay-link.ts';
	import type { Draft, Manifest, Profile } from '../game/types.ts';
	import { loadMedia } from '../media/client.ts';
	import type { MediaManifest } from '../media/types.ts';
	import type { WarRankings } from '../rankings/types.ts';
	import { createShareRenderModel } from '../share/model.ts';
	import type { ShareAction, ShareFormat, SharePublication, ShareRenderModel } from '../share/types.ts';
	import type { SeasonResult } from '../sim/types.ts';
	import type { NewCard, NewSticker } from '../collection/collection.ts';
	import type { SeasonReward } from '../cosmetics/ledger.ts';
	import ResultsReward from './ResultsReward.svelte';
	import ResultsScoreboard from './ResultsScoreboard.svelte';
	import ResultsCollection from './ResultsCollection.svelte';
	import ResultsGrades from './ResultsGrades.svelte';
	import DailyStandings from './DailyStandings.svelte';
	import DailyBoardEntry from './DailyBoardEntry.svelte';
	import StadiumStandings from './StadiumStandings.svelte';
	import type { StadiumStandingsView } from '../game/stadium-standings.ts';
	import type { DailyStandingsView } from '../game/standings.ts';
	import SeasonClipping from './SeasonClipping.svelte';
	import { phraseBand, pickSeasonPhrase } from '../news/phrases.ts';
	import { draftGrade, expectedWins, gradeRange, seasonGrade } from '../game/grade.ts';
	import { loadCardValues, scoutingReport, type ScoutingReport } from '../game/scouting.ts';
	import { replayInput } from '../game/draft.ts';
	import SeasonCalendar from './SeasonCalendar.svelte';
	import ResultsAwards from './ResultsAwards.svelte';
	import ResultsHand from './ResultsHand.svelte';
	import SeasonMoments from './SeasonMoments.svelte';
	import ShareBlock from './ShareBlock.svelte';
	import SeasonTotals from './SeasonTotals.svelte';
	import { dailyLabel } from '../game/daily.ts';

	interface Props {
		result: SeasonResult;
		draft: Draft;
		profiles: Profile[];
		manifest: Manifest;
		rankings: WarRankings | null;
		rankingLoading: boolean;
		rankingError: boolean;
		onNew: () => void;
		onShare: (action: ShareAction, format: ShareFormat, model: ShareRenderModel) => void;
		publication: SharePublication | null;
		sharing: boolean;
		shareStatus: string;
		/** A friend's season this draft was started to answer; the page then leads with the series. */
		challenge?: Challenge | null;
		/** Stickers this season earned for the first time. */
		newStickers?: readonly NewSticker[];
		/** Player-seasons this season added to the collection for the first time. */
		newCards?: readonly NewCard[];
		/** Tokens this season's save just granted; null or zero when nothing new was earned. */
		reward?: SeasonReward | null;
		/** Only an own season participates in earned-token feedback. */
		ownSeason?: boolean;
		/** Where this device's daily run stands among the day's runs, once the standings answer. */
		dailyStandings?: DailyStandingsView | null;
		/** Where this own season stands among every run at its home park, once the server answers. */
		stadiumStandings?: StadiumStandingsView | null;
		/** Asks for a board name on this device's daily run. */
		onDailyName?: (name: string) => Promise<void>;
	}

	let {
		result,
		draft,
		profiles,
		manifest,
		rankings,
		rankingLoading,
		rankingError,
		onNew,
		onShare,
		publication,
		sharing,
		shareStatus,
		challenge = null,
		newStickers = [],
		newCards = [],
		reward = null,
		ownSeason = false,
		dailyStandings = null,
		stadiumStandings = null,
		onDailyName
	}: Props = $props();
	const grade = $derived(seasonGrade(result.wins, result.losses));
	// Head-to-head setup opens with this team already in place; only the opponent is left to choose.
	const headToHeadHref = $derived(`/seasons${seriesHash({
		'team-a': { link: `/#replay=${encodeReplay(draft)}`, name: `${result.wins}–${result.losses} team` },
		'team-b': { link: '', name: '' }
	})}`);
	const parkName = $derived(manifest.stadiums.find(stadium => stadium.ref.id === draft.homeStadium?.id)?.name ?? null);
	const runDifference = $derived(result.runsFor - result.runsAgainst);
	const expected = $derived(expectedWins(draft.picks.map(pick => profiles.find(profile => profile.seasonId === pick.seasonId) ?? {})));
	const rosterGrade = $derived(expected === null ? null : draftGrade(expected));
	const phrase = $derived(grade ? pickSeasonPhrase(phraseBand(grade, result.wins, result.losses), expected === null ? null : result.wins - expected, result.seed) : null);
	const challengeVerdict = $derived(challenge
		? result.wins > challenge.wins ? 'You beat their record.' : result.wins === challenge.wins ? 'You matched their record.' : 'You fell short of their record.'
		: '');

	// The scouting grade needs WAR rankings and every offered card's value; it appears once both arrive.
	let scouting = $state.raw<ScoutingReport | null>(null);
	$effect(() => {
		const [source, ranked, data] = [draft, rankings, manifest];
		scouting = null;
		if (!ranked) return;
		let current = true;
		void loadCardValues(data)
			.then(values => { if (current) scouting = scoutingReport(replayInput(source), data, values, ranked); })
			.catch(() => undefined);
		return () => { current = false; };
	});

	let media = $state.raw<MediaManifest | null>(null);
	let mediaUnavailable = $state(false);
	let inspectedSeasonId = $state<string | null>(null);
	let inspectionTrigger: HTMLButtonElement | null = null;
	// The inspected card exists only raised over the page; it flies from, and lands back on, the card that opened it.
	let inspectionOpened = $state(false);
	let inspectionSource = $state<HTMLElement | null>(null);
	let turned = $state(true);
	let textBack = $state(false);
	let selectedMode = $state<'simulated' | 'actual'>('simulated');
	let handDirection = $state<-1 | 1>(1);
	let resultsHeading = $state<HTMLHeadingElement>();
	const resultsReviewId = 'results-card-review';

	let resultsModel = $derived(createResultsModel({ result, draft, profiles, manifest, rankings }));
	let shareModel = $derived(createShareRenderModel({ result, draft, profiles, manifest, media, rankings, scouting: scouting?.label }));
	let cardViews = $derived<ReadonlyMap<string, CardViewModel>>(
		new Map(shareModel.cards.map((entry) => [entry.seasonId, entry.card]))
	);
	let inspectedCard = $derived(
		inspectedSeasonId
			? resultsModel.cards.find((card) => card.seasonId === inspectedSeasonId) ?? null
			: null
	);
	let inspectedView = $derived(inspectedSeasonId ? cardViews.get(inspectedSeasonId) ?? null : null);

	function jumpTo(id: string): void {
		const heading = document.getElementById(id);
		heading?.focus({ preventScroll: true });
		heading?.scrollIntoView({ block: 'start' });
	}
	async function inspectCard(seasonId: string, trigger: HTMLButtonElement): Promise<void> {
		if (!resultsModel.cards.some((card) => card.seasonId === seasonId) || !cardViews.has(seasonId)) return;
		if (inspectedSeasonId !== seasonId) {
			turned = true;
			textBack = false;
			selectedMode = 'simulated';
		}
		inspectionTrigger = trigger;
		inspectionSource = trigger;
		inspectedSeasonId = seasonId;
		inspectionOpened = true;
		await tick();
		document.querySelector<HTMLButtonElement>(`#${resultsReviewId} .reader-return`)?.focus({ preventScroll: true });
	}

	/** The full hand in draft order, so the raised card steps through every player. */
	const handOrder = $derived(resultsModel.cards.filter(card => cardViews.has(card.seasonId)).sort((a, b) => a.pickNumber - b.pickNumber));
	const handIndex = $derived(handOrder.findIndex(card => card.seasonId === inspectedSeasonId));

	function handOffset(index: number): number {
		const length = handOrder.length;
		const offset = (index - handIndex + length) % length;
		return offset > length / 2 ? offset - length : offset;
	}
	function noCardDetails(): void {}

	async function selectHand(index: number, direction: -1 | 1): Promise<void> {
		if (!inspectionOpened || handIndex < 0 || !handOrder.length || index === handIndex) return;
		handDirection = direction;
		inspectedSeasonId = handOrder[index].seasonId;
		await tick();
		// Return to this player's source, while dismissal restores the original activating control.
		inspectionSource = [...document.querySelectorAll<HTMLElement>(`button[aria-controls="${resultsReviewId}"][aria-expanded="true"]`)]
			.find(button => button.getClientRects().length > 0) ?? inspectionSource;
	}

	function stepHand(direction: -1 | 1): void {
		void selectHand((handIndex + direction + handOrder.length) % handOrder.length, direction);
	}

	function handKeys(event: KeyboardEvent): void {
		if (!inspectedSeasonId || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
		if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea, [contenteditable="true"]')) return;
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			event.preventDefault();
			void stepHand(event.key === 'ArrowLeft' ? -1 : 1);
		}
	}

	function closeInspection(): void {
		const trigger = inspectionTrigger;
		inspectedSeasonId = null;
		inspectionTrigger = null;
		inspectionSource = null;
		inspectionOpened = false;
		void tick().then(() => {
			if (trigger?.isConnected && trigger.getClientRects().length > 0) trigger.focus({ preventScroll: true });
			else if (resultsHeading?.isConnected) resultsHeading.focus({ preventScroll: true });
		});
	}

	$effect(() => {
		if (inspectedSeasonId && (!resultsModel.cards.some((card) => card.seasonId === inspectedSeasonId) || !cardViews.has(inspectedSeasonId))) {
			inspectedSeasonId = null;
			inspectionTrigger = null;
		}
	});
	onMount(() => {
		let disposed = false;
		void loadMedia()
			.then((value) => {
				if (!disposed) media = value;
			})
			.catch(() => {
				if (!disposed) mediaUnavailable = true;
			});
		return () => { disposed = true; };
	});
</script>

<svelte:window onkeydown={handKeys} />

<section class="results" aria-labelledby="results-heading">
	{#if challenge}
		<aside class="challenge-offer" aria-labelledby="challenge-offer-heading">
			<div>
				<h2 id="challenge-offer-heading">{challengeVerdict} They went {challenge.wins}–{challenge.losses}.</h2>
			</div>
			<a class="button primary" href={challengeSeriesPath(encodeReplay(draft), challenge)}>Play the best-of-five</a>
		</aside>
	{/if}
	<ResultsScoreboard wins={result.wins} losses={result.losses} bind:heading={resultsHeading} busy={sharing}>
		{#snippet record()}
			{#if draft.daily}<p class="daily-stamp">Daily <span>{dailyLabel(draft.daily)}</span></p>{/if}
			{#if phrase}<SeasonClipping {phrase} />{/if}
			<ResultsGrades wins={result.wins} {grade} {rosterGrade} {expected} {scouting} />
			<dl class="season-ledger">
				<div><dt>{result.firstLoss === null ? 'Season' : 'First loss'}</dt><dd class:perfect={result.firstLoss === null}>{result.firstLoss === null ? 'No losses' : `Game ${result.firstLoss}`}</dd></div>
				<div><dt>Best streak</dt><dd>{result.longestWinningStreak} W</dd></div>
				<div>
					<dt>Runs</dt>
					<dd aria-label={`${result.runsFor} scored, ${result.runsAgainst} allowed, difference ${runDifference > 0 ? '+' : ''}${runDifference}`}>{result.runsFor}–{result.runsAgainst} <span class="run-difference" class:up={runDifference > 0} class:down={runDifference < 0}>{runDifference > 0 ? '+' : runDifference < 0 ? '−' : '±'}{Math.abs(runDifference)}</span></dd>
				</div>
			</dl>
			{#if ownSeason && draft.daily && dailyStandings?.date === draft.daily}
				<DailyStandings standings={dailyStandings} />
				{#if onDailyName}<DailyBoardEntry standings={dailyStandings} onName={onDailyName} />{/if}
			{:else if ownSeason && !draft.daily && stadiumStandings?.draft === draft && parkName}
				<StadiumStandings standings={stadiumStandings} park={parkName} />
			{/if}
		{/snippet}
		{#snippet actions()}
			<div class="share-shortcuts">
				<button class="primary" type="button" disabled={sharing} onclick={() => onShare('challenge', 'field', shareModel)}>{sharing ? 'Preparing…' : 'Challenge a friend'}<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M5 11l6-6M6 5h5v5"></path></svg></button>
				<button class="secondary" type="button" title="Copy link" disabled={sharing} onclick={() => onShare('copy-link', 'field', shareModel)}><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 0 1 4.5 9l1-1"></path></svg><span class="action-label">{sharing ? 'Preparing…' : 'Copy link'}</span></button>
			</div>
			<div class="more-actions">
				<a class="button" href={headToHeadHref}><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 5.5h9l-2.5-2.5M13 10.5H4l2.5 2.5"></path></svg>Head-to-head with this team</a>
				<button class="new-draft" type="button" onclick={onNew}><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 3.5v9M3.5 8h9"></path></svg>New draft</button>
			</div>
			<ResultsReward {reward} {ownSeason} />
		{/snippet}
	</ResultsScoreboard>



	<div class="awards-share">
		<ResultsAwards featured={resultsModel.featured} {cardViews} selectedSeasonId={inspectedSeasonId} reviewId={resultsReviewId} onInspect={inspectCard} />
		<ShareBlock
			model={shareModel}
			{publication}
			{sharing}
			status={shareStatus}
			onShare={(action, format) => onShare(action, format, shareModel)}
		/>
		<ResultsHand
			cards={resultsModel.rest}
			{cardViews}
			{rankingLoading}
			{rankingError}
			{mediaUnavailable}
			selectedSeasonId={inspectedSeasonId}
			reviewId={resultsReviewId}
			onInspect={inspectCard}
		/>
		<ResultsCollection {newStickers} {newCards} {cardViews} selectedSeasonId={inspectedSeasonId} reviewId={resultsReviewId} onInspect={inspectCard} />
	</div>


	<SeasonMoments {result} cards={resultsModel.cards} {cardViews} {manifest} {media} {rankings} selectedSeasonId={inspectedSeasonId} reviewId={resultsReviewId} onInspect={inspectCard} />

	{#snippet handNav()}
		{@const previous = handOrder[(handIndex - 1 + handOrder.length) % handOrder.length]}
		{@const next = handOrder[(handIndex + 1) % handOrder.length]}
		<button type="button" class="hand-step previous" data-hand-step="-1" aria-label={`Previous card: ${previous.profile.displayName}`} onclick={() => stepHand(-1)}><span aria-hidden="true">‹</span></button>
		<button type="button" class="hand-step next" data-hand-step="1" aria-label={`Next card: ${next.profile.displayName}`} onclick={() => stepHand(1)}><span aria-hidden="true">›</span></button>
		<div class="hand-dots" role="group" aria-label="Cards in draft order">
			{#each handOrder as card, index (card.seasonId)}
				<button type="button" class="hand-dot" aria-label={`Pick ${card.pickNumber}: ${card.profile.displayName}, ${card.profile.year}`} aria-current={index === handIndex ? 'true' : undefined} onclick={() => void selectHand(index, handOffset(index) < 0 ? -1 : 1)}></button>
			{/each}
		</div>
		<span class="sr-only" aria-live="polite">Pick {inspectedCard?.pickNumber} of {handOrder.length}: {inspectedCard?.profile.displayName}</span>
	{/snippet}
	{#snippet handDeck()}
		<div class="hand-deck" aria-hidden="true" inert>
			{#each handOrder as card, index (card.seasonId)}
				{@const offset = handOffset(index)}
				<div class="hand-neighbor" data-hand-offset={offset} style:--hand-offset={offset} style:--hand-depth={Math.abs(offset)} style:--hand-angle={offset < 0 ? '40deg' : '-40deg'} style:z-index={3 - Math.abs(offset)}>
					{#if offset !== 0 && Math.abs(offset) <= 2}
						{@const view = cardViews.get(card.seasonId)!}
						{#if turned}<InspectionBack s={view} view={card.inspection[selectedMode]} simplified={textBack} onDetails={noCardDetails} />
						{:else}<Card s={view} face="front" interactive={false} onDetails={noCardDetails} />{/if}
					{/if}
				</div>
			{/each}
		</div>
	{/snippet}
	{#if inspectedCard && inspectedView}
		<CardReview
			id={resultsReviewId}
			s={inspectedView}
			inspection={inspectedCard.inspection}
			bind:turned
			bind:textBack
			bind:selectedMode
			bind:opened={inspectionOpened}
			sourceElement={inspectionSource}
			raisedOnly
			flipInPlace
			pairFaces={false}
			showControl={false}
			onClose={closeInspection}
			readerNav={handOrder.length > 1 ? handNav : undefined}
			readerDeck={handDeck}
			deckPosition={{ key: inspectedCard.seasonId, direction: handDirection }}
			onStep={stepHand}
		/>
	{/if}


	<nav class="result-nav" aria-label="Season results sections">
		<button class="quiet" type="button" onclick={() => jumpTo('batting-heading')}>Batting totals</button>
		<button class="quiet" type="button" onclick={() => jumpTo('pitching-heading')}>Pitching totals</button>
		<button class="quiet" type="button" onclick={() => jumpTo('game-log-heading')}>All 162 games <span aria-hidden="true">↓</span></button>
	</nav>

	<section class="season-review" aria-labelledby="season-review-heading">
		<header class="review-heading">
			<h3 id="season-review-heading">Season in review</h3>
		</header>
	<SeasonTotals batting={result.batting} pitching={result.pitching} />
	</section>

	<section class="game-log" aria-label="All 162 games">
		<div class="section-heading">
			<div>
				<h3 id="game-log-heading" tabindex="-1">All {result.games.length} games</h3>
			</div>
		</div>
		<SeasonCalendar games={result.games} seed={result.seed} />
	</section>

</section>

<style>
	.results {
		display: grid;
		gap: var(--space-8);
		min-width: 0;
	}
	/* The daily run's mark: same seed and park for every player that day. */
	.daily-stamp { flex: none; margin: 0; padding: var(--space-1) var(--space-3); border: 1px solid var(--accent); border-radius: var(--radius); color: var(--accent); font: italic 800 var(--text-lg) / 1 'Barlow Condensed', sans-serif; letter-spacing: .06em; text-transform: uppercase; transform: rotate(-3deg); }
	.daily-stamp span { color: var(--text); }
	.share-shortcuts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); }
	.share-shortcuts button { min-height: 3rem; }
	.share-shortcuts .secondary { border-color: var(--border-strong, var(--border)); }
	/* Wide screens set the 2×2 awards beside the share panel; narrower ones stack them. */
	.awards-share { display: grid; gap: var(--space-8); min-width: 0; }
	.awards-share > :global(.share-panel) { grid-template-columns: minmax(0, 1fr); padding-block: var(--space-6) 0; border-bottom: 0; }
	@media (min-width: 64rem) {
		/* The rest of the hand fills the column under the awards, beside the taller share panel. */
		.awards-share { grid-template-columns: minmax(0, 1fr) 24rem; grid-template-rows: auto auto 1fr; grid-template-areas: 'awards share' 'hand share' 'collection share'; align-items: start; }
		.awards-share > :global(.awards) { grid-area: awards; }
		.awards-share > :global(.share-panel) { grid-area: share; padding-block: 0; border-block: 0; }
		.awards-share > :global(.rest-hand) { grid-area: hand; }
		.awards-share > :global(.collection-drawer) { grid-area: collection; }
	}
	.season-review { display: grid; gap: var(--space-6); min-width: 0; }
	.review-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--space-2) var(--space-4); padding-top: var(--space-5); border-top: 1px solid var(--border); }
	.review-heading h3 { font-size: var(--text-xl); }
	.game-log { display: grid; gap: var(--space-3); min-width: 0; }
	.section-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--space-2) var(--space-4); }
	.section-heading h3 { font-size: var(--text-xl); }
	.challenge-offer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3) var(--space-6); padding: var(--space-4) var(--space-5); border: 1px solid var(--accent); border-radius: var(--radius-lg); background: color-mix(in oklch, var(--accent) 10%, var(--surface)); }
	.challenge-offer h2 { margin: 0; font-size: var(--text-lg); line-height: 1.25; }
	.challenge-offer .button { flex: none; min-height: 2.75rem; }
	.result-nav {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
		border-block: 1px solid var(--border);
	}
	.result-nav button {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 2.75rem;
		font-size: var(--text-sm);
	}

	.hand-step { position: absolute; top: calc((100% - 6.25rem) / 2); display: grid; place-items: center; width: 44px; height: 44px; padding: 0; font-size: 1.5rem; line-height: 1; translate: 0 -50%; }
	.hand-step.previous { right: calc(100% + .5rem); }
	.hand-step.next { left: calc(100% + .5rem); }
	.hand-dots { position: absolute; top: calc(100% - 2.75rem); left: 50%; translate: -50% 0; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; width: min(30rem, calc(100vw - 1rem)); }
	.hand-dot { display: grid; place-items: center; flex: 1 0 24px; max-width: 2rem; min-width: 24px; height: 44px; min-height: 44px; padding: 0; border: 0; background: transparent; }
	.hand-dot::after { content: ''; width: .375rem; height: .375rem; border-radius: 50%; background: var(--muted); }
	.hand-dot[aria-current='true']::after { width: .625rem; height: .625rem; background: var(--accent); }
	.hand-deck { position: absolute; z-index: -1; inset: 0; perspective: 1000px; pointer-events: none; }
	.hand-neighbor { position: absolute; inset: 0 0 auto; width: 100%; opacity: .6; transform: translateX(calc(var(--hand-offset) * 60%)) translateZ(calc(var(--hand-depth) * -160px)) rotateY(var(--hand-angle)) scale(.82); transition: transform var(--motion-card-flight) var(--ease-out), opacity var(--motion-card-flight) var(--ease-out); }
	.hand-neighbor[data-hand-offset='0'] { transform: none; opacity: 0; }
	.hand-neighbor:not([data-hand-offset='-2'], [data-hand-offset='-1'], [data-hand-offset='0'], [data-hand-offset='1'], [data-hand-offset='2']) { visibility: hidden; }
	:global([data-motion='off']) .hand-neighbor { transition: none; }
	@media (prefers-reduced-motion: reduce) { .hand-neighbor { transition: none; } }
	@media (max-width: 25rem) {
		.hand-dots { top: calc(100% - 5.5rem); }
		.hand-step { top: calc((100% - 9rem) / 2); }
	}
	@media (min-width: 48rem) {
		.share-shortcuts { grid-template-columns: minmax(0, 1fr) auto; }
		.share-shortcuts button { min-height: 2.75rem; }
		.share-shortcuts .secondary { width: 2.75rem; padding: 0; }
		.share-shortcuts .secondary .action-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
	}
	@media (max-width: 40rem) {
		/* The fixed share bar never covers the last game; the site footer keeps its own clearance. */
		.results { padding-bottom: calc(5.25rem + env(safe-area-inset-bottom)); }
		/* Three equal jump links on one row instead of a ragged wrap. */
		.result-nav { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; }
		.result-nav button { justify-content: center; padding-inline: var(--space-1); font-size: var(--text-xs); text-align: center; line-height: 1.2; }
		.result-nav button + button { border-left: 1px solid var(--border); border-radius: 0; }
		.share-shortcuts {
			position: fixed;
			z-index: 30;
			inset-inline: 0;
			bottom: 0;
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: var(--space-2);
			padding: var(--space-2) var(--space-3) calc(var(--space-2) + env(safe-area-inset-bottom));
			background: color-mix(in oklch, var(--background) 94%, transparent);
			border-top: 1px solid var(--border);
			backdrop-filter: blur(.65rem);
		}
	}
</style>
