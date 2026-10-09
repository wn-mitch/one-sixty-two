<script lang="ts">
	import { onMount } from 'svelte';
	import ShareArtwork from '#lib/share/ShareArtwork.svelte';
	import { waitForShareCapture } from '#lib/share/capture.ts';
	import { SHARE_DIMENSIONS } from '#lib/share/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const dimensions = $derived(SHARE_DIMENSIONS[data.format]);
	let host = $state<HTMLDivElement>();
	let failure = $state<string | null>(null);

	onMount(() => {
		const root = host?.querySelector<HTMLElement>('[data-share-artwork]');
		if (!root) {
			failure = 'Share artwork root is missing.';
			return;
		}
		void waitForShareCapture(root, data.format, { timeoutMs: 15_000 }).catch((caught: unknown) => {
			failure = caught instanceof Error ? caught.message : 'Share artwork did not become ready.';
		});
	});
</script>

<svelte:head>
	<title>Share capture | 162-0</title>
	<meta name="robots" content="noindex, nofollow, noarchive" />
</svelte:head>

<div
	class="capture"
	bind:this={host}
	data-capture-failure={failure ?? undefined}
	style={`width:${dimensions.width}px;height:${dimensions.height}px`}
>
	<ShareArtwork model={data.model} format={data.format} />
</div>
{#if failure}<p class="capture-error" role="alert">{failure}</p>{/if}

<style>
	:global(html), :global(body) {
		width: 100%;
		height: 100%;
		min-width: 0;
		overflow: hidden;
	}
	.capture {
		overflow: hidden;
	}
	/* Paint only the fully decoded, fitted scene. Partial first paints can leave
	   different antialiased edges in Chromium's retained raster cache. */
	.capture :global([data-share-artwork]:not([data-share-ready='true'])) {
		visibility: hidden;
	}
	.capture-error {
		position: fixed;
		inset: auto 1rem 1rem;
		z-index: 2;
		margin: 0;
		padding: .75rem 1rem;
		background: var(--background);
		color: var(--error);
		font: 600 .875rem/1.3 system-ui, sans-serif;
	}
</style>
