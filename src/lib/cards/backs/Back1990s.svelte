<script lang="ts">
	import { fit } from '../fit.ts';
	import LogoSlot from '../parts/LogoSlot.svelte';
	import PhotoMask from '../parts/PhotoMask.svelte';
	import SourceCues from '../parts/SourceCues.svelte';
	import StatFamily from '../parts/StatFamily.svelte';
	import type { CardFamily, CardViewModel } from '../view-model.ts';

	let { s, onDetails }: { s: CardViewModel; onDetails: () => void } = $props();

	function familyStyles(fam: CardFamily): Record<string, string> {
		return {
			root: 'display:flex; flex-direction:column; gap:1.5cqw;',
			title: `align-self:flex-start; padding:0.7cqw 2.4cqw; background:${s.k.accent}; color:${s.k.onAccent}; transform:skewX(-10deg); font-family:'Barlow Condensed', sans-serif; font-weight:800; font-style:italic; font-size:3.4cqw; line-height:1; letter-spacing:0.06em; text-transform:uppercase;`,
			keyrow: 'display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:0;',
			keycell: `display:flex; flex-direction:column; gap:0.7cqw; min-width:0; padding-left:2cqw; border-left:0.6cqw solid ${s.k.accent}; align-items:stretch; text-align:start;`,
			keylabel: `font-size:${s.b.sz.l}cqw; line-height:1; letter-spacing:0.06em; text-transform:uppercase; white-space:nowrap; font-family:'Barlow Condensed', sans-serif; font-weight:700; color:${s.k.ink};`,
			keyvalue: `font-size:calc(${s.b.sz.k}cqw * 0.8); line-height:0.86; font-variant-numeric:tabular-nums; white-space:nowrap; font-family:'Barlow Condensed', sans-serif; font-weight:900; font-style:italic; letter-spacing:normal;`,
			countrow: `display:grid; grid-template-columns:repeat(${fam.cols}, minmax(0, 1fr)); row-gap:1.4cqw; column-gap:1.6cqw;`,
			countcell: 'display:flex; flex-direction:column; gap:0.6cqw; min-width:0; padding-top:0; border-top:0; align-items:stretch; text-align:start;',
			countlabel: `font-size:${s.b.sz.l}cqw; line-height:1; letter-spacing:0.05em; text-transform:uppercase; white-space:nowrap; font-family:'Barlow Condensed', sans-serif; font-weight:700; color:${s.k.ink};`,
			countvalue: `font-size:calc(${s.b.sz.c}cqw * 0.95); line-height:0.9; font-variant-numeric:tabular-nums; white-space:nowrap; font-family:'Barlow Condensed', sans-serif; font-weight:800; font-style:italic; letter-spacing:normal; color:${s.k.ink};`
		};
	}
</script>

