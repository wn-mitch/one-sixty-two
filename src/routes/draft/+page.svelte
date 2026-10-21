<script lang="ts">
	import { onMount } from 'svelte';
	import ScreenLoading from '#lib/components/ScreenLoading.svelte';
	import { page } from '$app/state';
	import { applyDraftModeOptIn, draftModeBuild } from '#lib/app/features.ts';
	import DraftModeSkeleton from '#lib/components/skeletons/DraftModeSkeleton.svelte';

	type Game = typeof import('#lib/components/ClassicGame.svelte').default;
	// Unfinished Draft Mode is developer-only; public visitors get a way back to the game instead.
	let access = $state<'checking' | 'open' | 'closed'>(draftModeBuild ? 'open' : 'checking');
	let Game = $state<Game | null>(null);
	let loadError = $state('');

	onMount(() => {
		access = applyDraftModeOptIn(page.url) ? 'open' : 'closed';
		if (access === 'open') {
			void import('#lib/components/ClassicGame.svelte')
				.then(module => { Game = module.default; })
				.catch(() => { loadError = 'Draft Mode could not load. Reload the page to try again.'; });
		}
	});
</script>

<svelte:head>
	<title>{access === 'closed' ? 'Play · 162-0' : 'Draft Mode · 162-0'}</title>
	<meta name="robots" content="noindex" />
</svelte:head>
<ScreenLoading active={access !== 'closed' && !Game && !loadError} label="Loading the draft…" />

{#if access === 'closed'}
	<main class="unavailable" aria-labelledby="unavailable-heading">
		<h1 id="unavailable-heading">This mode isn’t available</h1>
		<p>It’s still in development. The 162-0 challenge is ready: build a team from baseball history and chase an undefeated season.</p>
		<a class="button primary" href="/">Back to Play</a>
	</main>
{:else if loadError}
	<main class="unavailable"><p role="alert">{loadError}</p><button class="primary" onclick={() => location.reload()}>Reload</button></main>
{:else if Game}
	<Game mode="draft" />
{:else}
	<main class="unavailable"><DraftModeSkeleton /></main>
{/if}

<style>
	.unavailable { display: grid; gap: var(--space-4); justify-items: start; width: min(100% - 2rem, 40rem); margin-inline: auto; padding-block: var(--space-12); }
	.unavailable h1 { font-size: var(--text-2xl); }
	.unavailable p { margin: 0; color: var(--muted); }
</style>
