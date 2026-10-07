<script lang="ts">
	import { fit } from '../fit.ts';
	import BaseballBadge from '../parts/BaseballBadge.svelte';
	import PositionDiamond from '../parts/PositionDiamond.svelte';
	import SourceCues from '../parts/SourceCues.svelte';
	import StatFamily from '../parts/StatFamily.svelte';
	import type { CardViewModel } from '../view-model.ts';

	export interface Back1950sProps {
		s: CardViewModel;
		onDetails: () => void;
	}

	let { s, onDetails }: Back1950sProps = $props();
</script>

<div use:fit data-card="1950s" data-face="back" style="container-type:inline-size; contain:layout style; position:relative; width:100%; aspect-ratio:5/7;">
	<div data-layer="back.ground" style={`position:absolute; inset:0; overflow:hidden; border-radius:1.8cqw; background:${s.k.stock}; color:${s.k.fieldOnStock}; font-family:'Barlow Condensed', sans-serif;`}>
		<div data-layer="frame.rule" aria-hidden="true" style={`position:absolute; inset:2.2cqw; border:0.35cqw solid ${s.k.fieldOnStock}; border-radius:1cqw;`}></div>
		<div data-layer="frame.rule-inner" aria-hidden="true" style={`position:absolute; inset:3cqw; border:0.15cqw solid ${s.k.fieldOnStock}; border-radius:0.6cqw;`}></div>
		<div data-layer="back.flow" style="position:absolute; inset:5.6cqw 6cqw 4.8cqw; display:flex; flex-direction:column; gap:1.8cqw;">
			<div data-layer="identity.row" style="flex:none; display:flex; align-items:center; gap:2.6cqw;">
				<BaseballBadge position={s.b.posCode} k={s.k} />
				<div data-layer="identity.plate" style={`position:relative; flex:1; min-width:0; padding:2.2cqw 3.4cqw 2.3cqw; text-align:center; color:${s.k.onField};`}>
					<div data-layer="frame.plate" aria-hidden="true" style={`position:absolute; inset:0; background:${s.k.field}; clip-path:polygon(2.2cqw 0, calc(100% - 2.2cqw) 0, 100% 2.2cqw, 100% calc(100% - 2.2cqw), calc(100% - 2.2cqw) 100%, 2.2cqw 100%, 0 calc(100% - 2.2cqw), 0 2.2cqw);`}></div>
					<div data-layer="frame.plate-hairline" aria-hidden="true" style={`position:absolute; inset:0.8cqw; border:0.25cqw solid ${s.k.onField}; clip-path:polygon(1.6cqw 0, calc(100% - 1.6cqw) 0, 100% 1.6cqw, 100% calc(100% - 1.6cqw), calc(100% - 1.6cqw) 100%, 1.6cqw 100%, 0 calc(100% - 1.6cqw), 0 1.6cqw);`}></div>
					<div data-rt data-layer="name.full" data-fit data-max="7.6" data-min="5.4" data-wrap-min="5" data-lines="2" data-max-h="11" style="position:relative; font-family:'Roboto Serif', serif; font-weight:700; font-style:italic; font-size:7.6cqw; line-height:1.04; letter-spacing:-0.01em; white-space:nowrap; text-wrap:balance;">{s.b.name}</div>
					<div data-rt data-layer="team.name" data-fit data-max="3.2" data-min="2.7" style="position:relative; margin-top:0.9cqw; font-weight:700; font-size:3.2cqw; line-height:1; letter-spacing:0.16em; text-transform:uppercase; white-space:nowrap;">{s.b.team}</div>
				</div>
			</div>
			<div data-layer="identity.line" style={`flex:none; display:flex; justify-content:space-between; flex-wrap:wrap; gap:0.6cqw 2.4cqw; font-family:'Roboto Serif', serif; font-weight:600; font-style:italic; font-size:3.4cqw; line-height:1.1; color:${s.k.ink};`}>
				<span data-rt data-layer="season.line">{s.b.seasonLine}</span>
				<span data-rt data-layer="player.line">{s.b.playerLine}</span>
			</div>
			<div data-layer="families" style="flex:1 1 auto; min-height:0; display:flex; flex-direction:column; justify-content:space-evenly; gap:2cqw;">
				{#each s.b.fams as fam}
					<StatFamily
						{fam}
						sz={s.b.sz}
						styles={{ countvalue: `color:${s.k.ink};` }}
					/>
				{/each}
			</div>
			<div data-layer="back.bottom" style={`flex:none; display:flex; gap:3cqw; align-items:stretch; padding-top:2cqw; border-top:0.35cqw solid ${s.k.fieldOnStock};`}>
				{#if s.b.showDia}
					<PositionDiamond dia={s.b.dia} k={s.k} />
				{/if}
				<div style="flex:1; min-width:0; display:flex; flex-direction:column; justify-content:space-between; gap:2cqw;">
					<div data-layer="facts" style="display:flex; flex-direction:column; gap:1.2cqw; min-width:0;">
						{#if s.b.appsText}
							<div data-layer="facts.positions" style="display:flex; align-items:baseline; gap:2cqw;">
								<div style="flex:none; font-size:3cqw; line-height:1; letter-spacing:0.06em; text-transform:uppercase; font-weight:700;">{s.b.appsLabel}</div>
								<div data-rt data-layer="facts.positions.value" style={`min-width:0; font-size:3.5cqw; line-height:1.1; font-family:'Roboto Serif', serif; font-weight:600; font-style:italic; color:${s.k.ink};`}>{s.b.apps}</div>
							</div>
						{/if}
						{#if s.b.hasWar}
							<div data-layer="facts.war" style="display:flex; flex-direction:column; gap:0.8cqw;">
								<div style="font-size:3cqw; line-height:1; letter-spacing:0.06em; text-transform:uppercase; font-weight:700;">Ranking</div>
								<div data-rt data-layer="facts.war.value" style={`font-size:3.6cqw; line-height:1.15; text-wrap:pretty; font-family:'Roboto Serif', serif; font-weight:600; font-style:italic; color:${s.k.ink};`}>{s.b.war}</div>
							</div>
						{/if}
						{#if s.b.isBullpen}
							<div data-layer="facts.pool" style="display:flex; flex-direction:column; gap:0.8cqw;">
								<div style="font-size:3cqw; line-height:1; letter-spacing:0.06em; text-transform:uppercase; font-weight:700;">Pool</div>
								<div data-rt data-layer="facts.pool.value" style={`font-size:3.6cqw; line-height:1.15; text-wrap:pretty; font-family:'Roboto Serif', serif; font-weight:600; font-style:italic; color:${s.k.ink};`}>{s.b.pool}</div>
							</div>
						{/if}
					</div>
					<SourceCues back={s.b} {onDetails} statsStyle={`color:${s.k.ink};`} photoStyle={`color:${s.k.ink};`} />
				</div>
			</div>
		</div>
	</div>
</div>
