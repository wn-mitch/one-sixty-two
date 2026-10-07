<script lang="ts">
 import Card from '../cards/Card.svelte';
 import { createCardViewModel, type CardMediaStatus } from '../cards/view-model.ts';
 import type { Manifest, Profile, Slot } from '../game/types.ts';
 import type { MediaManifest } from '../media/types.ts';
 import type { WarRankings } from '../rankings/types.ts';
 import CardInspection from '../cards/CardInspection.svelte';

 type InspectionHandle = { open: (trigger: HTMLElement) => void | Promise<void> };

 let {
  profile,
  assignedSlot,
  manifest,
  rankings = null,
  rankingLoading = false,
  rankingError = false,
  media = null,
  mediaStatus = 'loading',
  inspectionReturnFocus = null
 }: {
  profile: Profile;
  assignedSlot: Slot;
  manifest: Manifest;
  rankings?: WarRankings | null;
  rankingLoading?: boolean;
  rankingError?: boolean;
  media?: MediaManifest | null;
  mediaStatus?: CardMediaStatus;
  inspectionReturnFocus?: HTMLElement | null;
 } = $props();

 let inspection = $state<InspectionHandle>();

 const card = $derived(createCardViewModel({
  profile,
  slot: assignedSlot,
  rankings,
  media,
  mediaStatus,
  manifest
 }));

 function inspect(trigger: HTMLElement): void {
  void inspection?.open(trigger);
 }
 function noDetails(): void {}
</script>

<div class="roster-item" data-season-id={profile.seasonId} data-card-era={card.era} data-card-finish={card.fin.tier}>
 <div class="miniature" aria-hidden="true" inert>
  <Card s={card} face="front" thumbnail interactive={false} onDetails={noDetails} />
 </div>
 <div class="identity">
  <strong>{profile.displayName}</strong>
  <span>{profile.year} · {profile.historicalTeam}</span>
  {#if rankingLoading}<span class="ranking-status">Loading ranking…</span>{:else if rankingError}<span class="ranking-status">Ranking unavailable</span>{/if}
 </div>
 <button type="button" class="inspect" onclick={event => inspect(event.currentTarget)}>Inspect card</button>
</div>

<CardInspection bind:this={inspection} s={card} returnFocus={inspectionReturnFocus} />

<style>
 .roster-item { display: grid; grid-template-columns: 3.75rem minmax(0, 1fr) auto; align-items: center; gap: var(--space-2); min-width: 0; max-width: 20rem; }
 .miniature { width: 3.75rem; align-self: start; }
 .identity { display: grid; min-width: 0; gap: .1rem; }
 .identity strong { overflow-wrap: anywhere; font-size: var(--text-sm); line-height: 1.15; }
 .identity span { color: var(--muted); font-size: var(--text-xs); line-height: 1.25; overflow-wrap: anywhere; }
 .identity .ranking-status { font-size: .6875rem; }
 .inspect { white-space: nowrap; font-size: var(--text-xs); }
 @media (max-width: 24rem) {
  .roster-item { grid-template-columns: 3.5rem minmax(0, 1fr); }
  .miniature { width: 3.5rem; }
  .inspect { grid-column: 2; justify-self: start; }
 }
</style>
