<script lang="ts">
 import { legalReassignments, reassignPick } from '../game/draft.ts';
 import { HITTER_SLOTS, type Draft, type HitterSlot, type Manifest, type Profile } from '../game/types.ts';

 let { seasonId, draft, manifest, profiles, busy, onReassign, onAnnounce }: {
  seasonId: string;
  draft: Draft;
  manifest: Manifest;
  profiles: Profile[];
  busy: boolean;
  onReassign: (seasonId: string, destination: HitterSlot) => void;
  onAnnounce?: (message: string) => void;
 } = $props();

 const bySeason = $derived(new Map(profiles.map(profile => [profile.seasonId, profile])));
 const selectedPick = $derived(draft.picks.find(pick => pick.seasonId === seasonId));
 const origin = $derived(selectedPick && HITTER_SLOTS.includes(selectedPick.slot as HitterSlot) ? selectedPick.slot as HitterSlot : null);
 const selectedName = $derived(bySeason.get(seasonId)?.displayName ?? 'Selected player');

 /** Every hitter slot, labelled with its outcome: the current slot alone, a legal move or swap, or the engine's reason it is unavailable. */
 const options = $derived.by(() => {
  if (!origin) return [];
  const legal = new Map(legalReassignments(draft, manifest, seasonId).map(option => [option.slot, option]));
  return HITTER_SLOTS.map(slot => {
   if (slot === origin) return { slot, available: false, swapWith: null, label: slot };
   const allowed = legal.get(slot);
   if (allowed) {
    const swapWith = allowed.swapWith ? bySeason.get(allowed.swapWith)?.displayName ?? 'Loading selected season…' : null;
    return { slot, available: true, swapWith, label: swapWith ? `${slot} · swap with ${swapWith}` : `${slot} · open` };
   }
   let reason = 'Assignment unavailable';
   try {
    reassignPick(draft, manifest, seasonId, slot);
   } catch (error) {
    if (!(error instanceof Error)) throw error;
    reason = error.message;
   }
   return { slot, available: false, swapWith: null, label: `${slot} · ${reason}` };
  });
 });

 function change(select: HTMLSelectElement): void {
  const option = options.find(candidate => candidate.slot === select.value);
  // Capture the slot before reassigning; `origin` follows the draft as soon as it changes.
  const from = origin;
  // Reset the native control first; a successful reassignment re-renders it at the new slot.
  select.value = from ?? '';
  if (busy || !from || !option?.available) return;
  onReassign(seasonId, option.slot);
  onAnnounce?.(option.swapWith ? `${selectedName} moved to ${option.slot}; ${option.swapWith} moves to ${from}.` : `${selectedName} moved to ${option.slot}.`);
 }
</script>

{#if origin}
 <span class="assignment" data-roster-assignment={seasonId}>
 <select
  data-assignment-select
  value={origin}
  disabled={busy}
  aria-label={`Position for ${selectedName}`}
  onchange={event => change(event.currentTarget)}
 >
  {#each options as option (option.slot)}
   <option value={option.slot} disabled={option.slot !== origin && !option.available} data-assignment-slot={option.slot}>{option.label}</option>
  {/each}
 </select>
 </span>
{/if}

<style>
 .assignment { display: block; min-width: 0; }
 select { width: 100%; min-width: 0; font-weight: 700; font-variant-numeric: tabular-nums; }
</style>
