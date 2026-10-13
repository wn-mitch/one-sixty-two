<script lang="ts">
 import Skeleton from './Skeleton.svelte';
</script>

<!-- Mirrors StadiumDeck: heading, intro, sort tools, the venue grid and the sticky commit bar. -->
<Skeleton label="Loading the stadiums…">
 <div class="stadium-skeleton">
  <div class="heading"><span class="sk-line" style:--sk-width="24rem"></span><span class="sk-line extra" style:--sk-width="8rem"></span></div>
  <div class="intro">{#each [100, 92, 96, 40] as width, index}<span class="sk-line" class:extra={index >= 2} class:last={index === 3} style:--sk-width="{width}%"></span>{/each}</div>
  <div class="tools"><span class="sk toggle"></span><span class="sk-line" style:--sk-width="10rem"></span></div>
  <div class="grid">{#each { length: 8 } as _}<span class="sk sk-card"></span>{/each}</div>
  <div class="commit"><span class="sk-line" style:--sk-width="9rem"></span><span class="sk button"></span></div>
 </div>
</Skeleton>

<style>
 .stadium-skeleton { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-4); padding-bottom: var(--space-16); }
 .heading { font-size: var(--text-2xl); line-height: 1.15; }
 .intro { max-width: 68ch; }
 .heading .extra, .intro .extra { display: none; }
 .tools { display: flex; align-items: center; gap: var(--space-2) var(--space-4); font-size: var(--text-sm); }
 .tools .sk-line { flex: 0 1 10rem; }
 .toggle { width: 11rem; height: 46px; border-radius: 999px; }
 .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-5) var(--space-4); }
 @media (min-width: 48rem) { .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
 @media (min-width: 72rem) { .grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
 .commit { position: sticky; z-index: 2; bottom: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-top: var(--space-4); padding: var(--space-3) 0 calc(var(--space-3) + env(safe-area-inset-bottom)); background: var(--background); border-top: 1px solid var(--border); }
 .button { width: 12rem; height: 2.75rem; }
 /* The heading and intro wrap onto more lines as the column narrows. */
 @media (max-width: 40rem) { .intro .extra:not(.last) { display: flex; } }
 @media (max-width: 30rem) { .heading .extra, .intro .extra { display: flex; } }
</style>
