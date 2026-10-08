<script lang="ts">
 import type { Profile, Slot } from '../game/types.ts';
 import { seasonEstimates } from './season-estimates.ts';
 import PlayerPhoto from './PlayerPhoto.svelte';
 let { profile, getSlots, selectedSlot = null }: { profile: Profile; getSlots: () => Slot[]; selectedSlot?: Slot | null } = $props();
 let open = $state(false);
 const slots = $derived(open ? getSlots() : []);
 const notes = $derived(seasonEstimates(profile, slots, selectedSlot));
</script>

<details class="season-notes" bind:open>
 <summary>Photo &amp; model notes</summary>
 {#if open}
  <div class="provenance">
   {#if !profile.bullpen}<PlayerPhoto playerId={profile.playerId} year={profile.year} franchiseId={profile.franchiseId} name={profile.displayName} />{/if}
   <div>
    {#if profile.bullpen}
     <p>Pooled relief-dominant pitcher-seasons. Neutral throwing handedness; no individual portrait or WAR.</p>
    {:else}
     <p>Bats: {profile.bats || 'Unknown'} · Throws: {profile.throws || 'Unknown'}.</p>
    {/if}
    <p class="muted">Simulation adjusts this season into the common 2025 environment. Composite WAR ranks choices only; it does not change the simulation.</p>
   </div>
  </div>
  <p class="scope">Model estimates for {selectedSlot && slots.includes(selectedSlot) ? selectedSlot : `legal roles: ${slots.join(', ')}`}.</p>
  {#if notes.length}
   <ul>{#each notes as note}<li>{note}</li>{/each}</ul>
  {:else}
   <p class="muted">No missing-data estimates are flagged for these roles. The shared <a href="/about#simulation">simulation assumptions</a> still apply.</p>
  {/if}
  <a href="/about#simulation">How the simulation works</a>
 {/if}
</details>

<style>
 .season-notes { font-size: var(--text-sm); margin-top: var(--space-2); overflow-wrap: anywhere; }
 summary { color: var(--muted); }
 .provenance { display: flex; align-items: flex-start; gap: var(--space-4); margin-block: var(--space-3); }
 .provenance > div { min-width: 0; }
 p { margin: 0 0 var(--space-3); }
 .scope { margin-top: var(--space-4); font-weight: 650; }
 ul { padding-left: var(--space-6); margin-block: var(--space-3); }
 li + li { margin-top: var(--space-2); }
 a { display: inline-flex; align-items: center; min-height: 2.75rem; }
</style>
