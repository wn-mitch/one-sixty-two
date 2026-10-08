<script lang="ts">
 import type { Draft, HitterSlot, Manifest, Profile } from '../game/types.ts';
 import { draftRules } from '../game/rules.ts';
 import PlayerCard from './PlayerCard.svelte';
 import { rankingForSeason } from '../rankings/client.ts';
 import type { WarRankings } from '../rankings/types.ts';
 import { isHitter, warValue } from './candidate-ranking.ts';
 import RosterAssignment from './RosterAssignment.svelte';
 let { draft, manifest, profiles, rankings, rankingLoading, rankingError, busy, onReassign, onOrder, onsimulate }: {
  draft: Draft;
  manifest: Manifest;
  profiles: Profile[];
  rankings: WarRankings | null;
  rankingLoading: boolean;
  rankingError: boolean;
  busy: boolean;
  onReassign: (seasonId: string, destination: HitterSlot) => void;
  onOrder: (kind: 'batting' | 'starter', order: string[]) => void;
  onsimulate: () => void;
 } = $props();
 let announcement = $state('');
 const bySeason = $derived(new Map(profiles.map(profile => [profile.seasonId, profile])));
 const bySeasonPick = $derived(new Map(draft.picks.map(pick => [pick.seasonId, pick])));
 const closerPick = $derived(draft.picks.find(pick => pick.slot === 'CL'));
 const closer = $derived(closerPick ? bySeason.get(closerPick.seasonId) : undefined);
 const bullpenPick = $derived(draft.picks.find(pick => pick.slot === 'BP'));
 const bullpen = $derived(bullpenPick ? bySeason.get(bullpenPick.seasonId) : undefined);
 const complete = $derived(draft.picks.length === draftRules(draft.schemaVersion).slots.length && draft.battingOrder.length === 9 && draft.starterOrder.length === 3 && draft.picks.every(pick => bySeason.has(pick.seasonId)));
 function move(kind: 'batting' | 'starter', index: number, direction: -1 | 1) {
  if (busy) return;
  const order = [...(kind === 'batting' ? draft.battingOrder : draft.starterOrder)];
  const next = index + direction;
  if (next < 0 || next >= order.length) return;
  const profile = bySeason.get(order[index]);
  [order[index], order[next]] = [order[next], order[index]];
  onOrder(kind, order);
  announcement = `${profile?.displayName ?? 'Player'} moved to ${kind === 'batting' ? 'batting position' : 'rotation position'} ${next + 1}.`;
 }
</script>

