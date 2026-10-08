<script lang="ts">
	import { onMount } from 'svelte';
	import { motionSettings } from '../cards/motion-settings.svelte.ts';

	const uid = $props.id();
	const amountId = `${uid}-amount`;
	const speedId = `${uid}-speed`;

	let ready = $state(false);
	onMount(() => {
		const release = motionSettings.retain();
		ready = true;
		return release;
	});
</script>

<details class="motion-settings">
	<summary>Motion</summary>
	<fieldset disabled={!ready}>
		<legend>Ambient motion</legend>
		<label class="toggle">
			<span>
				<strong>Enabled</strong>
				<small>Card drift, finish lighting, and moving rows</small>
			</span>
			<input
				type="checkbox"
				checked={motionSettings.enabled}
				onchange={event => motionSettings.setEnabled(event.currentTarget.checked)}
			/>
		</label>

		<label for={amountId}>
			<span>Amount <output for={amountId}>{motionSettings.amount.toFixed(2)}×</output></span>
			<input
				id={amountId}
				type="range"
				min="0"
				max="3"
				step="0.25"
				value={motionSettings.amount}
				oninput={event => motionSettings.setAmount(event.currentTarget.valueAsNumber)}
			/>
		</label>

		<label for={speedId}>
			<span>Speed <output for={speedId}>{motionSettings.speed.toFixed(2)}×</output></span>
			<input
				id={speedId}
				type="range"
				min="0.25"
				max="2"
				step="0.25"
				value={motionSettings.speed}
				oninput={event => motionSettings.setSpeed(event.currentTarget.valueAsNumber)}
			/>
		</label>

		{#if motionSettings.reducedMotion}
			<p class="notice" role="status">Your system preference currently reduces motion and overrides these controls.</p>
		{/if}
		{#if !motionSettings.storageAvailable}
			<p class="notice" role="status">Motion choices work for this session, but this browser blocked saving them.</p>
		{/if}
	</fieldset>
</details>

<style>
	.motion-settings {
		font-size: var(--text-sm);
	}

	summary {
		display: inline-flex;
		align-items: center;
		min-height: 2.75rem;
		color: var(--muted);
		font-weight: 700;
		cursor: pointer;
	}

	fieldset {
		display: grid;
		gap: var(--space-4);
		min-width: min(18rem, 100%);
		margin: var(--space-2) 0 0;
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}

	legend {
		padding-inline: var(--space-1);
		font-weight: 750;
	}

	label {
		display: grid;
		gap: var(--space-2);
	}

	label > span {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-4);
	}

	.toggle {
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
	}

	.toggle > span {
		display: grid;
		gap: var(--space-1);
	}

	small,
	.notice {
		color: var(--muted);
		line-height: 1.4;
	}

	output {
		font-variant-numeric: tabular-nums;
		font-weight: 750;
	}

	input[type='checkbox'] {
		width: 1.35rem;
		height: 1.35rem;
		accent-color: var(--accent);
	}

	input[type='range'] {
		width: 100%;
		min-height: 2.75rem;
		margin: 0;
		accent-color: var(--accent);
	}

	.notice {
		max-width: 32rem;
		margin: 0;
	}
</style>
