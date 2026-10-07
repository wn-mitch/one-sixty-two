<script lang="ts">
	import { fit } from '../fit.ts';
	import LogoSlot from '../parts/LogoSlot.svelte';
	import PhotoMask from '../parts/PhotoMask.svelte';
	import type { CardViewModel } from '../view-model.ts';

	let { s }: { s: CardViewModel } = $props();
</script>

<div data-card="2020s" use:fit style="position:relative; width:100%; height:100%; container-type:inline-size; contain:layout style;">
	<div data-layer="frame.ground" style={`position:absolute; inset:0; overflow:hidden; border-radius:1.8cqw; background:${s.k.dark}; color:${s.k.paper}; font-family:'Barlow Condensed', sans-serif; display:flex; flex-direction:column; padding:4cqw 4cqw 3.6cqw;`}>
		<div data-layer="photo.area" style="flex:1 1 auto; min-height:0; position:relative;">
			{#if s.fin.gem}
				<div data-layer="material.gem-ring" style="position:absolute; inset:-1.3cqw; clip-path:polygon(0 0, 100% 0, 100% calc(100% - 9.3cqw), calc(100% - 14.5cqw) 100%, 0 100%); background:conic-gradient(from var(--ang, 200deg), #ff6fc1, #ffe27a, #8dffb0, #6fd6ff, #b48cff, #ff6fc1);"></div>
			{/if}
			{#if s.fin.emboss}
				<div data-layer="material.photo-bevel" style="position:absolute; inset:0; filter:drop-shadow(calc(var(--lx, -0.45) * -0.8cqw) calc(var(--ly, -0.75) * -0.8cqw) 0.8cqw rgba(0,0,0,0.6)) drop-shadow(calc(var(--lx, -0.45) * 0.4cqw) calc(var(--ly, -0.75) * 0.4cqw) 0.3cqw rgba(255,255,255,0.45));"><div style="position:absolute; inset:0; background:#000; clip-path:polygon(0 0, 100% 0, 100% calc(100% - 9cqw), calc(100% - 14cqw) 100%, 0 100%);"></div></div>
			{/if}
			<div data-layer="photo.mask" style={`position:absolute; inset:0; overflow:hidden; background:${s.k.raised}; clip-path:polygon(0 0, 100% 0, 100% calc(100% - 9cqw), calc(100% - 14cqw) 100%, 0 100%);`}>
				<PhotoMask
					{s}
					emptyColor={s.k.onRaised}
					emptyStyle={`background:repeating-linear-gradient(135deg, rgba(255,255,255,.07) 0 1.1cqw, rgba(0,0,0,0) 1.1cqw 2.2cqw), ${s.k.raised};`}
				/>
			</div>
			<div data-rt data-layer="season.slab" style={`position:absolute; left:0; top:0; padding:1.2cqw 5cqw 1.2cqw 2.6cqw; background:${s.k.field}; color:${s.k.onField}; clip-path:polygon(0 0, 100% 0, calc(100% - 2.6cqw) 100%, 0 100%); display:flex; align-items:center; gap:1.4cqw; font-weight:800; font-size:5cqw; line-height:1;`}>
				<span data-layer="season.year">{s.year}</span>
				<span aria-hidden="true" style={`width:0.45cqw; height:3.8cqw; background:${s.k.onField};`}></span>
				<span data-layer="season.position">{s.pos}</span>
			</div>
			<div data-layer="logo.tile" style={`position:absolute; right:0; top:0; width:17cqw; height:17cqw; background:var(--stamp, ${s.k.paper}); clip-path:polygon(0 0, 100% 0, 100% 100%, 4cqw 100%, 0 calc(100% - 4cqw));`}>
				<LogoSlot {s} markStyle="left:2.6cqw; top:2.4cqw; width:12cqw; height:12cqw;" fallbackStyle={`font-size:5.4cqw; color:${s.k.fieldOnPaper};`} />
			</div>
		</div>

		<div use:fit={{ max: 14, min: 9, wrapMin: 6.4, lines: 2, maxH: 13.5 }} data-rt data-layer="name.full" data-fit data-max="14" data-min="9" data-wrap-min="6.4" data-lines="2" data-max-h="13.5" style="text-shadow:var(--emb, 0 0 0 transparent); flex:none; margin-top:2.8cqw; width:100%; font-weight:900; font-size:14cqw; line-height:0.86; text-transform:uppercase; white-space:nowrap; text-wrap:balance;">{s.full}</div>
		<div data-layer="team.row" style="flex:none; margin-top:1.4cqw; display:flex; align-items:center; gap:1.8cqw;">
			<span aria-hidden="true" style={`flex:none; width:5cqw; height:1.1cqw; background:${s.k.tintOnDark}; transform:skewX(-30deg);`}></span>
			<span use:fit={{ max: 4.4, min: 3.3 }} data-rt data-layer="team.name" data-fit data-max="4.4" data-min="3.3" style={`min-width:0; max-width:84cqw; font-weight:700; font-size:4.4cqw; line-height:1; letter-spacing:0.1em; text-transform:uppercase; white-space:nowrap; color:${s.k.tintOnDark};`}>{s.team}</span>
		</div>

		<div data-layer="stats" style="flex:none; margin-top:3.4cqw; display:grid; grid-template-columns:40fr 35fr 25fr; gap:1.4cqw;">
			<div data-layer="stat.primary" style={`display:flex; flex-direction:column; justify-content:flex-end; gap:0.8cqw; padding:1.8cqw 2.4cqw 2cqw; background:${s.k.field}; color:${s.k.onField}; clip-path:polygon(0 0, calc(100% - 2.6cqw) 0, 100% 2.6cqw, 100% 100%, 0 100%);`}>
				<div data-rt data-layer="stat.primary.label" style="font-weight:700; font-size:3.2cqw; line-height:1; letter-spacing:0.06em; text-transform:uppercase;">{s.st1.l}</div>
				<div use:fit={{ auto: true }} data-rt data-fit="auto" data-layer="stat.primary.value" style="font-weight:800; font-size:14cqw; line-height:0.82; font-variant-numeric:tabular-nums; white-space:nowrap;">{s.st1.v}</div>
			</div>
			<div data-layer="stat.secondary" style={`display:flex; flex-direction:column; justify-content:flex-end; gap:0.8cqw; padding:1.8cqw 2.4cqw 2cqw; background:${s.k.raised}; clip-path:polygon(0 0, calc(100% - 2.6cqw) 0, 100% 2.6cqw, 100% 100%, 0 100%);`}>
				<div data-rt data-layer="stat.secondary.label" style="font-weight:700; font-size:3.2cqw; line-height:1; letter-spacing:0.06em; text-transform:uppercase;">{s.st2.l}</div>
				<div use:fit={{ auto: true }} data-rt data-fit="auto" data-layer="stat.secondary.value" style="font-weight:800; font-size:12cqw; line-height:0.82; font-variant-numeric:tabular-nums; white-space:nowrap;">{s.st2.v}</div>
			</div>
			<div data-layer="stat.tertiary" style={`display:flex; flex-direction:column; justify-content:flex-end; gap:0.8cqw; padding:1.8cqw 2.4cqw 2cqw; background:${s.k.raised}; clip-path:polygon(0 0, calc(100% - 2.6cqw) 0, 100% 2.6cqw, 100% 100%, 0 100%);`}>
				<div data-rt data-layer="stat.tertiary.label" style="font-weight:700; font-size:3.2cqw; line-height:1; letter-spacing:0.06em; text-transform:uppercase;">{s.st3.l}</div>
				<div use:fit={{ auto: true }} data-rt data-fit="auto" data-layer="stat.tertiary.value" style="font-weight:800; font-size:12cqw; line-height:0.82; font-variant-numeric:tabular-nums; white-space:nowrap;">{s.st3.v}</div>
			</div>
		</div>

		<div data-layer="footer" style="flex:none; margin-top:2.4cqw; display:flex; justify-content:space-between; align-items:baseline; gap:2cqw;">
			<div data-rt data-layer="photo.caption" style={`font-weight:600; font-size:3cqw; line-height:1; letter-spacing:0.07em; text-transform:uppercase; white-space:nowrap; color:${s.k.mutedOnDark};`}>{s.caption}</div>
			<div data-layer="brand" style="font-weight:800; font-style:italic; font-size:3.6cqw; line-height:1;">162-0</div>
		</div>
	</div>
</div>
