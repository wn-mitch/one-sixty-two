<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { motionSettings, type MotionSettingsSnapshot } from '../cards/motion-settings.svelte.ts';

	const ERAS = ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'] as const;
	let root = $state<HTMLElement>();
	let active = $state(0);
	let flying = $state(false);
	let intersecting = true;
	let documentVisible = true;
	let motion = $state<MotionSettingsSnapshot>(motionSettings.snapshot);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let release: (() => void) | undefined;
	let unsubscribe: (() => void) | undefined;

	function stop(): void {
		if (timer !== undefined) clearTimeout(timer);
		timer = undefined;
		flying = false;
	}

	function schedule(): void {
		stop();
		if (!intersecting || !documentVisible || !motion.effectiveEnabled) return;
		timer = setTimeout(() => {
			active = (active + 1) % ERAS.length;
			void tick().then(() => {
				if (intersecting && documentVisible && motion.effectiveEnabled) flying = true;
			});
			timer = setTimeout(schedule, 1320);
		}, 1500);
	}

	onMount(() => {
		documentVisible = document.visibilityState === 'visible';
		release = motionSettings.retain();
		unsubscribe = motionSettings.subscribe(value => {
			motion = value;
			schedule();
		});
		const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
			intersecting = entries.some(entry => entry.isIntersecting);
			schedule();
		}, { threshold: 0.05 });
		if (observer && root) observer.observe(root);
		const onVisibilityChange = () => {
			documentVisible = document.visibilityState === 'visible';
			schedule();
		};
		document.addEventListener('visibilitychange', onVisibilityChange);
		schedule();
		return () => {
			stop();
			observer?.disconnect();
			document.removeEventListener('visibilitychange', onVisibilityChange);
			unsubscribe?.();
			release?.();
		};
	});
</script>

<div bind:this={root} class="loading-cards" aria-hidden="true">
	{#each ERAS as era, index (era)}
		<div class="loading-card era-{era.slice(0, 4)}" class:flying={flying && active === index}>
			<div class="card-rule"></div>
			<div class="team-word">TEAM</div>
			<div class="card-footer"><span>{era}</span><span class="card-dot"></span></div>
		</div>
	{/each}
</div>

<style>
	.loading-cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
		gap: clamp(.5rem, 2vw, .85rem);
		width: min(100%, 35rem);
		padding: 1rem .25rem 1.35rem;
		overflow: visible;
	}
	.loading-card {
		position: relative;
		isolation: isolate;
		aspect-ratio: 5 / 7;
		min-width: 72px;
		container-type: inline-size;
		padding: clamp(.45rem, 2vw, .8rem);
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		color: var(--text);
		background: var(--surface-raised);
		border: 1px solid var(--border);
		box-shadow: 0 .4rem 0 var(--background);
		transform-origin: 50% 100%;
		will-change: transform, opacity;
	}
	.loading-card::before,
	.loading-card::after {
		content: '';
		position: absolute;
		inset: .32rem;
		z-index: -1;
		border: 1px solid color-mix(in oklch, var(--muted) 35%, transparent);
		pointer-events: none;
	}
	.loading-card::after { inset: auto .32rem .32rem; height: 28%; border-width: 1px 0 0; }
	.card-rule { width: 62%; height: .35rem; background: var(--muted); opacity: .7; }
	.team-word {
		align-self: center;
		font: italic 900 clamp(.875rem, 24cqw, 1.8rem) / .9 'Barlow Condensed', sans-serif;
		letter-spacing: .04em;
		transform: rotate(-4deg);
	}
	.card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font: 700 .75rem / 1 'Barlow Condensed', sans-serif;
		letter-spacing: .1em;
		text-transform: uppercase;
	}
	.card-dot { width: .38rem; height: .38rem; border-radius: 50%; background: var(--muted); }
	.era-1950 { background: oklch(43% .008 230); transform: rotate(-1.5deg); }
	.era-1950 .team-word { font-family: 'Roboto Serif', serif; font-style: normal; }
	.era-1960 { background: oklch(35% .03 230); border-radius: .75rem; }
	.era-1960::before { border-radius: .5rem; }
	.era-1970 { background: oklch(44% .025 240); clip-path: polygon(0 4%, 96% 0, 100% 96%, 4% 100%); }
	.era-1980 { background: repeating-linear-gradient(90deg, oklch(34% .03 230) 0 7px, oklch(37% .03 230) 7px 10px); }
	.era-1990 { background: oklch(36% .03 250); transform: skewY(-1deg); }
	.era-2000 { background: oklch(31% .03 240); border-radius: .15rem; }
	.era-2010 { background: var(--surface); }
	.era-2020 { background: oklch(36% .04 230); clip-path: polygon(0 0, 100% 0, 100% 94%, 9% 100%, 0 91%); }
	.flying { animation: pluck-up 1.25s cubic-bezier(.16, 1, .3, 1) both; }
	@keyframes pluck-up {
		0% { opacity: 1; transform: translateY(0) rotate(0deg) scale(1); }
		22% { transform: translateY(-.65rem) rotate(-2deg) scale(1.02); }
		100% { opacity: 0; transform: translateY(-8rem) rotate(-8deg) scale(.92); }
	}
	@media (prefers-reduced-motion: reduce) {
		.flying { animation: none; }
	}
</style>
