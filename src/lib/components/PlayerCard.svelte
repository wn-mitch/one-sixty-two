<script lang="ts">
	import { onMount } from 'svelte';
	import Card from '../cards/Card.svelte';
	import CardInspection from '../cards/CardInspection.svelte';
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
		onChoose,
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
		onChoose?: () => void;
		manifest?: Manifest | null;
		ranking?: WarSeasonRanking | null;
		rankings?: WarRankings | null;
		rankingLoading?: boolean;
		rankingError?: boolean;
		inspectionReturnFocus?: HTMLElement | null;
	} = $props();

	let media = $state.raw<MediaManifest | null>(null);
	let mediaStatus = $state<CardMediaStatus>('loading');
	let artTrigger = $state<HTMLButtonElement>();
	let inspection = $state<CardInspection>();

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
		if (trigger) void inspection?.open(trigger);
	}

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
	data-season-id={profile.seasonId}
	aria-label={`${profile.year} ${profile.displayName} player card`}
>
	<header class="controller">
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
							<option value={season.seasonId}>{season.year} · {season.historicalTeam}</option>
						{/each}
					</select>
				</label>
			{:else}
				<div class="fixed-season"><span>Exact season</span><strong>{profile.year}</strong></div>
			{/if}
			{#if assignedSlot}<span class="assignment">Assigned {assignedSlot}</span>{/if}
		</div>

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
		{#if rankingStatus}<p class="ranking-status" role="status">{rankingStatus}</p>{/if}
	</header>

	<div class="art-frame">
		<button
			bind:this={artTrigger}
			type="button"
			class="art-trigger"
			aria-label={`Inspect ${profile.year} ${profile.displayName} card`}
			onclick={event => inspect(event.currentTarget)}
		>
			<Card s={card} interactive={!compact} thumbnail={compact} onDetails={() => inspect(artTrigger)} />
		</button>
	</div>

	{#if compact}
		<p class="compact-identity"><strong>{profile.displayName}</strong><span>{profile.year} · {assignedSlot ?? card.pos}</span></p>
	{/if}

	<div class="card-actions">
		<button type="button" class="inspect" onclick={event => inspect(event.currentTarget)}>Inspect card</button>
		{#if onChoose}
			<button type="button" class="choose" data-choose-season={profile.seasonId} aria-pressed={selected} onclick={onChoose}>{selected ? 'Clear selection' : `Choose ${profile.year}`}</button>
		{/if}
	</div>
</article>

<CardInspection bind:this={inspection} s={card} returnFocus={inspectionReturnFocus} />

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
	.player-card:not(.compact) { min-width: min(17rem, 100%); }
	.player-card.selected { outline: 3px solid var(--focus); outline-offset: 3px; }
	.controller { display: grid; gap: .55rem; }
	.season-row { display: flex; align-items: end; justify-content: space-between; gap: .6rem; }
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
	.qualification p, .ranking-status { margin: 0; font-weight: 750; }
	.ranking-status { color: var(--card-muted); font-size: .78rem; line-height: 1.4; }
	.art-frame { width: min(100%, 20rem); margin-inline: auto; }
	.art-trigger {
		all: unset;
		display: block;
		width: 100%;
		cursor: pointer;
	}
	.art-trigger:focus-visible { outline: 3px solid var(--focus); outline-offset: 4px; }
	.card-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem; }
	.card-actions button { min-height: 2.75rem; }
	.card-actions .choose { color: var(--surface); background: var(--text); border-color: var(--text); }
	.card-actions .choose[aria-pressed='true'] { color: var(--text); background: var(--surface); border-color: var(--text); }
	.compact { max-width: 12rem; gap: .5rem; }
	.compact .controller { display: none; }
	.compact .art-frame { width: min(100%, 8rem); }
	.compact-identity { display: grid; gap: .14rem; margin: 0; font-size: .78rem; line-height: 1.25; text-align: center; }
	.compact-identity strong { overflow-wrap: anywhere; }
	.compact-identity span { color: var(--card-muted); }
	.compact .card-actions { grid-template-columns: 1fr; }
	@media (max-width: 22rem) { .card-actions { grid-template-columns: 1fr; } }
</style>
