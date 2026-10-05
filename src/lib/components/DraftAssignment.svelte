<script lang="ts">
 import type { Profile, Slot } from '../game/types.ts';
 let { id, profile, slots, chosenSlot = $bindable(null), busy, onDraft, onClose }: {
  id: string; profile: Profile; slots: Slot[]; chosenSlot: Slot | null; busy: boolean;
  onDraft: () => void; onClose: () => void;
 } = $props();
 const uid = $props.id();
 let height = $state(0);
 $effect(() => {
  const root = document.documentElement;
  const body = document.body;
  const previousScroll = root.style.scrollPaddingBottom;
  const previousBody = body.style.paddingBottom;
  root.style.scrollPaddingBottom = `${height}px`;
  body.style.paddingBottom = `${height}px`;
  return () => { root.style.scrollPaddingBottom = previousScroll; body.style.paddingBottom = previousBody; };
 });
</script>
<svelte:window onkeydown={event => { if (event.key === 'Escape' && !busy) onClose(); }} />
<section {id} class="assignment-dock" aria-label={`Draft ${profile.year} ${profile.displayName}`} bind:clientHeight={height}>
 <div class="assignment-inner">
  <div class="selected-identity">
   <p class="selected-name" title={`${profile.year} ${profile.displayName}`}><strong>{profile.year}</strong> {profile.displayName}</p>
   <p class="permanent muted">Choose a slot. Picks are permanent.</p>
  </div>
  <button type="button" class="quiet clear" disabled={busy} onclick={onClose}>Clear selection</button>
  <fieldset disabled={busy} class="slot-choice">
   <legend>Assign to a legal empty slot</legend>
   <div class="slot-options">
    {#each slots as slot}
     <label class:chosen={chosenSlot === slot}><input type="radio" name="{uid}-assignment" value={slot} checked={chosenSlot === slot} onchange={() => chosenSlot = slot} /><span>{slot}</span></label>
    {/each}
   </div>
  </fieldset>
  <button type="button" class="primary commit" disabled={busy || !chosenSlot || !slots.includes(chosenSlot)} onclick={onDraft}>Draft player{chosenSlot ? ` at ${chosenSlot}` : ''}</button>
 </div>
</section>

<style>
 .assignment-dock { position: fixed; inset-inline: 0; bottom: 0; z-index: 10; background: var(--surface); border-top: 1px solid var(--border); padding: var(--space-3) max(var(--space-4), env(safe-area-inset-right)) calc(var(--space-3) + env(safe-area-inset-bottom)) max(var(--space-4), env(safe-area-inset-left)); }
 .assignment-inner { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-2) var(--space-3); max-width: 80rem; margin-inline: auto; }
 .selected-identity { min-width: 0; align-self: center; }
 .selected-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0; font-size: var(--text-sm); }
 .permanent { margin: var(--space-1) 0 0; font-size: var(--text-xs); }
 .clear { font-size: var(--text-xs); padding-inline: var(--space-2); }
 fieldset { grid-column: 1 / -1; border: 0; padding: 0; margin: 0; min-width: 0; }
 legend { font-size: var(--text-xs); color: var(--muted); margin-bottom: var(--space-2); }
 .slot-options { display: flex; flex-wrap: wrap; gap: var(--space-2); }
 .slot-options label { display: flex; align-items: center; justify-content: center; gap: var(--space-1); min-height: 2.75rem; min-width: 2.75rem; padding: var(--space-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; font-size: var(--text-sm); }
 .slot-options label:hover { background: var(--surface-hover); }
 .slot-options label.chosen { border-color: var(--accent); color: var(--accent); }
 .slot-options input { accent-color: var(--accent); margin: 0; }
 .slot-options label:has(input:focus-visible) { outline: 2px solid var(--focus); outline-offset: 2px; }
 fieldset:disabled label { opacity: .45; cursor: not-allowed; }
 .commit { grid-column: 1 / -1; }
 @media (min-width: 40rem) {
  .assignment-inner { grid-template-columns: minmax(0, 1fr) auto auto; }
  .clear { grid-column: 2; }
  .commit { grid-column: 3; grid-row: 1 / 3; align-self: end; }
  fieldset { grid-column: 1 / 3; }
 }
</style>
