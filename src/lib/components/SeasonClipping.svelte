<script lang="ts">
	import { cubicOut } from 'svelte/easing';
	import { appSettings } from '../game/settings.svelte.ts';
	import type { SeasonPhrase } from '../news/phrases.ts';

	/**
	 * The season as a newspaper clipping: a real period phrase, chosen by the grade, set as the
	 * headline over your record, with the printing it came from. The clipping is paper in every
	 * theme, and it drops onto the page like one.
	 */
	let { phrase, wins, losses }: { phrase: SeasonPhrase; wins: number; losses: number } = $props();

	const issued = $derived(new Date(`${phrase.date}T00:00:00Z`));
	const dateline = $derived(issued.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }));
	const shortDate = $derived(issued.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }));
	/** A bare page number reads "Page 4"; a section name prints as written. */
	const page = $derived(phrase.page && /^\d+$/.test(phrase.page) ? `Page ${phrase.page}` : phrase.page);
	const headline = $derived(phrase.phrase.charAt(0).toUpperCase() + phrase.phrase.slice(1));

	function drop(_: Element) {
		const motion = appSettings.effectiveEnabled;
		return {
			delay: motion ? 360 : 0,
			duration: motion ? 520 : 0,
			easing: cubicOut,
			css: (t: number, u: number) => `transform: translateY(${-28 * u}px) rotate(${-5 * u}deg) scale(${1 + .06 * u}); opacity: ${Math.min(1, t * 2)};`
		};
	}
</script>

<div class="lie" in:drop|global>
	<figure class="clipping" aria-labelledby="clipping-headline">
		<header class="masthead">
			<p class="paper">{phrase.publication}</p>
			<p class="dateline">{dateline}{#if page}{' · '}{page}{/if}</p>
		</header>
		<blockquote cite={phrase.url}>
			<p id="clipping-headline" class="headline">{headline}</p>
		</blockquote>
		<p class="deck">Your club finishes {wins}–{losses}</p>
		<figcaption>
			Words as printed in {phrase.publication}, {shortDate}, about another club.
			<a href={phrase.url} target="_blank" rel="noopener noreferrer">See the page<span aria-hidden="true"> ↗</span><span class="sr-only"> (opens in a new tab)</span></a>
		</figcaption>
	</figure>
</div>

<style>
	/* The shadow sits on a wrapper: the clipping's torn edge (clip-path) would cut a box-shadow off. */
	.lie { position: relative; z-index: 1; justify-self: center; width: min(100%, 32rem); margin-top: calc(-1 * var(--space-6)); rotate: -1.2deg; filter: drop-shadow(0 .5rem .9rem oklch(10% .01 255 / .4)); }
	.clipping {
		/* Newsprint stays newsprint in every theme. */
		--paper: oklch(93.5% .022 86);
		--ink: oklch(22% .012 70);
		--ink-soft: oklch(42% .02 70);
		margin: 0;
		padding: var(--space-4) var(--space-5) var(--space-3);
		background:
			radial-gradient(circle at 20% 15%, oklch(97% .015 86 / .7), transparent 60%),
			var(--paper);
		color: var(--ink);
		font-family: 'Roboto Serif', Georgia, serif;
		/* A scissored edge on the right. */
		clip-path: polygon(0 0, 100% 0, 99.2% 18%, 100% 37%, 99.4% 58%, 100% 79%, 99.3% 100%, 0 100%);
	}
	.masthead { display: grid; gap: var(--space-1); padding-bottom: var(--space-2); border-bottom: 3px double var(--ink); text-align: center; }
	.masthead p { margin: 0; }
	.paper { font-size: var(--text-lg); font-weight: 800; letter-spacing: .02em; font-variant: small-caps; line-height: 1.1; }
	.dateline { color: var(--ink-soft); font-size: var(--text-xs); letter-spacing: .04em; text-transform: uppercase; }
	blockquote { margin: var(--space-3) 0 var(--space-1); }
	.headline { margin: 0; font-size: clamp(1.5rem, 1.1rem + 1.6vw, 2.1rem); font-weight: 800; line-height: 1.08; letter-spacing: -.01em; text-wrap: balance; }
	.deck { margin: 0 0 var(--space-3); color: var(--ink-soft); font-size: var(--text-base); font-style: italic; }
	figcaption { padding-top: var(--space-2); border-top: 1px solid color-mix(in oklch, var(--ink) 35%, transparent); color: var(--ink-soft); font-family: system-ui, sans-serif; font-size: var(--text-xs); line-height: 1.4; }
	figcaption a { color: var(--ink); font-weight: 650; white-space: nowrap; }
	figcaption a:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
</style>
