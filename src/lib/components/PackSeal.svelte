<script lang="ts">
	/**
	 * A pack's heat-pressed seam: a band of crimp ridges across one end. Under the card light the band is pressed
	 * into the foil and each ridge stands up from it, so the crimps catch and lose the light as the pack tilts;
	 * without the light the band is printed stripes.
	 */
	let { bottom = false, lit = false, element = $bindable() }: { bottom?: boolean; lit?: boolean; element?: HTMLElement } = $props();

	// One ridge per 5px or so on a phone-sized pack; the ridges are sized in percent, so they scale with it.
	const RIDGES = 36;
</script>

<span class="seal" class:bottom class:lit bind:this={element} aria-hidden="true" data-surface={lit ? 'frame' : undefined} data-surface-shape={lit ? 'box' : undefined}>
	{#if lit}
		{#each { length: RIDGES } as _, index (index)}
			<i data-surface="ring" data-surface-shape="box" style:left={`${(index + 0.2) / RIDGES * 100}%`}></i>
		{/each}
	{/if}
</span>

<style>
	.seal {
		position: relative;
		background: repeating-linear-gradient(90deg, oklch(70% .01 255) 0 4px, oklch(88% .01 255) 4px 8px);
		mask: radial-gradient(circle at 50% 100%, transparent 3px, #000 3.5px) 0 0 / 8px 100% repeat-x;
	}
	.seal.bottom { transform: scaleY(-1); }
	/* Lit, the band is a pressed strip of the pack's own foil and the ridges are raised metal; the light draws both. */
	.seal.lit { background: none; mask: none; }
	i { position: absolute; top: 12%; bottom: 0; width: calc(55% / 36); }
</style>
