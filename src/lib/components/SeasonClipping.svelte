<script lang="ts">
	import type { SeasonPhrase } from '../news/phrases.ts';

	/** The season in a real period phrase, chosen by the grade, cited to the printing it came from. */
	let { phrase }: { phrase: SeasonPhrase } = $props();

	const shortDate = $derived(new Date(`${phrase.date}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }));
	const headline = $derived(phrase.phrase.charAt(0).toUpperCase() + phrase.phrase.slice(1));
</script>

<figure class="clipping" aria-label="Season headline">
	<blockquote cite={phrase.url}><p>“{headline}”</p></blockquote>
	<figcaption>
		<a href={phrase.url} target="_blank" rel="noopener noreferrer">{phrase.publication}, {shortDate}<span aria-hidden="true"> ↗</span><span class="sr-only"> (opens in a new tab)</span></a>
	</figcaption>
</figure>

<style>
	.clipping { display: grid; gap: var(--space-1); min-width: 0; max-width: 32rem; margin: 0; }
	blockquote { margin: 0; }
	blockquote p { margin: 0; font-family: 'Roboto Serif', Georgia, serif; font-size: var(--text-lg); font-style: italic; font-weight: 600; line-height: 1.25; text-wrap: balance; }
	figcaption { font-size: var(--text-xs); }
	figcaption a { color: var(--muted); }
</style>
