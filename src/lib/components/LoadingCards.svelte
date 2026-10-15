<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { appSettings } from '#lib/game/settings.svelte.ts';

	let { active, label = 'Loading…' }: { active: boolean; label?: string } = $props();
	let visible = $state(false);
	let leaving = $state(false);
	let cards = $state<number[]>([]);
	let shownLabel = $state('Loading…');
	const moving = $derived(appSettings.effectiveEnabled);

	onMount(() => appSettings.retain());
	$effect(() => {
		const busy = active;
		const animate = moving;
		return untrack(() => {
			if (busy) {
				leaving = false;
				if (visible) return;
				const timer = setTimeout(() => {
					const pool = Array.from({ length: 24 }, (_, index) => index + 1);
					for (let index = 0; index < 8; index++) {
						const next = index + Math.floor(Math.random() * (pool.length - index));
						[pool[index], pool[next]] = [pool[next], pool[index]];
					}
					cards = pool.slice(0, 8);
					visible = true;
				}, 120);
				return () => clearTimeout(timer);
			}
			if (!visible) return;
			if (!animate) { visible = false; return; }
			leaving = true;
			const timer = setTimeout(() => { visible = false; leaving = false; }, 280);
			return () => clearTimeout(timer);
		});
	});
	$effect(() => { if (active) shownLabel = label; });
</script>

{#if visible}
	<div class="loading-cards" class:leaving class:still={!moving} data-card-loader role="status" aria-live="polite">
		<div class="orbit" aria-hidden="true">
			{#each cards as card, index (card)}
				<div class="spoke" style={`--angle: ${index * 45}deg; --delay: ${index * 22}ms`}>
					<div class="flight"><div class="spin">
						<img src={`/loading-cards/${String(card).padStart(2, '0')}.webp`} alt="" width="200" height="280" draggable="false" />
					</div></div>
				</div>
			{/each}
		</div>
		<p>{shownLabel}</p>
	</div>
{/if}

<style>
	.loading-cards {
		position: fixed; inset: 0; z-index: 25; display: grid; place-content: center;
		justify-items: center; gap: var(--space-8); pointer-events: none; overflow: hidden;
		box-sizing: border-box; padding-block: 7rem 1rem;
		background: var(--background);
		animation: veil-in 160ms ease-out both;
	}
	.orbit { position: relative; width: min(80vw, calc(100svh - 12rem), 26rem); aspect-ratio: 1; }
	.spoke { position: absolute; inset: 0; transform: rotate(var(--angle)); }
	.flight { position: absolute; left: 40%; top: 2%; width: 20%; aspect-ratio: 5 / 7; animation: deal-in 360ms cubic-bezier(.16, 1, .3, 1) var(--delay) both; }
	.spin { width: 100%; height: 100%; animation: card-spin 2400ms linear calc(var(--delay) * -4) infinite; }
	img { display: block; width: 100%; height: 100%; border-radius: 4px; background: var(--surface-raised); box-shadow: 0 4px 12px oklch(8% .01 255 / .4); }
	p { margin: 0; color: var(--muted); font: 650 var(--text-sm)/1.5 var(--font-control); }
	.leaving { animation: veil-out 280ms ease-out both; }
	.leaving .flight { animation: deal-out 240ms cubic-bezier(.22, 1, .36, 1) both; }
	.still, .still .flight, .still .spin { animation: none; }
	.still .spin { transform: rotate(calc(-1 * var(--angle))); }
	@keyframes veil-in { from { opacity: 0; } to { opacity: 1; } }
	@keyframes veil-out { to { opacity: 0; } }
	@keyframes deal-in { from { opacity: 0; transform: translateY(160%) scale(.35) rotate(-110deg); } to { opacity: 1; transform: none; } }
	@keyframes deal-out { to { opacity: 0; transform: translateY(-180%) scale(.65) rotate(65deg); } }
	@keyframes card-spin { from { transform: rotate(calc(-1 * var(--angle))) rotateY(0deg); } to { transform: rotate(calc(-1 * var(--angle))) rotateY(360deg); } }
	@media (min-width: 64rem) { .loading-cards { padding-top: 4rem; } }
	@media (prefers-reduced-motion: reduce) {
		.loading-cards, .flight, .spin { animation: none !important; }
		.spin { transform: rotate(calc(-1 * var(--angle))); }
	}
</style>
