<script lang="ts">
	import { dialOf, optionsOf, spread, type ChoiceKey, type Target } from './controls.ts';
	import type { Lab } from './lab.svelte.ts';

	/**
	 * One lab control: a dial as a row of steps across its range with an exact value box, or a choice as
	 * steps (few options) or a list with previous and next. Either can be staggered across the stage.
	 */
	let { lab, target, label }: { lab: Lab; target: Target; label?: string } = $props();

	const STEPS = 7;
	const dial = $derived(dialOf(target, lab.setup));
	const options = $derived(dial ? [] : optionsOf(target as ChoiceKey));
	const current = $derived(lab.value(target));
	// The steps across the range, plus the current value when it sits between them.
	const steps = $derived.by(() => {
		if (!dial) return [];
		const values = spread(dial, STEPS);
		const value = Number(current);
		if (values.some(step => Math.abs(step - value) < (dial.step ?? 0.01) / 2)) return values;
		return [...values, value].sort((a, b) => a - b);
	});
	const name = $derived(label ?? (target.split(':')[1] ?? target).replace(/([A-Z])/g, ' $1').toLowerCase());
	const staggered = $derived(lab.stagger?.target === target);
	const id = $derived(`lab-${target.replace(':', '-')}`);
	const decimals = (step = 0.01) => Math.max(0, Math.min(4, -Math.floor(Math.log10(step))));
	const format = (value: number) => Number(value.toFixed(decimals(dial?.step)));

	function step(by: number): void {
		const index = options.findIndex(option => option.value === current);
		lab.set(target, options[(index + by + options.length) % options.length]!.value);
	}
</script>

<div class="control" class:staggered title={dial?.note}>
	<div class="head">
		<label for={id}>{name}</label>
		{#if dial}
			<input
				{id}
				type="number"
				min={dial.min}
				max={dial.max}
				step={dial.step ?? 0.01}
				value={format(Number(current))}
				onchange={event => {
					const value = Number(event.currentTarget.value);
					if (Number.isFinite(value)) lab.set(target, Math.min(dial.max, Math.max(dial.min, value)));
				}}
			/>
		{/if}
		<button
			type="button"
			class="stagger"
			aria-pressed={staggered}
			title="Spread this control across several cards side by side"
			onclick={() => lab.toggleStagger(target)}>Stagger</button
		>
	</div>
	{#if dial}
		<div class="steps" role="group" aria-label={name}>
			{#each steps as value (value)}
				<button
					type="button"
					aria-pressed={Math.abs(Number(current) - value) < (dial.step ?? 0.01) / 2}
					class:shipped={value === dial.value}
					title={value === dial.value ? 'Shipped value' : undefined}
					onclick={() => lab.set(target, value)}>{format(value)}</button
				>
			{/each}
		</div>
	{:else if options.length <= 4}
		<div class="steps" role="radiogroup" aria-label={name}>
			{#each options as option (option.value)}
				<button type="button" role="radio" aria-checked={option.value === current} onclick={() => lab.set(target, option.value)}>{option.label}</button>
			{/each}
		</div>
	{:else}
		<div class="list">
			<button type="button" aria-label={`Previous ${name}`} onclick={() => step(-1)}>‹</button>
			<select {id} value={current} onchange={event => lab.set(target, event.currentTarget.value)}>
				{#each options as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
			</select>
			<button type="button" aria-label={`Next ${name}`} onclick={() => step(1)}>›</button>
		</div>
	{/if}
</div>

<style>
	.control { display: grid; gap: 0.3rem; padding: 0.35rem 0.4rem; border-radius: var(--radius); }
	.control.staggered { background: color-mix(in oklch, var(--accent) 12%, transparent); outline: 1px solid color-mix(in oklch, var(--accent) 45%, transparent); }
	.head { display: flex; align-items: center; gap: 0.5rem; }
	label { flex: 1; font-size: var(--text-sm); color: var(--text); }
	input[type='number'] { width: 4.6rem; min-height: 0; height: 1.7rem; padding: 0.15rem 0.3rem; font: inherit; font-size: var(--text-xs); font-variant-numeric: tabular-nums; color: var(--accent); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
	button { min-height: 1.9rem; padding: 0.2rem 0.45rem; font-size: var(--text-sm); }
	.stagger { min-height: 1.6rem; padding: 0.1rem 0.45rem; font-size: var(--text-xs); color: var(--muted); background: transparent; }
	.stagger[aria-pressed='true'] { color: var(--background); background: var(--accent); border-color: var(--accent); }
	.steps { display: flex; flex-wrap: wrap; gap: 2px; }
	.steps button { flex: 1 1 0; min-width: 2.6rem; border-radius: 2px; font-variant-numeric: tabular-nums; }
	.steps button[aria-pressed='true'], .steps button[aria-checked='true'] { color: var(--background); background: var(--text); border-color: var(--text); }
	.steps button.shipped { box-shadow: inset 0 -2px 0 var(--accent); }
	.list { display: flex; gap: 2px; }
	.list select { flex: 1; min-width: 0; min-height: 1.9rem; font: inherit; font-size: var(--text-sm); color: var(--text); background: var(--surface-raised); border: 1px solid var(--border); border-radius: 2px; }
	.list button { width: 2rem; }
</style>
