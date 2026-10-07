<script lang="ts">
	import { fit, fitArc } from '../fit.ts';
	import PhotoMask from '../parts/PhotoMask.svelte';
	import LogoSlot from '../parts/LogoSlot.svelte';
	import type { CardViewModel } from '../view-model.ts';

	let { s }: { s: CardViewModel } = $props();
	const arcId = $props.id();
</script>

<div
	data-layer="frame.stock"
	style={`position:absolute; inset:0; overflow:hidden; border-radius:1.8cqw; background:${s.k.stock}; color:${s.k.fieldOnStock}; font-family:'Barlow Condensed', sans-serif;`}
>
	<svg data-layer="team.arc" viewBox="0 0 100 60" aria-hidden="true" style="position:absolute; left:0; top:0; width:100cqw; height:60cqw; overflow:visible; display:block;">
		<path id={arcId} d="M 2.5 52 A 47.5 32.5 0 0 1 97.5 52" fill="none"></path>
		<text
			use:fitArc={{ arcLength: 84, max: 24 }}
			data-rt
			data-layer="team.headline"
			data-fit-arc="84"
			data-max="24"
			style={`font-family:'Barlow Condensed', sans-serif; font-weight:900; font-size:24cqw; letter-spacing:.01em; text-anchor:middle; fill:${s.k.display};`}
		>
			<textPath href={`#${arcId}`} startOffset="50%">{s.nick}</textPath>
		</text>
	</svg>

	{#if s.fin.gem}
		<div data-layer="material.gem-ring" style="position:absolute; left:4.3cqw; right:4.3cqw; top:21.3cqw; height:73.4cqw; border-radius:45.2cqw 45.2cqw 3cqw 3cqw / 30.2cqw 30.2cqw 3cqw 3cqw; background:conic-gradient(from var(--ang, 200deg), #ff6fc1, #ffe27a, #8dffb0, #6fd6ff, #b48cff, #ff6fc1);"></div>
	{/if}
	{#if s.fin.emboss}
		<div data-layer="material.photo-bevel" style="position:absolute; left:5.6cqw; right:5.6cqw; top:22.6cqw; height:70.8cqw; border-radius:44.4cqw 44.4cqw 2.2cqw 2.2cqw / 29.4cqw 29.4cqw 2.2cqw 2.2cqw; box-shadow:calc(var(--lx, -0.45) * -0.8cqw) calc(var(--ly, -0.75) * -0.8cqw) 1cqw rgba(0,0,0,0.45), calc(var(--lx, -0.45) * 0.5cqw) calc(var(--ly, -0.75) * 0.5cqw) 0.6cqw rgba(255,255,255,0.6);"></div>
	{/if}
	<div data-layer="frame.arch-keyline" style={`position:absolute; left:5.6cqw; right:5.6cqw; top:22.6cqw; height:70.8cqw; background:${s.k.field}; border-radius:44.4cqw 44.4cqw 2.2cqw 2.2cqw / 29.4cqw 29.4cqw 2.2cqw 2.2cqw;`}></div>
	<div data-layer="photo.mask" style={`position:absolute; left:7cqw; right:7cqw; top:24cqw; height:68cqw; overflow:hidden; background:${s.k.accent}; border-radius:43cqw 43cqw 1.4cqw 1.4cqw / 28cqw 28cqw 1.4cqw 1.4cqw;`}>
		<PhotoMask {s} />
	</div>

	<div data-layer="name.band" style={`position:absolute; left:0; right:0; top:88.5cqw; padding:2cqw 18cqw 1.8cqw; background:${s.k.field}; color:${s.k.onField}; text-align:center;`}>
		<div
			use:fit={{ max: 11.5, min: 8, wrapMin: 5.6, lines: 2, maxH: 12 }}
			data-rt
			data-layer="name.full"
			data-fit
			data-max="11.5"
			data-min="8"
			data-wrap-min="5.6"
			data-lines="2"
			data-max-h="12"
			style="text-shadow:var(--emb, 0 0 0 transparent); width:100%; font-weight:800; font-size:11.5cqw; line-height:.9; letter-spacing:.01em; text-transform:uppercase; white-space:nowrap; text-wrap:balance;"
		>{s.full}</div>
	</div>

	<div data-layer="season.roundel" style={`position:absolute; left:4.5cqw; top:77.5cqw; width:15cqw; height:15cqw; border-radius:50%; background:var(--stamp, ${s.k.stock}); box-shadow:0 0 0 .7cqw ${s.k.fieldOnStock}; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.5cqw; line-height:1;`}>
		<span data-rt data-layer="season.year" style="font-weight:800; font-size:4.6cqw;">{s.year}</span>
		<span data-rt data-layer="season.position" style="font-weight:700; font-size:3.8cqw; letter-spacing:.06em;">{s.pos}</span>
	</div>
	<div data-layer="logo.roundel" style={`position:absolute; right:4.5cqw; top:77.5cqw; width:15cqw; height:15cqw; border-radius:50%; background:var(--stamp, ${s.k.paper}); box-shadow:0 0 0 .7cqw ${s.k.fieldOnStock};`}>
		<LogoSlot {s} markStyle="left:2.2cqw; top:2.2cqw; width:10.6cqw; height:10.6cqw;" fallbackStyle={`color:${s.k.fieldOnPaper};`} />
	</div>

	<div use:fit={{ max: 4.4, min: 3.3 }} data-rt data-layer="team.name" data-fit data-max="4.4" data-min="3.3" style="position:absolute; left:6cqw; right:6cqw; top:106cqw; text-align:center; font-weight:700; font-size:4.4cqw; line-height:1; letter-spacing:.14em; text-transform:uppercase; white-space:nowrap;">{s.team}</div>

	<div data-layer="stats" style="position:absolute; left:6cqw; right:6cqw; top:112.6cqw; display:grid; grid-template-columns:40fr 34fr 26fr; gap:2.2cqw;">
		<div data-layer="stat.primary" style={`display:flex; flex-direction:column; justify-content:flex-end; gap:.7cqw; padding:1.6cqw 2.4cqw 1.8cqw; border-radius:2.2cqw; background:${s.k.field}; color:${s.k.onField};`}>
			<div data-rt data-layer="stat.primary.label" style="font-weight:700; font-size:3.2cqw; line-height:1; letter-spacing:.05em; text-transform:uppercase;">{s.st1.l}</div>
			<div use:fit={{ auto: true }} data-rt data-fit="auto" data-layer="stat.primary.value" style="font-weight:800; font-size:13.5cqw; line-height:.82; font-variant-numeric:tabular-nums; white-space:nowrap;">{s.st1.v}</div>
		</div>
		<div data-layer="stat.secondary" style={`display:flex; flex-direction:column; justify-content:flex-end; gap:.7cqw; padding:1.6cqw 2.4cqw 1.8cqw; border-radius:2.2cqw; border:.5cqw solid ${s.k.fieldOnStock};`}>
			<div data-rt data-layer="stat.secondary.label" style="font-weight:700; font-size:3.2cqw; line-height:1; letter-spacing:.05em; text-transform:uppercase;">{s.st2.l}</div>
			<div use:fit={{ auto: true }} data-rt data-fit="auto" data-layer="stat.secondary.value" style="font-weight:800; font-size:11cqw; line-height:.82; font-variant-numeric:tabular-nums; white-space:nowrap;">{s.st2.v}</div>
		</div>
		<div data-layer="stat.tertiary" style={`display:flex; flex-direction:column; justify-content:flex-end; gap:.7cqw; padding:1.6cqw 2.4cqw 1.8cqw; border-radius:2.2cqw; border:.5cqw solid ${s.k.fieldOnStock};`}>
			<div data-rt data-layer="stat.tertiary.label" style="font-weight:700; font-size:3.2cqw; line-height:1; letter-spacing:.05em; text-transform:uppercase;">{s.st3.l}</div>
			<div use:fit={{ auto: true }} data-rt data-fit="auto" data-layer="stat.tertiary.value" style="font-weight:800; font-size:11cqw; line-height:.82; font-variant-numeric:tabular-nums; white-space:nowrap;">{s.st3.v}</div>
		</div>
	</div>

	<div data-layer="footer" style="position:absolute; left:6cqw; right:6cqw; bottom:3.8cqw; display:flex; justify-content:space-between; align-items:baseline; gap:2cqw;">
		<div data-rt data-layer="photo.caption" style={`font-weight:600; font-size:3cqw; line-height:1; letter-spacing:.07em; text-transform:uppercase; white-space:nowrap; color:${s.k.fieldOnStock};`}>{s.caption}</div>
		<div data-layer="brand" style="font-weight:800; font-style:italic; font-size:3.6cqw; line-height:1;">162-0</div>
	</div>
</div>