<div data-card="1990s" data-face="back" use:fit style="container-type:inline-size; contain:layout style; position:relative; width:100%; aspect-ratio:5/7;">
	<div data-layer="back.ground" style={`position:absolute; inset:0; overflow:hidden; border-radius:1.8cqw; background:${s.k.field}; color:${s.k.onField}; font-family:'Barlow Condensed', sans-serif;`}>
		<div data-layer="frame.photo-keyline" style={`position:absolute; right:3.2cqw; top:3.2cqw; width:31.6cqw; height:34.6cqw; background:${s.k.paper}; transform:rotate(3deg);`}></div>
		<div data-layer="photo.mask" style={`position:absolute; right:4.4cqw; top:4.4cqw; width:29.2cqw; height:32.2cqw; overflow:hidden; background:${s.k.accent}; transform:rotate(3deg);`}>
			<PhotoMask s={s} focus="50% 18%" />
		</div>
		<div data-layer="logo.disc" style={`position:absolute; top:28cqw; right:27cqw; width:13cqw; height:13cqw; border-radius:${s.logoShape === 'square' ? '0' : '50%'}; background:${s.k.paper}; box-shadow:inset 0 0 0 0.7cqw ${s.k.accent};`}>
			<LogoSlot s={s} markStyle="left:2cqw; top:2cqw; width:9cqw; height:9cqw;" fallbackStyle={`font-weight:800; font-style:italic; font-size:4.4cqw; color:${s.k.fieldOnPaper};`} />
		</div>
		<div data-layer="name.group" style="position:absolute; left:5cqw; width:56cqw; top:5cqw; display:flex; flex-direction:column; align-items:flex-start;">
			<div data-rt data-layer="name.given.chip" style={`margin:0 0 -0.5cqw 0.8cqw; padding:0.5cqw 2cqw 0.4cqw 1.6cqw; background:${s.k.accent}; transform:skewX(-10deg);`}>
				<div use:fit={{ max: 5.2, min: 4 }} data-fit data-max="5.2" data-min="4" style={`transform:skewX(10deg); font-weight:700; font-style:italic; font-size:5.2cqw; line-height:1; white-space:nowrap; color:${s.k.onAccent}; max-width:48cqw;`}>{s.b.given}</div>
			</div>
			<div use:fit={{ max: 12, min: 7.4, wrapMin: 6, lines: 2, maxH: 11 }} data-rt data-layer="name.family" data-fit data-max="12" data-min="7.4" data-wrap-min="6" data-lines="2" data-max-h="11" style={`width:100%; padding-right:1cqw; box-sizing:border-box; font-weight:900; font-style:italic; font-size:12cqw; line-height:0.86; text-transform:uppercase; white-space:nowrap; text-wrap:balance; text-shadow:0.5cqw 0.5cqw 0 ${s.k.echo};`}>{s.b.family}</div>
			<div use:fit={{ max: 3.8, min: 3 }} data-rt data-layer="team.name" data-fit data-max="3.8" data-min="3" style="margin-top:1.6cqw; max-width:56cqw; font-weight:800; font-style:italic; font-size:3.8cqw; line-height:1; letter-spacing:0.04em; text-transform:uppercase; white-space:nowrap;">{s.b.team}</div>
		</div>
		<div data-layer="back.panel" style={`position:absolute; left:3.2cqw; right:3.2cqw; top:42cqw; bottom:10cqw; box-sizing:border-box; padding:2.6cqw 3cqw 2.2cqw; background:${s.k.paper}; color:${s.k.fieldOnPaper}; display:flex; flex-direction:column; gap:2.2cqw;`}>
			<div data-layer="identity.line" style="flex:none; display:flex; justify-content:space-between; flex-wrap:wrap; gap:0.6cqw 2cqw; font-weight:800; font-style:italic; font-size:3.3cqw; line-height:1; letter-spacing:0.03em; text-transform:uppercase;">
				<span data-rt data-layer="season.line">{s.b.seasonLine}</span><span data-rt data-layer="player.line" style={`color:${s.k.ink};`}>{s.b.playerLine}</span>
			</div>
			<div data-layer="families" style="flex:1 1 auto; min-height:0; display:flex; flex-direction:column; justify-content:space-evenly; gap:2.2cqw;">
				{#each s.b.fams as fam}
					<StatFamily {fam} sz={s.b.sz} km={0.8} cm={0.95} titleStart={false} titleEnd={false} styles={familyStyles(fam)} />
				{/each}
			</div>
			<div data-layer="facts" style={`display:flex; flex-direction:column; gap:1.2cqw; min-width:0; flex:none; padding-top:1.4cqw; border-top:0.4cqw solid ${s.k.fieldOnPaper};`}>
				{#if s.b.appsText}
					<div data-layer="facts.positions" style="display:flex; align-items:baseline; gap:2cqw;">
						<div style={`flex:none; font-size:3cqw; line-height:1; letter-spacing:0.06em; text-transform:uppercase; font-weight:700; color:${s.k.ink};`}>{s.b.appsLabel}</div>
						<div data-rt data-layer="facts.positions.value" style="min-width:0; font-size:3.5cqw; line-height:1.1; font-weight:700; font-style:italic;">{s.b.apps}</div>
					</div>
				{/if}
				{#if s.b.hasWar}
					<div data-layer="facts.war" style="display:flex; flex-direction:column; gap:0.8cqw;">
						<div style={`font-size:3cqw; line-height:1; letter-spacing:0.06em; text-transform:uppercase; font-weight:700; color:${s.k.ink};`}>Ranking</div>
						<div data-rt data-layer="facts.war.value" style="font-size:3.6cqw; line-height:1.15; text-wrap:pretty; font-weight:700; font-style:italic;">{s.b.war}</div>
					</div>
				{/if}
				{#if s.b.isBullpen}
					<div data-layer="facts.pool" style="display:flex; flex-direction:column; gap:0.8cqw;">
						<div style={`font-size:3cqw; line-height:1; letter-spacing:0.06em; text-transform:uppercase; font-weight:700; color:${s.k.ink};`}>Pool</div>
						<div data-rt data-layer="facts.pool.value" style="font-size:3.6cqw; line-height:1.15; text-wrap:pretty; font-weight:700; font-style:italic;">{s.b.pool}</div>
					</div>
				{/if}
			</div>
		</div>
		<SourceCues back={s.b} {onDetails} style="position:absolute; left:5cqw; right:5cqw; bottom:3.2cqw;" buttonStyle="font-size:2.8cqw; font-weight:800; font-style:italic;" />
	</div>
</div>
