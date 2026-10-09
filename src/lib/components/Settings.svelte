<script lang="ts">
	import { onMount } from 'svelte';
	import { appSettings } from '#lib/game/settings.svelte.ts';

	let dialog = $state<HTMLDialogElement>();
	let trigger = $state<HTMLButtonElement>();
	let ready = $state(false);
	const uid = $props.id();
	const titleId = `${uid}-title`;
	const systemNoticeId = `${uid}-system-notice`;
	const storageNoticeId = `${uid}-storage-notice`;
	const motionId = `${uid}-motion`;
	const cardAnimationId = `${uid}-card-animation`;
	const cardSpeedId = `${uid}-card-speed`;
	const rosterLabelId = `${uid}-roster-first-click`;

	const systemNotice = $derived(appSettings.reducedMotion
		? 'Your system preference reduces motion. Motion stays off until that preference changes.'
		: '');
	const storageNotice = $derived(!appSettings.storageAvailable
		? 'Changes apply for this session because this browser blocked local storage.'
		: '');

	onMount(() => {
		const release = appSettings.retain();
		ready = true;
		return release;
	});

	function openSettings(): void {
		if (!ready || !dialog) return;
		dialog.showModal();
	}

	function closeSettings(): void {
		dialog?.close();
	}

	function handleDialogClick(event: MouseEvent): void {
		if (event.target === dialog) closeSettings();
	}

	function restoreFocus(): void {
		trigger?.focus({ preventScroll: true });
	}
</script>

