<script module lang="ts">
	export type StickersWorkshopView = 'sheet' | 'cards' | 'tiers' | 'sizes';

	export interface StickersWorkshopProps {
		view?: StickersWorkshopView;
		width?: number;
		fresh?: boolean;
		/** Cards drift and follow the pointer, as in the finish gallery, so stickers can be judged under moving light. */
		drift?: boolean;
	}
</script>

<script lang="ts">
	import Card from '#lib/cards/Card.svelte';
	import { createCardViewModel } from '#lib/cards/view-model.ts';
	import StickerBadge from '#lib/collection/StickerBadge.svelte';
	import { STICKERS, STICKER_BY_KIND, STICKER_SPOTS, type PlacedSticker, type StickerFamily } from '#lib/collection/stickers.ts';
	import type { Profile, RosterSlot } from '#lib/game/types.ts';
	import { createExampleMedia } from './media-fixtures.ts';
	import { createExampleFixtures, getExampleFinishRanking } from './fixtures.ts';
	import StoryFrame from './StoryFrame.svelte';

	let { view = 'sheet', width = 280, fresh = false, drift = true }: StickersWorkshopProps = $props();

	let instance = $state(0);
	const cardWidth = $derived(Math.max(160, Math.min(410, Math.round(width))));

	const fixtures = createExampleFixtures();
	const media = createExampleMedia();

	/** Families in sheet order, each with its tiers lowest first. */
	const families = [...new Set(STICKERS.map(sticker => sticker.family))].map(family => ({
		family,
		tiers: STICKERS.filter(sticker => sticker.family === family).toSorted((a, b) => a.tier - b.tier)
	}));

	function profileForSlot(slot: RosterSlot): Profile {
		const pick = fixtures.completeDraft.picks.find(item => item.slot === slot);
		const profile = fixtures.profiles.find(item => item.seasonId === pick?.seasonId);
		if (!profile) throw new Error(`Example fixture is missing ${slot}`);
		return profile;
	}

	function cardFor(slot: RosterSlot) {
		const role = slot === 'CL' ? 'closer' : slot === 'SP1' ? 'starter' : 'hitter';
		return createCardViewModel({ profile: profileForSlot(slot), slot, ranking: getExampleFinishRanking(role, 'base'), media, mediaStatus: 'ready', manifest: fixtures.manifest });
	}

	/** Stickers at their family's default spot, as the collection places them when earned. */
	function placed(kinds: readonly string[], hidden: readonly string[] = []): PlacedSticker[] {
		return kinds.map(kind => {
			const definition = STICKER_BY_KIND.get(kind);
			if (!definition) throw new Error(`Unknown sticker ${kind}`);
			const spot = STICKER_SPOTS[definition.family];
			return { kind, x: spot.x, y: spot.y, hidden: hidden.includes(kind), earnedAt: '2025-10-01T00:00:00.000Z' };
		});
	}

	/** A face for each role holding every family that role can earn; the face shows the grade and the three rarest. */
	const faces = [
		{ title: 'Hitter, every batting family', slot: '2B' as const, stickers: placed(['grade-perfect', 'perfect', 'mvp', 'hr-70', 'hits-250', 'rbi-160', 'sb-100', 'obp-500', 'club-50', 'cycle-2', 'hr-game-4', 'grand-slam-3', 'walk-off-3', 'drafted-100']) },
		{ title: 'Starter, every pitching family', slot: 'SP1' as const, stickers: placed(['grade-s-plus', 'wins-160', 'k-600', 'ace-100', 'no-hitter-3', 'perfect-game-2', 'shutout-5', 'k-game-20', 'drafted-50']) },
		{ title: 'Closer', slot: 'CL' as const, stickers: placed(['grade-b', 'wins-100', 'closer', 'saves-50', 'perfect-closer']) },
		{ title: 'Hitter, a typical season', slot: '2B' as const, stickers: placed(['grade-a', 'wins-120', 'hr-30', 'hits-175', 'rbi-100', 'grand-slam', 'walk-off', 'drafted-3']) }
	];

	/** Earned sets where a face shows less than was earned: the top tier per family, and nothing hidden. */
	const tierCases = [
		{ title: 'A moved sticker', note: 'The player moved 60 HR to the lower left; it keeps that spot while the rest fill the face slots.', stickers: [...placed(['grade-a', 'mvp', 'cycle', 'walk-off']), { ...placed(['hr-60'])[0], x: 0.2, y: 0.62 }] },
		{ title: 'Team tiers: 100, 120 and 162–0 earned', note: 'Only 162–0 shows.', stickers: placed(['wins-100', 'wins-120', 'perfect', 'grade-perfect']) },
		{ title: 'Power tiers: 40 and 60 HR earned', note: 'Only 60 HR shows.', stickers: placed(['hr-40', 'hr-60', 'grade-a']) },
		{ title: 'Hidden stickers', note: 'MVP and 40 HR earned but hidden; the face shows the rest.', stickers: placed(['mvp', 'hr-40', 'hits-200', 'grade-c'], ['mvp', 'hr-40']) },
		{ title: 'Nothing visible', note: 'Every earned sticker is hidden; the card shows no layer.', stickers: placed(['grade-f', 'wins-100'], ['grade-f', 'wins-100']) }
	];

	const freshKinds = $derived(fresh ? new Set(STICKERS.map(sticker => sticker.kind)) : undefined);

	/** Badge font sizes the app uses: a sticker is 21em of these. */
	const surfaces = [
		{ label: 'Collection detail list', size: '.15rem' },
		{ label: 'Results collection list', size: '.08rem' },
		{ label: 'Results earned strip', size: '.055rem' }
	];
	const familyName: Record<StickerFamily, string> = {
		grade: 'Season grade', team: 'Team record', mvp: 'Team MVP', war: 'Season WAR', power: 'Power', contact: 'Contact', production: 'Production',
		speed: 'Speed', eye: 'Eye', club: 'HR–SB club', cycle: 'Cycle', homerGame: 'Multi-homer game', grandSlam: 'Grand slam', walkOff: 'Walk-off home run',
		strikeouts: 'Strikeouts', ace: 'Ace', closer: 'Lights out', saves: 'Saves', perfectCloser: 'Perfect closer', noHitter: 'No-hitter', perfectGame: 'Perfect game',
		shutout: 'Shutout', strikeoutGame: '20-strikeout game', loyalty: 'Loyalty'
	};
