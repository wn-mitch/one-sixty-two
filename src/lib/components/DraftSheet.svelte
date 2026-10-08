<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { Snippet } from 'svelte';

	let {
		open,
		trigger,
		onClose,
		header,
		children,
		footer
	}: {
		open: boolean;
		trigger: HTMLElement | null;
		onClose: () => void;
		header: Snippet;
		children: Snippet;
		footer: Snippet;
	} = $props();

	let dialog = $state<HTMLDialogElement>();
	let activeTrigger: HTMLElement | null = null;
	let controlledClose = false;
	let closeRequested = false;
	let backdropPointerId: number | null = null;

	function restoreFocus(): void {
		const target = activeTrigger;
		activeTrigger = null;
		if (!target) return;

		queueMicrotask(() => {
			if (target.isConnected && target.getClientRects().length > 0) {
				target.focus({ preventScroll: true });
			}
		});
	}

	function requestUserClose(): void {
		if (!open || closeRequested) return;
		closeRequested = true;
		onClose();
	}

	function handleCancel(event: Event): void {
		event.preventDefault();
		requestUserClose();
	}

	function handleClose(): void {
		const wasControlled = controlledClose;
		controlledClose = false;
		backdropPointerId = null;
		restoreFocus();
		if (!wasControlled) requestUserClose();
	}

	function handlePointerDown(event: PointerEvent): void {
		backdropPointerId = event.target === event.currentTarget ? event.pointerId : null;
	}

	function handlePointerUp(event: PointerEvent): void {
		const dismissed = event.target === event.currentTarget && event.pointerId === backdropPointerId;
		backdropPointerId = null;
		if (dismissed) requestUserClose();
	}

	function focusHeaderControl(target: HTMLDialogElement): void {
		queueMicrotask(() => {
			if (!open || !target.open) return;
			const header = target.querySelector<HTMLElement>('.sheet-header');
			const control = header?.querySelector<HTMLElement>(
				'[autofocus]:not(:disabled), button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex=\"-1\"])'
			);
			control?.focus({ preventScroll: true });
		});
	}

	$effect(() => {
		const target = dialog;
		if (!target) return;

		if (open) {
			if (!target.open) {
				closeRequested = false;
				activeTrigger = trigger;
				target.showModal();
				focusHeaderControl(target);
			}
		} else {
			closeRequested = false;
			if (target.open) {
				controlledClose = true;
				target.close();
			}
		}
	});

	$effect(() => {
		if (!open) return;

		const root = document.documentElement;
		const body = document.body;
		const previousRootOverflow = root.style.overflow;
		const previousRootOverscroll = root.style.overscrollBehavior;
		const previousBodyOverflow = body.style.overflow;
		const previousBodyOverscroll = body.style.overscrollBehavior;

		root.style.overflow = 'hidden';
		root.style.overscrollBehavior = 'none';
		body.style.overflow = 'hidden';
		body.style.overscrollBehavior = 'none';

		return () => {
			root.style.overflow = previousRootOverflow;
			root.style.overscrollBehavior = previousRootOverscroll;
			body.style.overflow = previousBodyOverflow;
			body.style.overscrollBehavior = previousBodyOverscroll;
		};
	});

	onDestroy(() => {
		if (dialog?.open) {
			controlledClose = true;
			dialog.close();
		}
		restoreFocus();
	});
</script>

<dialog
	bind:this={dialog}
	class="draft-sheet"
	aria-label="Your field"
	oncancel={handleCancel}
	onclose={handleClose}
	onpointerdown={handlePointerDown}
	onpointerup={handlePointerUp}
	onpointercancel={() => (backdropPointerId = null)}
>
	{#if open}
		<div class="sheet-shell">
			<header class="sheet-header">
				{@render header()}
			</header>
			<div class="sheet-content">
				{@render children()}
			</div>
			<footer class="sheet-footer">
				{@render footer()}
			</footer>
		</div>
	{/if}
</dialog>

<style>
	.draft-sheet {
		inset: auto 0 0;
		width: min(100vw, 35rem);
		max-width: 35rem;
		max-height: calc(100dvh - max(1rem, env(safe-area-inset-top)));
		margin: 0 auto;
		padding: 0;
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--border);
		border-bottom: 0;
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		box-shadow: 0 -1.5rem 4rem oklch(8% .01 255 / .52);
		overflow: hidden;
	}
	.draft-sheet[open] { animation: sheet-enter 220ms var(--ease-out) both; }
	.draft-sheet::backdrop { background: oklch(8% .01 255 / .72); }
	.draft-sheet[open]::backdrop { animation: backdrop-enter 180ms var(--ease-out) both; }
	.sheet-shell {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		max-height: inherit;
		min-width: 0;
		overflow: hidden;
	}
	.sheet-header,
	.sheet-footer {
		position: relative;
		z-index: 1;
		min-width: 0;
		background: var(--surface-raised);
	}
	.sheet-header {
		padding: var(--space-4) max(var(--space-4), env(safe-area-inset-right)) var(--space-3) max(var(--space-4), env(safe-area-inset-left));
		border-bottom: 1px solid var(--border);
	}
	.sheet-content {
		min-width: 0;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
		padding: var(--space-4) max(var(--space-4), env(safe-area-inset-right)) var(--space-6) max(var(--space-4), env(safe-area-inset-left));
	}
	.sheet-footer {
		padding: var(--space-3) max(var(--space-4), env(safe-area-inset-right)) max(var(--space-4), env(safe-area-inset-bottom)) max(var(--space-4), env(safe-area-inset-left));
		border-top: 1px solid var(--border);
	}
	@keyframes sheet-enter {
		from { opacity: 0; transform: translateY(1.5rem); }
		to { opacity: 1; transform: translateY(0); }
	}
	@keyframes backdrop-enter {
		from { opacity: 0; }
		to { opacity: 1; }
	}
	@media (prefers-reduced-motion: reduce) {
		.draft-sheet[open],
		.draft-sheet[open]::backdrop { animation: none; }
	}
</style>
