<script lang="ts">
	import { onMount, tick } from 'svelte';
	import Card from '../cards/Card.svelte';
	import CardReview from '../cards/CardReview.svelte';
	import { createCardViewModel, type CardMediaStatus } from '../cards/view-model.ts';
	import { compareId } from '../game/types.ts';
	import type { Manifest, Profile, Slot } from '../game/types.ts';
	import { loadMedia } from '../media/client.ts';
	import type { MediaManifest } from '../media/types.ts';
	import type { WarRankings, WarSeasonRanking } from '../rankings/types.ts';

	let {
		profile,
		seasons,
		onSeasonChange,
		legalSlots,
		assignedSlot,
		war,
		selected = false,
		compact = false,
		draftMode = false,
		wide = false,
		turned = $bindable(false),
		onSelect,
		onPlace,
		manifest = null,
		ranking = null,
		rankings = null,
		rankingLoading = false,
		rankingError = false,
		inspectionReturnFocus = null
	}: {
		profile: Profile;
		seasons?: Profile[];
		onSeasonChange?: (seasonId: string) => void;
		legalSlots?: readonly Slot[];
		assignedSlot?: Slot;
		war?: number | null;
		selected?: boolean;
		compact?: boolean;
		draftMode?: boolean;
		wide?: boolean;
		turned?: boolean;
		onSelect?: (trigger: HTMLButtonElement) => void;
		onPlace?: (slot: Slot, trigger: HTMLButtonElement) => void;
		manifest?: Manifest | null;
		ranking?: WarSeasonRanking | null;
		rankings?: WarRankings | null;
		rankingLoading?: boolean;
		rankingError?: boolean;
		inspectionReturnFocus?: HTMLElement | null;
	} = $props();

	const uid = $props.id();
	let media = $state.raw<MediaManifest | null>(null);
	let mediaStatus = $state<CardMediaStatus>('loading');
	let artTrigger = $state<HTMLButtonElement>();
	let review = $state<CardReview>();
	let reviewOpen = $state(false);
	let reviewTurned = $state(false);
	let reviewTextBack = $state(false);
	let reviewTrigger = $state<HTMLElement | null>(null);
	let reviewSeasonId = $state<string | null>(null);

	const seasonChoices = $derived.by(() => {
		const unique = new Map<string, Profile>();
		for (const season of seasons?.length ? seasons : [profile]) unique.set(season.seasonId, season);
		if (!unique.has(profile.seasonId)) unique.set(profile.seasonId, profile);
		return [...unique.values()].sort((left, right) => left.year - right.year || compareId(left.seasonId, right.seasonId));
	});
	const available = $derived(legalSlots ? profile.eligibleSlots.filter(slot => legalSlots.includes(slot)) : []);
	const card = $derived(createCardViewModel({
		profile,
		slot: assignedSlot ?? null,
		war,
		ranking,
		rankings,
		manifest,
		media,
		mediaStatus
	}));
	const rankingStatus = $derived.by(() => {
		if (card.cardRole === 'bullpen' || card.st1.v !== '—') return null;
		if (rankingLoading) return 'WAR/162 is loading. Drafting remains available.';
		if (rankingError) return 'WAR/162 is unavailable. Drafting remains available.';
		return 'WAR/162 is unavailable. Drafting remains available.';
	});

	function inspect(trigger: HTMLElement | undefined): void {
		if (!trigger || draftMode) return;
		reviewTrigger = trigger;
		reviewTurned = false;
		reviewTextBack = false;
		reviewOpen = true;
		void tick().then(() => review?.focusHeading());
	}

	function closeReview(): void {
		const previousTrigger = reviewTrigger;
		reviewTrigger = null;
		reviewOpen = false;
		void tick().then(() => {
			const visible = previousTrigger?.isConnected && previousTrigger.getClientRects().length ? previousTrigger : null;
			const fallback = inspectionReturnFocus?.isConnected && inspectionReturnFocus.getClientRects().length ? inspectionReturnFocus : null;
			(visible ?? fallback ?? artTrigger)?.focus({ preventScroll: true });
		});
	}

	function select(trigger: HTMLButtonElement): void {
		onSelect?.(trigger);
	}

	function place(slot: Slot, trigger: HTMLButtonElement): void {
		if (!available.includes(slot)) return;
		onPlace?.(slot, trigger);
	}
	$effect(() => {
		const nextSeasonId = profile.seasonId;
		if (reviewSeasonId !== null && reviewSeasonId !== nextSeasonId) {
			reviewTurned = false;
			reviewTextBack = false;
		}
		reviewSeasonId = nextSeasonId;
	});

	onMount(() => {
		let disposed = false;
		void loadMedia()
			.then(value => {
				if (disposed) return;
				media = value;
				mediaStatus = 'ready';
			})
			.catch(() => {
				if (!disposed) mediaStatus = 'unavailable';
			});
		return () => { disposed = true; };
	});
