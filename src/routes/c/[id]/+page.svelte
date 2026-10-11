<script lang="ts">
	import { goto } from '$app/navigation';
	import { acceptChallenge } from '#lib/game/challenge.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let notice = $state('');

	/** Accepting stores the challenge for the next draft, then opens a fresh stadium deck. */
	async function accept(): Promise<void> {
		if (!data.record) return;
		if (!acceptChallenge({ replayId: data.replayId, ...data.record })) {
			notice = 'This browser blocked storage, so the series offer will not appear after your season. You can still draft and use Head-to-head with their link.';
			return;
		}
		await goto('/?new=1');
	}
</script>

<svelte:head>
	<title>{data.title}</title>
	<meta name="description" content={data.description} />
	<link rel="canonical" href={data.canonical} />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={data.canonical} />
	<meta property="og:title" content={data.title} />
	<meta property="og:description" content={data.description} />
	<meta name="twitter:card" content={data.image ? 'summary_large_image' : 'summary'} />
	<meta name="twitter:title" content={data.title} />
	<meta name="twitter:description" content={data.description} />
	{#if data.image}
		<meta property="og:image" content={data.image.url} />
		<meta property="og:image:width" content={String(data.image.width)} />
		<meta property="og:image:height" content={String(data.image.height)} />
		<meta property="og:image:type" content={data.image.type} />
		<meta property="og:image:alt" content={data.image.alt} />
		<meta name="twitter:image" content={data.image.url} />
		<meta name="twitter:image:alt" content={data.image.alt} />
	{/if}
</svelte:head>

<main class="challenge">
	{#if data.record}
		<p class="eyebrow">You've been challenged</p>
		<h1>Beat {data.record.wins}–{data.record.losses}</h1>
		<p class="lede muted">Draft your own club from baseball history and play its 162 games. Then take this club on in a best-of-five.</p>
		{#if data.image}<img src={data.image.url} width={data.image.width} height={data.image.height} alt={data.image.alt} />{/if}
		<div class="actions">
			<button class="primary" type="button" onclick={() => void accept()}>Draft your team</button>
			<a class="see-season" href="/r/{data.replayId}">See their season</a>
		</div>
		{#if notice}<p class="notice" role="status">{notice}</p>{/if}
	{:else}
		<h1>Challenge not found</h1>
		<p class="lede muted">This challenge link has expired or was made with an older version of the game.</p>
		<div class="actions"><a class="button primary" href="/?new=1">Start a draft</a></div>
	{/if}
</main>

<style>
	.challenge { display: grid; justify-items: center; gap: var(--space-4); width: min(100%, 30rem); margin-inline: auto; padding-block: var(--space-8); text-align: center; }
	.eyebrow { margin: 0; color: var(--accent); font-size: var(--text-xs); font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
	h1 { margin: 0; font: italic 900 clamp(2.75rem, 12vw, 4.5rem) / .95 'Barlow Condensed', sans-serif; text-transform: uppercase; }
	.lede { margin: 0; max-width: 34ch; }
	img { width: 100%; height: auto; border-radius: var(--radius-lg); }
	.actions { display: grid; justify-items: center; gap: var(--space-3); width: 100%; }
	.actions .primary { width: 100%; min-height: 3.25rem; font-size: var(--text-lg); }
	.see-season { display: inline-flex; align-items: center; min-height: 44px; color: var(--muted); font-weight: 650; }
	.notice { margin: 0; font-size: var(--text-sm); }
</style>
