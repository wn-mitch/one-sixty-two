<script lang="ts">
	import Card from '../cards/Card.svelte';
	import { STOCK, roles } from '../cards/tokens.ts';
	import { FIELD, fieldArt } from '../components/field-layout.ts';
	import { seasonGrade } from '../game/grade.ts';
	import type { Slot } from '../game/types.ts';
	import ShareGradeLadder from './ShareGradeLadder.svelte';
	import type { ShareRenderModel } from './types.ts';

	/** The draft field card printed from the home park, every roster card on its slot with a large surname caption. */
	let { model }: { model: ShareRenderModel } = $props();
	const pct = (value: number, total: number) => `${(value / total) * 100}%`;
	const { window: fieldWindow, staffPlate, stadium: stadiumPoint } = FIELD;
	const stadium = $derived(model.homeStadium);
	const art = $derived(fieldArt({ outline: [...stadium.outline] }));
	const palette = $derived(stadium.color ? roles({ primary: stadium.color, secondary: STOCK }) : null);
	const grade = $derived(seasonGrade(model.record.wins, model.record.losses));
	const fieldStyle = $derived(palette ? `--stock: ${palette.field}; --stock-ink: ${palette.onField};` : undefined);

	/** The relievers sit under the rotation's columns so the grade ladder takes the closer's column below. */
	const RELIEF_SHIFT: Partial<Record<Slot, number>> = { RP1: FIELD.slots.SP1.x - FIELD.slots.RP1.x, RP2: FIELD.slots.SP2.x - FIELD.slots.RP2.x, RP3: FIELD.slots.SP3.x - FIELD.slots.RP3.x };
	const ladderBox = { x: FIELD.slots.CL.x - 46, y: FIELD.slots.RP1.y - FIELD.card * .7, width: 92, height: staffPlate.y + staffPlate.height - 8 - (FIELD.slots.RP1.y - FIELD.card * .7) };

	function slotPosition(slot: Slot): string {
		const point = FIELD.slots[slot];
		return `--x:${pct(point.x + (RELIEF_SHIFT[slot] ?? 0), FIELD.width)};--y:${pct(point.y, FIELD.height)}`;
	}
	function ignoreCardDetails(): void { /* Front-only export has no details action. */ }
</script>

<div class="field-card" style={`--field-ratio: ${FIELD.width} / ${FIELD.height}; --field-aspect: ${FIELD.width / FIELD.height};${fieldStyle ?? ''}`}>
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
		<rect class="staff-plate" x={fieldWindow.x} y={staffPlate.y} width={fieldWindow.width} height={staffPlate.height} rx="6"></rect>
	</svg>
	<div class="park" style={`--x:${pct(stadiumPoint.x, FIELD.width)};--y:${pct(stadiumPoint.y, FIELD.height)}`}>
		<span class="park-card">
			{#if stadium.photo}<img src={stadium.photo.url} alt="" width={stadium.photo.width} height={stadium.photo.height} />{:else}<b>{stadium.name}</b>{/if}
		</span>
		<span class="identity"><strong>{stadium.name}</strong><span>Park</span></span>
	</div>
	<div class="ladder" style={`left:${pct(ladderBox.x, FIELD.width)};top:${pct(ladderBox.y, FIELD.height)};width:${pct(ladderBox.width, FIELD.width)};height:${pct(ladderBox.height, FIELD.height)}`}><ShareGradeLadder {grade} layout="column" /></div>
	{#each model.cards as entry (entry.seasonId)}
		<div class="slot" class:staff={FIELD.slots[entry.slot].y > FIELD.window.y + FIELD.window.height} style={slotPosition(entry.slot)}>
			<span class="miniature"><Card s={entry.card} face="front" compact thumbnail capture interactive={false} onDetails={ignoreCardDetails} /></span>
			<span class="identity"><strong>{entry.card.family}</strong><span>{entry.slot} · {entry.card.year}</span></span>
		</div>
	{/each}
</div>

<style>
	/* Draft field geometry in card units (FIELD), scaled by the field card's own width. */
	.field-card { position:relative; width:min(100cqw, calc(100cqh * var(--field-aspect))); aspect-ratio:var(--field-ratio); container-type:inline-size; border-radius:calc(100cqi * 14 / 424); box-shadow:0 2cqw 4cqw oklch(8% .01 255 / .45); }
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
	.park, .slot { position:absolute; left:var(--x); display:grid; justify-items:center; transform:translateX(-50%); }
	.park-card img { display:block; width:100%; height:100%; object-fit:cover; border-radius:calc(100cqi * 2 / 424); }
	.park-card b { display:-webkit-box; overflow:hidden; color:var(--stock-ink, oklch(97% .006 255)); font:italic 900 calc(100cqi * 8 / 424) / .95 'Barlow Condensed', sans-serif; text-transform:uppercase; -webkit-line-clamp:4; line-clamp:4; -webkit-box-orient:vertical; }
	.park-card { display:block; width:var(--mini); aspect-ratio:5 / 7; padding:calc(100cqi * 3 / 424); box-sizing:border-box; overflow:hidden; border-radius:calc(100cqi * 4 / 424); background:var(--stock, oklch(27% .016 255)); box-shadow:0 .3rem .7rem oklch(8% .01 255 / .4); }
	.park { --mini:calc(100cqi * 56 / 424); top:calc(var(--y) - var(--mini) * .7); gap:calc(100cqi * 2 / 424); width:calc(100cqi * 80 / 424); }
	.slot { --mini:calc(100cqi * 56 / 424); top:calc(var(--y) - var(--mini) * .7); gap:calc(100cqi * 2 / 424); width:calc(100cqi * 76 / 424); }
	/* Staff columns are 101 units apart, so their captions get the extra width. */
	.slot.staff { width:calc(100cqi * 92 / 424); }
	.ladder { position:absolute; display:grid; }
	.miniature { display:block; width:var(--mini); }
	.identity { display:grid; width:100%; gap:calc(100cqi * 1.5 / 424); text-align:center; }
	.identity strong, .identity span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	.identity strong { font:800 calc(100cqi * 16 / 424) / 1 'Barlow Condensed', sans-serif; letter-spacing:.01em; text-shadow:0 .1em .3em oklch(8% .01 255 / .9); }
	.identity span { color:oklch(86% .016 255); font:700 calc(100cqi * 10.5 / 424) / 1 'Barlow Condensed', sans-serif; letter-spacing:.06em; }
</style>
