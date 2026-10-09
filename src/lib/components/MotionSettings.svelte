<script lang="ts">
	import { onMount } from 'svelte';
	import { motionSettings } from '../cards/motion-settings.svelte.ts';

	const uid = $props.id();
	const noticeId = `${uid}-notice`;
	let ready = $state(false);
	const notice = $derived(motionSettings.reducedMotion
		? 'Your system preference reduces motion.'
		: !motionSettings.storageAvailable
			? 'Motion changes apply to this session; this browser blocked saving them.'
			: '');

	onMount(() => {
		const release = motionSettings.retain();
		ready = true;
		return release;
	});
</script>

<button
	type="button"
	class="motion-settings"
	role="switch"
	aria-label="Motion"
	aria-checked={motionSettings.effectiveEnabled}
	aria-describedby={notice ? noticeId : undefined}
	title={notice || undefined}
	disabled={!ready || motionSettings.reducedMotion}
	onclick={() => motionSettings.setEnabled(!motionSettings.enabled)}
>
	<span>Motion</span>
	<span class="switch-track" aria-hidden="true"></span>
</button>
{#if notice}<span id={noticeId} class="motion-notice" role="status">{notice}</span>{/if}

<style>
	.motion-settings {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 2.75rem;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--muted);
		font-size: var(--text-sm);
		font-weight: 700;
	}
	.motion-settings:not(:disabled):hover { color: var(--text); }
	.switch-track { width: 26px; height: 16px; padding: 2px; border: 1px solid currentColor; border-radius: 999px; }
	.switch-track::after { content: ''; display: block; width: 10px; height: 10px; border-radius: 50%; background: currentColor; }
	[aria-checked='true'] .switch-track { background: var(--accent); border-color: var(--accent); }
	[aria-checked='true'] .switch-track::after { margin-left: 10px; background: var(--background); }
	.motion-notice { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
