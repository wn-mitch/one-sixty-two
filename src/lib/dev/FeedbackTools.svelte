<script lang="ts">
	import { onMount } from 'svelte';
	import { createElement } from 'react';
	import { createRoot } from 'react-dom/client';
	import { Agentation } from 'agentation';
	import type { AgentationProps } from 'agentation';
	import { DialRoot } from 'dialkit/svelte';

	let host: HTMLDivElement;

	onMount(() => {
		// Agentation portals its toolbar into the page; React owns only this empty host.
		const root = createRoot(host);
		root.render(createElement<AgentationProps>(Agentation, { appName: '162-0' }));
		return () => root.unmount();
	});
</script>

<div bind:this={host}></div>
<DialRoot position="top-right" theme="dark" defaultOpen={false} />
