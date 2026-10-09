<script module lang="ts">
	import type { CardEra } from '#lib/cards/view-model.ts';
	import type { ExampleCardFinish } from './fixtures.ts';

	export type CardWorkshopRole = 'hitter' | 'starter' | 'closer' | 'two-way' | 'bullpen';
	export type CardWorkshopMode = 'interactive' | 'idle' | 'wall' | 'flip' | 'inspection' | 'gallery';

	export interface CardWorkshopProps {
		era?: CardEra;
		role?: CardWorkshopRole;
		finish?: ExampleCardFinish;
		width?: number;
		mode?: CardWorkshopMode;
		missingPhoto?: boolean;
		longIdentity?: boolean;
	}
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import Card from '#lib/cards/Card.svelte';
	import CardDetails from '#lib/cards/CardDetails.svelte';
	import CardFlip from '#lib/cards/CardFlip.svelte';
	import CardInspection from '#lib/cards/CardInspection.svelte';
	import { createCardViewModel, type CardViewModel } from '#lib/cards/view-model.ts';
	import type { Profile, Slot } from '#lib/game/types.ts';
	import { createExampleMedia } from './media-fixtures.ts';
	import { createExampleFixtures, getExampleFinishRanking, type ExampleCardRole } from './fixtures.ts';
	import StoryFrame from './StoryFrame.svelte';

	let {
		era = '2020s',
		role = 'hitter',
		finish = 'base',
		width = 280,
		mode = 'interactive',
		missingPhoto = false,
		longIdentity = false
	}: CardWorkshopProps = $props();

	const eraYear: Record<CardEra, number> = {
		'1950s': 1955,
		'1960s': 1965,
		'1970s': 1975,
		'1980s': 1985,
		'1990s': 1995,
		'2000s': 2005,
		'2010s': 2015,
		'2020s': 2025
	};
	const eras = Object.keys(eraYear) as CardEra[];
	const finishes = ['base', 'foil', 'emboss', 'gem'] as const;

	const fixtures = createExampleFixtures();
	const manifest = fixtures.manifest;
	const roleProfiles: Record<ExampleCardRole, Profile> = {
		hitter: profileForSlot('2B'),
		starter: profileForSlot('SP1'),
		closer: profileForSlot('CL'),
		bullpen: profileForSlot('BP')
	};
	let instance = $state(0);
	let flipKey = $state(0);
	let replayToken = 0;
	let turned = $state(false);
	let details = $state<CardDetails>();
	let wallDetails = $state<CardDetails>();
	let inspection = $state<CardInspection>();
	let inspectionTrigger = $state<HTMLButtonElement>();
	let selectedWall = $state<CardViewModel | null>(null);

	const cardWidth = $derived(Math.max(160, Math.min(410, Math.round(width))));
	const media = $derived(missingPhoto ? null : createExampleMedia());
	const profile = $derived(profileFor(role, era, longIdentity));
	const card = $derived(createCardViewModel({
		profile,
		slot: slotFor(role),
		ranking: getExampleFinishRanking(rankingRole(role), finish),
		media,
		mediaStatus: 'ready',
		manifest
	}));
	const wallCards = $derived(eras.map((wallEra, index) => {
		let wallRole: ExampleCardRole = 'hitter';
		if (index % 3 === 0) wallRole = 'closer';
		else if (index % 2 !== 0) wallRole = 'starter';
		const wallFinish = finishes[index % finishes.length];
		const wallProfile = profileFor(wallRole, wallEra, false);
		const sourcePlayerId = wallProfile.playerId;
		wallProfile.playerId = `storybook-wall-${index + 1}`;
		wallProfile.seasonId = `storybook-wall-${index + 1}:${eraYear[wallEra]}:AL:T`;
		wallProfile.displayName = `Example Wall Identity ${String(index + 1).padStart(2, '0')}`;
		return createCardViewModel({
			profile: wallProfile,
			slot: slotFor(wallRole),
			ranking: getExampleFinishRanking(wallRole, wallFinish),
			media: mediaFor(wallProfile, sourcePlayerId),
			mediaStatus: 'ready',
			manifest
		});
	}));
	const galleryCards = $derived(eras.map((galleryEra, index) => {
		const galleryProfile = profileFor('hitter', galleryEra, false);
		const sourcePlayerId = galleryProfile.playerId;
		galleryProfile.playerId = `storybook-gallery-${index + 1}`;
		galleryProfile.seasonId = `storybook-gallery-${index + 1}:${eraYear[galleryEra]}:AL:T`;
		galleryProfile.displayName = `Example Era ${galleryEra}`;
		return createCardViewModel({
			profile: galleryProfile,
			slot: '2B',
			ranking: getExampleFinishRanking('hitter', finish),
			media: mediaFor(galleryProfile, sourcePlayerId),
			mediaStatus: 'ready',
			manifest
		});
	}));

	function mediaFor(profile: Profile, sourcePlayerId: string) {
		if (!media) return null;
		const source = media.players[sourcePlayerId];
		if (!source) throw new Error(`Example media is missing ${sourcePlayerId}`);
		return {
			...media,
			players: { ...media.players, [profile.playerId]: { ...source, name: profile.displayName } }
		};
	}

	function slotFor(nextRole: CardWorkshopRole): Slot {
		if (nextRole === 'starter') return 'SP1';
		if (nextRole === 'closer') return 'CL';
		if (nextRole === 'bullpen') return 'BP';
		return '2B';
	}

	function rankingRole(nextRole: CardWorkshopRole): ExampleCardRole {
		return nextRole === 'two-way' ? 'hitter' : nextRole;
	}

	function seasonIdentity(nextRole: CardWorkshopRole, nextEra: CardEra): Pick<Profile, 'seasonId' | 'year'> {
		const year = eraYear[nextEra];
		return { year, seasonId: `storybook-card-${nextRole}:${year}:AL:T` };
	}

	function profileForSlot(slot: Slot): Profile {
		const pick = fixtures.completeDraft.picks.find(pick => pick.slot === slot);
		const profile = fixtures.profiles.find(profile => profile.seasonId === pick?.seasonId);
		if (!profile) throw new Error(`Example fixture is missing ${slot}`);
		return profile;
	}

	function profileFor(nextRole: CardWorkshopRole, nextEra: CardEra, useLongIdentity: boolean): Profile {
		const identity = seasonIdentity(nextRole, nextEra);
		const source = roleProfiles[rankingRole(nextRole)];
		let result: Profile;
		if (nextRole === 'hitter') {
			result = { ...source, ...identity, eligibleSlots: ['2B'], primaryHitterSlot: '2B', pitching: undefined, pitchingRates: undefined };
		} else if (nextRole === 'two-way') {
			const starter = roleProfiles.starter;
			result = {
				...source,
				...identity,
				displayName: 'Example Two-Way 01',
				eligibleSlots: ['2B', 'SP1'],
				primaryHitterSlot: '2B',
				pitching: starter.pitching,
				pitchingRates: starter.pitchingRates
			};
		} else {
			result = { ...source, ...identity, eligibleSlots: [slotFor(nextRole)], primaryHitterSlot: null, batting: undefined, battingRates: undefined };
		}
		if (useLongIdentity) result.displayName = 'Fictional Aurelius Maximilian Longname the Third';
		return result;
	}

	async function showDetails(): Promise<void> {
		await details?.showDetails();
	}

	async function showWallDetails(nextCard: CardViewModel): Promise<void> {
		selectedWall = nextCard;
		await tick();
		await wallDetails?.showDetails();
	}

	function openInspection(trigger: HTMLButtonElement): void {
		void inspection?.open(trigger);
	}

	function showInspection(): void {
		if (inspectionTrigger) openInspection(inspectionTrigger);
	}

	async function replay(): Promise<void> {
		const token = ++replayToken;
		turned = false;
		flipKey += 1;
		await tick();
		if (token === replayToken) turned = true;
	}

	function reset(): void {
		replayToken += 1;
		turned = false;
		selectedWall = null;
		instance += 1;
	}
