<script lang="ts">
 import Skeleton from './Skeleton.svelte';
</script>

<!-- Mirrors Progress: the broadcast line, phase heading, game count, progress track and Skip animation. -->
<Skeleton label="Loading the season…">
 <div class="progress-skeleton">
  <div class="broadcast-status"><span class="sk-line" style:--sk-width="12rem"></span></div>
  <span class="sk-line eyebrow" style:--sk-width="10rem"></span>
  <span class="sk-line heading" style:--sk-width="16rem"></span>
  <div class="game-count"><span class="sk count"></span><span class="sk-line of" style:--sk-width="3.5rem"></span></div>
  <div class="record"><span class="sk-line" style:--sk-width="20rem"></span><span class="sk-line narrow" style:--sk-width="8rem"></span></div>
  <span class="sk track"></span>
  <span class="sk-line explanation" style:--sk-width="17rem"></span>
  <span class="sk button"></span>
 </div>
</Skeleton>

<style>
 .progress-skeleton { max-width: 48rem; margin: var(--space-8) auto var(--space-12); }
 .broadcast-status { padding-bottom: var(--space-4); margin-bottom: var(--space-8); border-bottom: 1px solid var(--border); font-size: var(--text-xs); }
 .eyebrow { font-size: var(--text-xs); }
 .heading { font-size: var(--text-2xl); line-height: 1.15; }
 .game-count { max-width: 68ch; display: flex; align-items: flex-end; gap: var(--space-3); margin-top: var(--space-6); }
 .count { width: 7rem; height: calc(var(--text-score) + 1px); }
 .of { flex: none; width: 3.5rem; font-size: var(--text-xl); }
 .record { margin: var(--space-3) 0 var(--space-6); font-size: var(--text-sm); }
 .track { height: var(--space-2); margin-top: var(--space-6); border-radius: 0; }
 .explanation { margin: var(--space-3) 0 var(--space-6); font-size: var(--text-sm); }
 .button { width: 8.1rem; height: 2.75rem; }
 .narrow { display: none; }
 /* Phones wrap the status line under the count. */
 @media (max-width: 30rem) { .narrow { display: flex; } }
 @media (max-width: 47.999rem) {
  .progress-skeleton { margin-top: var(--space-4); }
  .track { margin-top: var(--space-4); }
  .explanation { margin-bottom: var(--space-4); }
 }
</style>
