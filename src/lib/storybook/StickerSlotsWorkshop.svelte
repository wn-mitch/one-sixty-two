<script module lang="ts">
	import type { CardEra } from '#lib/cards/view-model.ts';

	/** `era` places default stickers through the per-era slot table; `legacy` pins them to the old shared spots for comparison; `none` measures the bare fronts. */
	export type StickerSlotsMode = 'era' | 'legacy' | 'none';

	export interface StickerSlotsWorkshopProps {
		/** One era renders every variant; omitted renders one typical card per era. */
		era?: CardEra;
		mode?: StickerSlotsMode;
		width?: number;
		/** Draws the measured protected-layer boxes over each card. */
		overlay?: boolean;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import Card from '#lib/cards/Card.svelte';
	import { createCardViewModel, type CardViewModel } from '#lib/cards/view-model.ts';
	import { faceStickers, LEGACY_FACE_SLOTS, STICKER_BY_KIND, STICKER_SPOTS, type PlacedSticker } from '#lib/collection/stickers.ts';
	import { ERA_PLACEMENT, PROTECTED_LAYER_SELECTOR, STICKER_LAYOUT, STICKER_MARGIN } from '#lib/collection/sticker-slots.ts';
	import type { Profile, RosterSlot } from '#lib/game/types.ts';
	import { createExampleMedia } from './media-fixtures.ts';
	import { createExampleFixtures, getExampleFinishRanking, type ExampleCardFinish, type ExampleCardRole } from './fixtures.ts';
	import StoryFrame from './StoryFrame.svelte';

	let { era, mode = 'era', width = 300, overlay = false }: StickerSlotsWorkshopProps = $props();

	const ERA_YEAR: Record<CardEra, number> = { '1950s': 1955, '1960s': 1965, '1970s': 1975, '1980s': 1985, '1990s': 1995, '2000s': 2005, '2010s': 2015, '2020s': 2025 };
	const ERAS = Object.keys(ERA_YEAR) as CardEra[];
	const FINISHES: readonly ExampleCardFinish[] = ['base', 'foil', 'gem'];
	const NAMES = [
		{ key: 'short', name: 'Ed Ott' },
		{ key: 'typical', name: 'Barry Bonds' },
		{ key: 'long', name: 'Fictional Aurelius Maximilian Longname the Third' }
	] as const;
	const ROLES = ['hitter', 'starter', 'two-way'] as const;
	type Role = (typeof ROLES)[number];

	const fixtures = createExampleFixtures();
	const media = createExampleMedia();
	const source = (slot: RosterSlot): Profile => {
		const pick = fixtures.completeDraft.picks.find(item => item.slot === slot);
		const profile = fixtures.profiles.find(item => item.seasonId === pick?.seasonId);
		if (!profile) throw new Error(`Example fixture is missing ${slot}`);
		return profile;
	};
	const hitter = source('2B');
	const starter = source('SP1');

	/** The heaviest face each role can carry: its grade plus every family, so the three rarest fill the face. */
	const LOADS: Record<Role, readonly string[]> = {
		hitter: ['grade-perfect', 'perfect', 'mvp', 'hr-70', 'hits-250', 'rbi-160', 'sb-100', 'obp-500', 'club-50', 'cycle-2', 'hr-game-4', 'grand-slam-3', 'walk-off-3'],
		starter: ['grade-s-plus', 'wins-160', 'k-600', 'ace-100', 'no-hitter-3', 'perfect-game-2', 'shutout-5', 'k-game-20'],
		'two-way': ['grade-perfect', 'perfect', 'mvp', 'hr-70', 'cycle-2', 'no-hitter-3', 'perfect-game-2', 'k-game-20']
	};

	function profileFor(role: Role, cardEra: CardEra, name: string, index: number): Profile {
		const year = ERA_YEAR[cardEra];
		const identity = { year, seasonId: `sticker-slots-${index}:${year}:AL:T`, playerId: `sticker-slots-${index}`, displayName: name };
		if (role === 'hitter') return { ...hitter, ...identity, eligibleSlots: ['2B'], primaryHitterSlot: '2B', pitching: undefined, pitchingRates: undefined };
		if (role === 'starter') return { ...starter, ...identity, eligibleSlots: ['SP1'], primaryHitterSlot: null, batting: undefined, battingRates: undefined };
		return { ...hitter, ...identity, eligibleSlots: ['2B', 'SP1'], primaryHitterSlot: '2B', pitching: starter.pitching, pitchingRates: starter.pitchingRates };
	}

	function viewFor(role: Role, cardEra: CardEra, finish: ExampleCardFinish, name: string, photo: boolean, index: number): CardViewModel {
		const profile = profileFor(role, cardEra, name, index);
		const sourceId = role === 'starter' ? starter.playerId : hitter.playerId;
		const player = media.players[sourceId];
		const cardMedia = photo && player ? { ...media, players: { ...media.players, [profile.playerId]: { ...player, name } } } : null;
		const rankingRole: ExampleCardRole = role === 'starter' ? 'starter' : 'hitter';
		return createCardViewModel({ profile, slot: role === 'starter' ? 'SP1' : '2B', ranking: getExampleFinishRanking(rankingRole, finish), media: cardMedia, mediaStatus: 'ready', manifest: fixtures.manifest });
	}

	function stickersFor(role: Role): PlacedSticker[] {
		const placed = LOADS[role].map(kind => {
			const spot = STICKER_SPOTS[STICKER_BY_KIND.get(kind)!.family];
			return { kind, x: spot.x, y: spot.y, hidden: false, earnedAt: '2025-10-01T00:00:00.000Z' };
		});
		if (mode === 'era') return placed;
		if (mode === 'none') return [];
		// The old shared spots, pinned a hair off the defaults so the era table leaves them where they were.
		const face = faceStickers(placed);
		return face.map((sticker, index) => {
			const at = index === 0 ? STICKER_SPOTS.grade : LEGACY_FACE_SLOTS[index - 1];
			return { kind: sticker.kind, x: at.x + 1e-5, y: at.y, hidden: false, earnedAt: sticker.earnedAt };
		});
	}

	interface Variant { id: string; era: CardEra; role: Role; finish: ExampleCardFinish; name: string; nameKey: string; photo: boolean; view: CardViewModel; stickers: PlacedSticker[] }

	const variants = $derived.by(() => {
		const list: Variant[] = [];
		let index = 0;
		const eras = era ? [era] : ERAS;
		for (const cardEra of eras) {
			const combos = era
				? FINISHES.flatMap(finish => NAMES.flatMap(name => ROLES.flatMap(role => [true, false].map(photo => ({ finish, name, role, photo })))))
				: [{ finish: 'foil' as const, name: NAMES[1], role: 'hitter' as const, photo: true }];
			for (const combo of combos) {
				index += 1;
				list.push({
					id: `${cardEra}-${combo.role}-${combo.finish}-${combo.name.key}-${combo.photo ? 'photo' : 'nophoto'}`,
					era: cardEra, role: combo.role, finish: combo.finish, name: combo.name.name, nameKey: combo.name.key, photo: combo.photo,
					view: viewFor(combo.role, cardEra, combo.finish, combo.name.name, combo.photo, index),
					stickers: stickersFor(combo.role)
				});
			}
		}
		return list;
	});

	/** Protected-layer boxes and sticker circles per card, card-normalized, drawn with their margins when the overlay is on. */
	let boxes = $state<Record<string, { x: number; y: number; w: number; h: number; layer: string }[]>>({});
	let spots = $state<Record<string, { x: number; y: number; r: number }[]>>({});
	const ASPECT = STICKER_LAYOUT.aspect;
	const FRAME = STICKER_LAYOUT.rim + STICKER_MARGIN;
	let host = $state<HTMLElement>();
	function measure(): void {
		if (!overlay || !host) return;
		const next: typeof boxes = {};
		const nextSpots: typeof spots = {};
		for (const entry of host.querySelectorAll<HTMLElement>('[data-variant]')) {
			const card = entry.querySelector<HTMLElement>('.card[data-face="front"], [data-card][data-face="front"]');
			if (!card) continue;
			const frame = card.getBoundingClientRect();
			next[entry.dataset.variant!] = [...card.querySelectorAll<HTMLElement | SVGElement>(PROTECTED_LAYER_SELECTOR)]
				// An svg that only frames protected text (the 1970s arc) is measured by that text, as `just sticker-slots` does.
				.filter(node => !(node instanceof SVGSVGElement && node.querySelector(PROTECTED_LAYER_SELECTOR)))
				.map(node => ({ node, rect: node.getBoundingClientRect() }))
				.filter(({ rect }) => rect.width > 0 && rect.height > 0)
				.map(({ node, rect }) => ({ x: (rect.left - frame.left) / frame.width, y: (rect.top - frame.top) / frame.height, w: rect.width / frame.width, h: rect.height / frame.height, layer: node.dataset.layer ?? '' }));
			nextSpots[entry.dataset.variant!] = [...card.querySelectorAll('.stickers .spot')].map(spot => {
				const rect = spot.getBoundingClientRect();
				return { x: (rect.left + rect.width / 2 - frame.left) / frame.width, y: (rect.top + rect.height / 2 - frame.top) / frame.height, r: rect.width / 2 / frame.width };
			});
		}
		boxes = next;
		spots = nextSpots;
	}
	onMount(() => {
		const timer = setTimeout(measure, 600);
		return () => clearTimeout(timer);
	});
	$effect(() => {
		void variants;
		void overlay;
		const timer = setTimeout(measure, 600);
		return () => clearTimeout(timer);
	});
</script>

<StoryFrame wide onReset={() => {}}>
	<div class="slots" bind:this={host} style={`--w:${width}px`} data-sticker-slots-mode={mode}>
		{#each variants as variant (variant.id)}
			{@const identityMargin = ERA_PLACEMENT[variant.era]?.identityMargin ?? STICKER_MARGIN}
			<figure data-variant={variant.id} data-era={variant.era} data-role={variant.role} data-finish={variant.finish} data-name={variant.nameKey} data-photo={variant.photo}>
				<div class="card-slot">
					<Card s={variant.view} face="front" interactive={false} idle={false} capture={false} stickers={variant.stickers} onDetails={() => {}} />
					{#if overlay && boxes[variant.id]}
						<svg class="overlay" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
							<rect class="frame" x={FRAME} y={FRAME / ASPECT} width={1 - 2 * FRAME} height={1 - 2 * FRAME / ASPECT}><title>inner frame less the sticker margin</title></rect>
							{#each boxes[variant.id] as box, index (index)}
								<rect x={box.x} y={box.y} width={box.w} height={box.h}><title>{box.layer}</title></rect>
								<rect class="margin" x={box.x - identityMargin} y={box.y - identityMargin / ASPECT} width={box.w + 2 * identityMargin} height={box.h + 2 * identityMargin / ASPECT}></rect>
							{/each}
							{#each spots[variant.id] ?? [] as spot, index (index)}
								<ellipse cx={spot.x} cy={spot.y} rx={spot.r + STICKER_MARGIN} ry={(spot.r + STICKER_MARGIN) / ASPECT}><title>sticker margin</title></ellipse>
							{/each}
						</svg>
					{/if}
				</div>
				<figcaption>{variant.era} · {variant.role} · {variant.finish} · {variant.nameKey}{variant.photo ? '' : ' · no photo'}</figcaption>
			</figure>
		{/each}
	</div>
</StoryFrame>

<style>
	.slots { display: grid; grid-template-columns: repeat(auto-fill, var(--w)); gap: 24px 20px; padding: 8px 0 32px; }
	figure { margin: 0; display: grid; gap: 6px; }
	.card-slot { position: relative; width: var(--w); }
	figcaption { font: 12px/1.3 system-ui, sans-serif; color: var(--muted); }
	.overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 20; }
	.overlay rect { fill: oklch(65% .22 25 / .14); stroke: oklch(62% .24 25); stroke-width: 1; vector-effect: non-scaling-stroke; }
	.overlay rect.margin { fill: none; stroke-dasharray: 3 2; stroke-opacity: .7; }
	.overlay rect.frame { fill: none; stroke: oklch(70% .15 250); stroke-dasharray: 4 3; }
	.overlay ellipse { fill: none; stroke: oklch(75% .17 150); stroke-width: 1; stroke-dasharray: 3 2; vector-effect: non-scaling-stroke; }
</style>
