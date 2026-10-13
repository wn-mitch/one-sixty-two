<script lang="ts">
 import Skeleton from './Skeleton.svelte';
</script>

<!-- Mirrors DraftEntry, the screen a fresh Draft Mode visit opens on: heading, franchise grid, difficulty and start bar. -->
<Skeleton label="Loading Draft Mode…">
 <div class="entry-skeleton">
  <span class="sk-line heading" style:--sk-width="15rem"></span>
  <div class="lede">{#each [100, 45, 100, 30] as width, index}<span class="sk-line" class:narrow={index >= 2} style:--sk-width="{width}%"></span>{/each}</div>
  <div class="fieldset">
   <span class="sk-line legend" style:--sk-width="7.5rem"></span>
   <div class="note">{#each [100, 70, 40] as width, index}<span class="sk-line" class:narrow={index === 2} style:--sk-width="{width}%"></span>{/each}</div>
   <div class="franchises">{#each { length: 30 } as _}<span class="choice"><span class="sk logo"></span><span class="sk-line" style:--sk-width="70%"></span></span>{/each}</div>
  </div>
  <div class="fieldset">
   <span class="sk-line legend" style:--sk-width="7rem"></span>
   <div class="difficulties">{#each { length: 3 } as _}<span class="choice difficulty"><span class="sk-line" style:--sk-width="3.5rem"></span><span class="sk-line small" style:--sk-width="12rem"></span></span>{/each}</div>
  </div>
  <div class="start"><span class="sk-line" style:--sk-width="11rem"></span><span class="sk button"></span></div>
 </div>
</Skeleton>

<style>
 .entry-skeleton { display: grid; gap: var(--space-6); }
 .heading { font-size: var(--text-2xl); line-height: 1.15; }
 .lede, .note { max-width: 68ch; }
 .narrow { display: none; }
 .legend { margin-bottom: var(--space-2); }
 .note { margin-bottom: var(--space-3); font-size: var(--text-sm); }
 .franchises { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: var(--space-2); }
 .choice { display: flex; align-items: center; gap: var(--space-2); box-sizing: border-box; min-height: 2.75rem; padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); font-size: var(--text-sm); line-height: 1.25; }
 .franchises .sk-line { flex: 1; }
 .logo { flex: none; width: 2rem; height: 2rem; border-radius: 50%; }
 /* Longer club names wrap to two lines once the grid has columns, which sets each row's height. */
 @media (min-width: 30rem) { .franchises .choice { min-height: 53px; } }
 /* Phones wrap the lede and note onto more lines. */
 @media (max-width: 30rem) { .narrow { display: flex; } }
 .difficulties { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: var(--space-2); }
 .difficulty { flex-direction: column; align-items: stretch; gap: 0; font-size: var(--text-base); line-height: 1.5; }
 .difficulty .small { font-size: var(--text-xs); }
 .start { position: sticky; bottom: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) 0 calc(var(--space-3) + env(safe-area-inset-bottom)); background: var(--background); border-top: 1px solid var(--border); }
 .start .sk-line { flex: 0 1 11rem; }
 .button { flex: none; width: 7.5rem; height: 2.75rem; }
</style>
