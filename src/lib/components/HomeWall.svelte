<script lang="ts">
	import { onMount } from 'svelte';
	import Card from '../cards/Card.svelte';
	import { marquee } from '../cards/grid-motion.ts';
	import type { CardViewModel } from '../cards/view-model.ts';
	import type { Franchise } from '../game/types.ts';
	import TeamLogo from './TeamLogo.svelte';

	interface HomeWallCard {
		seasonId: string;
		model: CardViewModel;
	}

	let {
		cards,
		franchises
	}: {
		cards: readonly HomeWallCard[];
		franchises: readonly Franchise[];
	} = $props();

	const desktopSpeeds = [16, 22, 14, 19] as const;
	const phoneSpeeds = [12, 16, 10] as const;
	let phone = $state(false);
	let wallWidth = $state(0);
	let wallStage = $state<HTMLDivElement>();

	const rows = $derived.by(() => {
		const speeds = phone ? phoneSpeeds : desktopSpeeds;
		const cardStep = phone ? 108 : 198;
		const minimum = phone ? 7 : 10;
		const overscan = phone ? 1.6 : 1.5;
		const count = cards.length
			? Math.max(minimum, Math.ceil(wallWidth * overscan / cardStep) + 1)
			: 0;
		return speeds.map((speed, rowIndex) => ({
			speed,
			direction: (rowIndex % 2 === 0 ? 1 : -1) as 1 | -1,
			cards: Array.from({ length: count }, (_, cardIndex) => {
				const card = cards[(rowIndex * (phone ? 7 : 8) + cardIndex) % cards.length]!;
				return { card, key: `${rowIndex}-${cardIndex}-${card.seasonId}` };
			})
		}));
	});
	const noDetails = () => {};

	onMount(() => {
		const query = window.matchMedia('(max-width: 47.999rem)');
		const updateMode = () => { phone = query.matches; };
		const measure = () => { wallWidth = wallStage?.clientWidth ?? window.innerWidth; };
		const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
		updateMode();
		measure();
		if (observer && wallStage) observer.observe(wallStage);
		else window.addEventListener('resize', measure);
		query.addEventListener('change', updateMode);
		return () => {
			observer?.disconnect();
			window.removeEventListener('resize', measure);
			query.removeEventListener('change', updateMode);
		};
	});
</script>

<div class="wall-stage" bind:this={wallStage} aria-hidden="true">
	{#if cards.length}
		<div class="wall-grid">
			{#each rows as row, rowIndex (`${phone ? 'phone' : 'desktop'}-${rowIndex}`)}
				<div class="wall-row">
					<div class="wall-track" use:marquee={{ speed: row.speed, direction: row.direction }}>
						<div class="wall-copy" data-marquee-copy>
							{#each row.cards as entry (`first-${entry.key}`)}
								<div class="wall-card"><Card s={entry.card.model} wall onDetails={noDetails} /></div>
							{/each}
						</div>
						<div class="wall-copy">
							{#each row.cards as entry (`repeat-${entry.key}`)}
								<div class="wall-card"><Card s={entry.card.model} wall onDetails={noDetails} /></div>
							{/each}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
	<div class="horizontal-scrim"></div>
	<div class="top-scrim"></div>
	<div class="bottom-scrim"></div>
</div>

<div class="logo-strip" role="region" aria-label="All 30 franchises">
	<div class="logo-track" use:marquee={{ speed: 18, direction: 1 }}>
		{#each [false, true] as repeated}
			<div class="logo-copy" data-marquee-copy={!repeated || undefined} aria-hidden={repeated || undefined}>
				{#each franchises as franchise (franchise.id)}
					<TeamLogo franchiseId={franchise.id} label={franchise.name} size="small" />
				{/each}
			</div>
		{/each}
	</div>
</div>

<style>
	.wall-stage {
		position: absolute;
		inset: -4rem 0 0;
		z-index: 0;
		overflow: hidden;
		overflow: clip;
		contain: paint;
		pointer-events: none;
	}
	.wall-grid {
		position: absolute;
		left: -12%;
		right: -22%;
		top: 50%;
		display: flex;
		flex-direction: column;
		gap: 22px;
		transform: translateY(-50%) rotate(-7deg);
		transform-origin: center;
	}
	.wall-row { overflow: visible; }
	.wall-track,
	.wall-copy {
		display: flex;
		width: max-content;
		column-gap: 22px;
	}
	.wall-track { will-change: transform; }
	.wall-card {
		width: 176px;
		flex: 0 0 176px;
	}
	.horizontal-scrim,
	.top-scrim,
	.bottom-scrim {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.horizontal-scrim {
		background: linear-gradient(90deg, var(--background) 0%, oklch(16% .009 255 / .96) 30%, oklch(16% .009 255 / .82) max(52%, 41.5rem), oklch(16% .009 255 / 0) max(70%, 47.5rem));
	}
	.top-scrim {
		bottom: auto;
		height: 120px;
		background: linear-gradient(180deg, var(--background) 35%, oklch(16% .009 255 / 0));
	}
	.bottom-scrim {
		top: auto;
		height: 200px;
		background: linear-gradient(0deg, var(--background) 30%, oklch(16% .009 255 / 0));
	}
	.logo-strip {
		position: relative;
		z-index: 1;
		min-width: 0;
		margin: auto 2rem 0;
		padding-block: 14px;
		overflow: hidden;
		border-top: 1px solid var(--border);
		-webkit-mask-image: linear-gradient(90deg, transparent, oklch(0% 0 0) 5%, oklch(0% 0 0) 95%, transparent);
		mask-image: linear-gradient(90deg, transparent, oklch(0% 0 0) 5%, oklch(0% 0 0) 95%, transparent);
	}
	.logo-track,
	.logo-copy {
		display: flex;
		width: max-content;
		column-gap: 12px;
	}
	.logo-copy :global(.team-mark) {
		width: 40px;
		height: 40px;
		flex-basis: 40px;
		padding: 5px;
	}
	@media (max-width: 47.999rem) {
		.wall-stage {
			inset: 0 0 auto;
			height: 300px;
		}
		.wall-grid {
			left: -30%;
			right: -30%;
			top: -14px;
			gap: 12px;
			transform: rotate(-7deg);
		}
		.wall-track,
		.wall-copy { column-gap: 12px; }
		.wall-card {
			width: 96px;
			flex-basis: 96px;
		}
		.horizontal-scrim,
		.top-scrim { display: none; }
		.bottom-scrim {
			height: 120px;
			background: linear-gradient(0deg, var(--background) 10%, oklch(16% .009 255 / 0));
		}
		.logo-strip {
			margin-inline: 1rem;
			padding-block: 12px;
		}
		.logo-copy :global(.team-mark) {
			width: 32px;
			height: 32px;
			flex-basis: 32px;
			padding: 4px;
		}
	}
</style>
