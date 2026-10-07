<script lang="ts">
	import { fit } from '../fit.ts';
	import type { CardFamily, CardFamilySize } from '../view-model.ts';

	type FamilyStyle =
		| 'root'
		| 'title'
		| 'titleRule'
		| 'titleStart'
		| 'titleEnd'
		| 'keyrow'
		| 'keycell'
		| 'keylabel'
		| 'keyvalue'
		| 'countrow'
		| 'countcell'
		| 'countlabel'
		| 'countvalue';

	export interface StatFamilyProps {
		fam: CardFamily;
		sz: CardFamilySize;
		km?: number;
		cm?: number;
		styles?: Record<string, string>;
		titleStart?: boolean;
		titleEnd?: boolean;
	}

	let { fam, sz, km = 0.74, cm = 0.86, styles = {}, titleStart = true, titleEnd = true }: StatFamilyProps = $props();

	function authored(name: FamilyStyle, fallback: string): string {
		return `${fallback} ${styles[name] ?? ''}`;
	}
</script>

<div data-layer="family" style={authored('root', 'display:flex; flex-direction:column; gap:1.6cqw;')}>
	<div
		data-layer="family.title"
		style={authored('title', "display:flex; align-items:center; gap:2cqw; font-family:'Roboto Serif', serif; font-weight:700; font-style:italic; font-size:4.4cqw; line-height:1;")}
	>
		{#if titleStart}<span aria-hidden="true" style={authored('titleStart', authored('titleRule', 'flex:1; height:0.3cqw; background:currentColor;'))}></span>{/if}
		<span>{fam.title}</span>
		{#if titleEnd}<span aria-hidden="true" style={authored('titleEnd', authored('titleRule', 'flex:1; height:0.3cqw; background:currentColor;'))}></span>{/if}
	</div>
	<div data-layer="family.key" style={authored('keyrow', 'display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:2cqw;')}>
		{#each fam.key as cell}
			<div data-layer="family.key.cell" style={authored('keycell', 'display:flex; flex-direction:column; gap:0.7cqw; min-width:0; align-items:center; text-align:center;')}>
				<div data-rt data-layer="family.key.label" style={authored('keylabel', `font-size:${sz.l}cqw; line-height:1; letter-spacing:0.06em; text-transform:uppercase; white-space:nowrap; font-weight:700;`)}>{cell.l}</div>
				<div use:fit={{ auto: true }} data-rt data-fit="auto" data-layer="family.key.value" style={authored('keyvalue', `font-size:calc(${sz.k}cqw * ${km}); line-height:0.86; font-variant-numeric:tabular-nums; white-space:nowrap; font-family:'Roboto Serif', serif; font-weight:700; letter-spacing:-0.02em;`)}>{cell.v}</div>
			</div>
		{/each}
	</div>
	<div data-layer="family.counts" style={authored('countrow', `display:grid; grid-template-columns:repeat(${fam.cols}, minmax(0, 1fr)); row-gap:1.1cqw; column-gap:2cqw;`)}>
		{#each fam.counts as cell}
			<div data-layer="family.count.cell" style={authored('countcell', 'display:flex; flex-direction:column; gap:0.6cqw; min-width:0; padding-top:0.9cqw; border-top:0.25cqw solid currentColor;')}>
				<div data-rt data-layer="family.count.label" style={authored('countlabel', `font-size:${sz.l}cqw; line-height:1; letter-spacing:0.05em; text-transform:uppercase; white-space:nowrap; font-weight:700;`)}>{cell.l}</div>
				<div use:fit={{ auto: true }} data-rt data-fit="auto" data-layer="family.count.value" style={authored('countvalue', `font-size:calc(${sz.c}cqw * ${cm}); line-height:0.9; font-variant-numeric:tabular-nums; white-space:nowrap; font-family:'Roboto Serif', serif; font-weight:600; color:currentColor;`)}>{cell.v}</div>
			</div>
		{/each}
	</div>
</div>
