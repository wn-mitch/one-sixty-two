<script lang="ts">
 import TeamLogo from '../TeamLogo.svelte';
 import { RIVALS } from '../../draft/franchises.ts';
 import { DEFAULT_DIFFICULTY, DIFFICULTIES, type Difficulty } from '../../draft/scouting.ts';
 import type { Franchise } from '../../game/types.ts';

 let { franchises, refused, busy, onStart }: {
  franchises: readonly Franchise[]; refused: string; busy: boolean;
  onStart: (franchiseId: string, difficulty: Difficulty) => void;
 } = $props();
 let franchiseId = $state('');
 let difficulty = $state<Difficulty>(DEFAULT_DIFFICULTY);
 const sorted = $derived([...franchises].sort((a, b) => a.name.localeCompare(b.name)));
 const nameOf = (id: string) => franchises.find(item => item.id === id)?.name ?? id;
 const rivals = $derived(franchiseId ? (franchiseId === 'NYM' ? ['NYY'] : RIVALS[franchiseId] ?? []) : []);
 const LABELS: Record<Difficulty, string> = { rookie: 'Rookie', pro: 'Pro', ace: 'Ace' };
 const DETAILS: Record<Difficulty, string> = { rookie: 'AI clubs misjudge cards often.', pro: 'AI clubs misjudge some cards.', ace: 'AI clubs rarely misjudge a card.' };
</script>

<section class="entry" aria-labelledby="entry-heading">
 <h1 id="entry-heading">Draft Mode</h1>
 <p class="lede">Draft against seven AI clubs from passed packs, build a legal roster under the cap, then play a 162-game league season in six chapters.</p>
 {#if refused}<p class="refused" role="status">{refused}</p>{/if}

 <fieldset>
  <legend>Your franchise</legend>
  <p class="note">A franchise brings its home park and a guaranteed rival. Franchise packages and Commissioner decrees are later content.</p>
  <div class="franchises">
   {#each sorted as franchise (franchise.id)}
    <label class="franchise" class:selected={franchiseId === franchise.id}>
     <input type="radio" name="franchise" value={franchise.id} bind:group={franchiseId} />
     <TeamLogo franchiseId={franchise.id} label={franchise.name} size="small" />
     <span>{franchise.name}</span>
    </label>
   {/each}
  </div>
 </fieldset>

 <fieldset>
  <legend>AI difficulty</legend>
  <div class="difficulties">
   {#each DIFFICULTIES as level (level)}
    <label class="difficulty" class:selected={difficulty === level}>
     <input type="radio" name="difficulty" value={level} bind:group={difficulty} />
     <strong>{LABELS[level]}</strong><span>{DETAILS[level]}</span>
    </label>
   {/each}
  </div>
 </fieldset>

 <div class="start">
  <p>{#if franchiseId}{nameOf(franchiseId)} · rival {rivals.length ? rivals.map(nameOf).join(' or ') : 'drawn at the table'}{:else}Choose a franchise to start.{/if}</p>
  <button class="primary" disabled={!franchiseId || busy} onclick={() => onStart(franchiseId, difficulty)}>{busy ? 'Dealing…' : 'Start draft'}</button>
 </div>
</section>

<style>
 .entry { display: grid; gap: var(--space-6); }
 h1 { margin: 0; font-size: var(--text-2xl); }
 .lede, .note { margin: 0; color: var(--muted); max-width: 68ch; }
 .note { font-size: var(--text-sm); margin-bottom: var(--space-3); }
 .refused { margin: 0; padding: var(--space-3) var(--space-4); border: 1px solid var(--error); border-radius: var(--radius-lg); color: var(--error); }
 fieldset { margin: 0; padding: 0; border: 0; min-width: 0; }
 legend { padding: 0; margin-bottom: var(--space-2); font-weight: 700; }
 input[type='radio'] { position: absolute; opacity: 0; pointer-events: none; }
 .franchises { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: var(--space-2); }
 .franchise, .difficulty { display: flex; align-items: center; gap: var(--space-2); min-height: 2.75rem; padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); cursor: pointer; }
 .franchise span { font-size: var(--text-sm); line-height: 1.25; }
 .franchise:hover, .difficulty:hover { background: var(--surface-hover); }
 .selected { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
 label:has(input:focus-visible) { outline: 3px solid var(--focus); outline-offset: 4px; }
 .difficulties { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: var(--space-2); }
 .difficulty { flex-direction: column; align-items: flex-start; gap: 0; }
 .difficulty span { color: var(--muted); font-size: var(--text-xs); }
 .start { position: sticky; bottom: 0; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) 0 calc(var(--space-3) + env(safe-area-inset-bottom)); background: var(--background); border-top: 1px solid var(--border); }
 .start p { margin: 0; color: var(--muted); font-size: var(--text-sm); }
</style>
