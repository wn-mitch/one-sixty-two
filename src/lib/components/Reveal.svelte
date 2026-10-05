<script lang="ts">
 import type { Manifest, Roll } from '../game/types.ts';
 import TeamLogo from './TeamLogo.svelte';
 let { roll, manifest, revealing, pickNumber }: {
  roll: Roll | null; manifest: Manifest; revealing: boolean; pickNumber: number;
 } = $props();
 const franchise = $derived(manifest.franchises.find(item => item.id === roll?.franchiseId));
 const coverage = $derived(manifest.coverage.find(item => item.decade === roll?.decade));
</script>

<section class="reveal" class:revealing aria-label="Current draft roll" aria-busy={revealing} aria-live="polite" aria-atomic="true">
 {#if roll}<div class="team-mark"><TeamLogo franchiseId={roll.franchiseId} label={franchise?.name ?? roll.franchiseId} size="large" /></div>{/if}
 <div class="reveal-copy">
  <p class="eyebrow">Pick {pickNumber} of 13</p>
  {#if roll}
   <div class="roll-copy">
    <h2>{franchise?.name ?? roll.franchiseId}</h2>
    <p class="era">{coverage ? `${coverage.firstYear}–${coverage.lastYear}` : `${Math.max(1961, roll.decade)}–${Math.min(2025, roll.decade + 9)}`}</p>
   </div>
   <p class="muted">{revealing ? 'Revealing your player pool…' : 'Choose one exact season from this franchise.'}</p>
  {:else}
   <h2>Your next great pick.</h2>
   <p class="muted">Roll a franchise and an era, then choose the exact season.</p>
  {/if}
 </div>
 {#if !roll}
  <svg class="diamond" viewBox="0 0 100 100" fill="none" aria-hidden="true">
   <path d="M50 10 90 50 50 90 10 50Z" />
   <path d="M50 30 70 50 50 70 30 50Z" />
   <path class="base" d="m46 8 4-4 4 4-4 4Zm42 38 4 4-4 4-4-4ZM8 46l4 4-4 4-4-4Zm38 42h8v5l-4 4-4-4Z" />
  </svg>
 {/if}
</section>

<style>
 .reveal { display: flex; align-items: center; gap: var(--space-6); padding: var(--space-6) 0; border-block: 1px solid var(--border); }
 .reveal-copy { min-width: 0; flex: 1; }
 .eyebrow { margin: 0 0 var(--space-2); }
 .team-mark { flex: none; }
 h2 { margin: 0; font-size: var(--text-xl); font-weight: 800; line-height: 1.125; letter-spacing: -.025em; overflow-wrap: anywhere; }
 .era { color: var(--text); font-size: var(--text-lg); font-weight: 650; margin: var(--space-2) 0 0; }
 .muted { max-width: 40ch; margin: var(--space-3) 0 0; font-size: var(--text-sm); }
 .diamond { flex: 0 0 4rem; width: 4rem; stroke: var(--border); stroke-width: 1.5; }
 .base { fill: var(--text); stroke: none; }
 .revealing .roll-copy { animation: reveal-in 600ms var(--ease-out) both; }
 @keyframes reveal-in { from { opacity: 0; transform: translateY(.5rem); } to { opacity: 1; transform: translateY(0); } }
 @media (min-width: 48rem) { h2 { font-size: var(--text-2xl); } .reveal { gap: var(--space-8); } }
 @media (max-width: 24rem) { .reveal { gap: var(--space-3); } h2 { font-size: var(--text-lg); } }
 @media (prefers-reduced-motion: reduce) { .revealing .roll-copy { animation: none; } }
</style>
