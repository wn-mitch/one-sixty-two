<script lang="ts">
	import { dialOf, optionsOf, type ChoiceKey, type Target } from './controls.ts';
	import type { Lab } from './lab.svelte.ts';

	/**
	 * One lab control: a continuous numeric dial with exact entry, or a choice as
	 * segments (few options) or a list with previous and next. Either can be staggered.
	 */
	let { lab, target, label }: { lab: Lab; target: Target; label?: string } = $props();

	const dial = $derived(dialOf(target, lab.setup));
	const options = $derived(dial ? [] : optionsOf(target as ChoiceKey));
	const current = $derived(lab.value(target));
	const name = $derived(label ?? (target.split(':')[1] ?? target).replace(/([A-Z])/g, ' $1').toLowerCase());
	const staggered = $derived(lab.stagger?.target === target);
	const id = $derived(`lab-${target.replace(':', '-')}`);
	const discrete = $derived(dial?.step === 1 && Number.isInteger(dial.min) && Number.isInteger(dial.max));

	function setNumber(value: number): void {
		if (!dial || !Number.isFinite(value)) return;
		lab.set(target, Math.min(dial.max, Math.max(dial.min, discrete ? Math.round(value) : value)));
	}

	function nudge(event: KeyboardEvent): void {
		const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1
			: event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0;
		if (!dial || !direction) return;
		event.preventDefault();
		const amount = (dial.step ?? 0.01) / (event.shiftKey && !discrete ? 10 : 1);
		// Strip arithmetic noise only when nudging; exact entry keeps the number supplied.
		setNumber(Number((Number(current) + direction * amount).toFixed(12)));
	}

	function step(by: number): void {
		const index = options.findIndex(option => option.value === current);
		lab.set(target, options[(index + by + options.length) % options.length]!.value);
	}
</script>

<div class="control" class:staggered title={dial?.note}>
	<div class="head">
		{#if dial || options.length > 4}
			<label for={id}>{name}</label>
		{:else}
			<span class="label" id={`${id}-label`}>{name}</span>
		{/if}
		{#if dial}
			<input
				{id}
				type="number"
				min={dial.min}
				max={dial.max}
				step={discrete ? 1 : 'any'}
				value={Number(current)}
				onkeydown={nudge}
				onchange={event => {
					setNumber(event.currentTarget.valueAsNumber);
					event.currentTarget.value = String(lab.value(target));
				}}
			/>
		{/if}
		<button
			type="button"
			class="stagger"
			aria-pressed={staggered}
			aria-label={`Stagger ${name}`}
			title="Spread this control across several cards side by side"
			onclick={() => lab.toggleStagger(target)}>Stagger</button
		>
	</div>
	{#if dial}
		<input
			class="dial"
			type="range"
			aria-label={`${name} dial`}
			title={discrete ? 'Drag or use arrow keys to adjust' : 'Drag continuously; hold Shift with an arrow key for a fine adjustment'}
			min={dial.min}
			max={dial.max}
			step={discrete ? 1 : 'any'}
			value={Number(current)}
			oninput={event => setNumber(event.currentTarget.valueAsNumber)}
			onkeydown={nudge}
		/>
	{:else if options.length <= 4}
		<div class="steps" role="radiogroup" aria-labelledby={`${id}-label`}>
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
	.control { display: grid; gap: var(--space-1); padding: var(--space-2) 0; border-radius: var(--radius); }
	.control.staggered { background: color-mix(in oklch, var(--accent) 12%, transparent); outline: 1px solid color-mix(in oklch, var(--accent) 45%, transparent); }
	.head { display: flex; align-items: center; gap: var(--space-2); }
	label, .label { flex: 1; min-width: 0; font-size: var(--text-sm); color: var(--text); text-transform: capitalize; }
	input[type='number'] { width: 5.5rem; min-height: 44px; box-sizing: border-box; padding: var(--space-2); font: inherit; font-size: var(--text-sm); font-variant-numeric: tabular-nums; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
	.dial { width: 100%; min-width: 0; height: 28px; margin: 0; accent-color: var(--accent); cursor: ew-resize; }
	button { min-height: 44px; padding: var(--space-1) var(--space-2); font-size: var(--text-sm); }
	.stagger { flex: none; padding: var(--space-1) var(--space-2); font-size: var(--text-xs); color: var(--muted); background: transparent; }
	.stagger[aria-pressed='true'] { color: var(--background); background: var(--accent); border-color: var(--accent); }
	.steps { display: flex; flex-wrap: wrap; gap: 2px; }
	.steps button { flex: 1 1 0; min-width: 2.6rem; border-radius: 2px; font-variant-numeric: tabular-nums; }
	.steps button[aria-checked='true'] { color: var(--background); background: var(--text); border-color: var(--text); }
	.list { display: flex; gap: 2px; }
	.list select { flex: 1; min-width: 0; min-height: 44px; font: inherit; font-size: var(--text-sm); color: var(--text); background: var(--surface-raised); border: 1px solid var(--border); border-radius: var(--radius); }
	.list button { width: 44px; flex: none; }
</style>
