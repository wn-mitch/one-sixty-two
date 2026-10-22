<script lang="ts">
 import CapBar from './CapBar.svelte';
 import DraftCardTile from './DraftCardTile.svelte';
 import type { CardMediaStatus } from '../../cards/view-model.ts';
 import { STACK_ROLES, type StackRole } from '../../draft/cleanup.ts';
 import { effectiveCap, rosterSize } from '../../draft/rules.ts';
 import { ownedBy, type DraftRun } from '../../draft/run.ts';
 import type { DraftCard } from '../../draft/types.ts';
 import type { Manifest, Profile } from '../../game/types.ts';
 import type { MediaManifest } from '../../media/types.ts';
 import type { WarRankings } from '../../rankings/types.ts';
 import { money } from './format.ts';

 /** The opening window above the lineup: payroll against the cap, the cleanup stacks, and Auto-fix. */
 let { run, revision, profiles, manifest, media, mediaStatus, rankings, clubName, working, onCleanup, onAutofix }: {
  run: DraftRun; revision: number; profiles: ReadonlyMap<string, Profile>; manifest: Manifest | null;
  media: MediaManifest | null; mediaStatus: CardMediaStatus; rankings: WarRankings | null;
  clubName: (seat: number) => string; working: boolean;
  onCleanup: (role: StackRole) => void; onAutofix: () => void;
 } = $props();
 const human = $derived(run.seating.humanSeat);
 const owned = $derived.by(() => { void revision; return ownedBy(run, human); });
 const payroll = $derived(owned.reduce((sum, card) => sum + card.salary, 0));
 const size = $derived(rosterSize(run.pool.rules));
 const full = $derived(owned.length >= size);
 const tops = $derived.by(() => { void revision; return STACK_ROLES.map(role => ({ role, card: run.pool.cleanup.peek(human, role) })); });
 const nameOf = (card: DraftCard) => profiles.get(card.seasonId)?.displayName ?? card.playerId;
</script>

<div class="window-panel">
 <div class="status">
  <p>{clubName(human)} · {owned.length} of {size} cards · place, cut and take cleanup commons, then submit a legal roster</p>
  <CapBar {payroll} cap={effectiveCap(run.budgets[human])} />
  <button type="button" class="secondary" disabled={working} onclick={onAutofix}>Auto-fix</button>
 </div>
 <section aria-labelledby="cleanup-heading">
  <h3 id="cleanup-heading">Cleanup commons</h3>
  <p class="note">Each stack shows its top card. Commons cost at most {money(run.pool.rules.commonSalaryMax)}.{#if full}{' '}Your roster is full; cut a card to take another.{/if}</p>
  <div class="stacks">
   {#each tops as { role, card } (role)}
    <div class="stack">
     <div class="stack-head">
      <span class="slot">{role} stack</span>
      {#if card}<button type="button" class="quiet take" disabled={working || full} aria-label={`Take ${nameOf(card)} from the ${role} stack`} onclick={() => onCleanup(role)}>Take</button>{/if}
     </div>
     {#if card}
      <DraftCardTile {card} profile={profiles.get(card.seasonId)} {manifest} {media} {mediaStatus} {rankings} compact />
     {:else}<div class="open-frame">Empty</div>{/if}
    </div>
   {/each}
  </div>
 </section>
</div>

<style>
 .window-panel { display: grid; gap: var(--space-6); margin-bottom: var(--space-8); min-width: 0; }
 .window-panel > * { min-width: 0; }
 .status { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3) var(--space-4); }
 .status p, .note { margin: 0; color: var(--muted); font-size: var(--text-sm); }
 .status p { flex: 1 1 18rem; }
 h3 { margin: 0 0 var(--space-2); font-size: var(--text-lg); }
 .note { margin-bottom: var(--space-3); }
 /* One scrolling row of stacks, so the cleanup choice stays above the lineup rather than pushing it down. */
 .stacks { display: grid; grid-auto-flow: column; grid-auto-columns: 8.5rem; gap: var(--space-3); overflow-x: auto; padding-bottom: var(--space-2); overscroll-behavior-x: contain; }
 .stack { display: grid; gap: var(--space-2); align-content: start; min-width: 0; }
 .stack-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); min-height: 2rem; }
 .slot { color: var(--muted); font-size: var(--text-xs); font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
 .take { min-height: 2rem; padding: 0 var(--space-3); border: 1px solid var(--accent); background: transparent; color: var(--accent); font-size: var(--text-xs); }
 .open-frame { display: grid; place-items: center; aspect-ratio: 5 / 7; border: 2px dashed var(--border); border-radius: var(--radius-lg); color: var(--muted); font-size: var(--text-xs); }
</style>
