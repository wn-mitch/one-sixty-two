<script lang="ts">
	import { onMount, mount, unmount } from 'svelte';
	import { createElement } from 'react';
	import { createRoot, type Root } from 'react-dom/client';
	import { Agentation } from 'agentation';
	import type { AgentationProps } from 'agentation';
	import { DialRoot } from 'dialkit/svelte';
	import { DialStore } from 'dialkit/store';

	let {
		endpoint = import.meta.env.VITE_AGENTATION_ENDPOINT || 'http://127.0.0.1:4747',
		useHashLocation = false,
		dialProductionEnabled = import.meta.env.DEV,
		appName = '162-0'
	}: {
		endpoint?: string;
		useHashLocation?: boolean;
		dialProductionEnabled?: boolean;
		appName?: string;
	} = $props();

	let agentationHost: HTMLDivElement;
	let normalDialHost: HTMLDivElement;
	let agentationRoot = $state.raw<Root | null>(null);
	let portalContainer = $state<HTMLElement | null>(null);

	$effect(() => {
		agentationRoot?.render(createElement<AgentationProps>(Agentation, {
			endpoint,
			useHashLocation,
			appName,
			portalContainer
		}));
	});

	onMount(() => {
		const root = createRoot(agentationHost);
		agentationRoot = root;

		let destroyed = false;
		let dialInstance: Record<string, unknown> | null = null;
		let inlineDialHost: HTMLDivElement | null = null;
		let desiredTarget: HTMLElement | null = null;
		let dialGeneration = 0;
		let dialQueue = Promise.resolve();
		const panelOpenBeforeSheet = new Map<string, boolean>();
		let currentSheet: HTMLDialogElement | null = null;
		let observedShadow: ShadowRoot | null = null;
		const observerOptions: MutationObserverInit = { attributes: true, attributeFilter: ['open'], childList: true, subtree: true };

		function relocateDial(target: HTMLElement, inline: boolean): void {
			if (target === desiredTarget) return;
			desiredTarget = target;
			const generation = ++dialGeneration;

			dialQueue = dialQueue.then(async () => {
				const previousDial = dialInstance;
				dialInstance = null;
				if (previousDial) await unmount(previousDial);
				inlineDialHost?.remove();
				inlineDialHost = null;
				if (destroyed || generation !== dialGeneration) return;

				let host = target;
				if (inline) {
					if (!target.isConnected) return;
					inlineDialHost = document.createElement('div');
					inlineDialHost.dataset.feedbackDialHost = 'inline';
					target.append(inlineDialHost);
					host = inlineDialHost;
				}

				dialInstance = mount(DialRoot, {
					target: host,
					props: inline
						? { mode: 'inline', theme: 'dark', productionEnabled: dialProductionEnabled }
						: {
								position: 'top-right',
								theme: 'dark',
								defaultOpen: false,
								productionEnabled: dialProductionEnabled
							}
				});
			});
		}

		function synchronizeTools(): void {
			const sheet = document.querySelector<HTMLDialogElement>('.settings-dialog[open]') ?? document.querySelector<HTMLDialogElement>('.draft-sheet[open]');
			if (currentSheet !== sheet) {
				for (const panel of DialStore.getPanels('panel')) {
					const previous = panelOpenBeforeSheet.get(panel.id);
					if (previous !== undefined) DialStore.setPanelOpen(panel.id, previous);
				}
				panelOpenBeforeSheet.clear();
				if (sheet) {
					// Inline headers cannot expand a panel collapsed by the normal popover.
					for (const panel of DialStore.getPanels('panel')) {
						panelOpenBeforeSheet.set(panel.id, DialStore.getPanelOpen(panel.id) ?? false);
						DialStore.setPanelOpen(panel.id, true);
					}
				}
				currentSheet = sheet;
			}
			// A raised card reader sits in the top layer above the sheet, so the toolbar follows it there.
			const layer = document.querySelector<HTMLElement>('[data-card-reader]:popover-open') ?? sheet;
			if (portalContainer !== layer) portalContainer = layer;

			const sheetContent = sheet?.querySelector<HTMLElement>('.sheet-content');
			relocateDial(sheetContent ?? normalDialHost, sheetContent != null);
			const shadow = document.querySelector('agentation-toolbar')?.shadowRoot ?? null;
			if (shadow !== observedShadow) {
				observer.disconnect();
				observer.observe(document.documentElement, observerOptions);
				if (shadow) observer.observe(shadow, observerOptions);
				observedShadow = shadow;
			}
			// Popup removal happens inside Agentation's shadow root, outside the document subtree.
			if (sheet && !sheet.contains(document.activeElement)) {
				sheet.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
			}
		}

		const observer = new MutationObserver(synchronizeTools);
		observer.observe(document.documentElement, observerOptions);
		// Popover toggles change no attributes, so the observer cannot see a card reader open.
		document.addEventListener('toggle', synchronizeTools, true);
		synchronizeTools();

		return () => {
			destroyed = true;
			document.removeEventListener('toggle', synchronizeTools, true);
			++dialGeneration;
			observer.disconnect();
			for (const panel of DialStore.getPanels('panel')) {
				const previous = panelOpenBeforeSheet.get(panel.id);
				if (previous !== undefined) DialStore.setPanelOpen(panel.id, previous);
			}
			panelOpenBeforeSheet.clear();
			portalContainer = null;
			currentSheet = null;
			agentationRoot = null;
			root.unmount();

			const mountedDial = dialInstance;
			dialInstance = null;
			if (mountedDial) void unmount(mountedDial);
			inlineDialHost?.remove();
			inlineDialHost = null;
			desiredTarget = null;
		};
	});
</script>

<div bind:this={agentationHost} data-feedback-tools="agentation"></div>
<div bind:this={normalDialHost} data-feedback-dial-host="popover"></div>
