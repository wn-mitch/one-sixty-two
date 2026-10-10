<script lang="ts">
	import { onMount, tick } from 'svelte';
	import SeriesResults from '#lib/components/SeriesResults.svelte';
	import SeriesSetup from '#lib/components/SeriesSetup.svelte';
	import { copyShareLink } from '#lib/game/share.ts';
	import { SeriesSession } from '#lib/game/series-session.svelte.ts';
	import type { SeriesTeamId } from '#lib/sim/series-types.ts';

	const session = new SeriesSession();
	const TEAMS: { id: SeriesTeamId; label: string }[] = [{ id: 'team-a', label: 'Team A' }, { id: 'team-b', label: 'Team B' }];
	let copyStatus = $state('');

	async function play(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		copyStatus = '';
		await session.play();
		await tick();
		const firstError = TEAMS.find(team => session.fieldErrors[team.id]);
		if (firstError) document.getElementById(`${firstError.id}-link`)?.focus();
	}

	async function copySeries(): Promise<void> {
		const link = `${location.origin}/h2h${session.seriesHash()}`;
		try {
			await copyShareLink(link);
			copyStatus = 'Series link copied. Anyone who opens it replays the same games.';
		} catch { copyStatus = `Copy this series link: ${link}`; }
	}

	function again(): void {
		copyStatus = '';
		session.reset();
	}

	$effect(() => {
		if (session.phase === 'results') void tick().then(() => document.getElementById('series-heading')?.focus());
	});

	onMount(() => {
		void session.initialize();
		const onHash = () => { copyStatus = ''; void session.openHash(); };
		addEventListener('hashchange', onHash);
		return () => {
			removeEventListener('hashchange', onHash);
			session.destroy();
		};
	});
</script>

<svelte:head>
	<title>Head-to-head | 162-0</title>
	<meta name="description" content="Pit two drafted 162-0 teams against each other in a best-of-five series." />
</svelte:head>

<main class="page">
	{#if session.phase === 'results' && session.result && session.manifest && session.profiles && session.drafts}
		<SeriesResults result={session.result} manifest={session.manifest} profiles={session.profiles} drafts={session.drafts} copyStatus={copyStatus || session.historyNotice} onCopy={() => void copySeries()} onAgain={again} />
	{:else}
		<a class="back-link" href="/seasons">← My seasons</a>
		<h1>Head-to-head</h1>
		<p class="lede muted">Paste two replay links. Both regular seasons replay to set the seeds; the better record hosts games 1, 2 and 5 of a best-of-five in its home stadium.</p>
		<SeriesSetup fields={session.fields} fieldErrors={session.fieldErrors} library={session.library} running={session.running} loading={session.loading} error={session.error} stage={session.stage} progress={session.progress} onChoose={(id, entry) => session.choose(id, entry)} onSubmit={event => void play(event)} onCancel={() => session.cancel()} />
	{/if}
</main>

<style>
	.page { display: grid; gap: var(--space-4); width: min(100%, 56rem); padding-block: var(--space-8); min-width: 0; }
	.back-link { color: var(--muted); font-weight: 700; text-decoration: none; }
	h1 { margin: 0; font-size: clamp(2rem, 6vw, 3rem); letter-spacing: -.03em; }
	.lede { margin: 0; max-width: 60ch; }
</style>
