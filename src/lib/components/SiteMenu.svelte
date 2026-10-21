<script lang="ts">
 import { onMount, tick } from 'svelte';
 import { afterNavigate } from '$app/navigation';
 import Settings from './Settings.svelte';
 import { draftModeEnabled } from '#lib/app/features.ts';

 let { onNew, navigation = [] }: { onNew?: () => void; navigation?: { href: string; label: string; current: boolean }[] } = $props();
 let open = $state(false);
 let developerDraft = $state(false);
 let settings = $state<ReturnType<typeof Settings>>();
 let trigger = $state<HTMLButtonElement>();
 let panel = $state<HTMLElement>();
 const uid = $props.id();
 const panelId = `${uid}-menu`;
 let initialNavigation = true;

	onMount(() => { developerDraft = draftModeEnabled(); });
	afterNavigate(() => {
		if (initialNavigation) {
			initialNavigation = false;
			return;
		}
		open = false;
	});

	async function toggle(): Promise<void> {
		open = !open;
		if (open) {
			await tick();
			panel?.querySelector<HTMLElement>('a, button')?.focus();
		}
	}
	function close(returnFocus = true): void {
		if (!open) return;
		open = false;
		if (returnFocus) trigger?.focus({ preventScroll: true });
	}
	function openSettings(): void {
		open = false;
		settings?.open(trigger);
	}
	function onWindowClick(event: MouseEvent): void {
		if (!open) return;
		const target = event.target as Node;
		if (!panel?.contains(target) && !trigger?.contains(target)) close(false);
	}
</script>

<svelte:window onclick={onWindowClick} onkeydown={event => { if (event.key === 'Escape') close(); }} />

<div class="site-menu">
	<button bind:this={trigger} type="button" class="menu-trigger" aria-expanded={open} aria-controls={panelId} onclick={() => void toggle()}>
		<svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18"><path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" /></svg>
		Menu
	</button>
	<nav bind:this={panel} id={panelId} class="menu-panel" aria-label="More" hidden={!open}>
		<!-- Phones hide the main navigation (layout), so its destinations move here. -->
		{#each navigation as destination (destination.href)}
			<a class="nav-fallback" href={destination.href} aria-current={destination.current ? 'page' : undefined}>{destination.label}</a>
		{/each}
		{#if onNew}<button type="button" onclick={() => { close(); onNew?.(); }}>New draft</button>{/if}
		<button type="button" onclick={openSettings}>Settings</button>
		<a href="/how-to-play">How to play</a>
		<a href="/factory">Card factory</a>
		<a href="/about#simulation">Rules &amp; model</a>
		<a href="/credits">Data &amp; image credits</a>
		{#if developerDraft}<a class="developer" href="/draft">Draft Mode <span>developer</span></a>{/if}
	</nav>
	<Settings bind:this={settings} showTrigger={false} />
</div>

<style>
	.site-menu { position: relative; }
	.menu-trigger { display: inline-flex; min-height: 2.75rem; align-items: center; gap: var(--space-2); padding-inline: var(--space-3); border-color: transparent; background: transparent; color: var(--muted); font-size: var(--text-sm); }
	.menu-trigger:hover:not(:disabled), .menu-trigger[aria-expanded='true'] { color: var(--text); background: var(--surface); }
	.menu-panel {
		position: absolute;
		z-index: 20;
		top: calc(100% + var(--space-1));
		right: 0;
		display: grid;
		min-width: 14rem;
		padding: var(--space-1);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface-raised);
		box-shadow: 0 1rem 2.5rem oklch(0% 0 0 / .4);
	}
	.menu-panel[hidden] { display: none; }
	.menu-panel .nav-fallback { display: none; }
	.menu-panel a, .menu-panel button {
		display: flex;
		min-height: 2.75rem;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--text);
		font: 600 var(--text-sm)/1.2 var(--font-control);
		letter-spacing: normal;
		text-align: left;
		text-decoration: none;
	}
	.menu-panel a:hover, .menu-panel button:hover:not(:disabled) { background: var(--surface-hover); }
	.menu-panel a[aria-current='page'] { color: var(--accent); }
	.menu-panel .nav-fallback:nth-last-child(1 of .nav-fallback) { margin-bottom: var(--space-1); box-shadow: 0 1px 0 var(--border); }
	.developer span { color: var(--muted); font-size: var(--text-xs); }
</style>
