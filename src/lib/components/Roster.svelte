<script lang="ts">
 import { onMount } from 'svelte';
 import { draftRules } from '../game/rules.ts';
 import type { Draft, HitterSlot, Manifest, Profile } from '../game/types.ts';
 import PlayerCard from './PlayerCard.svelte';
 import RosterAssignment from './RosterAssignment.svelte';
 let { draft, manifest, profiles, busy, onReassign }: {
  draft: Draft;
  manifest: Manifest;
  profiles: Profile[];
  busy: boolean;
  onReassign: (seasonId: string, destination: HitterSlot) => void;
 } = $props();
 let expanded = $state(false);
 const bySeason = $derived(new Map(profiles.map(profile => [profile.seasonId, profile])));
 const bySlot = $derived(new Map(draft.picks.map(pick => [pick.slot, pick])));
 const slots = $derived(draftRules(draft.schemaVersion).slots);
 const sections = $derived([
  { label: 'Position players', slots: slots.slice(0, 9) },
  { label: 'Pitching staff', slots: slots.slice(9) }
 ]);
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
  <summary><span>Your roster</span> <span class="count">{draft.picks.length} / {slots.length} picked</span></summary>
  <div class="pick-track" aria-hidden="true">{#each slots as slot}<span class:locked={bySlot.has(slot)}></span>{/each}</div>
  {#if expanded}
  <div class="roster-content">
   {#each sections as section}
    <section aria-label={section.label}>
     <h3 class="eyebrow">{section.label}</h3>
     {#if section.label === 'Position players' && draft.schemaVersion === 3}
      <p class="assignment-note">Exact seasons stay on your roster. Fielding and DH assignments can move or swap.</p>
     {/if}
     <ul>
      {#each section.slots as slot}
       {@const pick = bySlot.get(slot)}
       {@const profile = pick ? bySeason.get(pick.seasonId) : undefined}
       <li class:filled={!!pick}>
        <div class="pick-row">
         <span class="slot">{slot}</span>
         {#if pick}
          {#if profile}
           <div class="collected-identity"><PlayerCard {profile} assignedSlot={pick.slot} compact /></div>
          {:else}
           <span class="name">Loading selected season…</span>
          {/if}
         {:else}
          <span class="open-slot">Open slot</span>
         {/if}
        </div>
        {#if pick && section.label === 'Position players'}
         <RosterAssignment seasonId={pick.seasonId} {draft} {manifest} {profiles} {busy} {onReassign} />
        {/if}
       </li>
      {/each}
     </ul>
     {#if section.label === 'Pitching staff'}
      <p class="workload">Three starters, 54 starts each. {draft.schemaVersion === 3 ? 'Your independently drafted team-season bullpen remainder supports your closer.' : 'Your closer is backed by league-average 2025 support relief.'}</p>
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
 .assignment-note { margin: 0 0 var(--space-2); color: var(--muted); font-size: var(--text-xs); line-height: 1.5; }
 ul { padding: 0; margin: 0; list-style: none; }
 li { display: grid; gap: var(--space-2); padding-block: var(--space-2); border-bottom: 1px solid var(--border); }
 .pick-row { display: flex; align-items: center; gap: var(--space-2); min-height: 2.75rem; }
 .slot { flex: 0 0 2rem; color: var(--muted); font-size: var(--text-xs); font-weight: 750; }
 .filled .slot { color: var(--text); }
 .collected-identity { min-width: 0; flex: 1; }
 .name { font-size: var(--text-sm); font-weight: 650; overflow-wrap: anywhere; }
 .open-slot { color: var(--muted); font-size: var(--text-xs); }
 .workload { margin: var(--space-4) 0 0; font-size: var(--text-xs); line-height: 1.5; }
</style>