</script>

<StoryFrame onReset={reset} onReplay={mode === 'flip' ? replay : undefined}>
	{#key instance}
		<section class="card-workshop" data-card-workshop data-mode={mode}>
			{#if mode === 'wall'}
				<div class="wall" aria-label="Card finish wall">
					{#each wallCards as wallCard (wallCard.full)}
						<article class="wall-entry">
							<div class="card-shell" style:width={`${Math.min(cardWidth, 250)}px`}>
								<Card s={wallCard} interactive wall capture={false} onDetails={() => void showWallDetails(wallCard)} />
							</div>
							<button type="button" onclick={() => void showWallDetails(wallCard)}>Show {wallCard.full} details</button>
						</article>
					{/each}
				</div>
				{#if selectedWall}<CardDetails bind:this={wallDetails} s={selectedWall} />{/if}
			{:else if mode === 'gallery'}
				<div class="gallery" aria-label="Card era gallery">
					{#each galleryCards as galleryCard (galleryCard.era)}
						<article class="gallery-entry">
							<h2>{galleryCard.era}</h2>
							<div class="card-shell" style:width={`${Math.min(cardWidth, 230)}px`}>
								<Card s={galleryCard} capture={false} onDetails={showDetails} />
							</div>
						</article>
					{/each}
				</div>
				<CardDetails bind:this={details} s={card} />
			{:else if mode === 'flip'}
				<div class="single-card">
					{#key flipKey}
						<div class="card-shell" style:width={`${cardWidth}px`}>
							<CardFlip s={card} bind:turned onDetails={showDetails} />
						</div>
					{/key}
					<CardDetails bind:this={details} s={card} />
				</div>
			{:else if mode === 'inspection'}
				<div class="single-card">
					<button bind:this={inspectionTrigger} class="inspection-trigger" type="button" aria-label={`Inspect ${card.full}`} onclick={event => openInspection(event.currentTarget)}>
						<div class="card-shell" style:width={`${cardWidth}px`}>
							<Card s={card} interactive capture={false} onDetails={showInspection} />
						</div>
					</button>
					<p>Open the real inspection dialog to turn the card, read its text version, and reveal value details.</p>
					<CardInspection bind:this={inspection} s={card} />
				</div>
			{:else}
				<div class="single-card">
					<div class="card-shell" style:width={`${cardWidth}px`}>
						<Card s={card} interactive={mode === 'interactive' || mode === 'idle'} idle={mode === 'idle'} capture={false} onDetails={showDetails} />
					</div>
					<button type="button" onclick={() => void showDetails()}>Show card details</button>
					<CardDetails bind:this={details} s={card} />
				</div>
			{/if}
		</section>
	{/key}
</StoryFrame>

<style>
	.card-workshop { min-width: 0; }
	.single-card { display: grid; grid-template-columns: minmax(0, 1fr); justify-items: center; gap: var(--space-4); }
	.card-shell { max-width: 100%; }
	.single-card > p { max-width: 42rem; margin: 0; color: var(--muted); text-align: center; }
	.inspection-trigger { max-width: 100%; padding: 0; border: 0; background: transparent; color: inherit; cursor: pointer; }
	.inspection-trigger:focus-visible { outline: 3px solid var(--focus, var(--accent)); outline-offset: .4rem; }
	.wall, .gallery { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr)); gap: clamp(1rem, 3vw, 2rem); align-items: start; }
	.wall-entry, .gallery-entry { display: grid; grid-template-columns: minmax(0, 1fr); justify-items: center; gap: var(--space-3); min-width: 0; }
	.wall-entry button { max-width: 100%; }
	.gallery-entry h2 { margin: 0; font-size: var(--text-sm); color: var(--muted); letter-spacing: .06em; text-transform: uppercase; }
</style>
