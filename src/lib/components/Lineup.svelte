<script lang="ts">
 import { historicalEra, innings } from '../game/format.ts';
 import type { Draft, Profile } from '../game/types.ts';
 import PlayerPhoto from './PlayerPhoto.svelte';
 let { draft, profiles, busy, onOrder, onsimulate }: {
  draft: Draft; profiles: Profile[]; busy: boolean;
  onOrder: (kind: 'batting' | 'starter', order: string[]) => void;
  onsimulate: () => void;
 } = $props();
 let announcement = $state('');
 const bySeason = $derived(new Map(profiles.map(profile => [profile.seasonId, profile])));
 const bySeasonPick = $derived(new Map(draft.picks.map(pick => [pick.seasonId, pick])));
 const closerPick = $derived(draft.picks.find(pick => pick.slot === 'CL'));
 const closer = $derived(closerPick ? bySeason.get(closerPick.seasonId) : undefined);
 const complete = $derived(draft.picks.length === 13 && draft.battingOrder.length === 9 && draft.starterOrder.length === 3 && draft.picks.every(pick => bySeason.has(pick.seasonId)));
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
  <p class="eyebrow">13 picks. One shot at perfection.</p>
  <h2 id="lineup-heading" tabindex="-1">Make the lineup yours.</h2>
  <p class="muted">Move hitters and starters into order. Your player-seasons and fielding positions stay locked.</p>
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
     <div class="closer-identity">
      <PlayerPhoto playerId={closer.playerId} year={closer.year} name={closer.displayName} size="small" credits={false} />
      <div><p class="closer-name">{closer.displayName}</p><p class="season">{closer.year} · {closer.historicalTeam}</p></div>
     </div>
     {#if closer.pitching}<p class="historical">Historical: {innings(closer.pitching.IPouts)} IP · {historicalEra(closer.pitching).toFixed(2)} ERA</p>{/if}
    {:else}
     <p class="muted">Loading selected closer…</p>
    {/if}
    <p class="workload muted">Available from the ninth inning when tied or ahead by 1–3. One inning per appearance, with a season innings cap and rest after two consecutive games.</p>
   </div>
   <div class="support">
    <h3>Support bullpen</h3>
    <p class="workload muted">League-average 2025 relief handles the innings your starters and closer do not. This is a pitching abstraction, not a full 26-player roster.</p>
   </div>
  </section>
 </div>
 <footer class="simulate">
  <p>No second chances inside the season. Every game counts.</p>
  <button type="button" class="primary" disabled={busy || !complete} onclick={onsimulate}>{busy ? 'Preparing your season…' : 'Simulate 162 games'}</button>
  {#if !complete && !busy}<p class="notice">All thirteen selected seasons must finish loading before the season can start.</p>{/if}
 </footer>
</section>

{#snippet orderList(kind: 'batting' | 'starter', order: string[])}
 <ol class="order">
  {#each order as seasonId, index (seasonId)}
   {@const profile = bySeason.get(seasonId)}
   {@const pick = bySeasonPick.get(seasonId)}
   <li>
    <span class="order-number" aria-label="Position {index + 1}">{index + 1}</span>
    {#if profile}<PlayerPhoto playerId={profile.playerId} year={profile.year} name={profile.displayName} size="small" credits={false} />{/if}
    <div class="identity">
     <span class="name">{profile?.displayName ?? 'Loading selected season…'}</span>
     <span class="season">{pick?.slot}{profile ? ` · ${profile.year} · ${profile.historicalTeam}` : ''}</span>
    </div>
    <div class="move-controls">
     <button type="button" class="secondary move" disabled={busy || index === 0} aria-label="Move {profile?.displayName ?? 'player'}{profile ? ` ${profile.year}` : ''} up in {kind === 'batting' ? 'batting order' : 'starting rotation'}" onclick={() => move(kind, index, -1)}><span aria-hidden="true">↑</span></button>
     <button type="button" class="secondary move" disabled={busy || index === order.length - 1} aria-label="Move {profile?.displayName ?? 'player'}{profile ? ` ${profile.year}` : ''} down in {kind === 'batting' ? 'batting order' : 'starting rotation'}" onclick={() => move(kind, index, 1)}><span aria-hidden="true">↓</span></button>
    </div>
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
 .order li { display: flex; align-items: center; gap: var(--space-3); padding-block: var(--space-3); border-bottom: 1px solid var(--border); }
 .order-number { flex: 0 0 1rem; color: var(--muted); font-size: var(--text-base); font-weight: 750; }
 .identity { display: grid; gap: var(--space-1); min-width: 0; flex: 1; }
 .name { font-weight: 650; overflow-wrap: anywhere; font-size: var(--text-sm); }
 .season { font-size: var(--text-xs); color: var(--muted); overflow-wrap: anywhere; margin: var(--space-1) 0 0; }
 .move-controls { display: flex; gap: var(--space-1); flex-shrink: 0; }
 .move { width: 2.75rem; min-height: 2.75rem; padding: var(--space-2); font-size: var(--text-lg); }
 .closer, .support { margin-top: var(--space-6); padding-top: var(--space-6); border-top: 1px solid var(--border); }
 .closer-identity { display: flex; align-items: center; gap: var(--space-3); margin-top: var(--space-4); }
 .closer-name { margin: 0; font-size: var(--text-sm); font-weight: 650; }
 .historical { margin: var(--space-3) 0; font-size: var(--text-sm); }
 .workload { font-size: var(--text-xs); line-height: 1.5; max-width: 60ch; }
 .simulate { margin-top: var(--space-8); padding-block: var(--space-6); border-top: 1px solid var(--border); }
 .simulate > p:first-child { margin: 0 0 var(--space-4); }
 .simulate .primary { width: 100%; }
 .announcement { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
 @media (min-width: 64rem) { .lineup-columns { grid-template-columns: 1.25fr 1fr; gap: var(--space-12); } .simulate .primary { width: auto; min-width: 16rem; } }
 @media (max-width: 30rem) { .order li { gap: var(--space-2); } .move-controls { flex-direction: column; } }
</style>