</script>

<article
	class="player-card"
	class:selected
	class:compact
	class:draft-mode={draftMode}
	class:wide
	data-season-id={profile.seasonId}
	aria-label={`${profile.year} ${profile.displayName} player card`}
>
	<header class="controller">
		{#if draftMode && wide}
			<div class="wide-controls" role="group" aria-label={`Season and placement controls for ${profile.displayName}`}>
				{#if onSeasonChange}
					<label class="season-picker wide-season-picker">
						<span class="sr-only">Exact season</span>
						<select
							aria-label={`Exact season for ${profile.displayName}`}
							value={profile.seasonId}
							onchange={event => onSeasonChange?.(event.currentTarget.value)}
						>
							{#each seasonChoices as season (season.seasonId)}
								<option value={season.seasonId}>{season.year}</option>
							{/each}
						</select>
					</label>
				{:else}
					<span class="fixed-season"><span class="sr-only">Exact season</span><strong>{profile.year}</strong></span>
				{/if}
				<span class="placement-list" aria-label={`Preview placement for ${profile.displayName} ${profile.year}`}>
					{#each profile.eligibleSlots as slot}
						{@const open = available.includes(slot)}
						<button
							type="button"
							class="placement"
							disabled={!open}
							aria-label={open ? `Preview ${profile.year} ${profile.displayName} at ${slot}` : `${slot} unavailable for ${profile.year} ${profile.displayName}`}
							title={open ? `${slot} placement preview` : `${slot} unavailable`}
							onclick={event => open && place(slot, event.currentTarget)}
						>{slot}</button>
					{/each}
				</span>
				{#if legalSlots !== undefined && !available.length}<span class="no-open-position">No open position</span>{/if}
				<button type="button" class="draft-turn" aria-label="Turn over" aria-pressed={turned} onclick={() => turned = !turned}>
					<span aria-hidden="true">↻</span><span class="sr-only">Turn over</span>
				</button>
			</div>
		{:else}
			<div class="season-row">
				{#if onSeasonChange}
					<label class="season-picker">
						<span>Exact season</span>
						<select
							aria-label={`Exact season for ${profile.displayName}`}
							value={profile.seasonId}
							onchange={event => onSeasonChange?.(event.currentTarget.value)}
						>
							{#each seasonChoices as season (season.seasonId)}
								<option value={season.seasonId}>{season.year}</option>
							{/each}
						</select>
					</label>
				{:else}
					<div class="fixed-season"><span>Exact season</span><strong>{profile.year}</strong></div>
				{/if}
				{#if assignedSlot}<span class="assignment">Assigned {assignedSlot}</span>{/if}
			</div>

			{#if draftMode}
				<p class="compact-qualification"><strong>{profile.year}</strong> · {profile.eligibleSlots.join(' · ')}{available.length ? ` · Open ${available.join(' · ')}` : legalSlots !== undefined ? ' · No open position' : ''}</p>
			{:else}
				<div class="qualification" aria-label="Season qualifications and availability">
					<div role="group" aria-label="Qualifies for">
						<span class="qualification-label">Qualifies for</span>
						<span class="slot-list">{#each profile.eligibleSlots as slot}<span class:available-slot={legalSlots?.includes(slot)} class:assigned-slot={assignedSlot === slot}>{slot}</span>{/each}</span>
					</div>
					{#if legalSlots !== undefined}
						<div role="group" aria-label="Available now"><span class="qualification-label">Available now</span><strong>{available.length ? available.join(' · ') : 'None'}</strong></div>
						{#if available.length === 0}<p>Reassign your roster to make room.</p>{/if}
					{/if}
				</div>
			{/if}
		{/if}
		{#if rankingStatus}<p class="ranking-status" role="status">{rankingStatus}</p>{/if}
	</header>
	

	<div class="art-frame">
		{#if draftMode}
			{#if wide}
				<CardReview
					bind:turned
					s={card}
					showControl={false}
					onFrontSelect={select}
				/>
			{:else}
				<button
					bind:this={artTrigger}
					type="button"
					class="art-trigger"
					aria-label={`Select ${profile.year} ${profile.displayName}`}
					onclick={event => select(event.currentTarget)}
				>
					<Card s={card} {compact} interactive={!compact} onDetails={() => undefined} />
				</button>
			{/if}
		{:else}
			<button
				bind:this={artTrigger}
				type="button"
				class="art-trigger"
				aria-label={`Inspect ${profile.year} ${profile.displayName} card`}
				aria-expanded={reviewOpen}
				aria-controls={`${uid}-review`}
				onclick={event => inspect(event.currentTarget)}
			>
				<Card s={card} {compact} interactive={!compact} thumbnail={compact} onDetails={() => inspect(artTrigger)} />
			</button>
		{/if}
	</div>
	{#if !draftMode && reviewOpen}
			<CardReview
				bind:this={review}
				id={`${uid}-review`}
				s={card}
				bind:turned={reviewTurned}
				bind:textBack={reviewTextBack}
				onClose={closeReview}
			/>
		{/if}

	{#if compact}
		<p class="compact-identity"><strong>{profile.displayName}</strong><span>{profile.year} · {assignedSlot ?? card.pos}</span></p>
	{/if}

	{#if !draftMode}
		<div class="card-actions">
			<button
				type="button"
				class="inspect"
				aria-expanded={reviewOpen}
				aria-controls={`${uid}-review`}
				onclick={event => inspect(event.currentTarget)}
			>Inspect card</button>
		</div>
	{/if}
</article>

<style>
	.player-card {
		--card-ink: var(--text);
		--card-muted: var(--muted);
		display: grid;
		gap: .75rem;
		width: 100%;
		max-width: 22rem;
		min-width: 0;
		color: var(--card-ink);
	}
	.player-card:not(.compact):not(.draft-mode) { min-width: min(17rem, 100%); }
	.player-card.draft-mode { max-width: none; }
	.draft-mode .art-frame { order: 0; }
	.draft-mode .controller { order: 1; }
	.draft-turn { grid-column: 2; grid-row: 1; min-width: 2.75rem; min-height: 2.75rem; box-sizing: border-box; padding: 0 .6rem; color: var(--card-ink); background: var(--surface-raised, var(--surface)); border: 1px solid var(--border); border-radius: .25rem; font-size: 1.1rem; }
	.draft-turn[aria-pressed='true'] { visibility: hidden; pointer-events: none; }
	.draft-mode:not(.wide) .ranking-status { display: none; }
	.draft-mode.wide .ranking-status { display: none; }
	.player-card.draft-mode.selected .art-frame { transform: translateY(-.2rem); }
	.player-card.draft-mode.selected .art-frame > :global(*) { outline: 3px solid var(--focus); outline-offset: 4px; }
	.player-card.draft-mode:not(.selected) .art-frame { transition: opacity .18s ease-out, transform .18s ease-out; }
	.controller { display: grid; gap: .55rem; }
	.season-row { display: flex; align-items: end; justify-content: space-between; gap: .6rem; }
	.draft-mode:not(.wide) .season-row { display: none; }
	.season-picker, .fixed-season { display: grid; gap: .2rem; min-width: 0; }
	.season-picker > span, .fixed-season > span, .qualification-label { color: var(--card-muted); font-size: .7rem; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
	.season-picker select { width: 100%; min-height: 2.75rem; padding: .4rem 2rem .4rem .55rem; color: var(--card-ink); background: var(--surface-raised, var(--surface)); border-color: var(--border); font-weight: 750; }
	.fixed-season strong { font-size: 1.25rem; line-height: 1; }
	.assignment { flex: 0 0 auto; padding: .28rem .5rem; color: var(--card-ink); background: color-mix(in oklch, var(--surface) 72%, var(--focus)); border: 1px solid var(--border); border-radius: 999px; font-size: .7rem; font-weight: 750; }
	.qualification { display: grid; gap: .42rem; padding-block: .55rem; border-block: 1px solid var(--border); font-size: .76rem; }
	.qualification > div { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem .65rem; }
	.slot-list { display: flex; flex-wrap: wrap; gap: .3rem; }
	.slot-list > span { min-width: 2rem; padding: .16rem .35rem; color: var(--card-muted); background: var(--surface-raised, var(--surface)); border: 1px solid var(--border); border-radius: .2rem; font-weight: 750; text-align: center; }
	.slot-list > .available-slot, .slot-list > .assigned-slot { color: var(--card-ink); border-color: var(--focus); }
	.qualification p, .ranking-status, .compact-qualification { margin: 0; font-weight: 750; }
	.ranking-status { color: var(--card-muted); font-size: .78rem; line-height: 1.4; }
	.compact-qualification { color: var(--card-muted); font-size: .76rem; line-height: 1.35; overflow-wrap: anywhere; }
	.compact-qualification strong { color: var(--card-ink); }
	.placement-list { display: flex; flex-wrap: wrap; gap: .35rem; min-width: 0; max-width: 100%; }
	.placement { min-height: 2.75rem; min-width: 2.75rem; box-sizing: border-box; padding: .3rem .5rem; color: var(--card-ink); background: color-mix(in oklch, var(--surface) 72%, var(--focus)); border: 1px solid var(--focus); border-radius: .25rem; font-size: .72rem; font-weight: 750; }
	.wide-controls { display: flex; flex-wrap: nowrap; align-items: center; gap: .35rem; width: calc(100% + 1rem); box-sizing: border-box; margin: -.5rem; padding: .5rem; overflow-x: auto; }
	.wide-season-picker { flex: 1 0 4.5rem; min-width: 4.5rem; }
	.wide-season-picker select { width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; min-height: 2.75rem; padding-block: .25rem; }
	.wide-controls .placement-list { display: contents; }
	.wide-controls .placement { flex: 0 0 2.75rem; }
	.placement:disabled { color: var(--card-muted); border-color: var(--border); background: var(--surface); cursor: not-allowed; opacity: .7; text-decoration: line-through; }
	.no-open-position { flex: none; white-space: nowrap; color: var(--card-muted); font-size: .72rem; font-weight: 700; }
	.art-frame { width: min(100%, 20rem); margin-inline: auto; }
	.draft-mode.wide { --card-front-width: 100%; --card-back-width: 410px; }
	.draft-mode.wide .art-frame { width: 100%; }
	.art-trigger { all: unset; display: block; width: 100%; cursor: pointer; }
	.art-trigger:focus-visible { outline: 3px solid var(--focus); outline-offset: 4px; }
	.draft-turn:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
	.card-actions { display: grid; grid-template-columns: 1fr; gap: .5rem; }
	.card-actions button { min-height: 2.75rem; }
	.compact { max-width: 12rem; gap: .5rem; }
	.compact .controller { display: none; }
	.compact .art-frame { width: min(100%, 8rem); min-width: 72px; }
	.compact-identity { display: grid; gap: .14rem; margin: 0; font-size: .78rem; line-height: 1.25; text-align: center; }
	.compact-identity strong { overflow-wrap: anywhere; }
	.compact-identity span { color: var(--card-muted); }
	.compact .card-actions { grid-template-columns: 1fr; }
	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
	@media (max-width: 22rem) { .card-actions { grid-template-columns: 1fr; } }
</style>

