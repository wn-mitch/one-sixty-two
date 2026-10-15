<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import SeasonLibrary from '#lib/components/SeasonLibrary.svelte';
	import DraftRunHistory from '#lib/components/DraftRunHistory.svelte';
	import SeriesSetup from '#lib/components/SeriesSetup.svelte';
	import { SeriesSession } from '#lib/game/series-session.svelte.ts';
	import { parseSeriesHash } from '#lib/game/replay-link.ts';
	import type { SeriesTeamId } from '#lib/sim/series-types.ts';
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
	let replay = $state(false);
	let selectedKeys = $state<string[]>([]);
	let challenge = $state.raw(new SeriesSession());
	const TEAMS: SeriesTeamId[] = ['team-a', 'team-b'];

	function newChallenge(): SeriesSession {
		challenge.destroy();
		challenge = new SeriesSession();
		challenge.manifest = manifest;
		challenge.loading = false;
		return challenge;
	}

	async function focusChallenge(): Promise<void> {
		await tick();
		if (replay) document.getElementById('replay-heading')?.focus();
	}

	async function useReplay(selected: readonly LibraryView[]): Promise<void> {
		selectedKeys = selected.map(entry => entry.key);
		const session = newChallenge();
		replay = true;
		void focusChallenge();
		await Promise.all(selected.filter(entry => entry.status === 'playable').slice(0, 2).map((entry, index) => session.choose(TEAMS[index], entry)));
	}

	async function restoreChallenge(): Promise<void> {
		if (!manifest) return;
		if (!parseSeriesHash(location.hash)) {
			challenge.destroy();
			replay = false;
			return;
		}
		const session = newChallenge();
		replay = true;
		await session.openHash(false);
		if (session !== challenge || !replay) return;
		selectedKeys = TEAMS.flatMap(id => {
			const entry = entries.find(entry => session.clubs[id]?.canonical === `/#replay=${entry.token}`);
			return entry ? [entry.key] : [];
		});
		void focusChallenge();
	}

	function backToGallery(): void {
		challenge.destroy();
		replay = false;
		window.history.replaceState(window.history.state, '', location.pathname);
	}

	async function play(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const session = challenge;
		const ready = await Promise.all(TEAMS.map(id => session.clubs[id] ? true : session.validate(id)));
		if (session !== challenge || !replay) return;
		if (ready.some(value => !value)) {
			await tick();
			const firstError = TEAMS.find(id => session.fieldErrors[id]);
			if (firstError) document.getElementById(`${firstError}-link`)?.focus();
			return;
		}
		try { await goto(`/h2h${session.seriesHash()}`); }
		catch { session.error = 'The series could not open. Please retry.'; }
	}

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
		let live = true;
		const onHash = () => { void restoreChallenge(); };
		addEventListener('hashchange', onHash);
		loadManifest()
			.then(async value => {
				if (!live) return;
				manifest = value;
				await refresh();
				if (live) await restoreChallenge();
			})
			.catch(caught => { error = caught instanceof Error ? caught.message : 'The game data could not be loaded.'; })
			.finally(() => { loading = false; if (live && replay) void focusChallenge(); });
		return () => {
			live = false;
			removeEventListener('hashchange', onHash);
			challenge.destroy();
		};
	});
</script>

<svelte:head>
	<title>{replay ? 'Replay challenge' : 'Team gallery'} | 162-0</title>
	<meta name="description" content="Inspect saved 162-0 teams, choose two for a best-of-five, or challenge a replay link." />
</svelte:head>

<main class="page">
	<header class="intro"><h1>Team gallery</h1></header>
	{#if loading}
		<p class="muted" role="status">Loading your seasons…</p>
	{:else if error}
		<p class="error" role="alert">{error}</p>
	{:else if replay}
		<div class="replay-heading">
			<button class="secondary" onclick={backToGallery}>Back to gallery</button>
			<h2 id="replay-heading" tabindex="-1">Replay challenge</h2>
			<p class="muted">Use two replay links, or add an opponent to your selected team. Both seasons replay for seeding.</p>
		</div>
		<SeriesSetup
			fields={challenge.fields}
			fieldErrors={challenge.fieldErrors}
			clubs={challenge.clubs}
			clubStatus={challenge.clubStatus}
			{manifest}
			loading={challenge.loading}
			error={challenge.error}
			onValidate={id => challenge.validate(id)}
			onChange={id => challenge.change(id)}
			onSubmit={event => void play(event)}
		/>
	{:else}
		<SeasonLibrary {entries} {history} {profiles} {manifest} {status} initialSelection={selectedKeys} onReplay={selected => void useReplay(selected)} onCopy={entry => void copyChallenge(entry)} onRename={rename} onDelete={remove} />
		{#if manifest}<DraftRunHistory {manifest} />{/if}
	{/if}
</main>

<style>
	.page { display: grid; gap: var(--space-4); width: min(100%, 84rem); padding-block: var(--space-8); }
	h1 { margin: 0; font-size: clamp(2rem, 6vw, 3rem); letter-spacing: -.03em; }
	.replay-heading { display: grid; justify-items: start; gap: var(--space-3); }
	.replay-heading h2, .replay-heading p { margin: 0; }
</style>
