<script module lang="ts">
	import type { SeasonGrade } from '#lib/game/grade.ts';

	export type TeamCardFixture = 'current' | 'retired';

	export interface TeamCardWorkshopProps {
		face?: 'front' | 'back';
		interactive?: boolean;
		fixture?: TeamCardFixture;
	}

	export const GALLERY_GRADES: readonly SeasonGrade[] = ['F', 'D', 'C', 'B', 'A', 'AA', 'S', 'S+', 'Perfect'];
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import ClubCard, { type ClubCardStat } from '#lib/components/library/ClubCard.svelte';
	import { createCardViewModel, type CardMediaStatus } from '#lib/cards/view-model.ts';
	import { gradeRange } from '#lib/game/grade.ts';
	import { stars as starSeasonIds } from '#lib/game/library-stats.ts';
	import type { LibraryView } from '#lib/game/library.ts';
	import type { Manifest, Profile } from '#lib/game/types.ts';
	import { loadMedia } from '#lib/media/client.ts';
	import type { MediaManifest } from '#lib/media/types.ts';
	import { getExampleSeries } from './series-fixtures.ts';
	import StoryFrame from './StoryFrame.svelte';

	let { face = 'front', interactive = true, fixture = 'current' }: TeamCardWorkshopProps = $props();
	let shownFace = $state<'front' | 'back'>('front');
	$effect(() => { shownFace = face; });
	let saved = $state<readonly LibraryView[]>([]);
	let libraryProfiles = $state<ReadonlyMap<string, readonly Profile[]>>(new Map());
	let manifest = $state<Manifest | null>(null);
	let media = $state<MediaManifest | null>(null);
	let mediaStatus = $state<CardMediaStatus>('loading');
	let loading = $state(true);
	let error = $state('');
	let instance = $state(0);
	const entry = $derived(saved.find(item => (fixture === 'retired' ? item.status === 'retired' : item.status === 'playable')) ?? null);
	const profiles = $derived(entry ? libraryProfiles.get(entry.key) ?? [] : []);
	const cardViews = $derived.by(() => {
		if (!entry) return [];
		const slots = new Map(entry.roster.map(pick => [pick.seasonId, pick.slot]));
		return profiles.map(profile => createCardViewModel({ profile, slot: slots.get(profile.seasonId) ?? null, media, manifest, mediaStatus }));
	});
	const starCards = $derived.by(() => {
		if (!entry) return [];
		const views = new Map(cardViews.map(view => [view.seasonId, view]));
		return starSeasonIds(entry, 6).flatMap(seasonId => {
			const view = views.get(seasonId);
			return view ? [{ seasonId, view }] : [];
		});
	});

	function statsFor(team: LibraryView): ClubCardStat[] {
		const differential = team.runs.scored - team.runs.allowed;
		return [
			{ label: 'Run differential', value: `${differential > 0 ? '+' : differential < 0 ? '−' : ''}${Math.abs(differential)}`, primary: true },
			{ label: 'Win %', value: `${(team.record.wins / Math.max(1, team.record.wins + team.record.losses) * 100).toFixed(1)}%` }
		];
	}

	onMount(() => {
		let live = true;
		void getExampleSeries()
			.then(example => {
				if (!live) return;
				saved = example.library;
				libraryProfiles = example.libraryProfiles;
				manifest = example.manifest;
			})
			.catch((reason: unknown) => { if (live) error = reason instanceof Error ? reason.message : 'Unable to prepare the example team cards.'; })
			.finally(() => { if (live) loading = false; });
		void loadMedia()
			.then(value => { if (live) { media = value; mediaStatus = 'ready'; } })
			.catch(() => { if (live) mediaStatus = 'unavailable'; });
		return () => { live = false; };
	});
</script>

<StoryFrame wide onReset={() => { instance += 1; shownFace = face; }} fixtureNotice="One real fixture roster, media set, stats, and saved record are shown across all nine grade treatments. The retired fixture keeps its own saved status and record.">
	{#key instance}
	{#if loading}
		<p class="muted" role="status">Loading the example team…</p>
	{:else if error}
		<p class="error" role="alert">{error}</p>
	{:else if entry}
		<section class="page" aria-labelledby="team-card-gallery-title">
			<header>
				<p class="eyebrow">Saved team · {fixture}</p>
				<h1 id="team-card-gallery-title">Nine season grades</h1>
				<p class="lede muted">Compare one saved team’s finish from F through Perfect. Use the face control below or Storybook’s face arg to inspect the same supplied roster and stats on the reverse.</p>
				<div class="face-controls" role="group" aria-label="Preview face">
					<span>Face</span>
					<button type="button" aria-pressed={shownFace === 'front'} onclick={() => shownFace = 'front'}>Show fronts</button>
					<button type="button" aria-pressed={shownFace === 'back'} onclick={() => shownFace = 'back'}>Show backs</button>
				</div>
			</header>
			<div class="gallery" role="region" aria-label="Nine-grade team card preview">
				{#each GALLERY_GRADES as grade (grade)}
					<figure data-gallery-grade={grade}>
						<figcaption><strong>{grade}</strong><span>{gradeRange(grade)}</span></figcaption>
						<ClubCard
							title={entry.nickname ?? 'Example Aces'}
							parkName={entry.stadium?.name ?? 'No home park'}
							recordLabel={`${entry.record.wins}–${entry.record.losses}`}
							{grade}
							stats={statsFor(entry)}
							footer={new Date(entry.savedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
							roster={entry.roster}
							stars={starCards}
							face={shownFace}
							{interactive}
							retired={entry.status === 'retired'}
						/>
					</figure>
				{/each}
			</div>
		</section>
	{/if}
	{/key}
</StoryFrame>

<style>
	.page { display: grid; gap: var(--space-5); }
	header { display: grid; gap: var(--space-2); max-width: 58ch; }
	.eyebrow { margin: 0; color: var(--muted); font-size: var(--text-xs); font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
	h1 { margin: 0; font-size: clamp(2rem, 5vw, 3rem); letter-spacing: -.03em; }
	.lede { margin: 0; }
	.face-controls { display: inline-flex; align-items: center; flex-wrap: wrap; gap: var(--space-1); width: fit-content; padding: var(--space-1); border: 1px solid var(--border); border-radius: 999px; background: var(--surface); }
	.face-controls > span { padding-inline: var(--space-2); color: var(--muted); font-size: var(--text-xs); font-weight: 700; text-transform: uppercase; }
	.face-controls button { min-height: 2.25rem; padding: .2rem .75rem; border: 0; border-radius: 999px; background: transparent; color: var(--muted); font: inherit; font-size: var(--text-sm); }
	.face-controls button[aria-pressed='true'] { background: var(--surface-raised); color: var(--text); }
	.gallery { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-5); align-items: start; }
	figure { display: grid; gap: var(--space-2); min-width: 0; margin: 0; }
	figcaption { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-2); color: var(--text); }
	figcaption strong { font-size: var(--text-lg); }
	figcaption span { color: var(--muted); font-size: var(--text-xs); text-align: right; }
	@media (max-width: 54rem) {
		.gallery { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); }
	}
	@media (max-width: 36rem) {
		.gallery { grid-template-columns: minmax(0, 1fr); }
	}
	.error { margin: 0; color: var(--error); }
</style>
