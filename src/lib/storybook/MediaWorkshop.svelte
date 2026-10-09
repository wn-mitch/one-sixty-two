<script module lang="ts">
	import type { MediaFixtureMode } from './media-fixtures.ts';
	export interface MediaWorkshopProps {
		mode?: MediaFixtureMode;
		credits?: boolean;
	}
</script>
<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import PlayerPhoto from '#lib/components/PlayerPhoto.svelte';
	import TeamLogo from '#lib/components/TeamLogo.svelte';
	import AtmosphereImage from '#lib/components/AtmosphereImage.svelte';
	import MediaCredits from '#lib/components/MediaCredits.svelte';
	import { configureMediaLoader } from './media-fixtures.ts';
	import StoryFrame from './StoryFrame.svelte';

	let { mode = 'ready', credits = false }: MediaWorkshopProps = $props();
	let activeMode = untrack(() => mode);
	let controller = configureMediaLoader(activeMode);
	let instance = $state(0);
	let resolved = $state(false);
	let recovered = $state(false);

	function reset(): void {
		controller = configureMediaLoader(mode);
		activeMode = mode;
		resolved = false;
		recovered = false;
		instance += 1;
	}
	$effect(() => {
		const nextMode = mode;
		untrack(() => { if (nextMode !== activeMode) reset(); });
	});
	onDestroy(() => controller.dispose());
</script>

<StoryFrame onReset={reset}>
	<section class="media-workshop" aria-label="Illustrative media fixtures">
		<p>Geometric illustrations and example credits, not historical photographs or club artwork.</p>
		{#if mode === 'loading'}
			<button type="button" disabled={resolved} onclick={() => { controller.resolve(); resolved = true; }}>Resolve media</button>
		{:else if mode === 'unavailable'}
			<button type="button" disabled={recovered} onclick={() => { controller.recover(); recovered = true; }}>Recover media source</button>
			{#if recovered}<p role="status">The example source is available. Use the image credits retry to load it.</p>{/if}
		{/if}
		{#key instance}
			{#if credits}
				<MediaCredits />
			{:else}
				<div class="media-grid">
					<section><h2>Player illustration</h2><PlayerPhoto playerId="roster-2" year={2025} franchiseId="F2" name="Example Hitter 03" size="large" /></section>
					<section><h2>Club illustration</h2><TeamLogo franchiseId="F2" year={2025} label="Example Club F2" size="large" /></section>
					<section><h2>Atmosphere illustration</h2><AtmosphereImage id="illustrative-f2-atmosphere" franchiseId="F2" /></section>
				</div>
			{/if}
		{/key}
	</section>
</StoryFrame>

<style>
	.media-workshop { display: grid; gap: var(--space-4); }
	.media-workshop > p { color: var(--muted); margin: 0; }
	.media-workshop > button { justify-self: start; }
	.media-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); gap: var(--space-6); }
	.media-grid section { min-width: 0; }
	.media-grid h2 { font-size: var(--text-sm); color: var(--muted); }
</style>
