<script lang="ts">
	import { fit } from '../fit.ts';
	import LogoSlot from '../parts/LogoSlot.svelte';
	import PhotoMask from '../parts/PhotoMask.svelte';
	import SourceCues from '../parts/SourceCues.svelte';
	import StatFamily from '../parts/StatFamily.svelte';
	import type { CardViewModel } from '../view-model.ts';

	let { s, onDetails }: { s: CardViewModel; onDetails: () => void } = $props();

	function familyStyles(columns: number): Record<string, string> {
		return {
			root: `display:flex; flex-direction:column; gap:1.6cqw; --family-label-size:${s.b.sz.l}cqw; --family-key-size:${s.b.sz.k}cqw; --family-count-size:${s.b.sz.c}cqw; --family-columns:${columns};`,
			title: "display:flex; align-items:center; gap:1.6cqw; font-family:'Barlow Condensed', sans-serif; font-weight:800; font-style:normal; font-size:3.4cqw; line-height:1; letter-spacing:0.08em; text-transform:uppercase;",
			titleStart: `flex:none; width:3cqw; height:3cqw; background:${s.k.echo}; clip-path:polygon(0 0, 100% 0, 100% 100%);`,
			keyrow: 'display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:0;',
			keycell: `display:flex; flex-direction:column; gap:0.7cqw; min-width:0; padding-left:2.2cqw; border-left:0.5cqw solid ${s.k.echo}; align-items:stretch; text-align:left;`,
			keylabel: "font-size:var(--family-label-size, 3.4cqw); line-height:1; letter-spacing:0.06em; text-transform:uppercase; white-space:nowrap; font-family:'Barlow Condensed', sans-serif; font-weight:700;",
			keyvalue: "font-size:calc(var(--family-key-size, 11cqw) * 0.85); line-height:0.86; font-variant-numeric:tabular-nums; white-space:nowrap; font-family:'Barlow Condensed', sans-serif; font-weight:800; letter-spacing:normal;",
			countrow: 'display:grid; grid-template-columns:repeat(var(--family-columns), minmax(0, 1fr)); row-gap:1.6cqw; column-gap:2cqw;',
			countcell: 'display:flex; flex-direction:column; gap:0.6cqw; min-width:0; padding-top:0; border-top:0; padding-left:0; border-left:0;',
			countlabel: "font-size:var(--family-label-size, 3.4cqw); line-height:1; letter-spacing:0.05em; text-transform:uppercase; white-space:nowrap; font-family:'Barlow Condensed', sans-serif; font-weight:700;",
			countvalue: "font-size:calc(var(--family-count-size, 8cqw) * 0.95); line-height:0.9; font-variant-numeric:tabular-nums; white-space:nowrap; font-family:'Barlow Condensed', sans-serif; font-weight:700; letter-spacing:normal; color:currentColor;"
		};
	}
</script>

