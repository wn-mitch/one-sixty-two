<script lang="ts">
	import { onMount } from 'svelte';
	import SeasonLibrary from '#lib/components/SeasonLibrary.svelte';
	import { loadManifest } from '#lib/game/data.ts';
	import { deleteSeason, loadLibrary, renameSeason, type LibraryView } from '#lib/game/library.ts';
	import { copyShareLink, decodeReplay, storeReplay } from '#lib/game/share.ts';
	import type { Manifest } from '#lib/game/types.ts';

	let manifest = $state.raw<Manifest | null>(null);
	let entries = $state.raw<LibraryView[]>([]);
	let loading = $state(true);
	let error = $state('');
	let status = $state('');

	function refresh(): void {
		if (!manifest) return;
		try {
			const library = loadLibrary(localStorage, manifest);
			entries = library.entries;
			if (library.notice) status = library.notice;
		} catch { status = 'Your season library is unavailable: browser storage is blocked or full.'; }
	}

	/** Publishes a short `/r/{id}` link; the inline link is the fallback when storage is unreachable. */
	async function copyChallenge(entry: LibraryView): Promise<void> {
		if (!manifest) return;
		status = 'Preparing challenge link…';
		let link = `${location.origin}/#replay=${entry.token}`;
		try { link = (await storeReplay(decodeReplay(entry.token, manifest), location.origin)).replayUrl; }
		catch { /* the inline link needs no server */ }
		try {
			await copyShareLink(link);
			status = 'Challenge link copied.';
		} catch { status = `Copy this challenge link: ${link}`; }
	}

	function rename(entry: LibraryView, nickname: string): void {
		const notice = renameSeason(localStorage, entry.key, nickname);
		status = notice ?? (nickname.trim() ? `Renamed to ${nickname.trim()}.` : 'Nickname cleared.');
		refresh();
	}

	function remove(entry: LibraryView): void {
		const notice = deleteSeason(localStorage, entry.key);
		status = notice ?? 'Season deleted.';
		refresh();
	}

	onMount(() => {
		loadManifest()
			.then(value => { manifest = value; refresh(); })
			.catch(caught => { error = caught instanceof Error ? caught.message : 'The game data could not be loaded.'; })
			.finally(() => { loading = false; });
	});
</script>

<svelte:head>
	<title>My seasons | 162-0</title>
	<meta name="description" content="Completed 162-0 seasons saved on this device." />
</svelte:head>

<main class="page">
	<a class="back-link" href="/">← Back to the draft</a>
	<h1>My seasons</h1>
	<p class="lede muted">Every season you finish is saved in this browser. Send a challenge link to a friend, or pit two of your teams against each other in a best-of-five.</p>
	<a class="button secondary h2h-link" href="/h2h">Set up a head-to-head series</a>
	{#if loading}
		<p class="muted" role="status">Loading your seasons…</p>
	{:else if error}
		<p class="error" role="alert">{error}</p>
	{:else}
		<SeasonLibrary {entries} {status} onCopy={entry => void copyChallenge(entry)} onRename={rename} onDelete={remove} />
	{/if}
</main>

<style>
	.page { display: grid; gap: var(--space-4); width: min(100%, 48rem); padding-block: var(--space-8); }
	.back-link { color: var(--muted); font-weight: 700; text-decoration: none; }
	h1 { margin: 0; font-size: clamp(2rem, 6vw, 3rem); letter-spacing: -.03em; }
	.lede { margin: 0; max-width: 52ch; }
	.h2h-link { justify-self: start; display: inline-flex; align-items: center; text-decoration: none; }
</style>
