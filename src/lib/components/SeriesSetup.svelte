<script lang="ts">
	import { onMount } from 'svelte';
	import { createCardViewModel, type CardMediaStatus } from '../cards/view-model.ts';
	import { seasonGrade } from '../game/grade.ts';
	import type { LibraryView } from '../game/library.ts';
	import { stars as starSeasons, teamTitle } from '../game/library-stats.ts';
	import type { SeriesClub, SeriesClubStatus } from '../game/series-session.svelte.ts';
	import type { Manifest } from '../game/types.ts';
	import type { SeriesField } from '../game/replay-link.ts';
	import { loadMedia } from '../media/client.ts';
	import type { MediaManifest } from '../media/types.ts';
	import { loadRankings } from '../rankings/client.ts';
	import type { WarRankings } from '../rankings/types.ts';
	import type { SeriesTeamId } from '../sim/series-types.ts';
	import ClubCard from './library/ClubCard.svelte';
	import SeriesRosterRail, { type SeriesRosterCard } from './h2h/SeriesRosterRail.svelte';

	let { fields, fieldErrors, clubs, clubStatus, library, manifest, running, loading, error, stage, progress, onChoose, onValidate, onChange, onSubmit, onCancel }: {
		fields: Record<SeriesTeamId, SeriesField>;
		fieldErrors: Record<SeriesTeamId, string>;
		clubs: Record<SeriesTeamId, SeriesClub | null>;
		clubStatus: Record<SeriesTeamId, SeriesClubStatus>;
		library: readonly LibraryView[];
		manifest: Manifest | null;
		running: boolean;
		loading: boolean;
		error: string;
		stage: string;
		progress: Record<SeriesTeamId | 'series', number>;
		onChoose: (id: SeriesTeamId, entry: LibraryView) => void | Promise<void>;
		onValidate: (id: SeriesTeamId) => void | Promise<unknown>;
		onChange: (id: SeriesTeamId) => void;
		onSubmit: (event: SubmitEvent) => void;
		onCancel: () => void;
	} = $props();

	const TEAMS: { id: SeriesTeamId; label: string }[] = [{ id: 'team-a', label: 'Team A' }, { id: 'team-b', label: 'Team B' }];
	const entryLabel = (entry: LibraryView) =>
		`${entry.nickname ? `${entry.nickname} · ` : ''}${entry.record.wins}–${entry.record.losses}${entry.stadium ? ` · ${entry.stadium.name}` : ''}`;

	let selectedKeys = $state<Record<SeriesTeamId, string>>({ 'team-a': '', 'team-b': '' });
	let media = $state.raw<MediaManifest | null>(null);
	let mediaStatus = $state<CardMediaStatus>('loading');
	let rankings = $state.raw<WarRankings | null>(null);
	$effect(() => {
		const version = manifest?.dataVersion;
		let live = true;
		rankings = null;
		if (version) void loadRankings(version).then(value => { if (live) rankings = value; }).catch(() => {});
		return () => { live = false; };
	});

	onMount(() => {
		let live = true;
		loadMedia().then(value => {
			if (live) {
				media = value;
				mediaStatus = 'ready';
			}
		}).catch(() => {
			if (live) mediaStatus = 'unavailable';
		});
		return () => { live = false; };
	});

	const presentations = $derived.by(() => {
		const output = new Map<SeriesTeamId, {
			title: string;
			recordLabel: string;
			grade: ReturnType<typeof seasonGrade>;
			stats: { label: string; value: string; primary?: boolean }[];
			footer: string;
			roster: SeriesRosterCard[];
			stars: { seasonId: string; view: SeriesRosterCard['view'] }[];
		}>();
		if (!manifest) return output;
		for (const team of TEAMS) {
			const club = clubs[team.id];
			if (!club) continue;
			const slots = new Map(club.draft.picks.map(pick => [pick.seasonId, pick.slot]));
			const roster = club.profiles.flatMap(profile => {
				const slot = slots.get(profile.seasonId);
				return slot ? [{ seasonId: profile.seasonId, slot, view: createCardViewModel({ profile, slot, manifest, media, mediaStatus, rankings }) }] : [];
			});
			const bySeason = new Map(roster.map(item => [item.seasonId, item]));
			const featured = club.entry ? starSeasons(club.entry, 6) : club.draft.picks.slice(0, 6).map(pick => pick.seasonId);
			const cardStars = featured.flatMap(seasonId => {
				const item = bySeason.get(seasonId);
				return item ? [{ seasonId, view: item.view }] : [];
			});
			const saved = club.entry;
			const differential = saved ? saved.runs.scored - saved.runs.allowed : 0;
			output.set(team.id, {
				title: saved ? teamTitle(saved) : fields[team.id].name.trim() || team.label,
				recordLabel: saved ? `${saved.record.wins}–${saved.record.losses}` : 'Replay ready',
				grade: saved ? seasonGrade(saved.record.wins, saved.record.losses) : null,
				stats: saved
					? [
						{ label: 'Runs', value: `${differential > 0 ? '+' : differential < 0 ? '−' : ''}${Math.abs(differential)}`, primary: true },
						{ label: 'Win %', value: (saved.record.wins / Math.max(1, saved.record.wins + saved.record.losses)).toFixed(3).replace(/^0/, '') }
					]
					: [{ label: 'Roster', value: `${roster.length}`, primary: true }, { label: 'Source', value: 'Replay' }],
				footer: saved ? 'Saved season' : 'Validated replay',
				roster,
				stars: cardStars
			});
		}
		return output;
	});

	async function choose(id: SeriesTeamId, event: Event): Promise<void> {
		const select = event.currentTarget as HTMLSelectElement;
		selectedKeys[id] = select.value;
		const entry = library.find(item => item.key === select.value);
		if (entry) await onChoose(id, entry);
	}

	function validateChoice(id: SeriesTeamId): void {
		const entry = library.find(item => item.key === selectedKeys[id]);
		if (entry) void onChoose(id, entry);
		else void onValidate(id);
	}
