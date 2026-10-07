<script lang="ts">
	import { fit } from '../fit.ts';
	import LogoSlot from '../parts/LogoSlot.svelte';
	import PhotoMask from '../parts/PhotoMask.svelte';
	import SourceCues from '../parts/SourceCues.svelte';
	import StatFamily from '../parts/StatFamily.svelte';
	import type { CardViewModel } from '../view-model.ts';

	let { s, onDetails }: { s: CardViewModel; onDetails: () => void } = $props();

	function familyStyles(s: CardViewModel): Record<string, string> {
		return {
			root: 'display:flex; flex-direction:column; gap:1.1cqw;',
			title: `font-family:'Barlow Condensed', sans-serif; font-weight:800; font-style:normal; font-size:3.3cqw; line-height:1; letter-spacing:0.1em; text-transform:uppercase; color:${s.k.tintOnDark};`,
			keyrow: 'display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:1.1cqw;',
			keycell: `display:flex; flex-direction:column; gap:0.7cqw; min-width:0; padding:1.1cqw 1.5cqw 1.2cqw; background:${s.k.field}; color:${s.k.onField}; clip-path:polygon(0 0, calc(100% - 2cqw) 0, 100% 2cqw, 100% 100%, 0 100%);`,
			keylabel: 'font-size:var(--family-label-size); line-height:1; letter-spacing:0.06em; text-transform:uppercase; white-space:nowrap; font-family:\'Barlow Condensed\', sans-serif; font-weight:700;',
			keyvalue: 'font-size:calc(var(--family-key-size) * .8); line-height:0.86; font-variant-numeric:tabular-nums; white-space:nowrap; font-family:\'Barlow Condensed\', sans-serif; font-weight:800; letter-spacing:normal;',
			countrow: 'display:grid; grid-template-columns:repeat(var(--family-cols), minmax(0, 1fr)); gap:0.9cqw;',
			countcell: `display:flex; flex-direction:column; gap:0.6cqw; min-width:0; padding:0.7cqw 1.3cqw 0.8cqw; border-top:0; background:${s.k.raised}; clip-path:polygon(0 0, calc(100% - 1.6cqw) 0, 100% 1.6cqw, 100% 100%, 0 100%);`,
			countlabel: 'font-size:var(--family-label-size); line-height:1; letter-spacing:0.05em; text-transform:uppercase; white-space:nowrap; font-family:\'Barlow Condensed\', sans-serif; font-weight:700;',
			countvalue: 'font-size:calc(var(--family-count-size) * .8); line-height:0.9; font-variant-numeric:tabular-nums; white-space:nowrap; font-family:\'Barlow Condensed\', sans-serif; font-weight:700; letter-spacing:normal; color:currentColor;'
		};
	}
</script>

