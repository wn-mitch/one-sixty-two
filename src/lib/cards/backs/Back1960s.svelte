<script lang="ts">
	import { fit } from '../fit.ts';
	import type { CardViewModel } from '../view-model.ts';
	import LogoSlot from '../parts/LogoSlot.svelte';
	import PositionDiamond from '../parts/PositionDiamond.svelte';
	import SourceCues from '../parts/SourceCues.svelte';
	import StatFamily from '../parts/StatFamily.svelte';

	let { s, onDetails }: { s: CardViewModel; onDetails: () => void } = $props();

	let familyStyles = $derived({
		root: 'display:flex; flex-direction:column; gap:1.6cqw;',
		title: `align-self:flex-start; padding:.9cqw 2.2cqw; border-radius:99cqw; background:${s.k.accent}; color:${s.k.onAccent}; font-family:'Barlow Condensed', sans-serif; font-weight:800; font-style:normal; font-size:3.4cqw; line-height:1; letter-spacing:.08em; text-transform:uppercase;`,
		keyrow: 'display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:2cqw;',
		keycell: 'display:flex; flex-direction:column; gap:.7cqw; min-width:0; align-items:stretch; text-align:start;',
		keylabel: 'line-height:1; letter-spacing:.06em; text-transform:uppercase; white-space:nowrap; font-weight:700;',
		keyvalue: "line-height:.86; font-variant-numeric:tabular-nums; white-space:nowrap; font-family:'Barlow Condensed', sans-serif; font-weight:800; letter-spacing:normal;",
		countrow: 'row-gap:1.6cqw; column-gap:2cqw;',
		countcell: 'display:flex; flex-direction:column; gap:.6cqw; min-width:0; padding-top:0; border-top:0;',
		countlabel: 'line-height:1; letter-spacing:.05em; text-transform:uppercase; white-space:nowrap; font-weight:700;',
		countvalue: "line-height:.9; font-variant-numeric:tabular-nums; white-space:nowrap; font-family:'Barlow Condensed', sans-serif; font-weight:700; letter-spacing:normal; color:inherit;"
	});

	let diamondStyles = $derived({
		outfield: `border:.35cqw solid rgba(0,0,0,0); border-top-color:${s.k.onAccent};`,
		infield: `border:.35cqw solid ${s.k.onAccent};`,
		chip: `background:${s.k.field}; color:${s.k.onField};`,
		games: "font-family:'Barlow Condensed', sans-serif; font-weight:800;",
		empty: `background:${s.k.onAccent};`
	});
</script>

