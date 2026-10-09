<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import DraftBoard from '#lib/components/DraftBoard.svelte';
	import { commitPick, reassignPick, rollDraft } from '#lib/game/draft.ts';
	import type { Draft, HitterSlot, Profile, Slot } from '#lib/game/types.ts';
	import type { WarRankings } from '#lib/rankings/types.ts';
	import { createExampleFixtures, type ExampleFixtures } from './fixtures.ts';
	import StoryFrame from './StoryFrame.svelte';

	type InitialState = 'ready' | 'revealing' | 'choosing' | 'partial';
	type RankingState = 'ready' | 'loading' | 'unavailable';
	type DraftPhase = 'ready' | 'revealing' | 'choosing';

	let {
		initial = 'ready',
		loading = false,
		busy = false,
		commitError = false,
		rankingState = 'ready',
		embedded = false
	}: {
		initial?: InitialState;
		loading?: boolean;
		busy?: boolean;
		commitError?: boolean;
		rankingState?: RankingState;
		embedded?: boolean;
	} = $props();

	let fixtures = $state<ExampleFixtures>(createExampleFixtures());
	let draft = $state<Draft>(untrack(() => fixtures.initialDraft));
	let phase = $state<DraftPhase>('ready');
	let pool = $state<Profile[]>([]);
	let error = $state('');
	let effectiveRankingState = $state<RankingState>(untrack(() => rankingState));
	let instance = $state(0);
	let revealTimer: ReturnType<typeof setTimeout> | null = null;
	let observedInitial = untrack(() => initial);
	let observedRankingState = untrack(() => rankingState);

	const profilesBySeason = $derived(new Map(fixtures.profiles.map(profile => [profile.seasonId, profile])));
	const draftedProfiles = $derived(draft.picks.flatMap(pick => {
		const profile = profilesBySeason.get(pick.seasonId);
		return profile ? [profile] : [];
	}));
	const rankings = $derived<WarRankings | null>(effectiveRankingState === 'ready' ? fixtures.rankings : null);
	const rankingLoading = $derived(effectiveRankingState === 'loading');
	const rankingError = $derived(effectiveRankingState === 'unavailable');

	function clearRevealTimer(): void {
		if (revealTimer !== null) {
			clearTimeout(revealTimer);
			revealTimer = null;
		}
	}

	function poolFor(draftState: Draft, source = fixtures): Profile[] {
		const roll = draftState.currentRoll;
		if (!roll) return [];
		const seasonIds = new Set(source.manifest.candidates
			.filter(candidate => candidate.franchiseId === roll.franchiseId && candidate.decade === roll.decade)
			.map(candidate => candidate.seasonId));
		return source.profiles.filter(profile => seasonIds.has(profile.seasonId));
	}

	function configureInitialState(): void {
		clearRevealTimer();
		error = '';
		switch (initial) {
			case 'revealing':
				draft = fixtures.choosingDraft;
				phase = 'revealing';
				pool = [];
				beginReveal();
				break;
			case 'choosing':
				draft = fixtures.choosingDraft;
				phase = 'choosing';
				pool = poolFor(draft);
				break;
			case 'partial':
				draft = fixtures.partialDraft;
				phase = 'ready';
				pool = [];
				break;
			default:
				draft = fixtures.initialDraft;
				phase = 'ready';
				pool = [];
		}
	}

	function reset(): void {
		clearRevealTimer();
		fixtures = createExampleFixtures();
		effectiveRankingState = rankingState;
		instance += 1;
		configureInitialState();
	}

	function reducedMotion(): boolean {
		return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	function beginReveal(): void {
		clearRevealTimer();
		revealTimer = setTimeout(() => {
			revealTimer = null;
			phase = 'choosing';
			pool = poolFor(draft);
		}, reducedMotion() ? 0 : 550);
	}

	function roll(): void {
		if (busy || phase !== 'ready') return;
		try {
			draft = rollDraft(draft, fixtures.manifest);
			phase = 'revealing';
			pool = [];
			error = '';
			beginReveal();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not reveal the roll';
		}
	}

	function replay(): void {
		if (initial !== 'revealing') return;
		clearRevealTimer();
		draft = fixtures.choosingDraft;
		phase = 'revealing';
		pool = [];
		error = '';
		instance += 1;
		beginReveal();
	}

	function draftPlayer(seasonId: string, slot: Slot): void {
		if (busy || phase !== 'choosing') return;
		if (commitError) {
			error = 'Example draft confirmation failed';
			return;
		}
		try {
			draft = commitPick(draft, fixtures.manifest, seasonId, slot);
			phase = 'ready';
			pool = [];
			error = '';
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not commit the pick';
		}
	}

	function reassign(seasonId: string, slot: HitterSlot): void {
		if (busy) return;
		try {
			draft = reassignPick(draft, fixtures.manifest, seasonId, slot);
			error = '';
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not change the assignment';
		}
	}

	function loadRankings(): void {
		effectiveRankingState = 'ready';
	}
	configureInitialState();


	$effect(() => {
		const nextInitial = initial;
		if (nextInitial === observedInitial) return;
		observedInitial = nextInitial;
		untrack(reset);
	});

	$effect(() => {
		const nextRankingState = rankingState;
		if (nextRankingState === observedRankingState) return;
		observedRankingState = nextRankingState;
		untrack(() => effectiveRankingState = nextRankingState);
	});

	onDestroy(clearRevealTimer);
</script>

{#snippet board()}
	<div class="draft-workshop">
		{#if rankingLoading}
			<div class="ranking-status" role="status">
				<p>Example rankings are loading.</p>
				<button class="secondary" type="button" onclick={loadRankings}>Load rankings</button>
			</div>
		{:else if rankingError}
			<p class="ranking-status" role="alert">Example rankings are unavailable. Use the production retry control to load them.</p>
		{/if}
		{#key instance}
			<DraftBoard
				{draft}
				manifest={fixtures.manifest}
				{pool}
				profiles={draftedProfiles}
				{phase}
				{loading}
				{busy}
				{error}
				{rankings}
				{rankingLoading}
				{rankingError}
				onRetryRankings={loadRankings}
				onRoll={roll}
				onDraft={draftPlayer}
				onReassign={reassign}
				onNew={reset}
			/>
		{/key}
	</div>
{/snippet}

{#if embedded}
	{@render board()}
{:else}
	<StoryFrame onReset={reset} onReplay={initial === 'revealing' ? replay : undefined} wide>
		{@render board()}
	</StoryFrame>
{/if}

<style>
	.draft-workshop { min-width: 0; }
	.ranking-status { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin: 0 0 var(--space-4); padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
	.ranking-status p { margin: 0; }
</style>
