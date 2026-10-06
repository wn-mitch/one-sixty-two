<script lang="ts">
 import { legalReassignments, reassignPick } from '../game/draft.ts';
 import { HITTER_SLOTS, type Draft, type HitterSlot, type Manifest, type Profile } from '../game/types.ts';

 let { seasonId, draft, manifest, profiles, busy, onReassign }: {
  seasonId: string;
  draft: Draft;
  manifest: Manifest;
  profiles: Profile[];
  busy: boolean;
  onReassign: (seasonId: string, destination: HitterSlot) => void;
 } = $props();

 const uid = $props.id();
 let destination = $state<HitterSlot | ''>('');
 let previousOrigin = $state<HitterSlot | ''>('');
 let previousSeasonId = $state('');
 const bySeason = $derived(new Map(profiles.map(profile => [profile.seasonId, profile])));
 const selectedPick = $derived(draft.picks.find(pick => pick.seasonId === seasonId));
 const origin = $derived(selectedPick && HITTER_SLOTS.includes(selectedPick.slot as HitterSlot) ? selectedPick.slot as HitterSlot : null);
 const selectedName = $derived(bySeason.get(seasonId)?.displayName ?? 'Selected player');
 const editable = $derived(draft.schemaVersion === 3 && origin !== null);

 const options = $derived.by(() => {
  if (!editable || !origin) return [];
  const legal = new Map(legalReassignments(draft, manifest, seasonId).map(option => [option.slot, option]));

  return HITTER_SLOTS.map(slot => {
   const occupant = draft.picks.find(pick => pick.slot === slot && pick.seasonId !== seasonId);
   const occupantName = occupant ? bySeason.get(occupant.seasonId)?.displayName ?? 'Loading selected season…' : null;
   if (slot === origin) {
    return { slot, available: false, swapWith: null, label: `${slot} · Current assignment`, detail: `Currently assigned to ${slot}.` };
   }

   const allowed = legal.get(slot);
   if (allowed) {
    const swapName = allowed.swapWith ? bySeason.get(allowed.swapWith)?.displayName ?? 'Loading selected season…' : null;
    return swapName
     ? { slot, available: true, swapWith: swapName, label: `${slot} · Swap with ${swapName}`, detail: `${swapName} moves to ${origin}.` }
     : { slot, available: true, swapWith: null, label: `${slot} · Open`, detail: `Move from ${origin} to open ${slot}.` };
   }

   let reason = 'Assignment unavailable';
   try {
    reassignPick(draft, manifest, seasonId, slot);
   } catch (error) {
    if (!(error instanceof Error)) throw error;
    reason = error.message;
   }
   const occupancy = occupantName ? `Occupied by ${occupantName}` : 'Open';
   return { slot, available: false, swapWith: occupantName, label: `${slot} · ${occupancy} · ${reason}`, detail: reason };
  });
 });

 const selectedOption = $derived(options.find(option => option.slot === destination));
 const actionLabel = $derived(!selectedOption || destination === origin ? 'Current' : selectedOption.available ? selectedOption.swapWith ? 'Swap' : 'Move' : 'Unavailable');
 const actionDescription = $derived(selectedOption?.detail ?? (origin ? `Currently assigned to ${origin}.` : 'Position assignment unavailable.'));

 $effect(() => {
  const nextOrigin = origin ?? '';
  if (seasonId !== previousSeasonId || nextOrigin !== previousOrigin) {
   destination = nextOrigin;
   previousOrigin = nextOrigin;
   previousSeasonId = seasonId;
  }
 });

 function submit(): void {
  if (busy || !selectedOption?.available || !destination || destination === origin) return;
  onReassign(seasonId, destination);
 }
</script>

{#if editable}
 <div class="assignment" data-roster-assignment={seasonId}>
  <label for="{uid}-destination">
   <span>Position</span>
   <select
    id="{uid}-destination"
    data-assignment-select
    value={destination}
    disabled={busy}
    aria-label={`Position for ${selectedName}`}
    aria-describedby="{uid}-assignment-status"
    onchange={(event) => { destination = event.currentTarget.value as HitterSlot; }}
   >
    {#each options as option (option.slot)}
     <option value={option.slot} disabled={!option.available} data-assignment-slot={option.slot}>{option.label}</option>
    {/each}
   </select>
  </label>
  <button
   type="button"
   class="secondary"
   data-assignment-action
   disabled={busy || !selectedOption?.available || destination === origin}
   aria-label={selectedOption?.available && destination !== origin ? `${actionLabel} ${selectedName} to ${destination}` : undefined}
   onclick={submit}
  >{actionLabel}</button>
  <p id="{uid}-assignment-status" class="status">{actionDescription}</p>
 </div>
{/if}

<style>
 .assignment { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: var(--space-2); width: 100%; min-width: 0; }
 label { display: grid; gap: var(--space-1); min-width: 0; color: var(--muted); font-size: var(--text-xs); font-weight: 650; }
 select { width: 100%; min-width: 0; }
 button { min-width: 5.5rem; }
 .status { grid-column: 1 / -1; margin: 0; color: var(--muted); font-size: var(--text-xs); line-height: 1.4; overflow-wrap: anywhere; }
 @media (max-width: 24rem) {
  .assignment { grid-template-columns: 1fr; }
  button { width: 100%; }
  .status { grid-column: 1; }
 }
</style>