<section class="lineup" aria-label="Set your lineup" aria-busy={busy}>
 <header>
  <p class="eyebrow">{draftRules(draft.schemaVersion).slots.length} picks. One shot at perfection.</p>
  <h2 id="lineup-heading" tabindex="-1">Make the lineup yours.</h2>
  <p class="muted">Move hitters and starters into order. Exact seasons are permanent; fielding and DH assignments can change before simulation.</p>
 </header>
 <p class="announcement" aria-live="polite" aria-atomic="true">{announcement}</p>
 <div class="lineup-columns">
  <section aria-labelledby="batting-heading">
   <div class="section-heading"><h3 id="batting-heading">Batting order</h3><span class="muted">1 through 9</span></div>
   {@render orderList('batting', draft.battingOrder)}
  </section>
  <section aria-labelledby="rotation-heading">
   <div class="section-heading"><h3 id="rotation-heading">Starting rotation</h3><span class="muted">54 starts each</span></div>
   {@render orderList('starter', draft.starterOrder)}
   <p class="workload muted">Your three starters cycle in this order for all 162 games. No injuries or seasonal starter fatigue are modeled.</p>
   <div class="closer">
    <h3>Closer</h3>
    {#if closer}
     <PlayerCard profile={closer} assignedSlot="CL" war={warValue({ profile: closer, slots: ['CL'] }, 'Pitchers', rankings)} ranking={rankingForSeason(rankings, closer.seasonId)} {rankings} {manifest} {rankingLoading} {rankingError} />
    {:else}
     <p class="muted">Loading selected closer…</p>
    {/if}
    <p class="workload muted">Available from the ninth inning when tied or ahead by 1–3. One inning per appearance, with a season innings cap and rest after two consecutive games.</p>
   </div>
   <div class="support">
    <h3>Drafted bullpen remainder</h3>
    {#if bullpen}<PlayerCard profile={bullpen} assignedSlot="BP" war={warValue({ profile: bullpen, slots: ['BP'] }, 'Bullpens', rankings)} ranking={rankingForSeason(rankings, bullpen.seasonId)} {rankings} {manifest} {rankingLoading} {rankingError} />{/if}
    <p class="workload muted">Pooled relief-dominant pitcher-seasons, excluding this team-season’s saves leader, handle the remaining innings with unlimited support workload. Composition stays fixed independently of your closer. This is a pitching abstraction, not a full 26-player roster.</p>
   </div>
  </section>
 </div>
 <footer class="simulate">
  <p>No second chances inside the season. Every game counts.</p>
  <button type="button" class="primary" disabled={busy || !complete} onclick={onsimulate}>{busy ? 'Preparing your season…' : 'Simulate 162 games'}</button>
  {#if !complete && !busy}<p class="notice">All {draftRules(draft.schemaVersion).slots.length} selected seasons must finish loading before the season can start.</p>{/if}
 </footer>
</section>

{#snippet orderList(kind: 'batting' | 'starter', order: string[])}
 <ol class="order">
  {#each order as seasonId, index (seasonId)}
   {@const profile = bySeason.get(seasonId)}
   {@const pick = bySeasonPick.get(seasonId)}
   <li>
    <div class="order-heading">
     <span class="order-number" aria-label="Position {index + 1}">{index + 1}</span>
     <span class="name">{profile?.displayName ?? 'Loading selected season…'}</span>
    <div class="move-controls">
     <button type="button" class="secondary move" disabled={busy || index === 0} aria-label="Move {profile?.displayName ?? 'player'}{profile ? ` ${profile.year}` : ''} up in {kind === 'batting' ? 'batting order' : 'starting rotation'}" onclick={() => move(kind, index, -1)}><span aria-hidden="true">↑</span></button>
     <button type="button" class="secondary move" disabled={busy || index === order.length - 1} aria-label="Move {profile?.displayName ?? 'player'}{profile ? ` ${profile.year}` : ''} down in {kind === 'batting' ? 'batting order' : 'starting rotation'}" onclick={() => move(kind, index, 1)}><span aria-hidden="true">↓</span></button>
    </div>
    </div>
    {#if profile && pick}
     <PlayerCard {profile} assignedSlot={pick.slot} war={warValue({ profile, slots: [pick.slot] }, isHitter(pick.slot) ? 'Hitters' : 'Pitchers', rankings)} ranking={rankingForSeason(rankings, profile.seasonId)} {rankings} {manifest} {rankingLoading} {rankingError} />
    {/if}
    {#if kind === 'batting'}
     <div class="assignment-control">
      <RosterAssignment {seasonId} {draft} {manifest} {profiles} {busy} {onReassign} />
     </div>
    {/if}
   </li>
  {/each}
 </ol>
{/snippet}

<style>
 .lineup { min-width: 0; }
 header { margin-block: var(--space-6); }
 h2 { margin: var(--space-2) 0 var(--space-4); font-size: var(--text-2xl); }
 header > .muted { max-width: 60ch; font-size: var(--text-sm); }
 .lineup-columns { display: grid; gap: var(--space-8); }
 .lineup-columns > section { min-width: 0; }
 .section-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--space-2) var(--space-4); margin-bottom: var(--space-2); padding-bottom: var(--space-3); border-bottom: 1px solid var(--border); }
 h3 { font-size: var(--text-lg); }
 .section-heading > span { font-size: var(--text-xs); }
 .order { list-style: none; padding: 0; margin: 0; }
 .order li { display: grid; gap: var(--space-3); padding-block: var(--space-4); min-width: 0; }
 .order-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
 .order-number { flex: 0 0 1rem; color: var(--muted); font-size: var(--text-base); font-weight: 750; }
 .order-heading .name { flex: 1; min-width: 0; }
 .name { font-weight: 650; overflow-wrap: anywhere; font-size: var(--text-sm); }
 .move-controls { display: flex; gap: var(--space-1); flex-shrink: 0; }
 .move { width: 2.75rem; min-height: 2.75rem; padding: var(--space-2); font-size: var(--text-lg); }
 .assignment-control { flex: 1 0 100%; min-width: 0; }
 .closer, .support { margin-top: var(--space-6); padding-top: var(--space-6); border-top: 1px solid var(--border); }
 .workload { font-size: var(--text-xs); line-height: 1.5; max-width: 60ch; }
 .simulate { margin-top: var(--space-8); padding-block: var(--space-6); border-top: 1px solid var(--border); }
 .simulate > p:first-child { margin: 0 0 var(--space-4); }
 .simulate .primary { width: 100%; }
 .announcement { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
 @media (min-width: 64rem) { .lineup-columns { grid-template-columns: 1.25fr 1fr; gap: var(--space-12); } .simulate .primary { width: auto; min-width: 16rem; } }
 @media (min-width: 40rem) { .order { display: grid; grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr)); gap: var(--space-6); } }
</style>
