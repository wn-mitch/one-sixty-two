<script lang="ts">
 import Skeleton from './Skeleton.svelte';
</script>

<!-- Mirrors Progress: the broadcast line, phase heading, count and record, the season reel, progress track and Skip animation. -->
<Skeleton label="Loading the season…">
 <div class="progress-skeleton">
  <div class="broadcast-status"><span class="sk-line" style:--sk-width="12rem"></span></div>
  <span class="sk-line heading" style:--sk-width="16rem"></span>
  <div class="tally"><span class="sk count"></span><span class="sk-line of" style:--sk-width="3.5rem"></span></div>
  <div class="reel-frame"><span class="sk reel"></span></div>
  <span class="sk track"></span>
  <span class="sk-line explanation" style:--sk-width="17rem"></span>
  <span class="sk button"></span>
 </div>
</Skeleton>

<style>
 .progress-skeleton { display: flex; flex-direction: column; max-width: 48rem; margin: var(--space-8) auto var(--space-12); }
 .broadcast-status { padding-bottom: var(--space-3); margin-bottom: var(--space-4); border-bottom: 1px solid var(--border); font-size: var(--text-xs); }
 .heading { font-size: var(--text-2xl); line-height: 1.15; }
 .tally { display: flex; align-items: flex-end; gap: var(--space-3); min-height: calc(var(--text-score) * 1.1); margin: var(--space-3) 0; }
 .count { width: 7rem; height: calc(var(--text-score) + 1px); }
 .of { flex: none; width: 3.5rem; font-size: var(--text-xl); }
 /* SeasonReel's window is one month tall: 2px border, 16px padding, 20px header, 14px weekdays and six week rows 2px apart. */
 .reel-frame { width: 100%; max-width: 26rem; container-type: inline-size; }
 .reel { display: block; height: calc(62px + 6 * ((100cqi - 38px) / 7 * .8)); border-radius: var(--radius-lg); }
 .track { height: var(--space-2); margin-top: var(--space-3); border-radius: 0; }
 .explanation { margin: var(--space-2) 0 var(--space-3); font-size: var(--text-sm); }
 .button { width: 8.1rem; height: 2.75rem; }
 @media (max-width: 47.999rem) {
  .progress-skeleton { margin-top: var(--space-3); }
  .tally { min-height: 3.3rem; margin-block: var(--space-2); }
  .count { width: 5rem; height: 3rem; }
 }
</style>
