<script lang="ts">
	import { onMount } from 'svelte';
	import { seasonMonths, type CalendarMonth } from '#lib/game/season-calendar.ts';
	import { appSettings } from '#lib/game/settings.svelte.ts';
	import { loadMedia, selectLogo } from '#lib/media/client.ts';
	import type { MediaManifest } from '#lib/media/types.ts';
	import type { SeasonResult } from '#lib/sim/types.ts';

	/**
	 * The pocket schedule on a slot reel, one month at a time: the window holds exactly one month card while its
	 * dates stamp in, and when the latest game crosses into the next month the reel snaps up to it with an
	 * overshoot, like a slot drum clunking onto its next stop. A finished month's record pops in its header.
	 * Each date carries its opponent's mark, faint until the game is revealed; the result then lights the square
	 * and prints its score. While the season is still simulating, blank months spin past. Purely visual: the
	 * progress bar beside it reports. `--reel-snap` and `--reel-spin` tune the snap and the spin.
	 */
	let { result, shown }: { result: SeasonResult | null; shown: number } = $props();

	const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
	// Blank April-to-September cards for the spin before the result exists.
	const BLANK: CalendarMonth[] = ['April', 'May', 'June', 'July', 'August', 'September'].map((name, month) => ({
		month: month + 3, name, lead: (month * 2) % 7, days: Array.from({ length: 30 }, (_, index) => ({ day: index + 1, games: [] })), wins: 0, losses: 0
	}));
	const months = $derived(result ? seasonMonths(result.games, result.seed) : BLANK);
	const motion = $derived(appSettings.effectiveEnabled);

	// One media read serves every square; a missing mark falls back to the club's short code.
	let media = $state.raw<MediaManifest | null>(null);
	onMount(() => {
		let disposed = false;
		void loadMedia().then(value => { if (!disposed) media = value; }).catch(() => undefined);
		return () => { disposed = true; };
	});
	const markUrl = (franchiseId: string) => selectLogo(media, franchiseId, 2025)?.asset.url ?? null;

	let strip = $state<HTMLElement>();
	// Every month card has six week rows, so one measured card sets the window and each stop's distance.
	let monthHeight = $state(0);
	const GAP = 12;
	// The month on the window: the one holding the latest revealed game, or the first before opening day.
	const current = $derived(result ? Math.max(0, months.findIndex(month => month.days.some(day => day.games.some(game => game.number === Math.max(1, shown))))) : 0);

	function complete(month: CalendarMonth): boolean {
		const games = month.days.flatMap(day => day.games);
		return games.length > 0 && games.every(game => game.number <= shown);
	}

	function record(month: CalendarMonth): string {
		const played = month.days.flatMap(day => day.games).filter(game => game.number <= shown);
		const wins = played.filter(game => game.win).length;
		return `${wins}–${played.length - wins}`;
	}
</script>

