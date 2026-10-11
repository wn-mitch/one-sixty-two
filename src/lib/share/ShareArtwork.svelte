<script lang="ts">
	import { onMount } from 'svelte';
	import Card from '../cards/Card.svelte';
	import { STOCK, roles } from '../cards/tokens.ts';
	import { FIELD, fieldArt } from '../components/field-layout.ts';
	import type { Slot } from '../game/types.ts';
	import type { ShareFormat, ShareRenderModel } from './types.ts';

	/**
	 * The season share image: the draft field card, with the home park drawn from its measured
	 * outline and every roster card in its slot, framed by the wordmark, the final record, and the
	 * replay link. The same component renders the local preview and the trusted capture.
	 */
	let { model, format = 'field' }: { model: ShareRenderModel; format?: ShareFormat } = $props();
	let root = $state<HTMLElement>();
	let hydrated = $state(false);
	const pct = (value: number, total: number) => `${(value / total) * 100}%`;
	const { window: fieldWindow, nameplate, stadium: stadiumPoint } = FIELD;
	const stadium = $derived(model.homeStadium);
	const art = $derived(fieldArt({ outline: [...stadium.outline] }));
	const palette = $derived(stadium.color ? roles({ primary: stadium.color, secondary: STOCK }) : null);
	const fieldStyle = $derived(palette ? `--stock: ${palette.field}; --stock-ink: ${palette.onField};` : undefined);
	const dimensions = $derived(([['LF', -45], ['CF', 0], ['RF', 45]] as const).flatMap(([label, bearing]) => {
		const dimension = stadium.dimensions.find(item => item.bearingDeg === bearing);
		return dimension ? [`${label} ${Math.round(dimension.distanceFt)}`] : [];
	}));
	// The header already carries the record, so the footer is the invitation: the replay once shared, the site until then.
	const replayLabel = $derived(model.replayUrl ? model.replayUrl.replace(/^https?:\/\//, '') : '162-0.dev');
	const expectedImages = $derived.by(() => {
		const urls = new Set<string>();
		for (const entry of model.cards) for (const url of [entry.card.photo, entry.card.logo]) if (url) urls.add(url);
		if (stadium.photo) urls.add(stadium.photo.url);
		return [...urls];
	});

	function slotPosition(slot: Slot): string {
		const point = FIELD.slots[slot];
		return `--x:${pct(point.x, FIELD.width)};--y:${pct(point.y, FIELD.height)}`;
	}

	onMount(() => { hydrated = true; });
	function ignoreCardDetails(): void { /* Front-only export has no details action. */ }
</script>

<section
	bind:this={root}
	class="field-share"
	data-share-artwork
	data-share-format={format}
	data-share-hydrated={hydrated}
	data-share-ready="false"
	data-share-state="idle"
	role="img"
	aria-label={`${model.record.wins} wins, ${model.record.losses} losses season share artwork`}
>
	<div class="expected-images" aria-hidden="true">
		{#each expectedImages as url}<img data-share-expected-image src={url} alt="" />{/each}
	</div>

	<header class="share-header">
		<strong class="wordmark"><i aria-hidden="true"></i>162-0</strong>
		<div class="record" aria-label={`${model.record.wins} wins and ${model.record.losses} losses`}>
			<b>{model.record.wins}</b><span>–</span><b class="losses">{model.record.losses}</b>
		</div>
	</header>

	<div class="field-card" style={fieldStyle}>
		<svg class="field-art" viewBox="0 0 {FIELD.width} {FIELD.height}" aria-hidden="true" focusable="false">
			<rect class="stock" width={FIELD.width} height={FIELD.height} rx="14"></rect>
			<rect class="ground" x={fieldWindow.x} y={fieldWindow.y} width={fieldWindow.width} height={fieldWindow.height} rx="6"></rect>
			<polygon class="fair" points={art.fair}></polygon>
			<polygon class="infield-dirt" points={art.infieldDirt}></polygon>
			<polygon class="infield-grass" points={art.infieldGrass}></polygon>
			<polyline class="foul-line" points={art.foulLines}></polyline>
			<circle class="mound" cx={art.mound.x} cy={art.mound.y} r="8"></circle>
			{#each art.bases as base}<rect class="base" x={base.x - 4.5} y={base.y - 4.5} width="9" height="9" transform="rotate(45 {base.x} {base.y})"></rect>{/each}
			<path class="base" d="M{art.home.x - 5} {art.home.y - 4}h10v4l-5 5l-5 -5z"></path>
			<rect class="staff-plate" x={fieldWindow.x} y={nameplate.y + nameplate.height + 4} width={fieldWindow.width} height={FIELD.height - nameplate.y - nameplate.height - 14} rx="6"></rect>
		</svg>
		<div class="nameplate" style={`--top:${pct(nameplate.y, FIELD.height)};--height:${pct(nameplate.height, FIELD.height)}`}>
			<strong>{stadium.name}</strong>
			{#if dimensions.length}<span>{dimensions.join(' · ')}</span>{/if}
		</div>
		<div class="park" style={`--x:${pct(stadiumPoint.x, FIELD.width)};--y:${pct(stadiumPoint.y, FIELD.height)}`}>
			<span class="park-card">
				{#if stadium.photo}<img src={stadium.photo.url} alt="" width={stadium.photo.width} height={stadium.photo.height} />{/if}
				<span class="park-name">{stadium.name}</span>
			</span>
			<span class="caption">Park</span>
		</div>
		{#each model.cards as entry (entry.seasonId)}
			<div class="slot" style={slotPosition(entry.slot)}>
				<span class="miniature"><Card s={entry.card} face="front" compact thumbnail capture interactive={false} onDetails={ignoreCardDetails} /></span>
				<span class="identity"><strong>{entry.card.full}</strong><span>{entry.card.year} · {entry.slot}</span></span>
			</div>
		{/each}
	</div>

	<footer class="share-footer">
		<strong>Beat this at</strong>
		<span>{replayLabel}{#if model.replayUrl} <b aria-hidden="true">↗</b>{/if}</span>
	</footer>
</section>

<style>
	[data-share-artwork] { position:relative; box-sizing:border-box; width:100%; aspect-ratio:4/5; container-type:inline-size; overflow:hidden; display:flex; flex-direction:column; align-items:center; justify-content:space-between; padding:3.6cqw 5.2cqw 2.2cqw; background:oklch(16% .009 255); color:oklch(97% .006 255); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-variant-numeric:tabular-nums; line-height:1; isolation:isolate; }
	.expected-images { position:absolute; inset:0; z-index:-1; pointer-events:none; opacity:0; }
	.expected-images img { position:absolute; width:1px; height:1px; }

	.share-header { flex:none; align-self:stretch; display:flex; align-items:center; justify-content:space-between; gap:3cqw; padding-bottom:1.6cqw; }
	.wordmark { display:inline-flex; align-items:center; gap:1.9cqw; font-size:4.6cqw; font-weight:850; letter-spacing:-.04em; }
	.wordmark i { display:block; width:2cqw; height:2cqw; border:.35cqw solid currentColor; transform:rotate(45deg); }
	.record { display:flex; align-items:baseline; gap:1.2cqw; font-size:10cqw; font-weight:850; letter-spacing:-.05em; line-height:.85; }
	.record span { color:oklch(52% .016 255); font-weight:600; }
	.record .losses { color:oklch(76% .018 255); }

	/* Draft field geometry: 424×594 card units, scaled by the field card's own width. */
	.field-card { position:relative; flex:none; width:80cqw; aspect-ratio:424 / 594; container-type:inline-size; border-radius:calc(100cqi * 14 / 424); box-shadow:0 2cqw 4cqw oklch(8% .01 255 / .45); }
	.field-art { position:absolute; inset:0; width:100%; height:100%; }
	.stock { fill:var(--stock, oklch(27% .016 255)); }
	.ground { fill:oklch(19% .02 160); }
	.fair { fill:oklch(24% .028 158); stroke:oklch(70% .02 255 / .45); stroke-width:2; }
	.infield-dirt { fill:oklch(32% .035 65 / .7); }
	.infield-grass { fill:oklch(26% .03 155); stroke:oklch(70% .02 255 / .5); stroke-width:1.2; }
	.foul-line { fill:none; stroke:oklch(88% .01 255 / .55); stroke-width:1.4; }
	.mound { fill:oklch(34% .035 65); }
	.base { fill:oklch(92% .01 255 / .8); }
	.staff-plate { fill:oklch(17% .012 255 / .88); }
	.nameplate { position:absolute; left:calc(100cqi * 16 / 424); right:calc(100cqi * 16 / 424); top:var(--top); height:var(--height); display:grid; align-content:center; gap:calc(100cqi * 2 / 424); color:var(--stock-ink, oklch(97% .006 255)); }
	.nameplate strong { font:italic 900 calc(100cqi * 17 / 424) / .95 'Barlow Condensed', sans-serif; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
	.nameplate span { font:700 calc(100cqi * 10.5 / 424) / 1 'Barlow Condensed', sans-serif; letter-spacing:.08em; }
	.park, .slot { position:absolute; left:var(--x); display:grid; justify-items:center; transform:translateX(-50%); }
	.park { --mini:calc(100cqi * 56 / 424); top:calc(var(--y) - var(--mini) * .7); gap:calc(100cqi * 3 / 424); width:calc(var(--mini) * 8 / 7); }
	.park-card { display:grid; grid-template-rows:minmax(0, 1fr) auto; gap:calc(100cqi * 2 / 424); width:var(--mini); aspect-ratio:5 / 7; padding:calc(100cqi * 3 / 424); box-sizing:border-box; overflow:hidden; border-radius:calc(100cqi * 4 / 424); color:var(--stock-ink, oklch(97% .006 255)); background:var(--stock, oklch(27% .016 255)); box-shadow:0 .3rem .7rem oklch(8% .01 255 / .4); }
	.park-card img { display:block; width:100%; height:100%; min-height:0; object-fit:cover; border-radius:calc(100cqi * 2 / 424); }
	.park-name { font:italic 900 calc(100cqi * 7.5 / 424) / .95 'Barlow Condensed', sans-serif; text-transform:uppercase; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; line-clamp:2; -webkit-box-orient:vertical; }
	.caption { color:oklch(76% .018 255); font:800 calc(100cqi * 9 / 424) / 1 'Barlow Condensed', sans-serif; letter-spacing:.06em; text-transform:uppercase; }
	.slot { --mini:calc(100cqi * 56 / 424); top:calc(var(--y) - var(--mini) * .7); gap:calc(100cqi * 2 / 424); width:calc(var(--mini) * 8 / 7); }
	.miniature { display:block; width:var(--mini); }
	.identity { display:grid; width:100%; gap:calc(100cqi * 1 / 424); text-align:center; }
	.identity strong, .identity span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:calc(100cqi * 7.5 / 424); line-height:1.1; }
	.identity span { color:oklch(76% .018 255); }

	.share-footer { flex:none; align-self:stretch; display:flex; align-items:baseline; justify-content:center; gap:1.6cqw; padding:1.8cqw 0 0; border-top:.19cqw solid oklch(37% .016 255); }
	.share-footer strong { font-size:4.4cqw; letter-spacing:-.04em; white-space:nowrap; }
	.share-footer span { min-width:0; color:oklch(83% .16 120); font-size:4.4cqw; font-weight:850; letter-spacing:-.03em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
</style>
