<script lang="ts">
 import CapBar from './CapBar.svelte';

 /** The draft's status line: the player's club and rival, then payroll against the cap. */
 let { club, rival, payroll, cap }: { club: string; rival: string | null; payroll: number; cap: number } = $props();
</script>

<div class="pile-status-line">
 <p class="club"><strong>{club}</strong>{#if rival}<span> · rival {rival}</span>{/if}</p>
 <CapBar {payroll} {cap} compact />
</div>

<style>
 .pile-status-line { display: grid; gap: var(--space-1); min-width: 0; max-width: 24rem; }
 .club { margin: 0; font-size: var(--text-sm); }
 .club span { color: var(--muted); }
</style>
