<script lang="ts">
	import { onMount, tick } from 'svelte';
	import CardReview from '../cards/CardReview.svelte';
	import type { CardViewModel } from '../cards/view-model.ts';
	import { challengeSeriesPath, type Challenge } from '../game/challenge.ts';
	import { createResultsModel } from '../game/results-model.ts';
	import { encodeReplay } from '../game/share.ts';
	import type { Draft, Manifest, Profile } from '../game/types.ts';
	import { innings } from '../game/format.ts';
	import { loadMedia } from '../media/client.ts';
	import type { MediaManifest } from '../media/types.ts';
	import type { WarRankings } from '../rankings/types.ts';
	import { createShareRenderModel } from '../share/model.ts';
	import type { ShareAction, ShareFormat, SharePublication, ShareRenderModel } from '../share/types.ts';
	import type { PitcherLine, SeasonResult } from '../sim/types.ts';
	import StickerBadge from '../collection/StickerBadge.svelte';
	import { STICKER_BY_KIND } from '../collection/stickers.ts';
	import type { NewSticker } from '../collection/collection.ts';
	import GradeBadge from './GradeBadge.svelte';
	import { gradeRange, seasonGrade } from '../game/grade.ts';
	import SeasonCalendar from './SeasonCalendar.svelte';
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
		onShare: (action: ShareAction, format: ShareFormat, model: ShareRenderModel) => void;
		publication: SharePublication | null;
		sharing: boolean;
		shareStatus: string;
		/** A friend's season this draft was started to answer; the page then leads with the series. */
		challenge?: Challenge | null;
		/** Stickers this season earned for the first time. */
		newStickers?: readonly NewSticker[];
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
		newStickers = []
	}: Props = $props();
	const earnedByCard = $derived([...Map.groupBy(newStickers, item => item.seasonId).values()]);
	const grade = $derived(seasonGrade(result.wins, result.losses));
	const challengeVerdict = $derived(challenge
		? result.wins > challenge.wins ? 'You beat their record.' : result.wins === challenge.wins ? 'You matched their record.' : 'You fell short of their record.'
		: '');

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
	{#if challenge}
		<aside class="challenge-offer" aria-labelledby="challenge-offer-heading">
			<div>
				<p class="eyebrow">Challenge</p>
				<h2 id="challenge-offer-heading">{challengeVerdict} They went {challenge.wins}–{challenge.losses}.</h2>
			</div>
			<a class="button primary" href={challengeSeriesPath(encodeReplay(draft), challenge)}>Play the best-of-five</a>
		</aside>
	{/if}
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
			{#if grade}<p class="season-grade"><span class="badge"><GradeBadge {grade} /></span><span>Grade {grade} · {gradeRange(grade)}</span></p>{/if}
		</div>

		<div class="score-actions" aria-busy={sharing}>
			<div class="share-shortcuts">
				<button class="primary" type="button" disabled={sharing} onclick={() => onShare('challenge', 'field', shareModel)}>{sharing ? 'Preparing…' : 'Challenge a friend'}<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M5 11l6-6M6 5h5v5"></path></svg></button>
				<button class="secondary" type="button" disabled={sharing} onclick={() => onShare('copy-link', 'field', shareModel)}><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 0 1 4.5 9l1-1"></path></svg>{sharing ? 'Preparing…' : 'Copy link'}</button>
			</div>
			<div class="more-actions">
				<a class="button" href="/seasons"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 5.5h9l-2.5-2.5M13 10.5H4l2.5 2.5"></path></svg>Play head-to-head</a>
				<button class="new-draft" type="button" onclick={onNew}><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 3.5v9M3.5 8h9"></path></svg>New draft</button>
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

	{#if earnedByCard.length}
		<details class="new-stickers">
			<summary>
				<span class="new-stickers-head">
					<h3 id="new-stickers-heading">New stickers</h3>
					<span class="muted">{newStickers.length} on {earnedByCard.length} {earnedByCard.length === 1 ? 'card' : 'cards'}</span>
				</span>
				<span class="summary-badges" aria-hidden="true">
					{#each [...new Set(newStickers.map(item => item.kind))].slice(0, 6) as kind (kind)}<StickerBadge definition={STICKER_BY_KIND.get(kind)!} />{/each}
				</span>
			</summary>
			<ul aria-labelledby="new-stickers-heading">
				{#each earnedByCard as earned (earned[0].seasonId)}
					<li>
						<span class="badges" aria-hidden="true">
							{#each earned as item (item.kind)}<StickerBadge definition={STICKER_BY_KIND.get(item.kind)!} />{/each}
						</span>
						<span class="sticker-copy"><strong>{earned[0].label}</strong> {earned.map(item => item.title).join(' · ')}</span>
					</li>
				{/each}
			</ul>
			<a href="/collection">Open your collection</a>
		</details>
	{/if}

	<div class="awards-share">
		<ResultsAwards featured={resultsModel.featured} {cardViews} selectedSeasonId={inspectedSeasonId} reviewId={resultsReviewId} onInspect={inspectCard} />
		<ShareBlock
			model={shareModel}
			{publication}
			{sharing}
			status={shareStatus}
			onShare={(action, format) => onShare(action, format, shareModel)}
		/>
	</div>

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
				flipInPlace
				onClose={closeInspection}
			/>
		{/key}
	{/if}


	<nav class="result-nav" aria-label="Season results sections">
		<button class="quiet" type="button" onclick={() => jumpTo('batting-heading')}>Batting totals</button>
		<button class="quiet" type="button" onclick={() => jumpTo('pitching-heading')}>Pitching totals</button>
		<button class="quiet" type="button" onclick={() => jumpTo('game-log-heading')}>All 162 games <span aria-hidden="true">↓</span></button>
	</nav>

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
						<tr>
							<th scope="row">
								<span class="stat-identity">{line.displayName}<small>{line.position} · {line.year}</small></span>
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
						<tr>
							<th scope="row">
								<span class="stat-identity">{pitcherName(line)}<small>{line.role === 'support' ? 'BP' : line.role === 'closer' ? 'CL' : line.role === 'reliever' ? 'RP' : 'SP'} · {line.year}</small></span>
							</th>
							<td>{innings(line.outs)}</td><td>{line.H}</td><td>{line.BB}</td>
							<td>{line.HBP}</td><td>{line.SO}</td><td class="stat-group">{line.R}</td><td class="stat-key">{ra9(line)}</td>
							<td class="stat-group">{line.starts}</td><td>{line.appearances}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="support-note muted">A league-average relief pool, listed as BP, covers every relief inning your closer and named relievers do not take.</p>
	</section>
	</section>

	<section class="game-log" aria-label="All 162 games">
		<div class="section-heading">
			<div>
				<p class="eyebrow">Every score counts</p>
				<h3 id="game-log-heading" tabindex="-1">All {result.games.length} games</h3>
			</div>
			<p>Choose any game for its inning line and complete box score.</p>
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
	.scoreboard {
		display: grid;
		gap: var(--space-6);
		padding: var(--space-6);
		background: var(--surface);
		border-block: 1px solid var(--border);
	}
	.record-block .eyebrow { margin: 0 0 var(--space-3); }
	.season-grade { display: flex; align-items: center; gap: var(--space-3); margin: var(--space-3) 0 0; color: var(--muted); font-size: var(--text-sm); font-weight: 650; }
	.season-grade .badge { font-size: var(--text-2xl); }
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
	.new-stickers { display: grid; gap: var(--space-3); border-block: 1px solid var(--border); }
	.new-stickers summary { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-4); min-height: 3rem; padding-block: var(--space-2); cursor: pointer; list-style: none; }
	.new-stickers summary::-webkit-details-marker { display: none; }
	.new-stickers summary::after { content: '›'; color: var(--muted); font-size: var(--text-lg); transition: rotate .15s; }
	.new-stickers[open] summary::after { rotate: 90deg; }
	.new-stickers-head { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-1) var(--space-3); margin-right: auto; }
	.new-stickers-head .muted { font-size: var(--text-xs); }
	.new-stickers h3 { margin: 0; font-size: var(--text-lg); }
	.summary-badges { display: inline-flex; gap: var(--space-1); font-size: .1rem; padding: .2rem; }
	.new-stickers a { min-height: 2.75rem; display: inline-flex; align-items: center; color: var(--accent); font-size: var(--text-sm); }
	.new-stickers ul { display: grid; gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
	.new-stickers li { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); color: var(--muted); font-size: var(--text-sm); }
	.new-stickers li strong { color: var(--text); }
	.new-stickers .badges { display: inline-flex; flex-wrap: wrap; gap: var(--space-2); font-size: .11rem; padding: .2rem; }
	.new-stickers[open] .summary-badges { display: none; }
	.sticker-copy { flex: 1 1 14rem; min-width: 0; }
	dt { color: var(--muted); font-size: var(--text-xs); }
	dd { margin: var(--space-1) 0 0; font-size: var(--text-lg); font-weight: 750; }
	.season-ledger dd.perfect { color: var(--success); }
	/* Two equal columns: the share pair at full size, then the smaller head-to-head / new-draft pair. */
	.score-actions { display: grid; align-content: center; gap: var(--space-2); width: min(100%, 24rem); }
	.share-shortcuts, .more-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); }
	.score-actions button, .score-actions .button { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); white-space: nowrap; }
	.score-actions svg { flex: none; width: 1rem; height: 1rem; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
	.share-shortcuts button { min-height: 3rem; }
	.share-shortcuts .secondary { border-color: var(--border-strong, var(--border)); }
	.more-actions .button, .more-actions button { min-height: 2.75rem; padding-inline: var(--space-3); border-color: var(--border); background: transparent; color: var(--muted); font-size: var(--text-sm); }
	.more-actions .button:hover, .more-actions button:hover { color: var(--text); background: var(--surface-raised); }
	/* Wide screens set the 2×2 awards beside the share panel; narrower ones stack them. */
	.awards-share { display: grid; gap: var(--space-8); min-width: 0; }
	.awards-share > :global(.share-panel) { grid-template-columns: minmax(0, 1fr); padding-block: var(--space-6) 0; border-bottom: 0; }
	@media (min-width: 64rem) {
		.awards-share { grid-template-columns: minmax(0, 1fr) 24rem; align-items: start; }
		.awards-share > :global(.share-panel) { padding-block: 0; border-block: 0; }
	}
	.season-review { display: grid; gap: var(--space-6); min-width: 0; }
	.review-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--space-2) var(--space-4); padding-top: var(--space-5); border-top: 1px solid var(--border); }
	.review-heading h3 { font-size: var(--text-xl); }
	.review-heading > span { color: var(--muted); font-size: var(--text-xs); }
	.season-totals, .game-log { display: grid; gap: var(--space-3); min-width: 0; }
	.section-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--space-2) var(--space-4); }
	.section-heading h3 { font-size: var(--text-xl); }
	.section-heading h4 { margin: 0; font-size: var(--text-base); font-weight: 750; }
	.section-heading > p { max-width: 60ch; margin: 0; color: var(--muted); font-size: var(--text-xs); }
	.challenge-offer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3) var(--space-6); padding: var(--space-4) var(--space-5); border: 1px solid var(--accent); border-radius: var(--radius-lg); background: color-mix(in oklch, var(--accent) 10%, var(--surface)); }
	.challenge-offer .eyebrow { margin: 0 0 var(--space-1); color: var(--accent); }
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
	.support-note { margin: 0; font-size: var(--text-xs); }

	@media (min-width: 48rem) {
		.scoreboard {
			grid-template-columns: minmax(15rem, 1fr) auto;
			align-items: center;
			gap: var(--space-6) var(--space-8);
		}
		.season-ledger { grid-template-columns: repeat(5, minmax(0, 1fr)); }
		.score-actions { justify-self: end; }
	}
	@media (max-width: 40rem) {
		/* The fixed share bar never covers the last game; the site footer keeps its own clearance. */
		.results { padding-bottom: calc(5.25rem + env(safe-area-inset-bottom)); }
		.scoreboard { padding: var(--space-4); }
		.scoreboard h2 { font-size: var(--text-3xl); }
		/* Three equal jump links on one row instead of a ragged wrap. */
		.result-nav { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; }
		.result-nav button { justify-content: center; padding-inline: var(--space-1); font-size: var(--text-xs); text-align: center; line-height: 1.2; }
		.result-nav button + button { border-left: 1px solid var(--border); border-radius: 0; }
		.score-actions button, .score-actions .button { white-space: normal; text-align: center; line-height: 1.15; }
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
