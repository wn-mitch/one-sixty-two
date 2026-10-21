<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { LightRenderer, DEFAULT_LIGHT, type LitCard, type SurfaceMap } from '#lib/cards/surface/light-renderer.ts';
	import type { HoloPattern } from '#lib/cards/surface/holo-films.ts';
	import { finishName } from '#lib/cosmetics/catalogue.ts';
	import { rolledLight, tiltLight, TILT_DEFAULTS } from '#lib/cards/tilt-math.ts';
	import StoryFrame from './StoryFrame.svelte';

	/**
	 * One film drawn at fixed poses, side by side: leaning across, leaning up and down, and turned in its own
	 * plane. A lean of ±1 is the full pointer tilt. Each pose is drawn once through the card light, with the
	 * same light the tilt would give it, so the states can be compared without scrubbing.
	 */
	const props: { films: readonly HoloPattern[] } = $props();
	const films = untrack(() => props.films);

	const WIDTH = 150;
	const HEIGHT = 210;
	const RATIO = 2;
	const STEPS = [-1, -0.5, 0, 0.5, 1];
	const ROLLS = [0, 45, 90, 135, 180];
	type Pose = { label: string; lean: [number, number]; roll: number };
	const rows: { title: string; poses: Pose[] }[] = [
		{ title: 'Leaning across', poses: STEPS.map(x => ({ label: `${x}`, lean: [x, 0], roll: 0 })) },
		{ title: 'Leaning up and down', poses: STEPS.map(y => ({ label: `${y}`, lean: [0, y], roll: 0 })) },
		{ title: 'Turned in plane', poses: ROLLS.map(roll => ({ label: `${roll}°`, lean: [0, 0], roll })) }
	];

	/** A blank face entirely under gem film, as the holo gallery's cards are. */
	function blankMap(): SurfaceMap {
		const width = WIDTH * RATIO;
		const height = HEIGHT * RATIO;
		const data = new Uint8Array(width * height * 4);
		for (let index = 0; index < data.length; index += 4) data.set([128, 255, 230, 255], index);
		return { width, height, data, ink: new Uint8Array(width * height * 4) };
	}

	/** The light the tilt gives a card leaning this far, as the card light receives it. */
	function litCard(film: HoloPattern, pose: Pose): LitCard {
		const reach = Math.sin(TILT_DEFAULTS.maxTilt * Math.PI / 180);
		const viewX = pose.lean[0] * reach;
		const viewY = pose.lean[1] * reach;
		const ry = Math.asin(viewX) * 180 / Math.PI;
		const rx = -Math.asin(viewY) * 180 / Math.PI;
		const light = { ...tiltLight(rx, ry), viewX, viewY };
		return {
			key: 'pose', originX: 0, originY: 0, axisXx: WIDTH, axisXy: 0, axisYx: 0, axisYy: HEIGHT,
			...light, ...rolledLight(light, pose.roll, WIDTH, HEIGHT), spotlight: 0.2,
			tier: 'gem', film, pattern: 0
		};
	}

	let failed = $state(false);
	const canvases = new Map<string, HTMLCanvasElement>();
	const key = (film: string, row: number, column: number) => `${film}:${row}:${column}`;
	function register(node: HTMLCanvasElement, id: string) {
		canvases.set(id, node);
		return { destroy: () => canvases.delete(id) };
	}

	onMount(() => {
		const renderer = LightRenderer.create(document.createElement('canvas'));
		if (!renderer || !renderer.add('pose', blankMap())) {
			failed = true;
			return;
		}
		let cancelled = false;
		renderer.resize(WIDTH, HEIGHT, RATIO);
		(async () => {
			await renderer.ready();
			for (const film of films) {
				for (const [rowIndex, row] of rows.entries()) {
					for (const [column, pose] of row.poses.entries()) {
						const card = litCard(film, pose);
						const options = { ...DEFAULT_LIGHT, time: 0 };
						while (!renderer.draw([card], options)) {
							await new Promise(resolve => requestAnimationFrame(resolve));
							if (cancelled) return;
						}
						const canvas = canvases.get(key(film, rowIndex, column));
						const context = canvas?.getContext('2d');
						if (!canvas || !context) continue;
						// Copy in the same task as the draw: WebGL may clear its buffer once this task yields.
						context.fillStyle = '#15171c';
						context.fillRect(0, 0, canvas.width, canvas.height);
						context.drawImage(renderer.canvas, 0, 0, WIDTH * RATIO, HEIGHT * RATIO, 0, 0, canvas.width, canvas.height);
						canvas.dataset.drawn = '';
					}
				}
			}
		})();
		return () => {
			cancelled = true;
			renderer.destroy();
		};
	});
</script>

<StoryFrame wide onReset={() => location.reload()} fixtureNotice="Each pose is one still frame through the card light; a lean of ±1 is the full pointer tilt.">
	{#if failed}
		<p role="alert">This browser cannot run the card light, so the poses cannot be drawn.</p>
	{:else}
		{#each films as film (film)}
			<section aria-label={finishName({ name: film })}>
				<h2>{finishName({ name: film })}</h2>
				{#each rows as row, rowIndex (row.title)}
					<div class="row">
						<h3>{row.title}</h3>
						{#each row.poses as pose, column (pose.label)}
							<figure>
								<canvas width={WIDTH * RATIO} height={HEIGHT * RATIO} use:register={key(film, rowIndex, column)} style={`transform:rotate(${pose.roll}deg)`}></canvas>
								<figcaption>{pose.label}</figcaption>
							</figure>
						{/each}
					</div>
				{/each}
			</section>
		{/each}
	{/if}
</StoryFrame>

<style>
	section + section { margin-top: var(--space-6); }
	h2 { margin: 0 0 var(--space-3); font-size: var(--text-lg); }
	h3 { margin: 0; width: 9rem; flex: none; color: var(--muted); font-size: var(--text-sm); font-weight: 500; }
	.row { display: flex; align-items: center; gap: var(--space-4); margin-bottom: var(--space-4); }
	/* Square cells leave room for a card turned in its plane. */
	figure { margin: 0; display: grid; justify-items: center; align-items: center; gap: var(--space-2); width: 210px; grid-template-rows: 210px auto; }
	canvas { width: 150px; height: 210px; border-radius: 3px; }
	figcaption { color: var(--muted); font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
</style>
