<script lang="ts">
	import { fit } from '../fit.ts';
	import BaseballBadge from '../parts/BaseballBadge.svelte';
	import PositionDiamond from '../parts/PositionDiamond.svelte';
	import SourceCues from '../parts/SourceCues.svelte';
	import StatFamily from '../parts/StatFamily.svelte';
	import type { CardViewModel } from '../view-model.ts';

	let { s, onDetails }: { s: CardViewModel; onDetails: () => void } = $props();

	const familyStyles = {
		root: 'gap:1.5cqw;',
		title: 'align-self:flex-start; display:block; padding:.8cqw 2.4cqw; background:var(--field); color:var(--onField); transform:skewX(-10deg); font-family:\'Barlow Condensed\', sans-serif; font-weight:800; font-style:italic; font-size:3.4cqw; line-height:1; letter-spacing:.08em; text-transform:uppercase;',
		keyrow: 'gap:0; border-bottom:.35cqw solid var(--fieldOnStock); padding-bottom:1.3cqw;',
		keycell: 'padding-left:1.8cqw; border-left:.35cqw solid var(--fieldOnStock); align-items:initial; text-align:initial;',
		keyvalue: "font-family:'Barlow Condensed', sans-serif; font-weight:800; font-style:italic; letter-spacing:0;",
		countrow: 'row-gap:1.4cqw; column-gap:1.6cqw;',
		countcell: 'padding-top:0; border-top:0;',
		countvalue: "font-family:'Barlow Condensed', sans-serif; font-weight:700; font-style:italic; color:var(--ink);"
} as const;

	const diamondStyles = {
		root: 'width:28cqw; height:28cqw;',
		outfield: 'border-width:.35cqw; border-top-color:var(--fieldOnStock);',
		infield: 'border-width:.35cqw; border-color:var(--fieldOnStock);',
		chip: 'border-radius:0; transform:skewX(-8deg);',
		label: 'font-size:2.5cqw; font-style:italic;',
		games: "font-size:3.7cqw; font-family:'Barlow Condensed', sans-serif; font-weight:800; font-style:italic;"
} as const;
</script>

