<script lang="ts">
	import { fit } from '../fit.ts';
	import LogoSlot from '../parts/LogoSlot.svelte';
	import PhotoMask from '../parts/PhotoMask.svelte';
	import PositionDiamond from '../parts/PositionDiamond.svelte';
	import SourceCues from '../parts/SourceCues.svelte';
	import StatFamily from '../parts/StatFamily.svelte';
	import type { CardViewModel } from '../view-model.ts';

	let { s, onDetails }: { s: CardViewModel; onDetails: () => void } = $props();

	const familyStyles = {
		root: 'gap:0;',
		title: 'padding-bottom:1.1cqw; font-family:inherit; font-style:normal; font-weight:700; font-size:3.3cqw; line-height:1; letter-spacing:0.14em; text-transform:uppercase; color:var(--accentOnStock);',
		keyrow: 'gap:0; border-top:0.35cqw solid var(--fieldOnStock);',
		keycell: 'gap:0.7cqw; padding:1.3cqw 1.5cqw 1.5cqw; border-right:0.25cqw solid var(--fieldOnStock); align-items:initial; text-align:initial;',
		keylabel: 'font-weight:600;',
		keyvalue: 'font-family:inherit; font-weight:600; letter-spacing:normal;',
		countrow: 'row-gap:0; column-gap:0; border-top:0.25cqw solid var(--fieldOnStock); border-bottom:0.35cqw solid var(--fieldOnStock);',
		countcell: 'gap:0.6cqw; padding:1.1cqw 1.5cqw 1.2cqw; border-top:0; border-bottom:0.15cqw solid var(--stripe);',
		countlabel: 'font-weight:600;',
		countvalue: 'font-family:inherit; font-weight:600; letter-spacing:normal; color:var(--ink);'
	};
	const diamondStyles = {
		root: 'width:26cqw; height:26cqw;',
		outfield: 'border-width:0.2cqw;',
		infield: 'border-width:0.2cqw;',
		chip: 'border-radius:0;',
		label: 'font-size:2.4cqw; font-weight:600; letter-spacing:0.1em;',
		games: 'font-family:inherit; font-size:3.4cqw; font-weight:600;'
	};
</script>

