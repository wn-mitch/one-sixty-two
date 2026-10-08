<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import type { ResultsInspection } from '../game/results-types.ts';
	import CardFlip from './CardFlip.svelte';
	import CardDetails from './CardDetails.svelte';
	import { motionSettings } from './motion-settings.svelte.ts';
	import type { CardViewModel } from './view-model.ts';

	type SeasonMode = 'simulated' | 'actual';

	let {
		s,
		inspection,
		returnFocus = null,
		onClose
	}: {
		s: CardViewModel;
		inspection?: ResultsInspection;
		returnFocus?: HTMLElement | null;
		onClose?: () => void;
	} = $props();
	const uid = $props.id();
	const titleId = `${uid}-inspection-title`;
	let opened = $state(false);
	let dialog = $state<HTMLDialogElement>();
	let inspectionContent = $state<HTMLDivElement>();
	let dialogHeader = $state<HTMLElement>();
	let seasonToggle = $state<HTMLDivElement>();
	let cardFlip = $state<CardFlip>();
	let cardDetails = $state<CardDetails>();
	let trigger: HTMLElement | null = null;
	let focusFallback: HTMLElement | null = null;
	let session = $state(0);
	let selectedMode = $state<SeasonMode>('simulated');
	let turned = $state(false);
	let cardScale = $state(1);
	let backdropPointerId: number | null = null;
	let destroying = false;
	const selectedView = $derived(inspection?.[selectedMode]);

	function numericStyle(value: string): number {
		const parsed = Number.parseFloat(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}

	function outerBlockSize(node: HTMLElement | undefined): number {
		if (!node) return 0;
		const styles = getComputedStyle(node);
		return node.getBoundingClientRect().height
			+ numericStyle(styles.marginTop)
			+ numericStyle(styles.marginBottom);
	}

	function updateCardScale(): void {
		const viewport = window.visualViewport;
		const width = Math.max(1, viewport?.width ?? window.innerWidth);
		const height = Math.max(1, viewport?.height ?? window.innerHeight);
		const rootSize = numericStyle(getComputedStyle(document.documentElement).fontSize) || 16;
		const dialogCapacity = Math.min(height * (width <= 30 * rootSize ? .96 : .92), 64 * rootSize);
		const dialogStyles = dialog ? getComputedStyle(dialog) : null;
		const contentStyles = inspectionContent ? getComputedStyle(inspectionContent) : null;
		const fixedHeight = outerBlockSize(dialogHeader)
			+ outerBlockSize(seasonToggle)
			+ (cardFlip?.chromeHeight() ?? 60)
			+ numericStyle(contentStyles?.paddingTop ?? '')
			+ numericStyle(contentStyles?.paddingBottom ?? '')
			+ numericStyle(dialogStyles?.borderTopWidth ?? '')
			+ numericStyle(dialogStyles?.borderBottomWidth ?? '');
		cardScale = Math.min(
			1,
			Math.max(1, dialogCapacity - fixedHeight) / 504,
			Math.max(1, width - 32) / 360
		);
	}

	$effect(() => {
		if (!inspection || !opened) return;
		const viewport = window.visualViewport;
		const observer = new ResizeObserver(updateCardScale);
		if (dialogHeader) observer.observe(dialogHeader);
		if (seasonToggle) observer.observe(seasonToggle);
		updateCardScale();
		window.addEventListener('resize', updateCardScale);
		viewport?.addEventListener('resize', updateCardScale);
		return () => {
			observer.disconnect();
			window.removeEventListener('resize', updateCardScale);
			viewport?.removeEventListener('resize', updateCardScale);
		};
	});

	export async function open(nextTrigger: HTMLElement): Promise<void> {
		trigger = nextTrigger;
		focusFallback = returnFocus;
		selectedMode = 'simulated';
		turned = false;
		opened = true;
		session += 1;
		const openingSession = session;
		if (!dialog?.open) dialog?.showModal();
		await tick();
		inspectionContent?.scrollTo({ top: 0 });
		if (inspection) updateCardScale();
		if (!opened || openingSession !== session) return;
		cardFlip?.focusTurn();
		if (!inspection) return;
		if (motionSettings.snapshot.reducedMotion) {
			turned = true;
			return;
		}
		requestAnimationFrame(() => {
			if (opened && openingSession === session) turned = true;
		});
	}

	function restoreFocus(): void {
		opened = false;
		const previousTrigger = trigger;
		const previousFallback = focusFallback;
		trigger = null;
		focusFallback = null;
		if (!previousTrigger && !previousFallback) return;
		queueMicrotask(() => {
			if (previousTrigger?.isConnected) previousTrigger.focus({ preventScroll: true });
			else if (previousFallback?.isConnected) previousFallback.focus();
		});
	}

	function close(): void {
		dialog?.close();
	}

	function selectMode(mode: SeasonMode): void {
		selectedMode = mode;
		turned = true;
	}

	async function showDetails(): Promise<void> {
		await cardDetails?.showDetails();
	}

	function handleClose(): void {
		backdropPointerId = null;
		restoreFocus();
		if (!destroying) onClose?.();
	}

	function handlePointerDown(event: PointerEvent): void {
		backdropPointerId = event.target === event.currentTarget ? event.pointerId : null;
	}

	function handlePointerUp(event: PointerEvent): void {
		const shouldClose = event.target === event.currentTarget && event.pointerId === backdropPointerId;
		backdropPointerId = null;
		if (shouldClose) close();
	}

	onDestroy(() => {
		destroying = true;
		if (!opened) return;
		dialog?.close();
		restoreFocus();
	});
</script>

<dialog
	bind:this={dialog}
	class="card-inspection"
	class:result-inspection={!!inspection}
	aria-labelledby={titleId}
	onclose={handleClose}
	onpointerdown={handlePointerDown}
	onpointerup={handlePointerUp}
	onpointercancel={() => (backdropPointerId = null)}
>
	<div class="dialog-shell">
		<header bind:this={dialogHeader} class="dialog-header">
			<div>
				<p class="eyebrow">{inspection ? '162-0 season card' : 'Historical season card'}</p>
				<h2 id={titleId}>{s.full}</h2>
				<p>{s.year} · {s.team} · {s.pos}</p>
			</div>
			<button type="button" class="close" onclick={close}>Close card</button>
		</header>

		<div bind:this={inspectionContent} class="inspection-content">
			{#if inspection}
				<div bind:this={seasonToggle} class="season-toggle" role="group" aria-label="Season statistics">
					<button type="button" aria-pressed={selectedMode === 'simulated'} onclick={() => selectMode('simulated')}>162-0 season</button>
					<button type="button" aria-pressed={selectedMode === 'actual'} onclick={() => selectMode('actual')}>Actual season</button>
				</div>
			{/if}
			{#if opened}
				{#key session}
					<CardFlip
						bind:this={cardFlip}
						bind:turned
						{s}
						inspectionView={selectedView}
						scale={inspection ? cardScale : 1}
						onDetails={showDetails}
					/>
				{/key}
			{/if}
			<CardDetails bind:this={cardDetails} {s} {inspection} view={selectedView} />
		</div>
	</div>
</dialog>

<style>
	.card-inspection {
		width: min(calc(100vw - 1.5rem), 46rem);
		max-width: none;
		max-height: min(92dvh, 64rem);
		padding: 0;
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: .65rem;
		box-shadow: 0 1.5rem 4rem oklch(8% .01 255 / .52);
		overflow: hidden;
	}
	.card-inspection::backdrop {
		background: oklch(8% .01 255 / .76);
		backdrop-filter: blur(.35rem);
	}
	.dialog-shell { display: grid; grid-template-rows: auto minmax(0, 1fr); max-height: inherit; min-width: 0; }
	.dialog-header { display: flex; align-items: start; justify-content: space-between; gap: 1rem; padding: 1rem clamp(1rem, 3vw, 1.5rem); border-bottom: 1px solid var(--border); background: var(--surface-raised, var(--surface)); }
	.eyebrow { margin: 0 0 .2rem; color: var(--muted); font-size: .72rem; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
	h2 { margin: 0; font-size: 1.25rem; line-height: 1.15; overflow-wrap: anywhere; }
	.dialog-header p:not(.eyebrow) { margin: .3rem 0 0; color: var(--muted); font-size: .9rem; overflow-wrap: anywhere; }
	.close { flex: 0 0 auto; min-height: 2.75rem; }
	.inspection-content { min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 1rem clamp(.75rem, 3vw, 1.5rem) 1.5rem; }
	.season-toggle { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); width: min(100%, 22.5rem); margin: 0 auto 1rem; padding: .25rem; border: 1px solid var(--border); border-radius: .45rem; background: var(--background); }
	.season-toggle button { min-height: 2.75rem; border-color: transparent; background: transparent; color: var(--muted); }
	.season-toggle button[aria-pressed='true'] { background: var(--surface-raised); color: var(--text); border-color: var(--border); }
	.result-inspection .dialog-header { padding: .65rem .75rem; }
	.result-inspection .eyebrow { display: none; }
	.result-inspection .inspection-content { padding: .75rem clamp(.375rem, 2vw, .75rem) 1rem; }
	.result-inspection .season-toggle { margin-bottom: .5rem; }
	@media (max-width: 30rem) {
		.card-inspection { width: calc(100vw - .75rem); max-height: 96dvh; border-radius: .4rem; }
		.dialog-header { gap: .75rem; padding: .75rem; }
		.close { min-width: 2.75rem; padding-inline: .6rem; font-size: .8rem; }
		.inspection-content { padding: .75rem .375rem 1rem; }
	}
</style>
