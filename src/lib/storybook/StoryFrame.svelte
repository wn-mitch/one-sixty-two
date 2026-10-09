<script lang="ts">
	import type { Snippet } from 'svelte';
	import MotionSettings from '#lib/components/MotionSettings.svelte';
	import { motionSettings } from '#lib/cards/motion-settings.svelte.ts';

	let { children, onReset, onReplay, wide = false }: {
		children: Snippet;
		onReset: () => void;
		onReplay?: () => void;
		wide?: boolean;
	} = $props();
</script>

<div class="story-frame" class:wide>
	<header class="workshop-controls" aria-label="Workshop controls">
		<div class="controls">
			<button class="secondary" onclick={onReset}>Reset story</button>
			{#if onReplay}<button class="secondary" onclick={onReplay}>Replay animation</button>{/if}
			<MotionSettings />
		</div>
		<p class="fixture-notice">Synthetic examples. Nothing is saved or uploaded. Images are illustrative geometry.</p>
		{#if motionSettings.reducedMotion}<p role="status">Your system preference reduces motion.</p>{/if}
	</header>
	<div class="story-content">{@render children()}</div>
</div>

<style>
	.story-frame { max-width: 80rem; margin-inline: auto; padding: var(--space-6); }
	.story-frame.wide { max-width: 90rem; }
	.workshop-controls { margin-bottom: var(--space-5); border-bottom: 1px solid var(--border); padding-bottom: var(--space-4); }
	.controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
	.fixture-notice { margin: var(--space-2) 0 0; color: var(--muted); font-size: var(--text-sm); }
	.story-content { min-width: 0; }
</style>