<div use:fit data-card="2010s" data-face="back" style="container-type:inline-size; contain:layout style; position:relative; width:100%; aspect-ratio:5/7;">
	<div data-layer="back.ground" style={`position:absolute; inset:0; overflow:hidden; border-radius:1.8cqw; background:${s.k.field}; color:${s.k.onField}; font-family:'Barlow Condensed', sans-serif;`}>
		<div data-layer="photo.mask" style={`position:absolute; left:0; right:0; top:0; height:34cqw; overflow:hidden; background:${s.k.accent};`}>
			<PhotoMask {s} focus="50% 18%" emptyStyle="align-items:stretch; justify-content:stretch;" />
		</div>
		<div data-layer="logo.disc" style={`position:absolute; top:4cqw; right:4.4cqw; width:13cqw; height:13cqw; border-radius:50%; background:${s.k.paper};`}>
			<LogoSlot {s} markStyle="left:1.8cqw; top:1.8cqw; width:9.4cqw; height:9.4cqw;" fallbackStyle={`font-size:4.4cqw; color:${s.k.fieldOnPaper};`} />
		</div>
		<div data-layer="identity.tab" style={`position:absolute; left:0; bottom:calc(100% - 42cqw); min-width:56cqw; max-width:86cqw; box-sizing:border-box; padding:2.6cqw 7cqw 2.2cqw 5cqw; background:${s.k.paper}; color:${s.k.fieldOnPaper}; clip-path:polygon(0 0, calc(100% - 4.4cqw) 0, 100% 4.4cqw, 100% 100%, 0 100%);`}>
			<div data-rt data-layer="name.full" data-fit data-max="9.6" data-min="6.6" data-wrap-min="5.8" data-lines="2" data-max-h="10" style="max-width:74cqw; font-weight:800; font-size:9.6cqw; line-height:0.88; text-transform:uppercase; white-space:nowrap; text-wrap:balance;">{s.b.name}</div>
			<div data-rt data-layer="team.name" data-fit data-max="3.4" data-min="2.9" style={`margin-top:1.2cqw; max-width:74cqw; font-weight:700; font-size:3.4cqw; line-height:1; letter-spacing:0.08em; text-transform:uppercase; white-space:nowrap; color:${s.k.ink};`}>{s.b.team}</div>
		</div>
		<div data-layer="back.flow" style="position:absolute; left:5cqw; right:5cqw; top:45cqw; bottom:3.6cqw; display:flex; flex-direction:column; gap:2.2cqw;">
			<div data-layer="identity.line" style="flex:none; display:flex; justify-content:space-between; flex-wrap:wrap; gap:0.6cqw 2cqw; font-weight:700; font-size:3.3cqw; line-height:1; letter-spacing:0.06em; text-transform:uppercase;">
				<span data-rt data-layer="season.line">{s.b.seasonLine}</span><span data-rt data-layer="player.line">{s.b.playerLine}</span>
			</div>
			<div data-layer="families" style="flex:1 1 auto; min-height:0; display:flex; flex-direction:column; justify-content:space-evenly; gap:2.2cqw;">
				{#each s.b.fams as fam}
					<StatFamily {fam} sz={s.b.sz} km={0.85} cm={0.95} styles={familyStyles(fam.cols)} titleEnd={false} />
				{/each}
			</div>
			<div data-layer="facts" style="display:flex; flex-direction:column; gap:1.2cqw; min-width:0; flex:none;">
				{#if s.b.appsText}
					<div data-layer="facts.positions" style="display:flex; align-items:baseline; gap:2cqw;">
						<div style="flex:none; font-size:3cqw; line-height:1; letter-spacing:0.06em; text-transform:uppercase; font-weight:700;">{s.b.appsLabel}</div>
						<div data-rt data-layer="facts.positions.value" style="min-width:0; font-size:3.5cqw; line-height:1.1; font-weight:600;">{s.b.apps}</div>
					</div>
				{/if}
				{#if s.b.hasWar}
					<div data-layer="facts.war" style="display:flex; flex-direction:column; gap:0.8cqw;">
						<div style="font-size:3cqw; line-height:1; letter-spacing:0.06em; text-transform:uppercase; font-weight:700;">Ranking</div>
						<div data-rt data-layer="facts.war.value" style="font-size:3.6cqw; line-height:1.15; text-wrap:pretty; font-weight:600;">{s.b.war}</div>
					</div>
				{/if}
				{#if s.b.isBullpen}
					<div data-layer="facts.pool" style="display:flex; flex-direction:column; gap:0.8cqw;">
						<div style="font-size:3cqw; line-height:1; letter-spacing:0.06em; text-transform:uppercase; font-weight:700;">Pool</div>
						<div data-rt data-layer="facts.pool.value" style="font-size:3.6cqw; line-height:1.15; text-wrap:pretty; font-weight:600;">{s.b.pool}</div>
					</div>
				{/if}
			</div>
			<SourceCues back={s.b} {onDetails} style="flex:none;" buttonStyle="font-weight:800;" />
		</div>
	</div>
</div>
