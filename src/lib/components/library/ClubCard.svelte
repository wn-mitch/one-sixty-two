<script module lang="ts">
	import type { CardViewModel } from '../../cards/view-model.ts';
	import type { SeasonGrade } from '../../game/grade.ts';

	export interface ClubCardStar { seasonId: string; view: CardViewModel }
	export interface ClubCardRosterItem { seasonId: string; label: string }
	export interface ClubCardStat { label: string; value: string; primary?: boolean }
</script>

<script lang="ts">
	import { fit } from '../../cards/fit.ts';
	import { tilt } from '../../cards/motion.ts';
	import { INK, STOCK, roles } from '../../cards/tokens.ts';
	import { appSettings } from '../../game/settings.svelte.ts';
	import { CLUB_MATERIALS } from './club-card-material.ts';

	let {
		title,
		parkName,
		recordLabel,
		grade = null,
		stats,
		footer,
		roster,
		stars = [],
		retired = false,
		face = 'front',
		interactive = true
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
		face?: 'front' | 'back';
		interactive?: boolean;
	} = $props();

	let root = $state<HTMLSpanElement>();
	let failedPhotos = $state<ReadonlySet<string>>(new Set());
	/** The collage is a 3×3 grid whose first cell spans 2×2. */
	const CELLS = 6;
	const NEUTRAL = roles({ primary: INK, secondary: STOCK });
	const k = $derived(stars[0]?.view.k ?? NEUTRAL);
	const material = $derived(CLUB_MATERIALS[grade ?? 'ungraded']);
	const cells = $derived.by(() => {
		const shown = stars.slice(0, CELLS).map(({ seasonId, view }) => ({ seasonId, label: view.pos, photo: view.hasPhoto ? view.photo : '' }));
		const taken = new Set(shown.map(cell => cell.seasonId));
		const rest = roster.filter(pick => !taken.has(pick.seasonId)).map(pick => ({ seasonId: pick.seasonId, label: pick.label, photo: '' }));
		return [...shown, ...rest].slice(0, CELLS);
	});
	const colors = $derived(Object.entries(k).map(([role, color]) => `--${role}:${color}`).join(';'));
	const tiltOptions = $derived.by(() => ({
		enabled: interactive,
		eventTarget: root?.closest('button') ?? root?.parentElement ?? undefined,
		idle: interactive,
		finish: material.motion,
		identity: `${title}|${recordLabel}|${parkName}`
	}));
</script>

