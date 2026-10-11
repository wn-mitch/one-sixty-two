<script module lang="ts">
	export interface CollectionWorkshopProps {
		initial?: 'binder' | 'empty' | 'blocked';
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import CollectionBinder from '#lib/components/collection/CollectionBinder.svelte';
	import { createCardViewModel, type CardViewModel } from '#lib/cards/view-model.ts';
	import type { CollectedCard } from '#lib/collection/collection.ts';
	import { seasonStickers, STICKER_BY_KIND, STICKER_SPOTS, type StickerFamily } from '#lib/collection/stickers.ts';
	import { STORAGE_NOTICE } from '#lib/game/library.ts';
	import { getExampleSeries } from './series-fixtures.ts';
	import StoryFrame from './StoryFrame.svelte';

	let { initial = 'binder' }: CollectionWorkshopProps = $props();
	let saved: CollectedCard[] = [];
	let cards = $state.raw<CollectedCard[]>([]);
	let views = $state.raw<ReadonlyMap<string, CardViewModel>>(new Map());
	let status = $state('');
	let loading = $state(true);
	let error = $state('');

	function reset(): void {
		cards = initial === 'binder' ? saved : [];
		status = initial === 'blocked' ? STORAGE_NOTICE : '';
	}

	/** Edits change only this story's copy. */
	function update(seasonId: string, family: StickerFamily, change: (sticker: CollectedCard['stickers'][number]) => CollectedCard['stickers'][number]): void {
		cards = cards.map(card => card.seasonId !== seasonId ? card : {
			...card,
			stickers: card.stickers.map(sticker => STICKER_BY_KIND.get(sticker.kind)?.family === family ? change(sticker) : sticker)
		});
	}

	onMount(() => {
		void getExampleSeries()
			.then(example => {
				const byCard = new Map<string, CollectedCard>();
				for (const entry of example.library) {
					const earned = seasonStickers(entry);
					for (const pick of entry.roster) {
						const line = [...entry.batting, ...entry.pitching].find(item => item.seasonId === pick.seasonId) ?? null;
						const existing = byCard.get(pick.seasonId);
						if (existing) { existing.times++; continue; }
						byCard.set(pick.seasonId, {
							seasonId: pick.seasonId, label: pick.label, slots: [pick.slot], times: 1, firstAt: entry.savedAt, lastAt: entry.savedAt,
							best: { wins: entry.record.wins, losses: entry.record.losses, line },
							stickers: earned.filter(item => item.seasonId === pick.seasonId).map(item => ({ kind: item.kind, ...STICKER_SPOTS[STICKER_BY_KIND.get(item.kind)!.family], hidden: false, earnedAt: entry.savedAt }))
						});
					}
				}
				saved = [...byCard.values()];
				const profiles = [...example.libraryProfiles.values()].flat();
				views = new Map(profiles.flatMap(profile => {
					const card = byCard.get(profile.seasonId);
					return card ? [[profile.seasonId, createCardViewModel({ profile, slot: card.slots[0], manifest: example.manifest })] as const] : [];
				}));
				reset();
			})
			.catch((reason: unknown) => { error = reason instanceof Error ? reason.message : 'Unable to prepare the example collection.'; })
			.finally(() => { loading = false; });
	});
</script>

<StoryFrame onReset={reset} wide fixtureNotice="Cards from two synthetic clubs played through a real season each. Sticker edits stay in this story and are never saved.">
	<div class="page">
		<h1>Collection</h1>
		{#if loading}
			<p class="muted" role="status">Loading the example collection…</p>
		{:else if error}
			<p class="error" role="alert">{error}</p>
		{:else}
			<CollectionBinder {cards} {views} {status}
				onMove={(seasonId, family, x, y) => update(seasonId, family, sticker => ({ ...sticker, x, y }))}
				onHide={(seasonId, family, hidden) => update(seasonId, family, sticker => ({ ...sticker, hidden }))} />
		{/if}
	</div>
</StoryFrame>

<style>
	.page { display: grid; gap: var(--space-4); }
	h1 { margin: 0; font-size: clamp(2rem, 6vw, 3rem); letter-spacing: -.03em; }
	.error { margin: 0; color: var(--error); }
</style>