</script>

<StoryFrame onReset={() => instance += 1} onReplay={fresh && view !== 'sheet' && view !== 'sizes' ? () => instance += 1 : undefined} wide={view === 'sheet'}>
	{#key instance}
		<section class="stickers-workshop" data-stickers-workshop data-view={view} style={`--card-width:${cardWidth}px`}>
			{#if view === 'sheet'}
				{#each families as { family, tiers } (family)}
					<section class="family" aria-labelledby={`family-${family}`}>
						<h2 id={`family-${family}`}>{familyName[family]}</h2>
						<ul>
							{#each tiers as definition (definition.kind)}
								<li data-sticker-kind={definition.kind}>
									<span class="sheet-badge" aria-hidden="true"><StickerBadge {definition} tilt={STICKER_SPOTS[family].tilt} /></span>
									<span class="rule">
										<strong>{definition.title}</strong>
										<code>{definition.kind}</code>{#if tiers.length > 1}<span class="tier">Tier {definition.tier}</span>{/if}
									</span>
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			{:else if view === 'cards' || view === 'tiers'}
				<div class="cards">
					{#each view === 'cards' ? faces : tierCases.map(item => ({ ...item, slot: '2B' as const })) as face (face.title)}
						<figure class="card-entry">
							<div class="card-shell" style:width={`${cardWidth}px`}>
								<Card s={cardFor(face.slot)} interactive={drift} idle={drift} capture={false} stickers={face.stickers} freshStickers={freshKinds} onDetails={() => {}} />
							</div>
							<figcaption>
								<strong>{face.title}</strong>
								{#if 'note' in face}<span>{face.note}</span>{/if}
							</figcaption>
						</figure>
					{/each}
				</div>
			{:else}
				<div class="sizes">
					<section aria-labelledby="sizes-card">
						<h2 id="sizes-card">On a card (0.5cqw)</h2>
						<div class="card-sizes">
							{#each [160, 280, 410] as size (size)}
								<figure class="card-entry">
									<div class="card-shell" style:width={`${size}px`}>
										<Card s={cardFor('2B')} interactive={drift} idle={drift} capture={false} stickers={faces[0].stickers} onDetails={() => {}} />
									</div>
									<figcaption><strong>{size}px card</strong></figcaption>
								</figure>
							{/each}
						</div>
					</section>
					<section aria-labelledby="sizes-lists">
						<h2 id="sizes-lists">In lists</h2>
						{#each surfaces as surface (surface.label)}
							<div class="surface-row">
								<span class="surface-label">{surface.label} <code>{surface.size}</code></span>
								<span class="surface-badges" style:font-size={surface.size}>
									{#each families as { family, tiers } (family)}<StickerBadge definition={tiers.at(-1)!} />{/each}
								</span>
							</div>
						{/each}
					</section>
				</div>
			{/if}
		</section>
	{/key}
</StoryFrame>

<style>
	.stickers-workshop { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-6); min-width: 0; }
	h2 { margin: 0 0 var(--space-3); color: var(--muted); font-size: var(--text-sm); letter-spacing: .06em; text-transform: uppercase; }
	.family ul { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr)); gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
	.family li { display: flex; align-items: center; gap: var(--space-4); min-width: 0; padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
	.sheet-badge { flex: none; font-size: .17rem; padding: .3rem; line-height: 0; }
	.rule { display: grid; gap: var(--space-1); min-width: 0; font-size: var(--text-sm); }
	.rule strong { font-weight: 650; overflow-wrap: anywhere; }
	.rule code, .surface-label code { color: var(--muted); font-size: var(--text-xs); }
	.tier { color: var(--muted); font-size: var(--text-xs); }
	.cards, .card-sizes { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--card-width)), 1fr)); gap: clamp(1rem, 3vw, 2rem); align-items: start; }
	.card-sizes { display: flex; flex-wrap: wrap; align-items: flex-start; }
	.card-sizes .card-entry { max-width: 100%; }
	.card-entry { display: grid; grid-template-columns: minmax(0, 1fr); justify-items: center; gap: var(--space-3); min-width: 0; margin: 0; }
	.card-shell { max-width: 100%; }
	figcaption { display: grid; gap: var(--space-1); max-width: var(--card-width); font-size: var(--text-sm); text-align: center; }
	figcaption span { color: var(--muted); font-size: var(--text-xs); }
	.sizes { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-8); }
	.sizes > section { min-width: 0; }
	.surface-row { display: grid; gap: var(--space-2); padding-block: var(--space-3); border-top: 1px solid var(--border); }
	.surface-label { font-size: var(--text-sm); }
	.surface-badges { display: flex; flex-wrap: wrap; gap: 3em 4em; padding: 1.5em; line-height: 0; }
</style>
