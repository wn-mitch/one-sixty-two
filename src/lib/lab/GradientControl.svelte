<script lang="ts">
	import { isGradient, MAX_GRADIENT_STOPS, MIN_GRADIENT_STOPS } from '#lib/cards/surface/palettes/custom.ts';
	import type { Lab } from './lab.svelte.ts';

	let { lab }: { lab: Lab } = $props();
	let invalidStop = $state<number | null>(null);

	function setStop(index: number, value: string): boolean {
		const gradient = lab.setup.gradient.with(index, value);
		if (!isGradient(gradient)) {
			invalidStop = index;
			return false;
		}
		invalidStop = null;
		lab.setup = { ...lab.setup, gradient };
		return true;
	}

	function addStop(): void {
		if (lab.setup.gradient.length >= MAX_GRADIENT_STOPS) return;
		const last = lab.setup.gradient.at(-1)!;
		lab.setup = { ...lab.setup, gradient: [...lab.setup.gradient, last] };
		invalidStop = null;
	}

	function removeStop(index: number): void {
		if (lab.setup.gradient.length <= MIN_GRADIENT_STOPS) return;
		lab.setup = { ...lab.setup, gradient: lab.setup.gradient.filter((_, stop) => stop !== index) };
		invalidStop = null;
	}
</script>

{#if lab.setup.palette === 'custom'}
	<fieldset>
		<legend>Custom gradient</legend>
		<div class="stops">
			{#each lab.setup.gradient as stop, index (index)}
				<div class="stop">
					<label for={`gradient-stop-${index}`}>Stop {index + 1}</label>
					<input
						class="picker"
						type="color"
						value={stop}
						aria-label={`Choose stop ${index + 1} colour`}
						oninput={event => setStop(index, event.currentTarget.value)}
					/>
					<input
						id={`gradient-stop-${index}`}
						class="hex"
						type="text"
						value={stop}
						maxlength="7"
						pattern="#[0-9a-fA-F]{6}"
						aria-invalid={invalidStop === index}
						aria-describedby={invalidStop === index ? 'gradient-error' : undefined}
						onchange={event => {
							setStop(index, event.currentTarget.value);
						}}
					/>
					<button
						type="button"
						class="remove"
						aria-label={`Remove stop ${index + 1}`}
						disabled={lab.setup.gradient.length <= MIN_GRADIENT_STOPS}
						onclick={() => removeStop(index)}>Remove</button
					>
				</div>
			{/each}
		</div>
		{#if invalidStop !== null}<p id="gradient-error" role="alert">Use a six-digit colour such as #53d9d1.</p>{/if}
		<button type="button" class="add" disabled={lab.setup.gradient.length >= MAX_GRADIENT_STOPS} onclick={addStop}>Add stop</button>
	</fieldset>
{/if}

<style>
	fieldset { display: grid; gap: 0.4rem; min-width: 0; margin: 0.35rem 0.4rem; padding: 0.5rem; border: 1px solid var(--border); border-radius: var(--radius); }
	legend { padding: 0 0.25rem; color: var(--text); font-size: var(--text-sm); }
	.stops { display: grid; gap: 0.3rem; }
	.stop { display: grid; grid-template-columns: minmax(3.2rem, auto) 2.2rem minmax(6.2rem, 1fr) auto; align-items: center; gap: 0.35rem; }
	label { color: var(--muted); font-size: var(--text-xs); }
	input { min-width: 0; height: 2rem; border: 1px solid var(--border); border-radius: var(--radius); }
	.picker { width: 2.2rem; padding: 0.15rem; background: var(--surface-raised); cursor: pointer; }
	.hex { padding: 0.2rem 0.45rem; color: var(--text); background: var(--surface); font: inherit; font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
	.hex[aria-invalid='true'] { border-color: var(--error); }
	button { min-height: 2rem; padding: 0.2rem 0.5rem; font-size: var(--text-xs); }
	.remove { color: var(--muted); background: transparent; }
	.add { justify-self: start; }
	p { margin: 0; color: var(--error); font-size: var(--text-xs); }
	@media (max-width: 24rem) {
		.stop { grid-template-columns: auto 2.2rem minmax(0, 1fr); }
		.remove { grid-column: 2 / -1; justify-self: end; }
	}
</style>
