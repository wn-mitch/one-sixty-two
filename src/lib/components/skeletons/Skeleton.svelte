<script lang="ts">
 import { onMount, type Snippet } from 'svelte';
 import { SKELETON_DELAY, skeletonShown } from './hold.ts';

 /**
  * Holds a screen's shape while it loads. The bones stay invisible for the first moments so fast loads never
  * flash, while the layout is reserved from the first frame. The status phrase is announced when the bones appear.
  */
 let { label, children }: { label: string; children: Snippet } = $props();
 let shown = $state(false);

 onMount(() => {
  let release: (() => void) | undefined;
  const timer = setTimeout(() => { shown = true; release = skeletonShown(); }, SKELETON_DELAY);
  return () => { clearTimeout(timer); release?.(); };
 });
</script>

<div class="skeleton" data-skeleton>
 <p class="sr-only" role="status">{shown ? label : ''}</p>
 <div class="bones" class:shown aria-hidden="true">{@render children()}</div>
</div>

<style>
 .skeleton, .bones { display: contents; }
 .bones { visibility: hidden; }
 .bones.shown { visibility: visible; }
 .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
</style>