<div data-card="2020s" data-face="back" use:fit style="position:relative; width:100%; height:100%; container-type:inline-size; contain:layout style;">
	<div data-layer="back.ground" style={`position:absolute; inset:0; overflow:hidden; border-radius:1.8cqw; background:${s.k.dark}; color:${s.k.paper}; font-family:'Barlow Condensed', sans-serif;`}>
		<div data-layer="photo.mask" style={`position:absolute; left:0; right:0; top:0; height:50cqw; overflow:hidden; background:${s.k.accent}; clip-path:polygon(0 0, 100% 0, 100% calc(100% - 7cqw), calc(100% - 12cqw) 100%, 0 100%);`}>
			<PhotoMask {s} focus="50% 18%" emptyStyle={`background:repeating-linear-gradient(135deg, rgba(255,255,255,.1) 0 1.1cqw, rgba(0,0,0,0) 1.1cqw 2.2cqw), ${s.k.accent};`} />
		</div>
		<div data-layer="photo.scrim" style={`position:absolute; left:0; right:0; top:0; height:50cqw; background:linear-gradient(180deg, rgba(0,0,0,0) 30%, ${s.k.dark} 92%);`}></div>
		<div data-rt data-layer="season.slab" style={`position:absolute; left:4cqw; top:4cqw; display:flex; padding:1.1cqw 4.6cqw 1.1cqw 2.4cqw; background:${s.k.field}; color:${s.k.onField}; clip-path:polygon(0 0, 100% 0, calc(100% - 2.4cqw) 100%, 0 100%); align-items:center; gap:1.4cqw; font-weight:800; font-size:4.4cqw; line-height:1;`}>
			<span>{s.year}</span><span aria-hidden="true" style={`width:0.45cqw; height:3.4cqw; background:${s.k.onField};`}></span><span>{s.pos}</span>
		</div>
		<div data-layer="logo.tile" style={`position:absolute; right:4cqw; top:4cqw; width:14cqw; height:14cqw; background:${s.k.paper}; clip-path:polygon(0 0, 100% 0, 100% 100%, 3.4cqw 100%, 0 calc(100% - 3.4cqw));`}>
			<LogoSlot {s} markStyle="left:2cqw; top:1.8cqw; width:10cqw; height:10cqw;" fallbackStyle={`font-size:4.6cqw; color:${s.k.fieldOnPaper};`} />
		</div>
		<div data-layer="identity" style="position:absolute; left:4cqw; right:16cqw; bottom:calc(100% - 50cqw);">
			<div use:fit={{ max: 11, min: 7.4, wrapMin: 6.2, lines: 2, maxH: 11 }} data-rt data-layer="name.full" data-fit data-max="11" data-min="7.4" data-wrap-min="6.2" data-lines="2" data-max-h="11" style="width:100%; font-weight:900; font-size:11cqw; line-height:0.86; text-transform:uppercase; white-space:nowrap; text-wrap:balance; text-shadow:0 0.4cqw 1.6cqw rgba(0,0,0,.5);">{s.b.name}</div>
			<div style="margin-top:1.4cqw; display:flex; align-items:center; gap:1.8cqw;"><span aria-hidden="true" style={`flex:none; width:5cqw; height:1.1cqw; background:${s.k.tintOnDark}; transform:skewX(-30deg);`}></span><span use:fit={{ max: 3.8, min: 3 }} data-rt data-layer="team.name" data-fit data-max="3.8" data-min="3" style={`min-width:0; max-width:70cqw; font-weight:700; font-size:3.8cqw; line-height:1; letter-spacing:0.1em; text-transform:uppercase; white-space:nowrap; color:${s.k.tintOnDark};`}>{s.b.team}</span></div>
		</div>
		<div data-layer="back.flow" style="position:absolute; left:4cqw; right:4cqw; top:52.4cqw; bottom:3.6cqw; display:flex; flex-direction:column; gap:1.6cqw;">
			<div data-layer="identity.line" style={`flex:none; display:flex; justify-content:space-between; flex-wrap:wrap; gap:0.6cqw 2cqw; font-weight:700; font-size:3.2cqw; line-height:1; letter-spacing:0.06em; text-transform:uppercase; color:${s.k.mutedOnDark};`}>
				<span data-rt data-layer="season.line">{s.b.seasonLine}</span><span data-rt data-layer="player.line">{s.b.playerLine}</span>
			</div>
			<div data-layer="families" style="flex:1 1 auto; min-height:0; display:flex; flex-direction:column; justify-content:space-evenly; gap:2cqw;">
				{#each s.b.fams as fam}
					<div style={`--family-key-size:${s.b.sz.k}cqw; --family-count-size:${s.b.sz.c}cqw; --family-label-size:${s.b.sz.l}cqw; --family-cols:${fam.cols};`}>
						<StatFamily {fam} sz={s.b.sz} km={0.8} cm={0.8} styles={familyStyles(s)} titleStart={false} titleEnd={false} />
					</div>
				{/each}
			</div>
			<div data-layer="facts" style="display:flex; flex-direction:column; gap:1.2cqw; min-width:0; flex:none;">
				{#if s.b.appsText}
					<div data-layer="facts.positions" style="display:flex; align-items:baseline; gap:2cqw;"><div style={`flex:none; font-size:3cqw; line-height:1; letter-spacing:0.06em; text-transform:uppercase; font-weight:700; color:${s.k.mutedOnDark};`}>{s.b.appsLabel}</div><div data-rt data-layer="facts.positions.value" style="min-width:0; font-size:3.5cqw; line-height:1.1; font-weight:600;">{s.b.apps}</div></div>
				{/if}
				{#if s.b.hasWar}
					<div data-layer="facts.war" style="display:flex; flex-direction:column; gap:0.8cqw;"><div style={`font-size:3cqw; line-height:1; letter-spacing:0.06em; text-transform:uppercase; font-weight:700; color:${s.k.mutedOnDark};`}>Ranking</div><div data-rt data-layer="facts.war.value" style="font-size:3.6cqw; line-height:1.15; text-wrap:pretty; font-weight:600;">{s.b.war}</div></div>
				{/if}
				{#if s.b.isBullpen}
					<div data-layer="facts.pool" style="display:flex; flex-direction:column; gap:0.8cqw;"><div style={`font-size:3cqw; line-height:1; letter-spacing:0.06em; text-transform:uppercase; font-weight:700; color:${s.k.mutedOnDark};`}>Pool</div><div data-rt data-layer="facts.pool.value" style="font-size:3.6cqw; line-height:1.15; text-wrap:pretty; font-weight:600;">{s.b.pool}</div></div>
				{/if}
			</div>
			<SourceCues back={s.b} {onDetails} style="flex:none;" statsStyle={`color:${s.k.mutedOnDark};`} photoStyle={`color:${s.k.mutedOnDark};`} buttonStyle="font-size:2.8cqw;" />
		</div>
	</div>
</div>
