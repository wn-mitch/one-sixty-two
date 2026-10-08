<script lang="ts">
	import './layout.css';
	import '../lib/cards/fonts.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="oklch(16% 0.009 255)" />
</svelte:head>

<div class="site">
	<header class="site-header">
		<a class="wordmark" href="/" aria-label="162-0 home"><span aria-hidden="true" class="mark"></span>162-0</a>
		<span class="edition">The undefeated challenge</span>
		<a class="rules-link" href="/about">Rules &amp; model</a>
	</header>
	{@render children()}
	<footer>
		<p>Inspired by <a href="https://82-0.com/">82-0</a>. An original baseball challenge.</p>
		<p><a href="https://sabr.org/lahman-database/">Lahman data via SABR</a>, filtered and repackaged with adjusted rates.
			<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>. <a href="/about#attribution">Full attribution &amp; data download</a>. <a href="/about#image-credits">Image credits</a>.</p>
	</footer>
</div>

<style>
	.site {
		max-width: 80rem;
		margin-inline: auto;
		padding-inline: max(var(--space-4), env(safe-area-inset-left)) max(var(--space-4), env(safe-area-inset-right));
	}
	.site:has(:global(.draft-board)) { max-width: 90rem; }
	.site-header { display: flex; justify-content: space-between; align-items: center; gap: var(--space-4); min-height: 4rem; border-bottom: 1px solid var(--border); }
	.site-header > a { min-height: 2.75rem; display: inline-flex; align-items: center; font-size: var(--text-sm); }
	.wordmark { color: var(--text); text-decoration: none; font-size: var(--text-xl) !important; font-weight: 850; letter-spacing: -.04em; gap: var(--space-3); }
	.mark { width: .75rem; height: .75rem; border: 2px solid var(--text); transform: rotate(45deg); }
	.edition { display: none; font-size: var(--text-xs); font-weight: 650; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); margin-right: auto; }
	.rules-link { color: var(--muted); text-decoration: none; }
	footer { border-top: 1px solid var(--border); padding: var(--space-6) 0 max(var(--space-6), env(safe-area-inset-bottom)); margin-top: var(--space-12); color: var(--muted); font-size: var(--text-xs); }
	footer p { margin: var(--space-1) 0; }
	footer a { display: inline-block; padding-block: var(--space-1); }
	@media (min-width: 48rem) {
		.edition { display: block; }
		footer { display: flex; justify-content: space-between; gap: var(--space-12); }
	}
	@media (min-width: 1100px), (min-width: 1024px) and (orientation: landscape) {
		.site { padding-inline: max(var(--space-8), env(safe-area-inset-left)) max(var(--space-8), env(safe-area-inset-right)); }
	}
</style>
