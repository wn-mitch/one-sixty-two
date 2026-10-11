<script lang="ts">
	import { onMount } from 'svelte';
	import SeasonLibrary from '#lib/components/SeasonLibrary.svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { loadDraftProfiles, loadManifest } from '#lib/game/data.ts';
	import { deleteSeason, loadLibrary, renameSeason, STORAGE_NOTICE, type LibraryView } from '#lib/game/library.ts';
	import { deviceDb } from '#lib/storage/db.ts';
	import { copyShareLink, decodeReplay, storeReplay } from '#lib/game/share.ts';
	import { loadSeriesHistory, type SeriesRecord } from '#lib/game/series-history.ts';
	import type { Manifest, Profile } from '#lib/game/types.ts';

	let manifest = $state.raw<Manifest | null>(null);
	let entries = $state.raw<LibraryView[]>([]);
	let history = $state.raw<SeriesRecord[]>([]);
	const profiles = new SvelteMap<string, readonly Profile[]>();
	let loading = $state(true);
	let error = $state('');
	let status = $state('');

	async function refresh(): Promise<void> {
		const current = manifest;
		if (!current) return;
		try {
			const device = await deviceDb();
			const library = await loadLibrary(device.db, current);
			entries = library.entries;
			if (library.notice ?? device.notice) status = (library.notice ?? device.notice)!;
			history = await loadSeriesHistory(device.db);
		} catch { status = STORAGE_NOTICE; }
		void loadCards();
	}

	/** Loads each playable club's season profiles, one club at a time, so tiles fill in with cards. */
	async function loadCards(): Promise<void> {
		if (!manifest) return;
		for (const entry of entries) {
			if (entry.status !== 'playable' || profiles.has(entry.key)) continue;
			try { profiles.set(entry.key, await loadDraftProfiles(manifest, decodeReplay(entry.token, manifest))); }
			catch { /* the tile keeps its slot placeholders */ }
		}
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

	async function rename(entry: LibraryView, nickname: string): Promise<void> {
		let notice: string | null;
		try { notice = await renameSeason((await deviceDb()).db, entry.key, nickname); }
		catch { notice = STORAGE_NOTICE; }
		status = notice ?? (nickname.trim() ? `Renamed to ${nickname.trim()}.` : 'Nickname cleared.');
		await refresh();
	}

	async function remove(entry: LibraryView): Promise<void> {
		let notice: string | null;
		try { notice = await deleteSeason((await deviceDb()).db, entry.key); }
		catch { notice = STORAGE_NOTICE; }
		status = notice ?? 'Season deleted.';
		await refresh();
	}

	onMount(() => {
		loadManifest()
			.then(value => { manifest = value; return refresh(); })
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
	<header class="intro">
		<div>
			<h1>My seasons</h1>
			<p class="lede muted">Every season you finish is saved in this browser. Pick a club for its cards and stats, or pick two for the tale of the tape and a best-of-five.</p>
		</div>
		<nav class="side-links" aria-label="Related">
			<a class="h2h-link" href="/collection">Collection →</a>
			<a class="h2h-link" href="/h2h">Head-to-head with any replay link →</a>
		</nav>
	</header>
	{#if loading}
		<p class="muted" role="status">Loading your seasons…</p>
	{:else if error}
		<p class="error" role="alert">{error}</p>
	{:else}
		<SeasonLibrary {entries} {history} {profiles} {manifest} {status} onCopy={entry => void copyChallenge(entry)} onRename={rename} onDelete={remove} />
	{/if}
</main>

<style>
	.page { display: grid; gap: var(--space-4); width: min(100%, 84rem); padding-block: var(--space-8); }
	.back-link { color: var(--muted); font-weight: 700; text-decoration: none; }
	h1 { margin: 0; font-size: clamp(2rem, 6vw, 3rem); letter-spacing: -.03em; }
	.lede { margin: 0; max-width: 52ch; }
	.intro { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: var(--space-2) var(--space-6); }
	.side-links { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); }
	.h2h-link { color: var(--muted); font-size: var(--text-sm); font-weight: 650; }
	.h2h-link:hover { color: var(--text); }
</style>
