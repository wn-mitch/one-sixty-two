<script lang="ts">
 import Skeleton from './Skeleton.svelte';
</script>

<!-- Mirrors Results: the scoreboard with its record, clipping, grades, ledger and actions, then awards beside sharing. -->
<Skeleton label="Loading the results…">
 <div class="results-skeleton">
  <div class="scoreboard">
   <div class="record-block"><span class="sk score"></span><span class="sk clipping"></span><span class="grades">{#each { length: 3 } as _}<span class="sk"></span>{/each}</span><span class="ledger">{#each { length: 3 } as _}<span class="sk"></span>{/each}</span></div>
   <div class="actions"><span class="sk"></span><span class="sk"></span></div>
  </div>
  <div class="awards-share">
   <div class="awards">
    <div class="heading"><span class="sk-line" style:--sk-width="7rem"></span><span class="sk info"></span></div>
    <div class="rail">
     {#each { length: 4 } as _}
      <div class="entry">
       <span class="sk-line kicker" style:--sk-width="6rem"></span>
       <span class="sk sk-card"></span>
       <span class="copy"><span class="sk-line name" style:--sk-width="9rem"></span><span class="sk-line small" style:--sk-width="4.5rem"></span></span>
       <span class="metric"><span class="sk-line" style:--sk-width="5.5rem"></span></span>
       <span class="extra"><span class="sk-line" style:--sk-width="100%"></span></span>
      </div>
     {/each}
    </div>
   </div>
   <div class="sk-panel share"></div>
  </div>
 </div>
</Skeleton>

<style>
 .results-skeleton { display: grid; gap: var(--space-8); min-width: 0; }
 .scoreboard { display: grid; gap: var(--space-5); padding: var(--space-5) var(--space-6); background: var(--surface); border-block: 1px solid var(--border); }
 .record-block { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-4) var(--space-6); min-width: 0; }
 /* The loaded pieces' sizes: the score, the newspaper clipping, the grade cards and the season ledger. */
 .score { width: 14.25rem; height: var(--text-score); }
 /* The headline takes one line beside the score from 30rem, two on phones. */
 .clipping { flex: 1 1 16rem; max-width: 32rem; height: 47px; }
 /* Three grade cards: season, draft and scouting; the ledger wraps beneath them. */
 .grades { width: 48rem; max-width: 100%; height: 5.625rem; }
 .ledger { width: 18rem; max-width: 100%; height: 2.75rem; }
 .grades, .ledger { display: flex; gap: var(--space-3); }
 .grades .sk, .ledger .sk { flex: 1; }
 /* The bottom padding stands for the loaded actions' empty outcome row and its gap. */
 .actions { display: grid; gap: var(--space-2); padding-bottom: var(--space-2); }
 .actions .sk { height: 50px; }
 .actions .sk + .sk { display: none; }
 .awards-share { display: grid; gap: var(--space-8); min-width: 0; }
 .awards { min-width: 0; }
 /* The awards title beside its info button. */
 .heading { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3); font-size: var(--text-xl); line-height: 1.15; }
 .heading .sk-line { flex: 0 1 7rem; }
 .info { flex: none; width: 44px; height: 44px; border-radius: 50%; }
 /* Award entries as ResultsAwards lays them out: a 2×2 grid beside sharing, a swipeable rail below that. */
 .rail { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(13rem, 16rem); gap: var(--space-4); min-width: 0; padding: var(--space-1) var(--space-1) var(--space-2); overflow: hidden; }
 .entry { display: grid; align-content: start; gap: var(--space-2); min-width: 0; }
 .kicker, .small, .extra { font-size: var(--text-xs); }
 .copy { display: grid; gap: .1rem; }
 .name { font-size: var(--text-lg); line-height: 1.15; }
 .metric { padding-top: var(--space-2); border-top: 1px solid var(--border); font-size: var(--text-2xl); line-height: 1; }
 .extra { padding-top: var(--space-2); border-top: 1px solid var(--border); }
 .share { min-height: 40rem; }
 @media (min-width: 48rem) {
  .scoreboard { grid-template-columns: minmax(15rem, 1fr) auto; align-items: center; gap: var(--space-6) var(--space-8); }
  .actions { width: 21.875rem; }
  .actions .sk { height: 2.75rem; }
  .actions .sk + .sk { display: block; height: 2.25rem; }
 }
 @media (min-width: 64rem) { .awards-share { grid-template-columns: minmax(0, 1fr) 24rem; align-items: start; } }
 @media (min-width: 64.001rem) {
  .rail { grid-auto-flow: row; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-6) var(--space-5); }
  .entry { grid-template-columns: minmax(0, 10rem) minmax(0, 1fr); grid-auto-rows: min-content; column-gap: var(--space-4); }
  .entry > .sk-card { grid-column: 1; grid-row: 1 / span 6; }
  .entry > :not(.sk-card) { grid-column: 2; }
  .name { font-size: var(--text-base); }
  .metric { font-size: var(--text-xl); }
 }
 @media (max-width: 30rem) { .clipping { height: 4.5rem; } }
 @media (max-width: 40rem) {
  .scoreboard { padding: var(--space-4); }
  .score { width: 12rem; height: var(--text-3xl); }
  /* The grade table's rows; scouting's stacks its label over its detail. */
  .grades { flex-direction: column; width: 100%; height: 8.85rem; }
  .ledger { height: 2.625rem; }
  /* The award rail runs to the screen edges on phones. */
  .rail { grid-auto-columns: minmax(13rem, calc(100% - 3rem)); margin-inline: calc(-1 * var(--space-4)); padding-inline: var(--space-4); }
 }
</style>
