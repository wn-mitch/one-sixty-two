<script lang="ts">
 import { onMount } from 'svelte';
 import { SLOTS, type Draft, type Profile } from '../game/types.ts';
 import PlayerPhoto from './PlayerPhoto.svelte';
 let { draft, profiles }: { draft: Draft; profiles: Profile[] } = $props();
 let expanded = $state(false);
 const bySeason = $derived(new Map(profiles.map(profile => [profile.seasonId, profile])));
 const bySlot = $derived(new Map(draft.picks.map(pick => [pick.slot, pick])));
 const sections = [
  { label: 'Position players', slots: SLOTS.slice(0, 9) },
  { label: 'Pitching staff', slots: SLOTS.slice(9) }
 ];
 onMount(() => {
  const desktop = window.matchMedia('(min-width: 64rem)');
  const adapt = () => { expanded = desktop.matches; };
  adapt();
  desktop.addEventListener('change', adapt);
  return () => desktop.removeEventListener('change', adapt);
 });
</script>

<aside class="roster" aria-label="Your drafted roster">
 <details bind:open={expanded}>
  <summary><span>Your roster</span> <span class="count">{draft.picks.length} / 13 picked</span></summary>
  <div class="pick-track" aria-hidden="true">{#each SLOTS as slot}<span class:locked={bySlot.has(slot)}></span>{/each}</div>
  {#if expanded}
  <div class="roster-content">
   {#each sections as section}
    <section aria-label={section.label}>
     <h3 class="eyebrow">{section.label}</h3>
     <ul>
      {#each section.slots as slot}
       {@const pick = bySlot.get(slot)}
       {@const profile = pick ? bySeason.get(pick.seasonId) : undefined}
       <li class:filled={!!pick}>
        <span class="slot">{slot}</span>
        {#if pick}
         {#if profile}<PlayerPhoto playerId={profile.playerId} year={profile.year} name={profile.displayName} size="small" credits={false} />{/if}
         <div class="identity">
          <span class="name">{profile?.displayName ?? 'Loading selected season…'}</span>
          {#if profile}<span class="season">{profile.year} · {profile.historicalTeam}</span>{/if}
         </div>
        {:else}
         <span class="open-slot">Open slot</span>
        {/if}
       </li>
      {/each}
     </ul>
     {#if section.label === 'Pitching staff'}
      <p class="workload">Three starters, 54 starts each. Your closer is backed by a league-average <strong>Support bullpen</strong>.</p>
      <p class="muted workload">An arcade workload, not a real-world pitching schedule.</p>
     {/if}
    </section>
   {/each}
  </div>
  {/if}
 </details>
</aside>

<style>
 .roster { min-width: 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
 summary { padding: var(--space-4); cursor: pointer; font-weight: 750; }
 .count { margin-left: var(--space-2); color: var(--muted); font-weight: 500; font-size: var(--text-xs); white-space: nowrap; }
 .pick-track { display: flex; gap: var(--space-1); padding: 0 var(--space-4) var(--space-4); }
 .pick-track span { height: var(--space-1); flex: 1; background: var(--border); }
 .pick-track .locked { background: var(--text); }
 .roster-content { padding: 0 var(--space-4) var(--space-4); }
 h3 { margin: var(--space-4) 0 var(--space-2); }
 ul { padding: 0; margin: 0; list-style: none; }
 li { display: flex; align-items: center; gap: var(--space-2); padding-block: var(--space-2); min-height: 2.75rem; border-bottom: 1px solid var(--border); }
 .slot { flex: 0 0 2rem; color: var(--muted); font-size: var(--text-xs); font-weight: 750; }
 .filled .slot { color: var(--text); }
 .identity { display: grid; gap: var(--space-1); min-width: 0; }
 .name { font-size: var(--text-sm); font-weight: 650; overflow-wrap: anywhere; }
 .season { color: var(--muted); font-size: var(--text-xs); overflow-wrap: anywhere; }
 .open-slot { color: var(--muted); font-size: var(--text-xs); }
 .workload { margin: var(--space-4) 0 0; font-size: var(--text-xs); line-height: 1.5; }
 .workload strong { font-weight: 650; }
</style>
