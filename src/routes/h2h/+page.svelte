<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import SeriesResults from '#lib/components/SeriesResults.svelte';
	import SeriesProgress from '#lib/components/h2h/SeriesProgress.svelte';
	import { copyShareLink } from '#lib/game/share.ts';
	import { parseSeriesHash } from '#lib/game/replay-link.ts';
	import { SeriesSession } from '#lib/game/series-session.svelte.ts';

	const session = new SeriesSession();
	let copyStatus = $state('');
	const checking = $derived(session.loading || Object.values(session.clubStatus).includes('pending'));

	async function copySeries(): Promise<void> {
		const link = `${location.origin}/h2h${session.seriesHash()}`;
		try {
			await copyShareLink(link);
			copyStatus = 'Series link copied. Anyone who opens it replays the same games.';
		} catch { copyStatus = `Copy this series link: ${link}`; }
	}

	async function gallery(restore = false): Promise<void> {
		const hash = restore ? session.seriesHash() : '';
		session.cancel();
		try { await goto(`/seasons${hash}`); }
		catch { session.error = 'The gallery could not open. Use Back to gallery to try again.'; }
	}

	/** Empty and partial matchups belong in the gallery, never a second setup screen. */
	function hasMatchup(): boolean {
		const fields = parseSeriesHash(location.hash);
		if (fields?.['team-a'].link && fields['team-b'].link) {
			session.fields = fields;
			return true;
		}
		session.cancel();
		void goto(`/seasons${fields ? location.hash : ''}`, { replaceState: true });
		return false;
	}

	$effect(() => {
		if (session.phase === 'results') void tick().then(() => document.getElementById('series-heading')?.focus());
	});

	onMount(() => {
		if (hasMatchup()) void session.initialize();
		const onHash = () => {
			copyStatus = '';
			if (hasMatchup() && session.manifest) void session.openHash();
		};
		addEventListener('hashchange', onHash);
		return () => {
			removeEventListener('hashchange', onHash);
			session.destroy();
		};
	});
</script>

<svelte:head>
	<title>Best-of-five | My teams | 162-0</title>
	<meta name="description" content="Replay a shared 162-0 best-of-five. Both teams' regular seasons determine home-field advantage." />
</svelte:head>

<main class="page">
	{#if session.phase === 'results' && session.result && session.manifest && session.profiles && session.drafts}
		<SeriesResults result={session.result} manifest={session.manifest} profiles={session.profiles} drafts={session.drafts} copyStatus={copyStatus || session.historyNotice} onCopy={() => void copySeries()} onAgain={() => void gallery()} />
	{:else}
		<h1>Best-of-five</h1>
		<p class="lede muted">Both regular seasons replay for seeding. The better record hosts Games 1, 2 and 5.</p>
		{#if session.running}
			<SeriesProgress stage={session.stage} progress={session.progress} onCancel={() => void gallery(true)} />
		{:else if checking}
			<p class="muted" role="status">Checking the matchup and loading exact seasons…</p>
			<button class="secondary" onclick={() => void gallery(true)}>Cancel series</button>
		{:else}
			<div class="errors" role="alert">
				{#if session.error}<p>{session.error}</p>{/if}
				{#if session.fieldErrors['team-a']}<p>Team A: {session.fieldErrors['team-a']}</p>{/if}
				{#if session.fieldErrors['team-b']}<p>Team B: {session.fieldErrors['team-b']}</p>{/if}
			</div>
			<div class="actions">
				<button class="primary" onclick={() => void (session.manifest ? session.play() : session.initialize())}>Retry series</button>
				<a class="button secondary" href={`/seasons${session.seriesHash()}`}>Edit replay challenge</a>
				<a href="/seasons">Back to gallery</a>
			</div>
		{/if}
	{/if}
</main>

<style>
	.page { display: grid; gap: var(--space-6); width: min(100%, 84rem); padding-block: var(--space-8); min-width: 0; }
	h1 { margin: 0; font-size: var(--text-3xl); letter-spacing: -.03em; }
	.lede { margin: calc(-1 * var(--space-2)) 0 0; max-width: 68ch; }
	.errors { color: var(--error); }
	.errors p { margin: 0; }
	.actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-4); }
</style>
