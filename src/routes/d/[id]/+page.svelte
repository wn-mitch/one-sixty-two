<script lang="ts">
 import DraftSharedReport from '#lib/components/draft-mode/DraftSharedReport.svelte';
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
 <meta property="og:image" content={data.image.url} />
 <meta property="og:image:width" content={String(data.image.width)} />
 <meta property="og:image:height" content={String(data.image.height)} />
 <meta property="og:image:type" content={data.image.type} />
 <meta property="og:image:alt" content={data.image.alt} />
 <meta name="twitter:card" content="summary_large_image" />
 <meta name="twitter:title" content={data.title} />
 <meta name="twitter:description" content={data.description} />
 <meta name="twitter:image" content={data.image.url} />
 <meta name="twitter:image:alt" content={data.image.alt} />
</svelte:head>

<main class="page">
 {#if data.report}
  <DraftSharedReport report={data.report} />
 {:else}
  <h1>Shared season unavailable</h1>
  <p>{data.missing}</p>
  <a class="button primary" href="/">Play 162-0</a>
 {/if}
</main>

<style>
 .page { width: min(100% - 2rem, 48rem); margin: var(--space-6) auto var(--space-12); }
</style>
