<script lang="ts">
	import { onMount } from 'svelte';
	import './layout.css';
	import '../lib/cards/fonts.css';
	import favicon from '#lib/assets/favicon.svg';
	import SiteMenu from '#lib/components/SiteMenu.svelte';
	import { showsExternalSupport } from '#lib/app/host.ts';
	import Toaster from '#lib/components/Toaster.svelte';
	import TokenAmount from '#lib/components/TokenAmount.svelte';
	import { refreshStickers } from '#lib/collection/store.svelte.ts';
	import { page } from '$app/state';
	import { refreshShop, shopState } from '#lib/cosmetics/store.svelte.ts';
	import { sitePreviewImage } from '#lib/share/site-preview.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
	const sitePreview = sitePreviewImage();
	const destinations = [
		{ href: '/', label: 'Play' }, { href: '/seasons', label: 'My teams' },
		{ href: '/collection', label: 'Collection' }
	];
	const balance = $derived(shopState.snapshot?.balance ?? null);
	// The iOS app marks itself before the page runs; the website alone shows the external support link.
	let externalSupport = $state(false);
	const playing = $derived(['/', '/classic', '/draft'].includes(page.url.pathname) || /^\/(r|c)\//.test(page.url.pathname));
	// Roster links (/r, /c) set their own preview from the published season image.
	const rosterLink = $derived(/^\/(r|c)\//.test(page.url.pathname));
	let FeedbackTools = $state<typeof import('#lib/dev/FeedbackTools.svelte').default | null>(null);

	onMount(() => {
		externalSupport = showsExternalSupport();
		void refreshStickers();
		void refreshShop();
	});

	onMount(() => {
		if (!import.meta.env.DEV) return;
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
	{#if page.url.pathname === '/' || page.url.pathname === '/classic'}
		<title>162-0 | The undefeated baseball challenge</title>
		<meta name="description" content="Roll a franchise and decade. Draft sixteen historical selections. Can your team survive 162 games without a loss?" />
		<meta property="og:type" content="website" />
		<meta property="og:url" content="https://162-0.dev/" />
		<meta property="og:title" content="162-0 | The undefeated baseball challenge" />
		<meta property="og:description" content="Roll a franchise and decade. Draft sixteen historical selections. Can your team survive 162 games without a loss?" />
	{/if}
	<meta property="og:site_name" content="162-0" />
	{#if !rosterLink}
		<meta property="og:image" content={sitePreview.url} />
		<meta property="og:image:width" content={String(sitePreview.width)} />
		<meta property="og:image:height" content={String(sitePreview.height)} />
		<meta property="og:image:type" content={sitePreview.type} />
		<meta property="og:image:alt" content={sitePreview.alt} />
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:image" content={sitePreview.url} />
		<meta name="twitter:image:alt" content={sitePreview.alt} />
	{/if}
</svelte:head>

<div class="site">
	<header class="site-header">
		<a class="wordmark" href="/" aria-label="162-0 home"><span aria-hidden="true" class="mark"></span>162-0</a>
		<nav class="primary-nav" aria-label="Main navigation">
			{#each destinations as destination (destination.href)}
				<a href={destination.href} aria-current={(destination.href === '/' ? playing : destination.href === '/seasons' ? ['/seasons', '/h2h'].includes(page.url.pathname) : page.url.pathname === destination.href) ? 'page' : undefined}>{destination.label}</a>
			{/each}
		</nav>
		<nav class="site-actions" aria-label="Site controls">
			<a class="shop-link" href="/shop" aria-current={page.url.pathname === '/shop' ? 'page' : undefined}
				aria-label={balance === null ? 'Shop' : `Shop, ${balance} ${balance === 1 ? 'token' : 'tokens'}`}>
				<span>Shop</span><span class="shop-balance" aria-hidden="true"><TokenAmount amount={balance} /></span>
			</a>
			<SiteMenu />
		</nav>
	</header>
	{@render children()}
	<footer>
		<div class="attribution">
			<p>Inspired by <a href="https://82-0.com/">82-0</a>. An original baseball challenge.</p>
			<p><a href="https://sabr.org/lahman-database/">Lahman data via SABR</a>, filtered and repackaged with adjusted rates.
				<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>. <a href="/about#attribution">Full attribution &amp; data download</a>. <a href="/about#image-credits">Image credits</a>.</p>
		</div>
		<div class="footer-links">
			{#if externalSupport}
				<a class="support-link" href="https://ko-fi.com/thealpacalypse" target="_blank" rel="noreferrer">Support the developer <span aria-hidden="true">↗</span></a>
			{/if}
			<a class="studio-link" href="https://alpacasoft.dev/" target="_blank" rel="noreferrer"><span>Made by</span> Alpacasoft <span aria-hidden="true">↗</span></a>
		</div>
	</footer>
</div>
<Toaster />

{#if FeedbackTools}
	<FeedbackTools />
{/if}

<style>
	.site {
		max-width: 88rem;
		margin-inline: auto;
		padding-inline: max(var(--space-4), env(safe-area-inset-left)) max(var(--space-4), env(safe-area-inset-right));
	}
	.site:has(:global(main.home-start)) { max-width: none; padding-inline: 0; }
	.site:has(:global(main.home-start)) .site-header,
	.site:has(:global(main.home-start)) footer {
		margin-inline: max(var(--space-4), env(safe-area-inset-left)) max(var(--space-4), env(safe-area-inset-right));
	}
	.site:has(:global(main.home-start)) footer { margin-top: 0; }
	.site:has(:global(:is(.draft-board, .draft-skeleton))) { max-width: 90rem; }
	.site:has(:global(:is(.draft-board, .draft-skeleton).wide)) { padding-inline: max(24px, env(safe-area-inset-left)) max(24px, env(safe-area-inset-right)); }
	.site:has(:global(:is(.draft-board, .draft-skeleton).wide)) .site-header { display: none; }
	.site-header {
		position: relative;
		z-index: 5;
		display: flex;
		min-height: 4rem;
		flex-wrap: wrap;
		align-items: center;
		column-gap: var(--space-4);
		row-gap: 0;
		border-bottom: 1px solid var(--border);
	}
	.site-header > a { min-height: 2.75rem; display: inline-flex; align-items: center; font-size: var(--text-sm); }
	.wordmark { flex: none; color: var(--text); text-decoration: none; font-size: var(--text-xl) !important; font-weight: 850; letter-spacing: -.04em; gap: var(--space-3); }
	.mark { width: .75rem; height: .75rem; border: 2px solid var(--text); transform: rotate(45deg); }
	.site-actions { position: relative; display: flex; align-items: center; gap: var(--space-1); margin-left: auto; }
	.shop-link { display: inline-flex; min-height: 2.75rem; align-items: center; gap: var(--space-2); padding-inline: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font: 650 var(--text-sm)/1 var(--font-control); text-decoration: none; white-space: nowrap; }
	.shop-link:hover, .shop-link[aria-current='page'] { border-color: var(--accent); background: var(--surface); }
	.shop-balance { color: var(--accent); font-weight: 750; }
	.primary-nav { order: 3; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); width: 100%; gap: var(--space-1); padding-block: var(--space-1); }
	.primary-nav a { display: flex; align-items: center; justify-content: center; min-height: 3rem; padding: var(--space-2) var(--space-1); border-radius: var(--radius); color: var(--muted); font: 650 1rem/1.2 var(--font-control); text-align: center; text-decoration: none; }
	.primary-nav a:hover { background: var(--surface); color: var(--text); }
	.primary-nav a[aria-current='page'] { color: var(--accent); background: var(--surface); }
	@media (min-width: 64rem) {
		.site-header { flex-wrap: nowrap; }
		.primary-nav { order: 0; display: flex; width: auto; }
		.primary-nav a { padding-inline: var(--space-3); }
	}
	@media (max-width: 30rem) {
		.site-header { column-gap: var(--space-2); }
		.wordmark { gap: var(--space-2); }
		.shop-link { padding-inline: var(--space-2); }
		.site-actions :global(.menu-trigger) { padding-inline: var(--space-2); }
		.primary-nav a { font-size: var(--text-sm); }
	}
	/* Home deals cards behind the header: no rule cutting across them, and a fade keeps the links legible. */
	.site:has(:global(main.home-start)) .site-header { border-bottom-color: transparent; }
	.site:has(:global(main.home-start)) .site-header::before { content: ''; position: absolute; z-index: -1; inset: 0 calc(-1 * max(var(--space-4), env(safe-area-inset-left))) -2.5rem; background: linear-gradient(var(--background) 55%, transparent); pointer-events: none; }
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
	footer p a { display: inline-block; padding-block: var(--space-1); }
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
	.footer-links { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-6); }
	.support-link { display: inline-flex; min-height: 2.75rem; align-items: center; gap: var(--space-1); color: var(--muted); font-size: .8125rem; font-weight: 650; }
	.support-link:hover { color: var(--text); }
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
	/* Results pins its share bar to the bottom of phones; the footer clears it so its links stay reachable. */
	@media (max-width: 40rem) {
		.site:has(:global(.results .share-shortcuts)) footer { padding-bottom: calc(5.5rem + max(var(--space-6), env(safe-area-inset-bottom))); }
	}
	@media (max-width: 23rem) {
		.site-header { gap: var(--space-2); }
		.site-actions { gap: var(--space-1); }
	}
</style>
