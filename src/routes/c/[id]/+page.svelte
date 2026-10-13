<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { acceptChallenge, claimChallenge } from '#lib/game/challenge.ts';
	import { loadManifest } from '#lib/game/data.ts';
	import { restoreDraft } from '#lib/game/persistence.ts';
	import { deviceDb } from '#lib/storage/db.ts';
	import { draftRules } from '#lib/game/rules.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let notice = $state('');
	/** The unfinished draft on this device, which can answer the challenge instead of a fresh one. */
	let inProgress = $state<{ seed: number; label: string } | null>(null);

	onMount(() => {
		let live = true;
		void loadManifest().then(async manifest => {
			let saved;
			try { saved = await restoreDraft((await deviceDb()).db, manifest); } catch { return; }
			if (!live || saved.kind !== 'valid' || saved.phase === 'results') return;
			const picks = saved.draft.picks.length;
			const slots = draftRules(saved.draft.schemaVersion).slots.length;
			inProgress = { seed: saved.draft.seed, label: picks === slots ? 'Roster complete' : `${picks} of ${slots} picked` };
		}).catch(() => { /* without the manifest, accepting starts fresh */ });
		return () => { live = false; };
	});

	/** Accepting stores the challenge, then either resumes the draft in progress for it or opens a fresh stadium deck. */
	async function accept(useCurrent: boolean): Promise<void> {
		if (!data.record) return;
		if (!acceptChallenge({ replayId: data.replayId, ...data.record })) {
			notice = 'This browser blocked storage, so the series offer will not appear after your season. You can still draft and use Head-to-head with their link.';
			return;
		}
		if (useCurrent && inProgress) {
			claimChallenge(inProgress.seed);
			await goto('/classic?resume=1');
		} else {
			await goto('/classic?new=1');
		}
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
			{#if inProgress}
				<p class="in-progress">You have a draft in progress · {inProgress.label}</p>
				<button class="primary" type="button" onclick={() => void accept(true)}>Answer with my current draft</button>
				<button class="secondary" type="button" onclick={() => void accept(false)}>Start a fresh draft</button>
			{:else}
				<button class="primary" type="button" onclick={() => void accept(false)}>Draft your team</button>
			{/if}
			<a class="see-season" href="/r/{data.replayId}">See their season</a>
		</div>
		{#if notice}<p class="notice" role="status">{notice}</p>{/if}
	{:else}
		<h1>Challenge not found</h1>
		<p class="lede muted">This challenge link has expired or was made with an older version of the game.</p>
		<div class="actions"><a class="button primary" href="/classic?new=1">Start a draft</a></div>
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
	.actions .secondary { width: 100%; min-height: 2.75rem; }
	.in-progress { margin: 0; color: var(--muted); font-size: var(--text-sm); }
	.see-season { display: inline-flex; align-items: center; min-height: 44px; color: var(--muted); font-weight: 650; }
	.notice { margin: 0; font-size: var(--text-sm); }
</style>
