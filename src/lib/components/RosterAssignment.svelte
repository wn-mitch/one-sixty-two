<script lang="ts">
 import type { LineupPlaces } from '../game/lineup-view.ts';

 /** A card's place in the lineup and every place it could move to, unavailable ones with their reason. */
 let { seasonId, name, places, busy, onMove, onAnnounce }: {
  seasonId: string;
  name: string;
  places: LineupPlaces;
  busy: boolean;
  onMove: (seasonId: string, key: string) => void;
  onAnnounce?: (message: string) => void;
 } = $props();

 function change(select: HTMLSelectElement): void {
  const option = places.options.find(candidate => candidate.key === select.value);
  // Reset the native control first; a successful move re-renders it at the new place.
  select.value = places.current;
  if (busy || !option?.available || option.key === places.current) return;
  onMove(seasonId, option.key);
  onAnnounce?.(option.announce);
 }
</script>

<span class="assignment" data-roster-assignment={seasonId}>
 <select data-assignment-select value={places.current} disabled={busy} aria-label={`Position for ${name}`} onchange={event => change(event.currentTarget)}>
  {#each places.options as option (option.key)}
   <option value={option.key} disabled={option.key !== places.current && !option.available} data-assignment-slot={option.key}>{option.label}</option>
  {/each}
 </select>
</span>

<style>
 .assignment { display: block; min-width: 0; }
 select { width: 100%; min-width: 0; font-weight: 700; font-variant-numeric: tabular-nums; }
</style>