</script>

<form class="setup" onsubmit={onSubmit} novalidate>
	<div class="matchup">
		{#each TEAMS as team (team.id)}
			{@const club = clubs[team.id]}
			{@const presentation = presentations.get(team.id)}
			<section class="side" aria-labelledby={`${team.id}-heading`} aria-busy={clubStatus[team.id] === 'pending'}>
				<header class="side-heading">
					<div>
						<p>{team.label}</p>
						<h2 id={`${team.id}-heading`}>{presentation?.title ?? 'Choose a club'}</h2>
					</div>
					{#if club}
						<button class="quiet" type="button" disabled={running} onclick={() => { selectedKeys[team.id] = ''; onChange(team.id); }}>Change team</button>
					{/if}
				</header>

				{#if club && presentation}
					<div class="chosen-club">
						<div class="club-card">
							<ClubCard
								title={presentation.title}
								parkName={club.stadiumName}
								recordLabel={presentation.recordLabel}
								grade={presentation.grade}
								stats={presentation.stats}
								footer={presentation.footer}
								roster={club.draft.picks.map(pick => ({ seasonId: pick.seasonId, label: pick.slot }))}
								stars={presentation.stars}
							/>
						</div>
						<SeriesRosterRail title={presentation.title} items={presentation.roster} />
					</div>
				{:else}
					<fieldset disabled={running || loading || clubStatus[team.id] === 'pending'}>
						<legend class="sr-only">{team.label} selection</legend>
						{#if library.length}
							<label for={`${team.id}-library`}>Choose from my seasons</label>
							<select id={`${team.id}-library`} value={selectedKeys[team.id]} onchange={event => void choose(team.id, event)}>
								<option value="">Pick a saved season…</option>
								{#each library as entry (entry.key)}<option value={entry.key}>{entryLabel(entry)}</option>{/each}
							</select>
							<p class="or"><span>or use a replay</span></p>
						{/if}
						<label for={`${team.id}-link`}>{team.label} replay link</label>
						<input
							id={`${team.id}-link`}
							type="url"
							inputmode="url"
							autocomplete="off"
							placeholder="https://…/r/…"
							bind:value={fields[team.id].link}
							aria-invalid={fieldErrors[team.id] ? 'true' : undefined}
							aria-describedby={fieldErrors[team.id] ? `${team.id}-error` : undefined}
						/>
						<label for={`${team.id}-name`}>Club name <span class="muted">(optional)</span></label>
						<input id={`${team.id}-name`} maxlength="40" placeholder={team.label} bind:value={fields[team.id].name} />
						{#if fieldErrors[team.id]}<p id={`${team.id}-error`} class="field-error">{fieldErrors[team.id]}</p>{/if}
						{#if clubStatus[team.id] === 'pending'}
							<p class="pending" role="status">Checking replay and loading exact seasons…</p>
						{:else}
							<button type="button" class="secondary use-replay" aria-label={selectedKeys[team.id] ? `Retry ${team.label} saved season` : `Use ${team.label} replay`} disabled={!fields[team.id].link.trim()} onclick={() => validateChoice(team.id)}>{selectedKeys[team.id] ? 'Retry saved season' : 'Use replay'}</button>
						{/if}
					</fieldset>
				{/if}
			</section>
		{/each}
	</div>

	<div class="action-area">
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		{#if running}
			<div class="run-status" role="status" aria-live="polite">
				<strong>{stage}</strong>
				<div class="meters">
					<label>Team A season <progress max="162" value={progress['team-a']}></progress><span>{progress['team-a']}/162</span></label>
					<label>Team B season <progress max="162" value={progress['team-b']}></progress><span>{progress['team-b']}/162</span></label>
					<label>Series <progress max="5" value={progress.series}></progress><span>{progress.series}/5</span></label>
				</div>
			</div>
			<button type="button" class="secondary" onclick={onCancel}>Cancel series</button>
		{:else}
			<div>
				<button class="primary play" type="submit" disabled={loading || TEAMS.some(team => clubStatus[team.id] === 'pending' || (!clubs[team.id] && !fields[team.id].link.trim()))}>Play best-of-five</button>
				{#if stage}<p class="muted status" role="status">{stage}</p>{/if}
			</div>
		{/if}
	</div>
</form>

<style>
	.setup { display: grid; gap: var(--space-8); min-width: 0; }
	.matchup { display: grid; gap: var(--space-5); min-width: 0; }
	.side { display: grid; gap: var(--space-4); min-width: 0; padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); }
	.side-heading { display: flex; align-items: start; justify-content: space-between; gap: var(--space-3); }
	.side-heading p, .side-heading h2 { margin: 0; }
	.side-heading p { color: var(--muted); font-size: var(--text-xs); font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
	.side-heading h2 { margin-top: var(--space-1); font-size: var(--text-xl); line-height: 1.1; overflow-wrap: anywhere; }
	fieldset { display: grid; gap: var(--space-2); min-width: 0; margin: 0; padding: 0; border: 0; }
	label { font-size: var(--text-sm); font-weight: 650; }
	label:not(:first-of-type) { margin-top: var(--space-2); }
	input, select { width: 100%; min-height: 44px; }
	.field-error, .pending, .error, .status { margin: 0; }
	.field-error, .error { color: var(--error); }
	.field-error, .pending, .status { font-size: var(--text-sm); }
	.pending { color: var(--muted); }
	.or { display: flex; align-items: center; gap: var(--space-3); margin: var(--space-2) 0 0; color: var(--muted); font-size: var(--text-xs); text-transform: uppercase; }
	.or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--border); }
	.use-replay { justify-self: start; margin-top: var(--space-2); }
	.chosen-club { display: grid; gap: var(--space-5); min-width: 0; }
	.club-card { width: min(12rem, 62vw); }
	.action-area { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: var(--space-4); padding: var(--space-5); border-block: 1px solid var(--border); background: var(--surface); }
	.play { min-width: min(100%, 16rem); }
	.run-status { display: grid; flex: 1 1 34rem; gap: var(--space-3); min-width: 0; }
	.meters { display: grid; gap: var(--space-2); }
	.meters label { display: grid; grid-template-columns: 7rem minmax(6rem, 1fr) 3.5rem; align-items: center; gap: var(--space-2); color: var(--muted); font-size: var(--text-xs); }
	.meters progress { width: 100%; accent-color: var(--accent); }
	.meters span { text-align: right; font-variant-numeric: tabular-nums; }
	@media (min-width: 48rem) {
		.matchup { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.side { padding: var(--space-5); }
		.club-card { width: 13rem; }
	}
	@media (min-width: 72rem) {
		.chosen-club { grid-template-columns: 13rem minmax(0, 1fr); align-items: start; }
	}
</style>
