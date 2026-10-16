<script lang="ts">
	import { onMount, tick } from 'svelte';
	import Card from '#lib/cards/Card.svelte';
	import type { CardViewModel } from '#lib/cards/view-model.ts';
	import { STICKERS, STICKER_SPOTS } from '#lib/collection/stickers.ts';
	let cards = $state.raw<CardViewModel[]>([]);
	let width = $state(240);
	let decorated = $state(false);
	const stickers = STICKERS.map(item => ({ kind: item.kind, ...STICKER_SPOTS[item.family], hidden: false, earnedAt: 'audit' }));
	onMount(() => {
		const host = window as unknown as { renderAudit?: (items: CardViewModel[], size: number, decoration: boolean) => Promise<void> };
		host.renderAudit = async (items, size, decoration) => {
			width = size;
			decorated = decoration;
			cards = items;
			await tick();
			await document.fonts.ready;
			await Promise.all([...document.querySelectorAll<HTMLImageElement>('[data-audit-grid] img')].map(async image => {
				image.loading = 'eager';
				await image.decode();
			}));
			await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
		};
		return () => { delete host.renderAudit; };
	});
</script>
<svelte:head><meta name="robots" content="noindex" /></svelte:head>
<div data-audit-grid style={`--card-width:${width}px`}>
	{#each cards as card, index (index)}
		<div class="tile"><Card s={card} capture={!decorated} scene interactive={false} idle={false} stickers={decorated ? stickers : []} appearance={null} onDetails={() => {}} /></div>
	{/each}
</div>
<style>
	:global(body) { margin: 0; }
	[data-audit-grid] { display: grid; grid-template-columns: repeat(8, var(--card-width)); width: max-content; background: #10161c; }
	.tile { width: var(--card-width); height: calc(var(--card-width) * 1.4); overflow: hidden; }
	.tile :global(*) { animation: none !important; transition: none !important; }
</style>