{#snippet seal()}
	<span class="seal" class:perfect={grade === 'Perfect'}>
		<span class="seal-grade">{grade ?? '—'}</span>
	</span>
{/snippet}

{#snippet statistics(compact = false)}
	{#if stats.length}
		<span class="stats">
			{#each stats as stat (stat.label)}
				<span class="stat" class:primary={stat.primary}>
					<span class="label">{stat.label}</span>
					<span class="value" data-fit data-max={compact ? '6.4' : '8'} data-min="4" data-lines="1">{stat.value}</span>
				</span>
			{/each}
		</span>
	{/if}
{/snippet}

{#snippet evidence()}
	<span class="footer">
		<span>{retired ? 'Retired · ' : ''}{footer}</span>
	</span>
{/snippet}
{#snippet brandCorner()}
	<span class="brand-corner"><span class="brand">162-0</span></span>
{/snippet}

<span class="frame" class:retired>
	<span
		bind:this={root}
		class="card"
		data-card="club"
		data-grade={grade ?? 'ungraded'}
		data-face={face}
		data-interactive={interactive}
		data-motion={appSettings.animateCards ? 'on' : 'off'}
		style="{colors};--club-finish:{material.paint}"
		use:tilt={tiltOptions}
		use:fit
	>
		<span class="flipper" class:turned={face === 'back'}>
			<span class="face front" aria-hidden={face !== 'front'}>
				<span class="print">
					<span class="edition">
						<span class="record">{recordLabel}</span>
						{@render seal()}
					</span>
					<span class="collage" aria-hidden="true">
						{#each cells as cell (cell.seasonId)}
							<span class="cell">
								{#if cell.photo && !failedPhotos.has(cell.photo)}
									<img src={cell.photo} alt="" loading="lazy" decoding="async" onerror={() => failedPhotos = new Set([...failedPhotos, cell.photo])} />
								{:else}
									<span class="slot" data-fit data-max="5" data-min="3.2" data-wrap-min="3.2" data-lines="2">{cell.label}</span>
								{/if}
							</span>
						{:else}
							<span class="empty-photo">Roster unavailable</span>
						{/each}
					</span>
					<span class="title" data-fit data-max="12" data-min="7" data-wrap-min="6" data-lines="2" data-max-h="16">{title}</span>
					<span class="park" data-fit data-max="4.8" data-min="3.2" data-wrap-min="3.2" data-lines="2" data-max-h="8">{parkName}</span>
					{@render evidence()}
					{@render statistics()}
					{@render brandCorner()}
				</span>
			</span>
			<span class="face back" aria-hidden={face !== 'back'}>
				<span class="print">
					<span class="edition">
						<span class="record">{recordLabel}</span>
						{@render seal()}
					</span>
					<span class="back-title" data-fit data-max="8" data-min="5.6" data-wrap-min="4.8" data-lines="2" data-max-h="12">{title}</span>
					<span class="park" data-fit data-max="4.8" data-min="3.2" data-wrap-min="3.2" data-lines="2" data-max-h="8">{parkName}</span>
					{@render evidence()}
					{@render statistics(true)}
					<span class="roster-heading"><span>Roster</span><span>{roster.length} selections</span></span>
					<span class="roster" style:grid-template-rows={`repeat(${Math.max(1, Math.ceil(roster.length / 2))}, minmax(0, 1fr))`}>
						{#each roster as pick, index (`${pick.seasonId}:${index}`)}
							<span class="roster-row">
								<span class="roster-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
								<span class="roster-name" data-fit data-max="4" data-min="4" data-wrap-min="3.2" data-lines="2" data-max-h="8">{pick.label}</span>
							</span>
						{:else}
							<span class="empty-roster">No roster was supplied for this club.</span>
						{/each}
					</span>
					{@render brandCorner()}
				</span>
			</span>
		</span>
	</span>
</span>

<style>
	.frame { display: block; container-type: inline-size; width: 100%; }
	.card {
		/* Card-space scale follows the shared 5:7 print system, independent of gallery width. */
		--club-unit: .8cqw;
		--club-gap: calc(var(--club-unit) * 2);
		--club-pad: calc(var(--club-unit) * 4);
		--club-radius: 1.8cqw;
		--club-edge: calc(var(--club-unit) * 2);
		--club-rule: color-mix(in srgb, var(--paper) 24%, transparent);
		--club-shine: color-mix(in srgb, var(--paper) 40%, transparent);
		--club-shade: color-mix(in srgb, var(--ink) 60%, transparent);
		--mx: 68%; --my: 24%; --lx: .36; --ly: -.64; --ang: 218deg;
		display: block;
		position: relative;
		width: 100%;
		aspect-ratio: 5 / 7;
		font-family: 'Barlow Condensed', sans-serif;
		text-align: left;
		perspective: 1200px;
	}
	.flipper { display: block; position: absolute; inset: 0; transform-style: preserve-3d; transition: transform var(--motion-field-flip, 640ms) var(--ease-out, cubic-bezier(.16, 1, .3, 1)); }
	.flipper.turned { transform: rotateY(180deg); }
	.face { display: block; position: absolute; inset: 0; box-sizing: border-box; padding: var(--club-edge); border-radius: var(--club-radius); background: var(--club-finish); backface-visibility: hidden; overflow: hidden; box-shadow: 0 var(--club-unit) var(--club-pad) var(--club-shade), inset 0 0 var(--club-unit) var(--club-shine); }
	.back { transform: rotateY(180deg); }
	.print { position: relative; display: flex; flex-direction: column; box-sizing: border-box; height: 100%; min-width: 0; padding: var(--club-pad); background: var(--dark); color: var(--paper); overflow: hidden; }
	.edition { display: flex; align-items: center; justify-content: space-between; flex: none; gap: var(--club-gap); min-height: 12cqw; margin-bottom: var(--club-gap); }
	.record { font-size: 12cqw; line-height: .9; font-weight: 800; font-variant-numeric: tabular-nums; }
	.seal { position: relative; display: flex; flex: none; flex-direction: column; align-items: center; justify-content: center; width: 14cqw; height: 12cqw; box-sizing: border-box; border: var(--club-unit) double var(--club-shade); outline: 1px solid var(--club-shine); outline-offset: calc(var(--club-unit) * -2); background: var(--club-finish); color: var(--ink); }
	.seal-grade { position: relative; z-index: 1; font-size: 7.8cqw; font-weight: 900; line-height: .9; white-space: nowrap; }
	.seal.perfect .seal-grade { font-size: 3.6cqw; font-style: italic; text-transform: uppercase; }
	.collage { position: relative; flex: 1 1 auto; min-height: 0; display: grid; grid-template: repeat(3, 1fr) / repeat(3, 1fr); gap: var(--club-unit); background: var(--raised); clip-path: polygon(0 0, 100% 0, 100% calc(100% - 8cqw), calc(100% - 12cqw) 100%, 0 100%); }
	.cell { position: relative; min-width: 0; min-height: 0; overflow: hidden; background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--paper) 7%, transparent) 0 var(--club-unit), transparent var(--club-unit) var(--club-gap)), var(--raised); }
	.cell:first-child { grid-area: 1 / 1 / span 2 / span 2; }
	.cell img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 22%; }
	.slot { position: absolute; inset: var(--club-gap); display: grid; place-items: center; color: var(--onRaised); font-weight: 800; font-size: 5cqw; text-align: center; overflow-wrap: anywhere; }
	.empty-photo { grid-area: 1 / 1 / -1 / -1; align-self: center; color: var(--onRaised); font-size: 4.8cqw; text-align: center; }
	.retired .collage { filter: grayscale(1) contrast(.9); }
	.title, .back-title { display: block; flex: none; min-width: 0; width: 100%; font-weight: 900; font-style: italic; line-height: .9; text-transform: uppercase; text-wrap: balance; overflow-wrap: anywhere; }
	.title { margin-top: var(--club-pad); font-size: 12cqw; }
	.back-title { font-size: 8cqw; }
	.park { display: block; flex: none; margin-top: var(--club-gap); color: var(--tintOnDark); font-weight: 700; font-size: 4.8cqw; line-height: 1; letter-spacing: .04em; text-transform: uppercase; overflow-wrap: anywhere; }
	.stats { display: grid; flex: none; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: var(--club-gap); margin-top: var(--club-pad); }
	.stat { display: flex; flex-direction: column; justify-content: flex-end; min-width: 0; gap: var(--club-unit); padding-top: var(--club-gap); border-top: 1px solid var(--club-rule); }
	.stat.primary { border-top-color: var(--tintOnDark); }
	.label { font-weight: 700; font-size: 3.2cqw; line-height: 1; letter-spacing: .06em; text-transform: uppercase; }
	.value { display: block; font-weight: 800; font-size: 8cqw; line-height: .95; font-variant-numeric: tabular-nums; white-space: nowrap; }
	.footer { display: block; flex: none; margin-top: var(--club-gap); color: var(--mutedOnDark); font-weight: 600; font-size: 3.2cqw; line-height: 1.1; letter-spacing: .04em; text-transform: uppercase; }
	.brand-corner { display: flex; flex: none; justify-content: flex-end; align-items: center; min-height: var(--club-control-height, 0px); margin-top: var(--club-pad); padding-right: var(--club-control-space, 0px); }
	.brand { flex: none; color: var(--paper); font-weight: 800; font-style: italic; font-size: 4cqw; letter-spacing: 0; text-transform: none; }
	.roster-heading { display: flex; flex: none; justify-content: space-between; gap: var(--club-gap); margin-top: var(--club-pad); padding-bottom: var(--club-unit); border-bottom: 1px solid var(--club-rule); color: var(--mutedOnDark); font-size: 3.2cqw; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
	.roster { display: grid; flex: 1 1 0; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-flow: column; column-gap: var(--club-pad); min-height: 0; }
	.roster-row { display: flex; align-items: center; min-width: 0; min-height: 0; gap: var(--club-unit); border-bottom: 1px solid var(--club-rule); line-height: 1; }
	.roster-number { flex: none; width: 4cqw; color: var(--mutedOnDark); font-size: 3.2cqw; line-height: 1; font-variant-numeric: tabular-nums; }
	.roster-name { display: block; min-width: 0; flex: 1; font-size: 4cqw; line-height: 1; font-weight: 600; overflow-wrap: anywhere; }
	.empty-roster { grid-column: 1 / -1; align-self: center; color: var(--mutedOnDark); font-size: 4.8cqw; }
	/* Every grade keeps the same printing plate; the edge, stock and pressed seal change. */
	.card[data-grade='F'] .face, .card[data-grade='ungraded'] .face { box-shadow: 0 var(--club-unit) var(--club-gap) var(--club-shade); }
	.card[data-grade='F'] .seal, .card[data-grade='ungraded'] .seal { outline: none; border-style: solid; border-width: 1px; }
	.card[data-grade='D'] .face { background: repeating-linear-gradient(0deg, transparent 0 var(--club-unit), var(--club-rule) var(--club-unit) var(--club-gap)), repeating-linear-gradient(90deg, transparent 0 var(--club-unit), var(--club-shine) var(--club-unit) var(--club-gap)), var(--club-finish); }
	.card[data-grade='D'] .seal { border-style: dashed; border-width: 1px; }
	.card[data-grade='C'] .seal, .card[data-grade='B'] .seal, .card[data-grade='A'] .seal { box-shadow: inset 0 var(--club-unit) var(--club-unit) var(--club-shine), inset 0 calc(var(--club-unit) * -1) var(--club-unit) var(--club-shade); }
	.card[data-grade='AA'] { --club-edge: calc(var(--club-unit) * 3); }
	.card[data-grade='AA'] .face, .card[data-grade='AA'] .seal { background: repeating-linear-gradient(45deg, transparent 0 var(--club-unit), var(--club-shade) var(--club-unit) calc(var(--club-unit) * 1.25), transparent calc(var(--club-unit) * 1.25) var(--club-gap)), var(--club-finish); }
	.card[data-grade='AA'] .seal-grade { text-shadow: calc(var(--club-unit) / 2) calc(var(--club-unit) / 2) var(--club-shine); }
	.card[data-grade='S'] { --club-edge: calc(var(--club-unit) * 3); }
	.card[data-grade='S'] .print { box-shadow: inset 0 0 0 var(--club-unit) var(--club-shine); }
	.card[data-grade='S+'] { --club-edge: calc(var(--club-unit) * 4); }
	.back .edition { min-height: 10cqw; }
	.back .seal { height: 10cqw; }
	.back .seal-grade { font-size: 6.4cqw; }
	.back .seal.perfect .seal-grade { font-size: 3.2cqw; }
	.back .record { font-size: 9.6cqw; }
	.back .stats { margin-top: var(--club-gap); }
	.back .value { font-size: 6.4cqw; }
	.card[data-grade='S+'] .face { background: repeating-linear-gradient(60deg, transparent 0 var(--club-gap), var(--club-shine) var(--club-gap) calc(var(--club-gap) + var(--club-unit) / 2)), var(--club-finish); }
	.card[data-grade='S+'] .seal::before { content: ''; position: absolute; inset: var(--club-unit); background: color-mix(in srgb, var(--paper) 72%, transparent); }
	.card[data-grade='Perfect'] { --club-edge: calc(var(--club-unit) * 4); }
	.card[data-grade='Perfect'] .print { box-shadow: inset 0 0 0 1px var(--club-shine), inset 0 0 0 var(--club-unit) var(--dark), inset 0 0 0 var(--club-gap) var(--club-shine); }
	.card[data-grade='Perfect'] .seal { border-radius: 50%; height: 14cqw; outline-offset: calc(var(--club-unit) * -3); }
	.card[data-grade='Perfect'] .back .seal { height: 10cqw; border-radius: var(--club-gap); }
	.card[data-grade='Perfect'] .collage { clip-path: none; border: 1px solid var(--club-shine); }
	.card[data-motion='off'] .flipper { transition: none; }
	@media (prefers-reduced-motion: reduce) { .flipper { transition: none; } }
</style>
