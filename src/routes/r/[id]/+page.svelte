<script lang="ts">
	import GamePage from '../../+page.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.title}</title>
	<meta name="description" content={data.description} />
	<link rel="canonical" href={data.canonical} />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={data.canonical} />
	<meta property="og:title" content={data.title} />
	<meta property="og:description" content={data.description} />
	<meta name="twitter:card" content={data.image ? 'summary_large_image' : 'summary'} />
	<meta name="twitter:title" content={data.title} />
	<meta name="twitter:description" content={data.description} />
	{#if data.image}
		<meta property="og:image" content={data.image.url} />
		<meta property="og:image:width" content={String(data.image.width)} />
		<meta property="og:image:height" content={String(data.image.height)} />
		<meta property="og:image:type" content={data.image.type} />
		<meta property="og:image:alt" content={data.image.alt} />
		<meta name="twitter:image" content={data.image.url} />
		<meta name="twitter:image:alt" content={data.image.alt} />
	{/if}
</svelte:head>

<GamePage />