<div data-card="1960s" data-face="back" use:fit style="container-type:inline-size; contain:layout style; position:relative; width:100%; aspect-ratio:5/7;">
	<div data-layer="back.ground" style={`position:absolute; inset:0; overflow:hidden; border-radius:1.8cqw; background:${s.k.field}; color:${s.k.onField}; font-family:'Barlow Condensed', sans-serif;`}>
		<div data-layer="back.flow" style="position:absolute; inset:5.6cqw 5.6cqw 4.6cqw; display:flex; flex-direction:column; gap:2.4cqw;">
			<div data-layer="identity" style="flex:none; display:flex; gap:3cqw; align-items:flex-start;">
				<div style="flex:1; min-width:0;">
					<div use:fit={{ max: 11, min: 7.5, wrapMin: 6.4, lines: 2, maxH: 13 }} data-rt data-layer="name.full" data-fit data-max="11" data-min="7.5" data-wrap-min="6.4" data-lines="2" data-max-h="13" style="width:100%; font-weight:800; font-size:11cqw; line-height:.88; text-transform:uppercase; white-space:nowrap; text-wrap:balance;">{s.b.name}</div>
					<div use:fit={{ max: 4, min: 3.1 }} data-rt data-layer="team.name" data-fit data-max="4" data-min="3.1" style="margin-top:1.4cqw; width:100%; font-weight:700; font-size:4cqw; line-height:1; letter-spacing:.1em; text-transform:uppercase; white-space:nowrap;">{s.b.team}</div>
				</div>
				<div data-layer="logo.disc" style={`position:relative; flex:none; width:15cqw; height:15cqw; border-radius:${s.logoShape === 'square' ? '0' : '50%'}; background:${s.k.paper};`}>
					<LogoSlot {s} markStyle="left:2.2cqw; top:2.2cqw; width:10.6cqw; height:10.6cqw;" fallbackStyle={`font-size:5cqw; color:${s.k.fieldOnPaper};`} />
				</div>
			</div>
			<div data-layer="identity.line" style={`flex:none; padding:1.2cqw 0; border-top:.6cqw solid ${s.k.onField}; border-bottom:.3cqw solid ${s.k.onField}; display:flex; justify-content:space-between; flex-wrap:wrap; gap:.6cqw 2cqw; font-weight:700; font-size:3.3cqw; line-height:1; letter-spacing:.05em; text-transform:uppercase;`}>
				<span data-rt data-layer="season.line">{s.b.seasonLine}</span>
				<span data-rt data-layer="player.line">{s.b.playerLine}</span>
			</div>
			<div data-layer="families" style="flex:1 1 auto; min-height:0; display:flex; flex-direction:column; justify-content:space-evenly; gap:2.2cqw;">
				{#each s.b.fams as fam}
					<StatFamily {fam} sz={s.b.sz} km={.8} cm={.92} styles={familyStyles} titleStart={false} titleEnd={false} />
				{/each}
			</div>
			<div data-layer="back.bottom" style={`flex:none; display:flex; gap:3cqw; align-items:stretch; padding:2.6cqw 3cqw; border-radius:2.6cqw; background:${s.k.accent};`}>
				{#if s.b.showDia}
					<PositionDiamond dia={s.b.dia} k={s.k} style="width:30cqw; height:30cqw;" styles={diamondStyles} />
				{/if}
				<div style="flex:1; min-width:0; display:flex; flex-direction:column; justify-content:space-between; gap:2cqw;">
					<div data-layer="facts" style="display:flex; flex-direction:column; gap:1.2cqw; min-width:0;">
						{#if s.b.appsText}
							<div data-layer="facts.positions" style="display:flex; align-items:baseline; gap:2cqw;">
								<div style={`flex:none; font-size:3cqw; line-height:1; letter-spacing:.06em; text-transform:uppercase; font-weight:700; color:${s.k.onAccent};`}>{s.b.appsLabel}</div>
								<div data-rt data-layer="facts.positions.value" style={`min-width:0; font-size:3.5cqw; line-height:1.1; font-weight:600; color:${s.k.onAccent};`}>{s.b.apps}</div>
							</div>
						{/if}
						{#if s.b.hasWar}
							<div data-layer="facts.war" style="display:flex; flex-direction:column; gap:.8cqw;">
								<div style={`font-size:3cqw; line-height:1; letter-spacing:.06em; text-transform:uppercase; font-weight:700; color:${s.k.onAccent};`}>Ranking</div>
								<div data-rt data-layer="facts.war.value" style={`font-size:3.6cqw; line-height:1.15; text-wrap:pretty; font-weight:600; color:${s.k.onAccent};`}>{s.b.war}</div>
							</div>
						{/if}
						{#if s.b.isBullpen}
							<div data-layer="facts.pool" style="display:flex; flex-direction:column; gap:.8cqw;">
								<div style={`font-size:3cqw; line-height:1; letter-spacing:.06em; text-transform:uppercase; font-weight:700; color:${s.k.onAccent};`}>Pool</div>
								<div data-rt data-layer="facts.pool.value" style={`font-size:3.6cqw; line-height:1.15; text-wrap:pretty; font-weight:600; color:${s.k.onAccent};`}>{s.b.pool}</div>
							</div>
						{/if}
					</div>
					<SourceCues back={s.b} {onDetails} style={`color:${s.k.onAccent};`} statsStyle={`color:${s.k.onAccent};`} photoStyle={`color:${s.k.onAccent};`} buttonStyle={`color:${s.k.onAccent}; font-weight:800;`} />
				</div>
			</div>
		</div>
	</div>
</div>