<div data-app-settings>
	<button
		bind:this={trigger}
		type="button"
		class="settings-trigger"
		aria-haspopup="dialog"
		onclick={openSettings}
	>
		Settings
	</button>

	<dialog
		bind:this={dialog}
		class="settings-dialog"
		aria-labelledby={titleId}
		onclick={handleDialogClick}
		onclose={restoreFocus}
	>
		<div class="settings-panel">
			<header class="settings-header">
				<h2 id={titleId}>Settings</h2>
				<button type="button" class="close-button" aria-label="Close settings" onclick={closeSettings}>×</button>
			</header>

			<div class="settings-options">
				<div class="setting-row">
					<div class="setting-copy">
						<label for={motionId}>Motion</label>
						<p>Allow movement and transitions throughout the game.</p>
					</div>
					<button
						id={motionId}
						type="button"
						class="settings-switch"
						role="switch"
						aria-checked={appSettings.motionEnabled}
						aria-label="Motion"
						disabled={!ready || appSettings.reducedMotion}
						aria-describedby={appSettings.reducedMotion ? systemNoticeId : undefined}
						onclick={() => appSettings.setMotionEnabled(!appSettings.motionEnabled)}
					><span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span></button>
				</div>

				<div class="setting-row">
					<div class="setting-copy">
						<label for={cardAnimationId}>Card review animation</label>
						<p>Turn and raise cards. Requires Motion.</p>
					</div>
					<button
						id={cardAnimationId}
						type="button"
						class="settings-switch"
						role="switch"
						aria-checked={appSettings.cardAnimation}
						aria-label="Card review animation"
						disabled={!ready || appSettings.reducedMotion}
						aria-describedby={appSettings.reducedMotion ? systemNoticeId : undefined}
						onclick={() => appSettings.setCardAnimation(!appSettings.cardAnimation)}
					><span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span></button>
				</div>

				<div class="setting-group">
					<div class="setting-range-header">
						<label for={cardSpeedId}>Card speed</label>
						<output for={cardSpeedId}>{appSettings.cardSpeed}×</output>
					</div>
					<input
						id={cardSpeedId}
						class="settings-range"
						type="range"
						min="0.5"
						max="2"
						step="0.1"
						value={appSettings.cardSpeed}
						disabled={!ready || !appSettings.effectiveEnabled || !appSettings.cardAnimation}
						aria-describedby={appSettings.reducedMotion ? systemNoticeId : undefined}
						oninput={(event) => appSettings.setCardSpeed(Number((event.currentTarget as HTMLInputElement).value))}
					/>
					<div class="range-labels" aria-hidden="true"><span>Slower</span><span>Faster</span></div>
				</div>

				<div class="setting-group">
					<p id={rosterLabelId} class="setting-label">Roster first click</p>
					<div class="choice-buttons" role="group" aria-labelledby={rosterLabelId}>
						<button type="button" aria-pressed={appSettings.rosterFirstClick === 'move'} disabled={!ready} onclick={() => appSettings.setRosterFirstClick('move')}>Move first</button>
						<button type="button" aria-pressed={appSettings.rosterFirstClick === 'review'} disabled={!ready} onclick={() => appSettings.setRosterFirstClick('review')}>Review first</button>
					</div>
				</div>
			</div>

			{#if systemNotice}<p id={systemNoticeId} class="settings-notice" role="status">{systemNotice}</p>{/if}
			{#if storageNotice}<p id={storageNoticeId} class="settings-notice" role="status">{storageNotice}</p>{/if}
		</div>
	</dialog>
</div>

<style>
	[data-app-settings] { display: inline-flex; }
	.settings-trigger {
		min-height: 2.75rem;
		padding: var(--space-2) var(--space-3);
		border: 0;
		background: transparent;
		color: var(--muted);
		font-size: var(--text-sm);
		font-weight: 700;
	}
	.settings-trigger:hover { color: var(--text); background: var(--surface); }
	.settings-dialog {
		width: min(32rem, calc(100vw - 2rem));
		max-height: min(42rem, calc(100dvh - 2rem));
		margin: auto;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		color: var(--text);
		box-shadow: 0 1.5rem 4rem color-mix(in oklch, var(--background) 72%, transparent);
	}
	.settings-dialog::backdrop { background: color-mix(in oklch, var(--background) 76%, transparent); }
	.settings-panel { padding: var(--space-6); overflow: auto; }
	.settings-header { display: flex; align-items: start; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-6); }
	.settings-header h2 { font-size: var(--text-xl); }
	.close-button { min-width: 2.75rem; padding-inline: 0; font-size: 1.5rem; line-height: 1; }
	.settings-options { display: grid; gap: var(--space-5); }
	.setting-row { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: var(--space-4); }
	.setting-copy label, .setting-label, .setting-range-header label { font-weight: 750; }
	.setting-copy p { margin: var(--space-1) 0 0; color: var(--muted); font-size: var(--text-sm); }
	.setting-group { display: grid; gap: var(--space-3); }
	.setting-label { margin: 0; }
	.setting-range-header { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-4); }
	.setting-range-header output { color: var(--accent); font-variant-numeric: tabular-nums; font-weight: 750; }
	.settings-range { width: 100%; min-height: 44px; margin: -var(--space-2) 0; accent-color: var(--accent); }
	.settings-range:disabled { opacity: .5; }
	.range-labels { display: flex; justify-content: space-between; color: var(--muted); font-size: var(--text-xs); }
	.settings-switch { display: grid; place-items: center; width: 56px; height: 44px; min-height: 44px; padding: 0; border: 0; border-radius: var(--radius); background: transparent; }
	.switch-track { display: block; width: 44px; height: 24px; padding: 2px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface-raised); }
	.switch-thumb { display: block; width: 18px; height: 18px; border-radius: 50%; background: var(--muted); transition: transform 180ms var(--ease-out); }
	.settings-switch[aria-checked='true'] .switch-track { border-color: var(--accent); background: var(--accent); }
	.settings-switch[aria-checked='true'] .switch-thumb { transform: translateX(20px); background: var(--background); }
	.settings-switch:hover:not(:disabled) .switch-track { border-color: var(--text); }
	.settings-switch:disabled { opacity: .5; }
	.choice-buttons { display: flex; gap: 4px; padding: 3px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--background); }
	.choice-buttons button { flex: 1; min-width: 0; min-height: 44px; padding: var(--space-2); border: 0; border-radius: calc(var(--radius) - 2px); background: transparent; color: var(--muted); font-size: var(--text-sm); }
	.choice-buttons button[aria-pressed='true'] { background: var(--accent); color: var(--background); }
	.choice-buttons button:hover:not([aria-pressed='true']) { background: var(--surface-raised); color: var(--text); }
	.settings-notice { margin: var(--space-5) 0 0; color: var(--muted); font-size: var(--text-sm); }

	@media (max-width: 28rem) { .settings-panel { padding: var(--space-5); } }
</style>