<div class="season-reel" class:spinning={!result && motion} class:still={!motion} aria-hidden="true">
	<div class="reel-window" style:height={monthHeight ? `${monthHeight + 2}px` : undefined}>
		<div bind:this={strip} class="strip" style:transform={result ? `translateY(${-current * (monthHeight + GAP)}px)` : undefined}>
			{#each result || !motion ? months : [...months, ...months] as month, index (`${index}-${month.month}`)}
				{@const done = !!result && complete(month)}
				<section class="month" class:done>
					{#if index === 0}<span class="measure" bind:offsetHeight={monthHeight}></span>{/if}
					<header><h4>{month.name}</h4>{#if result}{#key done}<span class="month-record">{record(month)}</span>{/key}{/if}</header>
					<div class="weekdays">{#each WEEKDAYS as weekday}<span>{weekday}</span>{/each}</div>
					<div class="grid">
						{#each { length: month.lead } as _}<span class="cell blank"></span>{/each}
						{#each month.days as entry (entry.day)}
							{@const game = entry.games.at(-1)}
							{#if game}
								{@const revealed = entry.games.filter(item => item.number <= shown)}
								{@const url = markUrl(game.opponentId)}
								<span class="cell game" class:home={game.isHome} class:revealed={revealed.length > 0} class:latest={entry.games.some(item => item.number === shown)}
									class:win={revealed.length > 0 && revealed.every(item => item.win)} class:loss={revealed.some(item => !item.win)} data-games={entry.games.map(item => item.number).join(' ')}>
									<span class="date">{entry.day}</span>
									{#if url}<img class="mark" src={url} alt="" decoding="async" draggable="false" />{:else}<b class="mark">{game.opponentId.slice(0, 3).toUpperCase()}</b>{/if}
									{#if revealed.length}<span class="result">{revealed.map(item => `${item.challengeRuns}-${item.opponentRuns}`).join(' ')}</span>{/if}
								</span>
							{:else}
								<span class="cell off"><span class="date">{entry.day}</span></span>
							{/if}
						{/each}
					</div>
				</section>
			{/each}
		</div>
	</div>
</div>

<style>
	.season-reel { --home-ground: color-mix(in oklch, var(--accent) 14%, var(--surface)); width: 100%; max-width: 26rem; min-width: 0; }
	/* The window is a drum: a fixed height, with the strip fading out at both edges as it rolls. */
	/* The window is a drum stop: exactly one month tall, shaded at its top and bottom edges like curved glass. */
	.reel-window {
		position: relative;
		height: 17rem;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--background);
	}
	.reel-window::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(oklch(0% 0 0 / .35), transparent 14%, transparent 86%, oklch(0% 0 0 / .35)); }
	/* The snap overshoots its stop and settles back, the clunk of a reel landing. */
	.strip { display: grid; gap: 12px; transition: transform var(--reel-snap, 400ms) cubic-bezier(.3, 1.45, .55, 1); will-change: transform; }
	.still .strip { transition: none; }
	.spinning .strip { animation: spin var(--reel-spin, 1500ms) linear infinite; }
	@keyframes spin { from { transform: translateY(0); } to { transform: translateY(-50%); } }
	.month { position: relative; padding: var(--space-2) var(--space-3); container-type: inline-size; }
	.measure { position: absolute; inset: 0; pointer-events: none; }
	/* Fixed header and weekday heights keep a month's height a function of its width alone; ProgressSkeleton repeats the sum. */
	.month > header { display: flex; align-items: center; justify-content: space-between; height: 18px; margin-bottom: 2px; }
	.month h4 { margin: 0; font: italic 900 1rem/1 'Barlow Condensed', sans-serif; text-transform: uppercase; }
	.month-record { color: var(--muted); font-size: var(--text-xs); font-weight: 700; font-variant-numeric: tabular-nums; }
	.done .month-record { color: var(--accent); font-size: var(--text-sm); }
	.season-reel:not(.still) .done .month-record { animation: record-land 320ms cubic-bezier(.3, 1.45, .55, 1); }
	@keyframes record-land { from { transform: scale(1.8); opacity: 0; } }
	.weekdays { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; height: 12px; margin-bottom: 2px; color: var(--muted); font-size: .5625rem; font-weight: 700; line-height: 12px; text-align: center; }
	/* Six week rows in every month, so each stop is the same height and the window never resizes. */
	.grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); grid-template-rows: repeat(6, calc((100cqi - 12px) / 7 * .8)); gap: 2px; }
	.cell { position: relative; display: grid; grid-template-rows: 1fr auto; place-items: center; min-width: 0; overflow: hidden; padding: 1px 0 2px; border-radius: 3px; }
	.cell .date { position: absolute; top: 1px; left: 2px; color: var(--muted); font-size: .5rem; line-height: 1; }
	.cell.off { background: color-mix(in oklch, var(--surface-raised) 30%, transparent); }
	.cell.game { border: 1px solid var(--border); }
	.cell.game.home { background: var(--home-ground); border-color: transparent; }
	/* The opponent's mark is the square's emphasis: faint on the schedule, full strength once the game is played. */
	.mark { grid-row: 1 / -1; width: 56%; max-height: 62%; object-fit: contain; opacity: .28; filter: grayscale(1); transition: opacity 160ms, filter 160ms; }
	b.mark { width: auto; color: var(--muted); font: 800 clamp(.5625rem, 2.4cqi, .75rem)/1 'Barlow Condensed', sans-serif; }
	.revealed .mark { grid-row: 1; align-self: end; max-height: 48%; opacity: 1; filter: none; }
	.cell .result { grid-row: 2; font-size: clamp(.5rem, 2.2cqi, .625rem); font-weight: 750; line-height: 1; font-variant-numeric: tabular-nums; white-space: nowrap; }
	/* A revealed square lights up with its result; a doubleheader with any loss reads as a loss. */
	.cell.game.win { background: color-mix(in oklch, var(--success) 18%, var(--surface)); border-color: transparent; }
	.cell.game.loss { background: color-mix(in oklch, var(--error) 18%, var(--surface)); border-color: transparent; }
	.cell.win .result { color: var(--success); }
	.cell.loss .result { color: var(--error); }
	.cell.latest { outline: 2px solid var(--accent); outline-offset: -2px; }
	.season-reel:not(.still) .cell.revealed { animation: stamp 220ms var(--ease-out, ease-out); }
	@keyframes stamp { from { transform: scale(1.25); } to { transform: none; } }
	@media (prefers-reduced-motion: reduce) {
		.strip, .mark { transition: none; }
		.spinning .strip, .cell.revealed, .done .month-record { animation: none; }
	}
</style>
