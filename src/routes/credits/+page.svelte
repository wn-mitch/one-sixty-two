<script lang="ts">
	import { onMount } from 'svelte';
	import { fetchJson, loadManifest } from '#lib/game/data.ts';
	import type { Attribution } from '#lib/game/types.ts';
	import MediaCredits from '#lib/components/MediaCredits.svelte';

	let attribution = $state<Attribution | null>(null);
	let archiveUrl = $state('');
	let loading = $state(true);
	let error = $state('');
	let mounted = $state(false);
	let request = 0;

	async function loadAttribution(): Promise<void> {
		const current = ++request;
		loading = true;
		error = '';
		try {
			const manifest = await loadManifest();
			const loaded = await fetchJson<Attribution>(manifest.attributionUrl);
			if (current !== request) return;
			attribution = loaded;
			archiveUrl = manifest.archiveUrl;
		} catch (caught) {
			if (current !== request) return;
			error = caught instanceof Error ? caught.message : 'The data notice could not be loaded.';
		} finally {
			if (current === request) loading = false;
		}
	}

	onMount(() => {
		mounted = true;
		void loadAttribution();
		return () => { request++; };
	});
</script>

<svelte:head>
	<title>Data and image credits | 162-0</title>
	<meta name="description" content="Data source, licence and image provenance for 162-0." />
</svelte:head>

<article class="credits">
	<header class="intro">
		<h1>Data and image credits</h1>
		<p class="lede">Where the statistics and pictures in 162-0 come from, and the licences they are used under.</p>
	</header>

	<section id="attribution">
		<div>
			<h2>Source, attribution, and download</h2>
			<p>The browser loads the full required source notice from the same versioned dataset used by the game. The downloadable transformed archive is distributed under Creative Commons Attribution-ShareAlike 3.0 and includes the machine-readable payload, source revision, licence, attribution, and a description of changes.</p>

			<div class="attribution-panel" aria-busy={loading}>
				{#if loading}
					<div class="source-skeleton" aria-hidden="true"><span class="sk-line"></span><span class="sk-line" style:--sk-width="82%"></span><span class="sk-line" style:--sk-width="57%"></span></div>
					<p class="muted" role="status">Loading the versioned source notice…</p>
				{:else if error}
					<p class="error" role="alert">{error}</p>
					<button class="secondary" type="button" onclick={loadAttribution}>Retry source notice</button>
				{:else if attribution}
					<p class="notice" role="status">Attribution data loaded from the current game dataset.</p>
					<dl>
						<div><dt>Dataset</dt><dd>{attribution.title}</dd></div>
						<div><dt>Credit</dt><dd>{attribution.credit}</dd></div>
						<div><dt>Licence</dt><dd><a href={attribution.licenseUrl} rel="license">{attribution.license}</a></dd></div>
						<div><dt>Source revision</dt><dd><code>{attribution.sourceCommit}</code></dd></div>
						<div><dt>Changes</dt><dd>{attribution.changes}</dd></div>
					</dl>
					<div class="data-actions">
						<a class="button primary button-link" href={archiveUrl} download>Download transformed data</a>
						<a class="button secondary button-link" href={attribution.sourceUrl}>Open source dataset</a>
					</div>
					<details class="full-notice">
						<summary>Read the full source notice</summary>
						<pre>{attribution.fullNotice}</pre>
					</details>
				{/if}
			</div>
			{#if !mounted}
				<p class="muted ssr-note">The current versioned source notice loads after this page starts in your browser. All game rules above are available in the prerendered page.</p>
			{/if}
		</div>
	</section>

	<section id="image-credits">
		<div>
			<h2>Image provenance and licences</h2>
			<MediaCredits />
		</div>
	</section>

	<section id="name-filter">
		<div>
			<h2>Board name filter</h2>
			<p>The daily board’s name filter starts from the English <a href="https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words">List of Dirty, Naughty, Obscene, and Otherwise Bad Words</a>, used under <a href="https://creativecommons.org/licenses/by/4.0/" rel="license">Creative Commons Attribution 4.0</a>, with terms of our own added.</p>
		</div>
	</section>
</article>

<style>
	.credits { width: min(100% - 2rem, 52rem); margin: 0 auto; padding: var(--space-8) 0 var(--space-16); }
	.intro { padding-bottom: var(--space-8); }
	h1 { font-size: clamp(var(--text-2xl), 7vw, var(--text-3xl)); }
	.lede { max-width: 60ch; margin: var(--space-3) 0 0; color: var(--muted); }
	.credits > section { padding: var(--space-8) 0; border-top: 1px solid var(--border); }
	h2 { margin: 0 0 var(--space-4); font-size: var(--text-xl); }
	p { line-height: 1.6; max-width: 68ch; }
	.attribution-panel { min-height: 10rem; margin-top: var(--space-6); padding: var(--space-5); border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); }
	.source-skeleton { padding: var(--space-2) 0; line-height: 1.4; }
	.attribution-panel dl { display: grid; margin: var(--space-5) 0; }
	.attribution-panel dl div { display: grid; grid-template-columns: 8rem minmax(0, 1fr); gap: var(--space-4); padding: var(--space-3) 0; border-bottom: 1px solid var(--border); }
	dt { color: var(--muted); font-size: var(--text-xs); font-weight: 750; letter-spacing: .04em; text-transform: uppercase; }
	dd { min-width: 0; margin: 0; line-height: 1.5; overflow-wrap: anywhere; }
	code { font-size: .78rem; }
	.data-actions { display: flex; flex-wrap: wrap; gap: var(--space-3); margin: var(--space-5) 0; }
	.button-link { display: inline-flex; align-items: center; justify-content: center; min-height: 2.75rem; padding: 0 var(--space-4); text-decoration: none; }
	details { margin-top: var(--space-4); border-top: 1px solid var(--border); }
	summary { font-weight: 750; }
	.full-notice pre { max-height: 26rem; margin: var(--space-4) 0 0; padding: var(--space-4); overflow: auto; border-radius: var(--radius); background: var(--background); color: var(--muted); font: .72rem/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; }
	.ssr-note { font-size: var(--text-sm); }
	@media (max-width: 38rem) {
		.attribution-panel { padding: var(--space-4); }
		.attribution-panel dl div { grid-template-columns: 1fr; gap: var(--space-1); }
		.data-actions { display: grid; }
	}
</style>
