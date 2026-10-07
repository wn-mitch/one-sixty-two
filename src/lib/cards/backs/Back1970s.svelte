<script lang="ts">
	import { fit, fitArc } from '../fit.ts';
	import BaseballBadge from '../parts/BaseballBadge.svelte';
	import PositionDiamond from '../parts/PositionDiamond.svelte';
	import SourceCues from '../parts/SourceCues.svelte';
	import StatFamily from '../parts/StatFamily.svelte';
	import type { CardViewModel } from '../view-model.ts';

	let { s, onDetails }: { s: CardViewModel; onDetails: () => void } = $props();
	const arcId = $props.id();
</script>

<div
	data-layer="back.ground"
	style={`position:absolute; inset:0; overflow:hidden; border-radius:1.8cqw; background:${s.k.kraft}; color:${s.k.fieldOnKraft}; font-family:'Barlow Condensed', sans-serif;`}
>
	<div data-layer="frame.kraft-grain" aria-hidden="true" style="position:absolute; inset:0; background:repeating-linear-gradient(0deg, rgba(90,70,40,.05) 0 .2cqw, rgba(0,0,0,0) .2cqw .9cqw), repeating-linear-gradient(90deg, rgba(255,255,255,.07) 0 .3cqw, rgba(0,0,0,0) .3cqw 1.3cqw);"></div>
	<svg data-layer="team.arc" viewBox="0 0 100 38" aria-hidden="true" style="position:absolute; left:0; top:0; width:100cqw; height:38cqw; overflow:visible; display:block;">
		<path id={arcId} d="M 7 36 A 43 21 0 0 1 93 36" fill="none"></path>
		<text
			use:fitArc={{ arcLength: 96, max: 15 }}
			data-rt
			data-layer="team.headline"
			data-fit-arc="96"
			data-max="15"
			style={`font-family:'Barlow Condensed', sans-serif; font-weight:900; font-size:15cqw; letter-spacing:.02em; text-anchor:middle; fill:${s.k.fieldOnKraft}; paint-order:stroke; stroke:${s.k.accentOnKraft}; stroke-width:.9; stroke-linejoin:round;`}
		>
			<textPath href={`#${arcId}`} startOffset="50%">{s.nick}</textPath>
		</text>
	</svg>

	<div data-layer="back.flow" style="position:absolute; left:5cqw; right:5cqw; top:22cqw; bottom:4cqw; display:flex; flex-direction:column; gap:1.8cqw;">
		<div data-layer="identity.pill" style={`flex:none; align-self:center; max-width:100%; box-sizing:border-box; padding:1.3cqw 5cqw 1.2cqw; border-radius:99cqw; background:${s.k.field}; color:${s.k.onField}; box-shadow:.9cqw .9cqw 0 ${s.k.accentOnKraft}; text-align:center;`}>
			<div
				use:fit={{ max: 7, min: 5, wrapMin: 4.8, lines: 2, maxH: 10 }}
				data-rt
				data-layer="name.full"
				data-fit
				data-max="7"
				data-min="5"
				data-wrap-min="4.8"
				data-lines="2"
				data-max-h="10"
				style="max-width:80cqw; font-weight:800; font-size:7.6cqw; line-height:.92; text-transform:uppercase; white-space:nowrap; text-wrap:balance;"
			>{s.b.name}</div>
		</div>

		<div data-layer="identity.row" style="flex:none; display:flex; align-items:center; gap:3cqw;">
			<BaseballBadge position={s.b.posCode} k={s.k} style="width:14cqw; height:14cqw;" positionStyle="font-family:'Barlow Condensed', sans-serif; font-weight:800; font-size:5cqw; font-style:normal;" />
			<div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:1cqw;">
				<div use:fit={{ max: 4.2, min: 3.2 }} data-rt data-layer="team.name" data-fit data-max="4.2" data-min="3.2" style="width:100%; font-weight:800; font-size:4.2cqw; line-height:1; letter-spacing:.08em; text-transform:uppercase; white-space:nowrap;">{s.b.team}</div>
				<div data-rt data-layer="season.line" style={`font-weight:700; font-size:3.4cqw; line-height:1; letter-spacing:.05em; text-transform:uppercase; color:${s.k.fieldOnKraft};`}>{s.b.seasonLine}</div>
				<div data-rt data-layer="player.line" style={`font-weight:600; font-size:3.2cqw; line-height:1.1; letter-spacing:.03em; text-transform:uppercase; color:${s.k.fieldOnKraft};`}>{s.b.playerLine}</div>
			</div>
		</div>

		<div data-layer="families" style="flex:1 1 auto; min-height:0; display:flex; flex-direction:column; justify-content:space-evenly; gap:2cqw;">
			{#each s.b.fams as fam}
				<StatFamily
					{fam}
					sz={s.b.sz}
					km={0.74}
					cm={0.78}
					titleStart={false}
					styles={{
						root: 'gap:1.3cqw;',
						title: `gap:1.6cqw; font-family:'Barlow Condensed', sans-serif; font-weight:900; font-style:normal; font-size:3.6cqw; line-height:1; letter-spacing:.1em; text-transform:uppercase; color:${s.k.fieldOnKraft};`,
						titleEnd: `height:.5cqw; border-radius:99cqw; background:${s.k.accentOnKraft};`,
						keyrow: 'gap:1.4cqw;',
						keycell: `gap:.7cqw; padding:1.1cqw 1cqw; border-radius:99cqw; background:${s.k.field}; color:${s.k.onField};`,
						keylabel: 'font-weight:700;',
						keyvalue: "font-family:'Barlow Condensed', sans-serif; font-weight:800; letter-spacing:0;",
						countrow: `gap:0; border-radius:1.6cqw; overflow:hidden; box-shadow:0 0 0 .4cqw ${s.k.fieldOnKraft};`,
						countcell: 'gap:0; align-items:stretch; text-align:center; padding:0; border:0;',
						countlabel: `padding:.8cqw 0 .7cqw; background:${s.k.fieldOnKraft}; color:${s.k.kraft}; font-weight:800;`,
						countvalue: `padding:.9cqw 0 1cqw; background:${s.k.kraftRow}; color:${s.k.fieldOnKraft}; font-family:'Barlow Condensed', sans-serif; font-weight:800; letter-spacing:0;`
					}}
				/>
			{/each}
		</div>

		<div data-layer="back.bottom" style={`flex:none; display:flex; gap:3cqw; align-items:stretch; padding:1.8cqw 2.4cqw; border-radius:2.6cqw; border:.45cqw solid ${s.k.fieldOnKraft};`}>
			{#if s.b.showDia}
				<PositionDiamond
					dia={s.b.dia}
					k={s.k}
					style="width:25cqw; height:25cqw;"
					styles={{
						outfield: `border-width:.4cqw; border-top-color:${s.k.fieldOnKraft};`,
						infield: `border-width:.4cqw; border-color:${s.k.fieldOnKraft}; background:${s.k.kraftRow};`,
						chip: `border-radius:99cqw; padding:.6cqw 1.4cqw .7cqw; background:${s.k.fieldOnKraft}; color:${s.k.kraft};`,
						label: 'font-weight:800;',
						games: "font-family:'Barlow Condensed', sans-serif; font-weight:900;",
						empty: `background:${s.k.fieldOnKraft};`
					}}
				/>
			{/if}
			<div style="flex:1; min-width:0; display:flex; flex-direction:column; justify-content:space-between; gap:2cqw;">
				<div data-layer="facts" style="display:flex; flex-direction:column; gap:1.2cqw; min-width:0;">
					{#if s.b.appsText}
						<div data-layer="facts.positions" style="display:flex; align-items:baseline; gap:2cqw;">
							<div style={`flex:none; font-size:3cqw; line-height:1; letter-spacing:.06em; text-transform:uppercase; font-weight:800; color:${s.k.fieldOnKraft};`}>{s.b.appsLabel}</div>
							<div data-rt data-layer="facts.positions.value" style={`min-width:0; font-size:3.5cqw; line-height:1.1; font-weight:700; color:${s.k.fieldOnKraft};`}>{s.b.apps}</div>
						</div>
					{/if}
					{#if s.b.hasWar}
						<div data-layer="facts.war" style="display:flex; flex-direction:column; gap:.8cqw;">
							<div style={`font-size:3cqw; line-height:1; letter-spacing:.06em; text-transform:uppercase; font-weight:800; color:${s.k.fieldOnKraft};`}>Ranking</div>
							<div data-rt data-layer="facts.war.value" style={`font-size:3.6cqw; line-height:1.15; text-wrap:pretty; font-weight:700; color:${s.k.fieldOnKraft};`}>{s.b.war}</div>
						</div>
					{/if}
					{#if s.b.isBullpen}
						<div data-layer="facts.pool" style="display:flex; flex-direction:column; gap:.8cqw;">
							<div style={`font-size:3cqw; line-height:1; letter-spacing:.06em; text-transform:uppercase; font-weight:800; color:${s.k.fieldOnKraft};`}>Pool</div>
							<div data-rt data-layer="facts.pool.value" style={`font-size:3.6cqw; line-height:1.15; text-wrap:pretty; font-weight:700; color:${s.k.fieldOnKraft};`}>{s.b.pool}</div>
						</div>
					{/if}
				</div>
				<SourceCues back={s.b} {onDetails} statsStyle={`color:${s.k.fieldOnKraft};`} photoStyle={`color:${s.k.fieldOnKraft};`} buttonStyle={`color:${s.k.fieldOnKraft}; font-weight:800;`} />
			</div>
		</div>
	</div>
</div>
