<script lang="ts">
	import type { Snippet } from 'svelte';
	import Settings from '#lib/components/Settings.svelte';


	let { children, onReset, onReplay, wide = false, fixtureNotice = 'Synthetic game data. Drafts and results are not saved or uploaded. Images are illustrative geometry.' }: {
		children: Snippet;
		onReset: () => void;
		onReplay?: () => void;
		wide?: boolean;
		fixtureNotice?: string;
	} = $props();
</script>

<div class="story-frame" class:wide>
	<header class="workshop-controls" aria-label="Workshop controls">
		<div class="controls">
			<button class="secondary" onclick={onReset}>Reset story</button>
			{#if onReplay}<button class="secondary" onclick={onReplay}>Replay animation</button>{/if}
			<Settings />
		</div>
		<p class="fixture-notice">{fixtureNotice}</p>
	</header>
	<div class="story-content">{@render children()}</div>
</div>

<style>
	.story-frame { max-width: 80rem; margin-inline: auto; padding: var(--space-6); }
	.story-frame.wide { max-width: 90rem; }
	.workshop-controls { margin-bottom: var(--space-5); border-bottom: 1px solid var(--border); padding-bottom: var(--space-4); }
	.controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
	.story-frame:has(:global(.draft-board.wide)) .controls :global([data-app-settings]) { display: none; }
	.fixture-notice { margin: var(--space-2) 0 0; color: var(--muted); font-size: var(--text-sm); }
	.story-content { min-width: 0; }
</style>
