<script lang="ts">
 import Card from '../cards/Card.svelte';
 import { createCardViewModel, type CardMediaStatus } from '../cards/view-model.ts';
 import type { Manifest, Profile, Slot } from '../game/types.ts';
 import type { MediaManifest } from '../media/types.ts';
 import type { WarRankings } from '../rankings/types.ts';

 let {
  profile,
  assignedSlot,
  manifest,
  rankings = null,
  rankingLoading = false,
  rankingError = false,
  media = null,
  mediaStatus = 'loading'
 }: {
  profile: Profile;
  assignedSlot: Slot;
  manifest: Manifest;
  rankings?: WarRankings | null;
  rankingLoading?: boolean;
  rankingError?: boolean;
  media?: MediaManifest | null;
  mediaStatus?: CardMediaStatus;
 } = $props();

 const card = $derived(createCardViewModel({
  profile,
  slot: assignedSlot,
  rankings,
  media,
  mediaStatus,
  manifest
 }));
 function noDetails(): void {}
</script>

<span class="roster-item" data-season-id={profile.seasonId} data-card-era={card.era} data-card-finish={card.fin.tier}>
 <span class="miniature" aria-hidden="true" inert>
  <Card s={card} face="front" compact thumbnail interactive={false} onDetails={noDetails} />
 </span>
 <span class="identity">
  <strong>{profile.displayName}</strong>
  <span>{profile.year}</span>
 </span>
</span>

<style>
 .roster-item { display: grid; justify-items: center; gap: .15rem; min-width: 0; width: 100%; color: inherit; }
 .miniature { display: block; width: max(4.5rem, 72px); }
 .identity { display: grid; min-width: 0; width: 100%; gap: 0; text-align: center; }
 .identity strong { overflow-wrap: anywhere; font-size: .5625rem; line-height: 1.08; }
 .identity span { color: var(--muted); font-size: .5625rem; line-height: 1.08; overflow-wrap: anywhere; }
</style>