<div data-card="2000s" data-face="back" use:fit style={`container-type:inline-size; contain:layout style; position:relative; width:100%; aspect-ratio:5/7; --fieldOnStock:${s.k.fieldOnStock}; --accentOnStock:${s.k.accentOnStock}; --stripe:${s.k.stripe}; --ink:${s.k.ink};`}>
	<div data-layer="back.ground" style={`position:absolute; inset:0; overflow:hidden; border-radius:1.8cqw; background:${s.k.stock}; color:${s.k.fieldOnStock}; font-family:'Barlow Condensed', sans-serif;`}>
		<div data-layer="frame.rail" style={`position:absolute; left:0; top:0; bottom:0; width:10cqw; background:${s.k.field}; color:${s.k.onField};`}>
			<div data-layer="brand" style="position:absolute; top:4.6cqw; left:0; right:0; display:flex; justify-content:center;"><div style="writing-mode:vertical-rl; transform:rotate(180deg); font-weight:800; font-style:italic; font-size:3.6cqw; line-height:1;">162-0</div></div>
			<div data-rt data-layer="season.rail" style="position:absolute; bottom:5cqw; left:0; right:0; display:flex; justify-content:center;"><div style="writing-mode:vertical-rl; transform:rotate(180deg); display:flex; align-items:center; gap:1.6cqw; font-weight:800; font-size:6.2cqw; line-height:1; letter-spacing:0.03em;"><span>{s.year}</span><span style={`width:0.4cqw; height:3.6cqw; background:${s.k.onField};`}></span><span>{s.pos}</span></div></div>
		</div>
		<div data-layer="photo.mask" style={`position:absolute; right:4cqw; top:4cqw; width:24cqw; height:28cqw; overflow:hidden; background:${s.k.accent};`}>
			<PhotoMask {s} focus="50% 18%" />
		</div>
		<div data-layer="frame.photo-rail" style={`position:absolute; right:4cqw; top:32.6cqw; width:24cqw; height:0.8cqw; background:${s.k.accent};`}></div>
		<div data-layer="logo.slot" style={`position:absolute; right:5cqw; top:24.6cqw; width:8cqw; height:8cqw; border-radius:50%; background:${s.k.paper};`}>
			<LogoSlot {s} markStyle="left:1.2cqw; top:1.2cqw; width:5.6cqw; height:5.6cqw;" fallbackStyle={`font-size:3cqw; color:${s.k.fieldOnPaper};`} />
		</div>
		<div data-layer="back.flow" style="position:absolute; left:14cqw; right:4cqw; top:5cqw; bottom:4cqw; display:flex; flex-direction:column; gap:1.8cqw;">
			<div data-layer="identity" style="flex:none; width:52cqw; min-height:28.6cqw; display:flex; flex-direction:column; justify-content:flex-end;">
				<div use:fit={{ max: 9.6, min: 6.6, wrapMin: 5.8, lines: 2, maxH: 17 }} data-rt data-layer="name.full" data-fit data-max="9.6" data-min="6.6" data-wrap-min="5.8" data-lines="2" data-max-h="17" style="width:100%; font-weight:700; font-size:9.6cqw; line-height:0.9; letter-spacing:0.01em; text-transform:uppercase; white-space:nowrap; text-wrap:balance;">{s.b.name}</div>
				<div use:fit={{ max: 3.6, min: 2.9 }} data-rt data-layer="team.name" data-fit data-max="3.6" data-min="2.9" style="margin-top:1.2cqw; width:100%; font-weight:600; font-size:3.6cqw; line-height:1; letter-spacing:0.12em; text-transform:uppercase; white-space:nowrap;">{s.b.team}</div>
			</div>
			<div data-layer="identity.line" style={`flex:none; padding:1.2cqw 0; border-top:0.35cqw solid ${s.k.fieldOnStock}; border-bottom:0.35cqw solid ${s.k.fieldOnStock}; display:flex; justify-content:space-between; flex-wrap:wrap; gap:0.6cqw 2cqw; font-weight:600; font-size:3.2cqw; line-height:1; letter-spacing:0.08em; text-transform:uppercase; color:${s.k.ink};`}>
				<span data-rt data-layer="season.line">{s.b.seasonLine}</span><span data-rt data-layer="player.line">{s.b.playerLine}</span>
			</div>
			<div data-layer="families" style="flex:1 1 auto; min-height:0; display:flex; flex-direction:column; justify-content:space-evenly; gap:2.2cqw;">
				{#each s.b.fams as fam}
					<StatFamily {fam} sz={s.b.sz} km={0.84} cm={0.9} styles={familyStyles} titleStart={false} titleEnd={false} />
				{/each}
			</div>
			<div data-layer="back.bottom" style="flex:none; display:flex; gap:3cqw; align-items:stretch;">
				{#if s.b.showDia}
					<PositionDiamond dia={s.b.dia} k={s.k} styles={diamondStyles} />
				{/if}
				<div style="flex:1; min-width:0; display:flex; flex-direction:column; justify-content:space-between; gap:2cqw;">
					<div data-layer="facts" style="display:flex; flex-direction:column; gap:1.2cqw; min-width:0;">
						{#if s.b.appsText}<div data-layer="facts.positions" style="display:flex; align-items:baseline; gap:2cqw;"><div style="flex:none; font-size:3cqw; line-height:1; letter-spacing:0.06em; text-transform:uppercase; font-weight:600;">{s.b.appsLabel}</div><div data-rt data-layer="facts.positions.value" style={`min-width:0; font-size:3.5cqw; line-height:1.1; font-weight:500; color:${s.k.ink};`}>{s.b.apps}</div></div>{/if}
						{#if s.b.hasWar}<div data-layer="facts.war" style="display:flex; flex-direction:column; gap:0.8cqw;"><div style="font-size:3cqw; line-height:1; letter-spacing:0.06em; text-transform:uppercase; font-weight:600;">Ranking</div><div data-rt data-layer="facts.war.value" style={`font-size:3.6cqw; line-height:1.15; text-wrap:pretty; font-weight:500; color:${s.k.ink};`}>{s.b.war}</div></div>{/if}
						{#if s.b.isBullpen}<div data-layer="facts.pool" style="display:flex; flex-direction:column; gap:0.8cqw;"><div style="font-size:3cqw; line-height:1; letter-spacing:0.06em; text-transform:uppercase; font-weight:600;">Pool</div><div data-rt data-layer="facts.pool.value" style={`font-size:3.6cqw; line-height:1.15; text-wrap:pretty; font-weight:500; color:${s.k.ink};`}>{s.b.pool}</div></div>{/if}
					</div>
					<SourceCues back={s.b} {onDetails} statsStyle={`color:${s.k.ink};`} photoStyle={`color:${s.k.ink};`} buttonStyle="font-size:2.8cqw;" />
				</div>
			</div>
		</div>
	</div>
</div>