<div data-card="1980s" data-face="back" style="container-type:inline-size; contain:layout style; position:relative; width:100%; height:100%;" use:fit>
	<div data-layer="back.ground" style={`position:absolute; inset:0; overflow:hidden; border-radius:1.8cqw; background:repeating-linear-gradient(90deg, ${s.k.stripe} 0 .28cqw, rgba(0,0,0,0) .28cqw 3.3cqw), ${s.k.stock}; color:${s.k.fieldOnStock}; font-family:'Barlow Condensed', sans-serif;`}>
		<div data-layer="identity.band" style="position:absolute; left:-4cqw; top:9cqw; width:108cqw; transform:rotate(-6deg); transform-origin:0 0;">
			<div data-layer="name.band" style={`padding:2cqw 24cqw 1.5cqw 10cqw; background:repeating-linear-gradient(90deg, ${s.k.stripeOnField} 0 .28cqw, rgba(0,0,0,0) .28cqw 3.3cqw), ${s.k.field}; color:${s.k.onField};`}>
				<div use:fit data-rt data-layer="name.full" data-fit data-max="9.6" data-min="6.6" data-wrap-min="5.4" data-lines="2" data-max-h="10.5" style="width:72cqw; font-weight:800; font-style:italic; font-size:9.6cqw; line-height:.88; text-transform:uppercase; white-space:nowrap; text-wrap:balance;">{s.b.name}</div>
			</div>
			<div data-layer="team.band" style={`padding:1cqw 24cqw 1cqw 10cqw; background:${s.k.accent}; color:${s.k.onAccent};`}>
				<div use:fit data-rt data-layer="team.name" data-fit data-max="3.8" data-min="3" style="width:72cqw; font-weight:700; font-style:italic; font-size:3.8cqw; line-height:1; letter-spacing:.08em; text-transform:uppercase; white-space:nowrap;">{s.b.team}</div>
			</div>
		</div>
		<div style="position:absolute; right:4.6cqw; top:3cqw;">
			<BaseballBadge position={s.b.posCode} k={s.k} style="width:16cqw; height:16cqw;" positionStyle="font-family:'Barlow Condensed', sans-serif; font-size:5.4cqw;" />
		</div>

		<div data-layer="back.panel" style={`position:absolute; left:6cqw; right:6cqw; top:31cqw; bottom:3.4cqw; padding:2cqw 2.6cqw 2.2cqw; background:${s.k.stock}; border-top:.8cqw solid ${s.k.fieldOnStock}; display:flex; flex-direction:column; gap:2.2cqw;`}>
			<div data-layer="identity.line" style="flex:none; display:flex; justify-content:space-between; flex-wrap:wrap; gap:.6cqw 2cqw; font-weight:700; font-style:italic; font-size:3.3cqw; line-height:1; letter-spacing:.04em; text-transform:uppercase;">
				<span data-rt data-layer="season.line">{s.b.seasonLine}</span>
				<span data-rt data-layer="player.line" style={`color:${s.k.ink};`}>{s.b.playerLine}</span>
			</div>
			<div data-layer="families" style="flex:1 1 auto; min-height:0; display:flex; flex-direction:column; justify-content:space-evenly; gap:2.2cqw;">
				{#each s.b.fams as fam}
					<StatFamily {fam} sz={s.b.sz} km={0.72} cm={0.92} styles={familyStyles} titleStart={false} titleEnd={false} />
				{/each}
			</div>
			<div data-layer="back.bottom" style={`flex:none; display:flex; gap:3cqw; align-items:stretch; padding-top:1.8cqw; border-top:.35cqw solid ${s.k.fieldOnStock};`}>
				{#if s.b.showDia}
					<PositionDiamond dia={s.b.dia} k={s.k} styles={diamondStyles} />
				{/if}
				<div style="flex:1; min-width:0; display:flex; flex-direction:column; justify-content:space-between; gap:2cqw;">
					<div data-layer="facts" style="display:flex; flex-direction:column; gap:1.2cqw; min-width:0;">
						{#if s.b.appsText}
							<div data-layer="facts.positions" style="display:flex; align-items:baseline; gap:2cqw;">
								<div style="flex:none; font-size:3cqw; line-height:1; letter-spacing:.06em; text-transform:uppercase; font-weight:700;">{s.b.appsLabel}</div>
								<div data-rt data-layer="facts.positions.value" style={`min-width:0; font-size:3.5cqw; line-height:1.1; font-weight:600; font-style:italic; color:${s.k.ink};`}>{s.b.apps}</div>
							</div>
						{/if}
						{#if s.b.hasWar}
							<div data-layer="facts.war" style="display:flex; flex-direction:column; gap:.8cqw;">
								<div style="font-size:3cqw; line-height:1; letter-spacing:.06em; text-transform:uppercase; font-weight:700;">Ranking</div>
								<div data-rt data-layer="facts.war.value" style={`font-size:3.6cqw; line-height:1.15; text-wrap:pretty; font-weight:600; font-style:italic; color:${s.k.ink};`}>{s.b.war}</div>
							</div>
						{/if}
						{#if s.b.isBullpen}
							<div data-layer="facts.pool" style="display:flex; flex-direction:column; gap:.8cqw;">
								<div style="font-size:3cqw; line-height:1; letter-spacing:.06em; text-transform:uppercase; font-weight:700;">Pool</div>
								<div data-rt data-layer="facts.pool.value" style={`font-size:3.6cqw; line-height:1.15; text-wrap:pretty; font-weight:600; font-style:italic; color:${s.k.ink};`}>{s.b.pool}</div>
							</div>
						{/if}
					</div>
					<SourceCues back={s.b} {onDetails} statsStyle={`color:${s.k.ink};`} photoStyle={`color:${s.k.ink};`} buttonStyle="font-weight:800; font-style:italic;" />
				</div>
			</div>
		</div>
	</div>
</div>
