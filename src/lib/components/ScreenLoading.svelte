<script lang="ts">
	import { getContext } from 'svelte';
	import type { SvelteMap } from 'svelte/reactivity';

	let { active, label = 'Loading…' }: { active: boolean; label?: string } = $props();
	// The layout owns these signals, so overlapping route and data waits share one animation.
	const pending = getContext<SvelteMap<symbol, string> | undefined>('screen-loading');
	const key = Symbol();
	$effect(() => {
		if (active) pending?.set(key, label);
		else pending?.delete(key);
		return () => { pending?.delete(key); };
	});
</script>
