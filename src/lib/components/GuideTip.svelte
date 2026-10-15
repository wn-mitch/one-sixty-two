<script lang="ts">
	import { onDestroy } from 'svelte';
	import { guide, type GuideStep } from '../game/guide.svelte.ts';

	// A tip sits in the page flow beside what it explains, so it never covers a control. Leaving the
	// moment (the tip unmounting) counts as seen; a reload mid-moment shows it again.
	let { step, text }: { step: GuideStep; text: string } = $props();
	const shown = $derived(guide.shows(step));
	let wasShown = false;
	$effect(() => { if (shown) wasShown = true; });
	onDestroy(() => { if (wasShown) guide.done(step); });
</script>

{#if shown}
	<aside class="guide-tip" aria-label="First-season tip">
		<p role="status">{text}</p>
		<div class="guide-actions">
			<button type="button" class="quiet" onclick={() => guide.done(step)}>Got it</button>
			<button type="button" class="quiet skip" onclick={() => guide.skip()}>Skip guidance</button>
		</div>
	</aside>
{/if}

<style>
	.guide-tip { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-3); margin-block: var(--space-2); padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4); border: 1px solid var(--accent); border-left-width: 4px; border-radius: var(--radius); background: var(--surface); color: var(--text); font-size: var(--text-sm); }
	.guide-tip p { flex: 1 1 16rem; margin: 0; line-height: 1.4; }
	.guide-actions { display: flex; gap: var(--space-1); }
	.guide-actions button { min-height: 2.75rem; padding-inline: var(--space-3); font-size: var(--text-sm); }
	.skip { color: var(--muted); }
</style>
