<script lang="ts">
	import { onMount, tick } from 'svelte';
	import CardReview from '../cards/CardReview.svelte';
	import type { CardViewModel } from '../cards/view-model.ts';
	import { createResultsModel } from '../game/results-model.ts';
	import type { Draft, Manifest, Profile } from '../game/types.ts';
	import { innings } from '../game/format.ts';
	import { loadMedia } from '../media/client.ts';
	import type { MediaManifest } from '../media/types.ts';
	import type { WarRankings } from '../rankings/types.ts';
	import { createShareRenderModel } from '../share/model.ts';
	import type { ShareAction, ShareFormat, SharePublication } from '../share/types.ts';
	import type { PitcherLine, SeasonResult } from '../sim/types.ts';
	import AtmosphereImage from './AtmosphereImage.svelte';
	import GameDetails from './GameDetails.svelte';
	import ResultsAwards from './ResultsAwards.svelte';
	import ResultsHand from './ResultsHand.svelte';
	import SeasonMoments from './SeasonMoments.svelte';
	import ShareBlock from './ShareBlock.svelte';
	import { tableScroll } from './table-scroll.ts';

	interface Props {
		result: SeasonResult;
		draft: Draft;
		profiles: Profile[];
		manifest: Manifest;
		rankings: WarRankings | null;
		rankingLoading: boolean;
		rankingError: boolean;
		onNew: () => void;
		onShare: (action: ShareAction, format: ShareFormat) => void;
		publication: SharePublication | null;
		sharing: boolean;
		shareStatus: string;
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
		shareStatus
	}: Props = $props();

	let media = $state.raw<MediaManifest | null>(null);
	let mediaUnavailable = $state(false);
	let inspectedSeasonId = $state<string | null>(null);
	let inspectionTrigger: HTMLButtonElement | null = null;
	let review = $state<CardReview>();
	let turned = $state(true);
	let textBack = $state(false);
	let selectedMode = $state<'simulated' | 'actual'>('simulated');
	let resultsHeading = $state<HTMLHeadingElement>();
	const resultsReviewId = 'results-card-review';

	let profileById = $derived(new Map(profiles.map((profile) => [profile.seasonId, profile])));
	let resultsModel = $derived(createResultsModel({ result, draft, profiles, manifest, rankings }));
	let shareModel = $derived(createShareRenderModel({ result, draft, profiles, manifest, media, rankings }));
	let cardViews = $derived<ReadonlyMap<string, CardViewModel>>(
		new Map(shareModel.cards.map((entry) => [entry.seasonId, entry.card]))
	);
	let inspectedCard = $derived(
		inspectedSeasonId
			? resultsModel.cards.find((card) => card.seasonId === inspectedSeasonId) ?? null
			: null
	);
	let inspectedView = $derived(inspectedSeasonId ? cardViews.get(inspectedSeasonId) ?? null : null);
	function pitcherName(line: PitcherLine): string {
		return line.displayName;
	}

	function ra9(line: PitcherLine): string {
		return line.outs > 0 ? (line.R * 27 / line.outs).toFixed(2) : '–';
	}

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
		inspectedSeasonId = seasonId;
		await tick();
		review?.focusHeading();
	}

	function closeInspection(): void {
		const trigger = inspectionTrigger;
		inspectedSeasonId = null;
		inspectionTrigger = null;
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

<section class="results" aria-labelledby="results-heading">
	<header class="scoreboard">
		<div class="record-block">
			<p class="eyebrow">Your club · Season final</p>
			<h2
				id="results-heading"
				bind:this={resultsHeading}
				tabindex="-1"
				aria-label={`Final record: ${result.wins} wins and ${result.losses} losses`}
			>
				<span>{result.wins}<small>W</small></span>
				<i aria-hidden="true">–</i>
				<span>{result.losses}<small>L</small></span>
			</h2>
		</div>

		<div class="score-actions" aria-busy={sharing}>
			<div class="share-shortcuts">
				<button class="primary" type="button" disabled={sharing} onclick={() => onShare('challenge', 'scorecard')}>{sharing ? 'Preparing…' : 'Challenge a friend'}</button>
				<button class="secondary" type="button" disabled={sharing} onclick={() => onShare('copy-link', 'scorecard')}>{sharing ? 'Preparing…' : 'Copy link'}</button>
			</div>
			<div class="more-actions">
				<a class="button quiet" href="/seasons">Play head-to-head</a>
				<button class="quiet new-draft" type="button" onclick={onNew}>New draft</button>
			</div>
		</div>

		<dl class="season-ledger">
			<div>
				<dt>{result.firstLoss === null ? 'Season' : 'First loss'}</dt>
				<dd class:perfect={result.firstLoss === null}>{result.firstLoss === null ? 'No losses' : `Game ${result.firstLoss}`}</dd>
			</div>
			<div><dt>Longest winning streak</dt><dd>{result.longestWinningStreak} W</dd></div>
			<div><dt>Runs for</dt><dd>{result.runsFor}</dd></div>
			<div><dt>Runs against</dt><dd>{result.runsAgainst}</dd></div>
			<div>
				<dt>Run difference</dt>
				<dd>{result.runsFor - result.runsAgainst > 0 ? '+' : ''}{result.runsFor - result.runsAgainst}</dd>
			</div>
		</dl>
	</header>

	<ResultsAwards featured={resultsModel.featured} {cardViews} selectedSeasonId={inspectedSeasonId} reviewId={resultsReviewId} onInspect={inspectCard} />

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

	<SeasonMoments {result} cards={resultsModel.cards} {cardViews} selectedSeasonId={inspectedSeasonId} reviewId={resultsReviewId} onInspect={inspectCard} />

	{#if inspectedCard && inspectedView}
		{#key inspectedSeasonId}
			<CardReview
				id={resultsReviewId}
				bind:this={review}
				s={inspectedView}
				inspection={inspectedCard.inspection}
				bind:turned
				bind:textBack
				bind:selectedMode
				onClose={closeInspection}
			/>
		{/key}
	{/if}

	<ShareBlock
		model={shareModel}
		{publication}
		{sharing}
		status={shareStatus}
		{onShare}
	/>

	<nav class="result-nav" aria-label="Season results sections">
		<button class="quiet" type="button" onclick={() => jumpTo('batting-heading')}>Batting totals</button>
		<button class="quiet" type="button" onclick={() => jumpTo('pitching-heading')}>Pitching totals</button>
		<button class="quiet" type="button" onclick={() => jumpTo('game-log-heading')}>All 162 games <span aria-hidden="true">↓</span></button>
	</nav>

	<div class="baseball-atmosphere">
		<p class="eyebrow">Baseball atmosphere · Not the simulated venue</p>
		<AtmosphereImage id="camden-atmosphere" compact />
	</div>

	<section class="season-review" aria-labelledby="season-review-heading">
		<header class="review-heading">
			<h3 id="season-review-heading">Season in review</h3>
			<span>Simulated season · 162 games</span>
		</header>
	<section class="season-totals" aria-labelledby="batting-heading">
		<div class="section-heading">
			<div>
				<h4 id="batting-heading" tabindex="-1">Batting</h4>
			</div>
			<p>Every plate appearance, including all games after the first loss.</p>
		</div>
		<div class="table-scroll stat-table-scroll" role="region" aria-label="Season batting totals" use:tableScroll>
			<table class="stat-table">
				<caption class="sr-only">Simulated season batting totals</caption>
				<thead>
					<tr>
						<th scope="col">Batter</th><th scope="col">PA</th><th scope="col">AB</th><th scope="col">H</th>
						<th scope="col">2B</th><th scope="col">3B</th><th scope="col" class="stat-key">HR</th><th scope="col" class="stat-group">BB</th>
						<th scope="col">HBP</th><th scope="col">SO</th><th scope="col" class="stat-group">R</th><th scope="col" class="stat-key">RBI</th>
						<th scope="col" class="stat-group">SB</th><th scope="col">CS</th><th scope="col">SF</th>
					</tr>
				</thead>
				<tbody>
					{#each result.batting as line}
						{@const profile = profileById.get(line.seasonId)}
						<tr>
							<th scope="row">
								<span class="stat-identity">{line.displayName}{#if profile}<small>{profile.year}</small>{/if}</span>
							</th>
							<td>{line.PA}</td><td>{line.AB}</td><td>{line.H}</td>
							<td>{line.doubles}</td><td>{line.triples}</td><td class="stat-key">{line.HR}</td><td class="stat-group">{line.BB}</td>
							<td>{line.HBP}</td><td>{line.SO}</td><td class="stat-group">{line.R}</td><td class="stat-key">{line.RBI}</td>
							<td class="stat-group">{line.SB}</td><td>{line.CS}</td><td>{line.SF}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<section class="season-totals" aria-labelledby="pitching-heading">
		<div class="section-heading">
			<div>
				<h4 id="pitching-heading" tabindex="-1">Pitching</h4>
			</div>
			<p>RA9 is runs allowed per nine innings. It is not simulated ERA.</p>
		</div>
		<div class="table-scroll stat-table-scroll" role="region" aria-label="Season pitching totals" use:tableScroll>
			<table class="stat-table pitching-table">
				<caption class="sr-only">Simulated season pitching totals</caption>
				<thead>
					<tr>
						<th scope="col">Pitcher</th><th scope="col">IP</th><th scope="col">H</th><th scope="col">BB</th>
						<th scope="col">HBP</th><th scope="col">SO</th><th scope="col" class="stat-group">R</th><th scope="col" class="stat-key">RA9</th>
						<th scope="col" class="stat-group">Starts</th><th scope="col">App.</th>
					</tr>
				</thead>
				<tbody>
					{#each result.pitching as line}
						{@const profile = profileById.get(line.seasonId)}
						<tr>
							<th scope="row">
								<span class="stat-identity">{pitcherName(line)}{#if profile}<small>{profile.year} · {line.role === 'support' ? 'BP' : line.role === 'closer' ? 'CL' : 'SP'}</small>{/if}</span>
							</th>
							<td>{innings(line.outs)}</td><td>{line.H}</td><td>{line.BB}</td>
							<td>{line.HBP}</td><td>{line.SO}</td><td class="stat-group">{line.R}</td><td class="stat-key">{ra9(line)}</td>
							<td class="stat-group">{line.starts}</td><td>{line.appearances}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="support-note muted">Support bullpen covers every relief inning not assigned to your closer.</p>
	</section>
	</section>

	<section class="game-log" aria-label="All 162 games">
		<div class="section-heading">
			<div>
				<p class="eyebrow">Every score counts</p>
				<h3 id="game-log-heading" tabindex="-1">All {result.games.length} games</h3>
			</div>
			<p>Open any game for its inning line and complete box score.</p>
		</div>
		<div class="game-list">
			{#each result.games as game (game.number)}
				<GameDetails {game} />
			{/each}
		</div>
	</section>

</section>

<style>
	.results {
		display: grid;
		gap: var(--space-10);
		min-width: 0;
	}
	.scoreboard {
		display: grid;
		gap: var(--space-6);
		padding: var(--space-6);
		background: var(--surface);
		border-block: 1px solid var(--border);
	}
	.record-block .eyebrow { margin: 0 0 var(--space-3); }
	.scoreboard h2 {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-score);
		font-weight: 850;
		line-height: 1;
		letter-spacing: -.05em;
	}
	.scoreboard h2 > span { display: inline-flex; align-items: baseline; gap: var(--space-2); }
	.scoreboard h2 small {
		color: var(--muted);
		font-size: var(--text-sm);
		font-weight: 650;
		letter-spacing: 0;
	}
	.scoreboard h2 i {
		color: var(--muted);
		font-size: var(--text-2xl);
		font-style: normal;
		font-weight: 500;
	}
	.season-ledger {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-4) var(--space-6);
		grid-column: 1 / -1;
		margin: 0;
		padding-top: var(--space-4);
		border-top: 1px solid var(--border);
	}
	dt { color: var(--muted); font-size: var(--text-xs); }
	dd { margin: var(--space-1) 0 0; font-size: var(--text-lg); font-weight: 750; }
	.season-ledger dd.perfect { color: var(--success); }
	.score-actions { display: grid; align-content: center; gap: var(--space-3); }
	.share-shortcuts { display: flex; flex-wrap: wrap; gap: var(--space-3); }
	.more-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); justify-self: start; }
	.more-actions a { display: inline-flex; align-items: center; text-decoration: none; }
	.season-review { display: grid; gap: var(--space-6); min-width: 0; }
	.review-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--space-2) var(--space-4); padding-top: var(--space-5); border-top: 1px solid var(--border); }
	.review-heading h3 { font-size: var(--text-xl); }
	.review-heading > span { color: var(--muted); font-size: var(--text-xs); }
	.season-totals, .game-log { display: grid; gap: var(--space-3); min-width: 0; }
	.section-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--space-2) var(--space-4); }
	.section-heading h3 { font-size: var(--text-xl); }
	.section-heading h4 { margin: 0; font-size: var(--text-base); font-weight: 750; }
	.section-heading > p { max-width: 60ch; margin: 0; color: var(--muted); font-size: var(--text-xs); }
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
	.stat-identity { display: flex; flex-wrap: wrap; align-items: baseline; gap: .2rem .5rem; max-width: 15rem; white-space: normal; }
	.stat-identity small { color: var(--muted); font-size: var(--text-xs); font-weight: 500; }
	.support-note { margin: 0; font-size: var(--text-xs); }
	.game-list { display: grid; min-width: 0; border-top: 1px solid var(--border); }
	@media (min-width: 64rem) {
		.game-list { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: var(--space-6); align-items: start; }
		.game-list :global(.game-detail[open]) { grid-column: 1 / -1; }
	}
	.baseball-atmosphere .eyebrow { margin-bottom: var(--space-3); }

	@media (min-width: 48rem) {
		.scoreboard {
			grid-template-columns: minmax(15rem, 1fr) auto;
			align-items: center;
			gap: var(--space-6) var(--space-8);
		}
		.season-ledger { grid-template-columns: repeat(5, minmax(0, 1fr)); }
		.score-actions { justify-items: end; }
		.share-shortcuts { justify-content: end; }
		.more-actions { justify-self: end; }
	}
	@media (max-width: 40rem) {
		.results { padding-bottom: calc(5.25rem + env(safe-area-inset-bottom)); }
		.scoreboard { padding: var(--space-4); }
		.scoreboard h2 { font-size: var(--text-3xl); }
		.share-shortcuts {
			position: fixed;
			z-index: 30;
			inset-inline: 0;
			bottom: 0;
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: var(--space-2);
			padding: var(--space-2) var(--space-3) calc(var(--space-2) + env(safe-area-inset-bottom));
			background: color-mix(in oklch, var(--background) 94%, transparent);
			border-top: 1px solid var(--border);
			backdrop-filter: blur(.65rem);
		}
	}
</style>
