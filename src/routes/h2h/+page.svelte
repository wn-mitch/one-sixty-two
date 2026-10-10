<script lang="ts">
	import { onMount, tick } from 'svelte';
	import SeriesResults from '#lib/components/SeriesResults.svelte';
	import { copyShareLink } from '#lib/game/share.ts';
	import { SeriesSession } from '#lib/game/series-session.svelte.ts';
	import type { SeriesTeamId } from '#lib/sim/series-types.ts';

	const session = new SeriesSession();
	const TEAMS: { id: SeriesTeamId; label: string }[] = [{ id: 'team-a', label: 'Team A' }, { id: 'team-b', label: 'Team B' }];
	let copyStatus = $state('');

	const entryLabel = (entry: (typeof session.library)[number]) =>
		`${entry.nickname ? `${entry.nickname} · ` : ''}${entry.record.wins}–${entry.record.losses}${entry.stadium ? ` · ${entry.stadium.name}` : ''}`;

	function choose(id: SeriesTeamId, event: Event): void {
		const select = event.currentTarget as HTMLSelectElement;
		const entry = session.library.find(item => item.key === select.value);
		if (entry) session.choose(id, entry);
		select.value = '';
	}

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
		<SeriesResults result={session.result} manifest={session.manifest} profiles={session.profiles} drafts={session.drafts} {copyStatus} onCopy={() => void copySeries()} onAgain={again} />
	{:else}
		<a class="back-link" href="/seasons">← My seasons</a>
		<h1>Head-to-head</h1>
		<p class="lede muted">Paste two replay links. Both regular seasons replay to set the seeds; the better record hosts games 1, 2 and 5 of a best-of-five in its home stadium.</p>
		{#if session.error}<p class="error" role="alert">{session.error}</p>{/if}
		<form class="setup" onsubmit={play} novalidate>
			{#each TEAMS as team (team.id)}
				<fieldset disabled={session.running || session.loading}>
					<legend>{team.label}</legend>
					<label for={`${team.id}-link`}>{team.label} replay link</label>
					<input
						id={`${team.id}-link`}
						type="url"
						inputmode="url"
						autocomplete="off"
						placeholder="https://…/r/…"
						bind:value={session.fields[team.id].link}
						aria-invalid={session.fieldErrors[team.id] ? 'true' : undefined}
						aria-describedby={session.fieldErrors[team.id] ? `${team.id}-error` : undefined}
					/>
					{#if session.fieldErrors[team.id]}<p id={`${team.id}-error`} class="field-error">{session.fieldErrors[team.id]}</p>{/if}
					{#if session.library.length}
						<label for={`${team.id}-library`}>Choose from my seasons</label>
						<select id={`${team.id}-library`} onchange={event => choose(team.id, event)}>
							<option value="">Pick a saved season…</option>
							{#each session.library as entry (entry.key)}<option value={entry.key}>{entryLabel(entry)}</option>{/each}
						</select>
					{/if}
					<label for={`${team.id}-name`}>Team name <span class="muted">(optional)</span></label>
					<input id={`${team.id}-name`} maxlength="40" placeholder={team.label} bind:value={session.fields[team.id].name} />
				</fieldset>
			{/each}
			<div class="actions">
				<button class="primary" type="submit" disabled={session.running || session.loading}>Play best-of-five</button>
				{#if session.running}<button type="button" onclick={() => session.cancel()}>Cancel</button>{/if}
			</div>
		</form>
		<div class="progress" role="status" aria-live="polite">
			{#if session.running}
				<p>{session.stage}</p>
				<p class="muted">Team A season {session.progress['team-a']}/162 · Team B season {session.progress['team-b']}/162{#if session.progress.series} · Series game {session.progress.series}{/if}</p>
			{:else if session.stage}
				<p class="muted">{session.stage}</p>
			{/if}
		</div>
	{/if}
</main>

<style>
	.page { display: grid; gap: var(--space-4); width: min(100%, 56rem); padding-block: var(--space-8); min-width: 0; }
	.back-link { color: var(--muted); font-weight: 700; text-decoration: none; }
	h1 { margin: 0; font-size: clamp(2rem, 6vw, 3rem); letter-spacing: -.03em; }
	.lede { margin: 0; max-width: 60ch; }
	.setup { display: grid; gap: var(--space-4); }
	fieldset { display: grid; gap: var(--space-2); margin: 0; padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); min-width: 0; }
	legend { padding-inline: var(--space-2); font-weight: 800; }
	label { font-size: var(--text-sm); font-weight: 650; }
	label:not(:first-of-type) { margin-top: var(--space-2); }
	input, select { width: 100%; }
	.field-error { margin: 0; color: var(--error); font-size: var(--text-sm); }
	.actions { display: flex; flex-wrap: wrap; gap: var(--space-3); }
	.progress p { margin: var(--space-1) 0; }
	@media (min-width: 48rem) {
		.setup { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.actions { grid-column: 1 / -1; }
	}
</style>
