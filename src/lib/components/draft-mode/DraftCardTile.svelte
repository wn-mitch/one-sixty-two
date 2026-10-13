<script lang="ts">
 import type { Snippet } from 'svelte';
 import Card from '../../cards/Card.svelte';
 import { materialFor } from '../../cards/finish.ts';
 import { createCardViewModel, type CardMediaStatus } from '../../cards/view-model.ts';
 import type { DraftCard } from '../../draft/types.ts';
 import type { Manifest, Profile } from '../../game/types.ts';
 import type { MediaManifest } from '../../media/types.ts';
 import type { WarRankings } from '../../rankings/types.ts';
 import { FINISH_LABELS, historicalLine, money, rolesLabel } from './format.ts';

 let { card, profile, manifest, media, mediaStatus, rankings = null, compact = false, actions }: {
  card: DraftCard; profile: Profile | undefined; manifest: Manifest | null; media: MediaManifest | null; mediaStatus: CardMediaStatus;
  rankings?: WarRankings | null;
  /** One truncated line per caption row, so tiles in a dense grid stay the same height. */
  compact?: boolean;
  actions?: Snippet;
 } = $props();
 // The draft card's finish is its pack rarity; the front shows it rather than recomputing one.
 const view = $derived(profile ? { ...createCardViewModel({ profile, slot: card.pricedSlot, manifest, media, mediaStatus, rankings }), fin: materialFor(card.finish) } : null);
</script>

<article class="tile" class:compact aria-label={profile ? `${profile.displayName}, ${card.year}` : card.seasonId}>
 <div class="art">
  {#if view}<Card s={view} face="front" onDetails={() => {}} />{:else}<span class="placeholder">Loading card…</span>{/if}
 </div>
 <div class="caption">
  <p class="name">{profile?.displayName ?? card.playerId} <span>{card.year}</span></p>
  <p class="meta"><span class="salary">{money(card.salary)}</span> · {rolesLabel(card)} · <span class="finish {card.finish}">{FINISH_LABELS[card.finish]}</span></p>
  {#if profile}<p class="line">{historicalLine(profile, card)}</p>{/if}
 </div>
 {#if actions}<div class="actions">{@render actions()}</div>{/if}
</article>

<style>
 .tile { display: grid; gap: var(--space-2); align-content: start; min-width: 0; }
 .art { aspect-ratio: 5 / 7; container-type: inline-size; }
 .placeholder { display: grid; place-items: center; height: 100%; border-radius: var(--radius-lg); background: var(--surface-raised); color: var(--muted); font-size: var(--text-xs); }
 .caption p { margin: 0; }
 .name { font-weight: 700; line-height: 1.25; overflow-wrap: anywhere; }
 .name span, .meta, .line { color: var(--muted); font-size: var(--text-xs); }
 .salary { color: var(--text); font-weight: 700; }
 .finish.gem { color: var(--focus); }
 .finish.emboss { color: var(--accent); }
 .caption { min-width: 0; }
 .compact .caption p { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
 .compact .name { font-size: var(--text-sm); }
 .actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
 .actions :global(button) { flex: 1 1 auto; }
</style>
