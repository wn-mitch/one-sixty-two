<script lang="ts">
	import { onMount } from 'svelte';
	import './layout.css';
	import '../lib/cards/fonts.css';
	import favicon from '#lib/assets/favicon.svg';
	import MotionSettings from '#lib/components/MotionSettings.svelte';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
	let FeedbackTools = $state<typeof import('#lib/dev/FeedbackTools.svelte').default | null>(null);
	const captureRoute = $derived(page.url.pathname.startsWith('/__share/') && page.data.capture === true);

	onMount(() => {
		if (!import.meta.env.DEV || captureRoute) return;
		let cancelScheduled = () => {};
		const load = () => {
			void import('#lib/dev/FeedbackTools.svelte').then(({ default: component }) => {
				FeedbackTools = component;
			});
		};
		const schedule = () => {
			const requestIdle = Reflect.get(window, 'requestIdleCallback') as typeof window.requestIdleCallback | undefined;
			if (requestIdle) {
				const idleId = requestIdle.call(window, load);
				cancelScheduled = () => {
					const cancelIdle = Reflect.get(window, 'cancelIdleCallback') as typeof window.cancelIdleCallback | undefined;
					cancelIdle?.call(window, idleId);
				};
			} else {
				const timeoutId = window.setTimeout(load, 0);
				cancelScheduled = () => window.clearTimeout(timeoutId);
			}
		};
		if (document.readyState === 'complete') schedule();
		else window.addEventListener('load', schedule, { once: true });
		return () => {
			window.removeEventListener('load', schedule);
			cancelScheduled();
		};
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="oklch(16% 0.009 255)" />
	{#if page.url.pathname === '/'}
		<title>162-0 | The undefeated baseball challenge</title>
		<meta name="description" content="Roll a franchise and decade. Draft fourteen historical selections. Can your team survive 162 games without a loss?" />
	{/if}
</svelte:head>

{#if captureRoute}
	{@render children()}
{:else}
	<div class="site">
		<header class="site-header">
			<a class="wordmark" href="/" aria-label="162-0 home"><span aria-hidden="true" class="mark"></span>162-0</a>
			<nav class="site-actions" aria-label="Site controls">
				<MotionSettings />
				<a class="rules-link" href="/about">Rules &amp; model</a>
			</nav>
		</header>
		{@render children()}
		<footer>
			<div class="attribution">
				<p>Inspired by <a href="https://82-0.com/">82-0</a>. An original baseball challenge.</p>
				<p><a href="https://sabr.org/lahman-database/">Lahman data via SABR</a>, filtered and repackaged with adjusted rates.
					<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>. <a href="/about#attribution">Full attribution &amp; data download</a>. <a href="/about#image-credits">Image credits</a>.</p>
			</div>
			<a class="studio-link" href="https://alpacasoft.dev/" target="_blank" rel="noreferrer"><span>Made by</span> Alpacasoft <span aria-hidden="true">↗</span></a>
		</footer>
	</div>
{/if}

{#if FeedbackTools && !captureRoute}
	<FeedbackTools />
{/if}

<style>
	.site {
		max-width: 80rem;
		margin-inline: auto;
		padding-inline: max(var(--space-4), env(safe-area-inset-left)) max(var(--space-4), env(safe-area-inset-right));
	}
	.site:has(:global(main.home-start)) { max-width: none; padding-inline: 0; }
	.site:has(:global(main.home-start)) .site-header,
	.site:has(:global(main.home-start)) footer {
		margin-inline: max(var(--space-4), env(safe-area-inset-left)) max(var(--space-4), env(safe-area-inset-right));
	}
	.site:has(:global(main.home-start)) footer { margin-top: 0; }
	.site:has(:global(.draft-board)) { max-width: 90rem; }
	.site:has(:global(.draft-board.wide)) { padding-inline: max(24px, env(safe-area-inset-left)) max(24px, env(safe-area-inset-right)); }
	.site:has(:global(.draft-board.wide)) .site-header { display: none; }
	.site-header {
		position: relative;
		z-index: 5;
		display: flex;
		min-height: 4rem;
		align-items: center;
		gap: var(--space-4);
		border-bottom: 1px solid var(--border);
	}
	.site-header > a { min-height: 2.75rem; display: inline-flex; align-items: center; font-size: var(--text-sm); }
	.wordmark { flex: none; color: var(--text); text-decoration: none; font-size: var(--text-xl) !important; font-weight: 850; letter-spacing: -.04em; gap: var(--space-3); }
	.mark { width: .75rem; height: .75rem; border: 2px solid var(--text); transform: rotate(45deg); }
	.site-actions { position: relative; display: flex; align-items: center; gap: var(--space-4); margin-left: auto; }
	.rules-link { min-height: 2.75rem; display: inline-flex; align-items: center; color: var(--muted); font-size: var(--text-sm); text-decoration: none; white-space: nowrap; }
	footer {
		position: relative;
		z-index: 2;
		margin-top: var(--space-12);
		padding: var(--space-6) 0 max(var(--space-6), env(safe-area-inset-bottom));
		border-top: 1px solid var(--border);
		color: var(--muted);
		font-size: var(--text-xs);
	}
	footer p { margin: var(--space-1) 0; }
	footer a { display: inline-block; padding-block: var(--space-1); }
	.studio-link {
		display: inline-flex;
		min-height: 2.75rem;
		flex: none;
		align-items: center;
		gap: var(--space-2);
		color: var(--text);
		font-size: .8125rem;
		font-weight: 650;
		text-decoration: none;
	}
	.studio-link span:first-child { color: var(--muted); font-weight: 500; }
	@media (min-width: 48rem) {
		footer { display: flex; justify-content: space-between; align-items: center; gap: var(--space-12); }
	}
	@media (min-width: 68rem) {
		.site:has(:global(main.home-start)) .site-header,
		.site:has(:global(main.home-start)) footer {
			margin-inline: max(2rem, calc((100vw - 90rem) / 2));
		}
	}
	@media (min-width: 1100px), (min-width: 1024px) and (orientation: landscape) {
		.site:not(:has(:global(main.home-start))) { padding-inline: max(var(--space-8), env(safe-area-inset-left)) max(var(--space-8), env(safe-area-inset-right)); }
	}
	@media (max-width: 23rem) {
		.site-header { gap: var(--space-2); }
		.site-actions { gap: var(--space-2); }
		.rules-link { font-size: var(--text-xs); }
	}
</style>
