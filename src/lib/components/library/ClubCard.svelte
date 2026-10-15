<script module lang="ts">
	import type { CardViewModel } from '../../cards/view-model.ts';
	import type { SeasonGrade } from '../../game/grade.ts';

	export interface ClubCardStar { seasonId: string; view: CardViewModel }
	export interface ClubCardRosterItem { seasonId: string; label: string }
	export interface ClubCardStat { label: string; value: string; primary?: boolean }
</script>

<script lang="ts">
	import { fit } from '../../cards/fit.ts';
	import { STOCK, roles } from '../../cards/tokens.ts';
	import GradeBadge from '../GradeBadge.svelte';

	let {
		title,
		parkName,
		recordLabel,
		grade = null,
		stats,
		footer,
		roster,
		stars = [],
		retired = false
	}: {
		title: string;
		parkName: string;
		recordLabel: string;
		grade?: SeasonGrade | null;
		stats: readonly ClubCardStat[];
		footer: string;
		roster: readonly ClubCardRosterItem[];
		stars?: readonly ClubCardStar[];
		retired?: boolean;
	} = $props();

	/** The collage is a 3×3 grid whose first cell spans 2×2. */
	const CELLS = 6;
	const NEUTRAL = roles({ primary: '#59636f', secondary: STOCK });
	const k = $derived(stars[0]?.view.k ?? NEUTRAL);
	const cells = $derived.by(() => {
		const shown = stars.slice(0, CELLS).map(({ seasonId, view }) => ({ seasonId, label: view.pos, photo: view.hasPhoto ? view.photo : '' }));
		const taken = new Set(shown.map(cell => cell.seasonId));
		const rest = roster.filter(pick => !taken.has(pick.seasonId)).map(pick => ({ seasonId: pick.seasonId, label: pick.label, photo: '' }));
		return [...shown, ...rest].slice(0, CELLS);
	});
	const colors = $derived(Object.entries(k).map(([role, color]) => `--${role}:${color}`).join(';'));
</script>

<span class="frame" class:retired>
	<span class="card" data-card="club" style={colors} use:fit>
		<span class="collage" aria-hidden="true">
			{#each cells as cell (cell.seasonId)}
				<span class="cell">
					{#if cell.photo}<img src={cell.photo} alt="" loading="lazy" />{:else}<span class="slot">{cell.label}</span>{/if}
				</span>
			{/each}
			<span class="record">{recordLabel}{#if grade}<span class="grade"><GradeBadge {grade} /></span>{/if}</span>
		</span>
		<span class="title" use:fit={{ max: 12, min: 7, wrapMin: 6, lines: 2, maxH: 15 }} data-fit data-max="12" data-min="7" data-wrap-min="6" data-lines="2" data-max-h="15">{title}</span>
		<span class="park"><span class="dash" aria-hidden="true"></span>{parkName}</span>
		<span class="stats">
			{#each stats as stat (stat.label)}
				<span class="stat" class:primary={stat.primary}><span class="label">{stat.label}</span> <span class="value">{stat.value}</span></span>
			{/each}
		</span>
		<span class="footer">
			<span>{retired ? 'Retired · ' : ''}{footer}</span>
			<span class="brand">162-0</span>
		</span>
	</span>
</span>

<style>
	.frame { display: block; container-type: inline-size; width: 100%; }
	.retired .collage { filter: grayscale(1) contrast(.9); }
	.card {
		display: flex;
		flex-direction: column;
		aspect-ratio: 5 / 7;
		padding: 4cqw 4cqw 3.6cqw;
		border-radius: 1.8cqw;
		background: var(--dark);
		color: var(--paper);
		font-family: 'Barlow Condensed', sans-serif;
		box-shadow: 0 .5rem 1.2rem rgb(0 0 0 / .32);
		overflow: hidden;
	}
	.collage {
		position: relative;
		flex: 1 1 auto;
		min-height: 0;
		display: grid;
		grid-template: repeat(3, 1fr) / repeat(3, 1fr);
		gap: .8cqw;
		background: var(--dark);
		clip-path: polygon(0 0, 100% 0, 100% calc(100% - 9cqw), calc(100% - 14cqw) 100%, 0 100%);
	}
	.cell { position: relative; min-width: 0; min-height: 0; overflow: hidden; background: repeating-linear-gradient(135deg, rgba(255,255,255,.07) 0 1.1cqw, rgba(0,0,0,0) 1.1cqw 2.2cqw), var(--raised); }
	.cell:first-child { grid-area: 1 / 1 / span 2 / span 2; }
	.cell img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 22%; }
	.slot { position: absolute; inset: 0; display: grid; place-items: center; color: var(--onRaised); font-weight: 800; font-size: 5cqw; letter-spacing: .08em; }
	.cell:first-child .slot { font-size: 9cqw; }
	.grade { margin-left: 2cqw; font-size: .85em; vertical-align: .08em; }
	.record {
		position: absolute;
		left: 0;
		bottom: 0;
		padding: 1.4cqw 5cqw 1.2cqw 2.6cqw;
		background: var(--field);
		color: var(--onField);
		clip-path: polygon(0 0, calc(100% - 2.6cqw) 0, 100% 100%, 0 100%);
		font-weight: 800;
		font-size: 7cqw;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	.title { display: block; flex: none; margin-top: 2.8cqw; width: 100%; font-weight: 900; font-style: italic; font-size: 12cqw; line-height: .88; text-transform: uppercase; white-space: nowrap; text-wrap: balance; }
	.park { flex: none; display: flex; align-items: center; gap: 1.8cqw; margin-top: 1.4cqw; min-width: 0; color: var(--tintOnDark); font-weight: 700; font-size: 4.4cqw; line-height: 1; letter-spacing: .1em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.dash { flex: none; width: 5cqw; height: 1.1cqw; background: currentColor; transform: skewX(-30deg); }
	.stats { flex: none; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 1.4cqw; margin-top: 3.4cqw; }
	.stat { display: flex; flex-direction: column; justify-content: flex-end; gap: .8cqw; padding: 1.8cqw 2.4cqw 2cqw; background: var(--raised); clip-path: polygon(0 0, calc(100% - 2.6cqw) 0, 100% 2.6cqw, 100% 100%, 0 100%); }
	.stat.primary { background: var(--field); color: var(--onField); }
	.label { font-weight: 700; font-size: 3.2cqw; line-height: 1; letter-spacing: .06em; text-transform: uppercase; }
	.value { font-weight: 800; font-size: 8cqw; line-height: .85; font-variant-numeric: tabular-nums; white-space: nowrap; }
	.footer { flex: none; display: flex; justify-content: space-between; align-items: baseline; gap: 2cqw; margin-top: 2.4cqw; color: var(--mutedOnDark); font-weight: 600; font-size: 3cqw; line-height: 1; letter-spacing: .07em; text-transform: uppercase; }
	.brand { color: var(--paper); font-weight: 800; font-style: italic; font-size: 3.6cqw; letter-spacing: 0; text-transform: none; }
</style>
