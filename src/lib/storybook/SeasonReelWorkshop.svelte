<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { createDialKitController } from 'dialkit/svelte';
	import SeasonReel from '#lib/components/SeasonReel.svelte';
	import { getExampleSeason, type ExampleSeason } from './season-fixtures.ts';
	import { loadMedia } from '#lib/media/client.ts';
	import type { SeasonResult } from '#lib/sim/types.ts';
	import StoryFrame from './StoryFrame.svelte';

	/**
	 * The season reel on its own: play the reveal at a chosen length, scrub to any game while paused, show the
	 * simulating spin, and tune the month snap and the spin through the reel's custom properties.
	 */
	let { simulating = false }: { simulating?: boolean } = $props();

	type Range = [number, number, number, number];
	const dials = createDialKitController('Season reel', untrack(() => ({
		playback: { playing: !simulating, seconds: [6, 1, 16, 0.5] as Range, game: [48, 0, 162, 1] as Range, simulating },
		reel: {
			snap: [400, 0, 1000, 10] as Range,
			spin: [1500, 200, 3000, 50] as Range
		}
	})));
	const values = $derived(dials.values);

	let season = $state<ExampleSeason | null>(null);
	let error = $state('');
	let playhead = $state(0);
	let instance = $state(0);
	// The example season plays synthetic opponents; each is shown as a real club so the squares carry marks.
	let reelResult = $state.raw<SeasonResult | null>(null);
	onMount(() => {
		void Promise.all([getExampleSeason(), loadMedia().catch(() => null)]).then(([value, media]) => {
			season = value;
			const clubs = Object.keys(media?.teams ?? {}).sort();
			const byOpponent = new Map<string, string>();
			reelResult = clubs.length ? {
				...value.result,
				games: value.result.games.map(game => {
					if (!byOpponent.has(game.opponentId)) byOpponent.set(game.opponentId, clubs[byOpponent.size % clubs.length]);
					return { ...game, opponentId: byOpponent.get(game.opponentId)! };
				})
			} : value.result;
		})
			.catch(cause => { error = cause instanceof Error ? cause.message : 'The example season could not be prepared.'; });
	});

	// Playing advances through all 162 games in the chosen length, holds the final game a moment, then starts over.
	$effect(() => {
		if (!values.playback.playing || values.playback.simulating) return;
		const duration = values.playback.seconds * 1000;
		const hold = 1200;
		let start = performance.now() - untrack(() => playhead) / 162 * duration;
		let frame = requestAnimationFrame(function step(now) {
			const elapsed = now - start;
			if (elapsed > duration + hold) start = now;
			playhead = Math.min(162, Math.floor(Math.max(0, now - start) / duration * 162));
			frame = requestAnimationFrame(step);
		});
		return () => cancelAnimationFrame(frame);
	});
	const shown = $derived(values.playback.playing ? playhead : values.playback.game);
	const record = $derived.by(() => {
		const games = season?.result.games.slice(0, shown) ?? [];
		const wins = games.filter(game => game.win).length;
		return { wins, losses: games.length - wins };
	});
</script>

<StoryFrame onReset={() => { playhead = 0; instance++; }}>
	{#if error}
		<p role="alert">{error}</p>
	{:else if !season}
		<p role="status">Preparing the example season…</p>
	{:else}
		<div class="reel-story" style:--reel-snap={`${values.reel.snap}ms`} style:--reel-spin={`${values.reel.spin}ms`}>
			<p class="tally"><strong>{values.playback.simulating ? 0 : shown}</strong><span>/ 162</span>
				{#if !values.playback.simulating}<span class="record"><span class="win">{record.wins} W</span> · <span class="loss">{record.losses} L</span></span>{/if}</p>
			{#key instance}<SeasonReel games={values.playback.simulating ? null : reelResult?.games ?? null} seed={reelResult?.seed ?? 0} {shown} />{/key}
		</div>
	{/if}
</StoryFrame>

<style>
	.reel-story { display: grid; gap: var(--space-3); max-width: 26rem; }
	.tally { display: flex; align-items: baseline; gap: var(--space-3); margin: 0; }
	.tally strong { font-size: var(--text-3xl); font-weight: 850; letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
	.tally > span { color: var(--muted); font-weight: 650; }
	.record { margin-left: auto; font-weight: 750; }
	.win { color: var(--success); }
	.loss { color: var(--error); }
</style>
