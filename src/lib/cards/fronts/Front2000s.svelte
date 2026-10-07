<script lang="ts">
	import { fit } from '../fit.ts';
	import LogoSlot from '../parts/LogoSlot.svelte';
	import PhotoMask from '../parts/PhotoMask.svelte';
	import type { CardViewModel } from '../view-model.ts';

	let { s }: { s: CardViewModel } = $props();
</script>

<div data-card="2000s" data-art={s.fin.tier} use:fit style={`container-type:inline-size; contain:layout style; position:relative; width:100%; aspect-ratio:5/7; --stamp:${s.fin.stamp}; --emb:${s.fin.emb};`}>
	<div data-layer="frame.stock" style={`position:absolute; inset:0; overflow:hidden; border-radius:1.8cqw; background:${s.k.stock}; color:${s.k.fieldOnStock}; font-family:'Barlow Condensed', sans-serif;`}>
		<div data-layer="frame.rail" style={`position:absolute; left:0; top:0; bottom:0; width:10cqw; background:${s.k.field}; color:${s.k.onField};`}>
			<div data-layer="brand" style="position:absolute; top:4.6cqw; left:0; right:0; display:flex; justify-content:center;"><div style="writing-mode:vertical-rl; transform:rotate(180deg); font-weight:800; font-style:italic; font-size:3.6cqw; line-height:1;">162-0</div></div>
			<div data-rt data-layer="season.rail" style="position:absolute; bottom:5cqw; left:0; right:0; display:flex; justify-content:center;">
				<div style="writing-mode:vertical-rl; transform:rotate(180deg); display:flex; align-items:center; gap:1.6cqw; font-weight:800; font-size:6.2cqw; line-height:1; letter-spacing:0.03em;">
					<span data-layer="season.year">{s.year}</span>
					<span style={`width:0.4cqw; height:3.6cqw; background:${s.k.onField};`}></span>
					<span data-layer="season.position">{s.pos}</span>
				</div>
			</div>
		</div>

		{#if s.fin.gem}<div data-layer="material.gem-ring" style="position:absolute; left:12.7cqw; right:2.7cqw; top:2.7cqw; height:82.6cqw; border-radius:0.4cqw; background:conic-gradient(from var(--ang, 200deg), #ff6fc1, #ffe27a, #8dffb0, #6fd6ff, #b48cff, #ff6fc1);"></div>{/if}
		{#if s.fin.emboss}<div data-layer="material.photo-bevel" style="position:absolute; left:14cqw; right:4cqw; top:4cqw; height:80cqw; border-radius:0; box-shadow:calc(var(--lx, -0.45) * -0.8cqw) calc(var(--ly, -0.75) * -0.8cqw) 1cqw rgba(0,0,0,0.45), calc(var(--lx, -0.45) * 0.5cqw) calc(var(--ly, -0.75) * 0.5cqw) 0.6cqw rgba(255,255,255,0.6);"></div>{/if}
		<div data-layer="photo.mask" style={`position:absolute; left:14cqw; right:4cqw; top:4cqw; height:80cqw; overflow:hidden; background:${s.k.accent};`}>
			<PhotoMask {s} />
		</div>
		<div data-layer="frame.photo-rail" style={`position:absolute; left:14cqw; right:4cqw; top:85cqw; height:1.2cqw; background:var(--stamp, ${s.k.accent});`}></div>

		<div data-layer="identity" style="position:absolute; left:14cqw; width:64cqw; top:88.8cqw;">
			<div use:fit={{ max: 12, min: 8, wrapMin: 5.6, lines: 2, maxH: 11.4 }} data-rt data-layer="name.full" data-fit data-max="12" data-min="8" data-wrap-min="5.6" data-lines="2" data-max-h="11.4" style="text-shadow:var(--emb, 0 0 0 transparent); width:100%; font-weight:700; font-size:12cqw; line-height:0.88; letter-spacing:0.01em; text-transform:uppercase; white-space:nowrap; text-wrap:balance;">{s.full}</div>
			<div use:fit={{ max: 4.2, min: 3.3 }} data-rt data-layer="team.name" data-fit data-max="4.2" data-min="3.3" style="margin-top:1.3cqw; width:100%; font-weight:600; font-size:4.2cqw; line-height:1; letter-spacing:0.12em; text-transform:uppercase; white-space:nowrap;">{s.team}</div>
		</div>
		<div data-layer="logo.slot" style="position:absolute; right:4cqw; top:88.8cqw; width:14cqw; height:14cqw;">
			<LogoSlot {s} markStyle="left:0; top:0; width:100%; height:100%;" fallbackStyle={`background:${s.k.field}; color:${s.k.onField};`} />
		</div>

		<div data-layer="stats" style={`position:absolute; left:14cqw; right:4cqw; top:108.4cqw; display:grid; grid-template-columns:38fr 36fr 26fr; border-top:0.35cqw solid ${s.k.fieldOnStock}; border-bottom:0.35cqw solid ${s.k.fieldOnStock};`}>
			<div data-layer="stat.primary" style={`display:flex; flex-direction:column; justify-content:flex-end; gap:0.8cqw; padding:1.8cqw 2.4cqw 2cqw; background:${s.k.field}; color:${s.k.onField};`}>
				<div data-rt data-layer="stat.primary.label" style="font-weight:600; font-size:3.2cqw; line-height:1; letter-spacing:0.08em; text-transform:uppercase;">{s.st1.l}</div>
				<div use:fit={{ auto: true }} data-rt data-fit="auto" data-layer="stat.primary.value" style="font-weight:600; font-size:12.5cqw; line-height:0.84; font-variant-numeric:tabular-nums; white-space:nowrap;">{s.st1.v}</div>
			</div>
			<div data-layer="stat.secondary" style={`display:flex; flex-direction:column; justify-content:flex-end; gap:0.8cqw; padding:1.8cqw 2.4cqw 2cqw; border-right:0.35cqw solid ${s.k.fieldOnStock};`}>
				<div data-rt data-layer="stat.secondary.label" style="font-weight:600; font-size:3.2cqw; line-height:1; letter-spacing:0.08em; text-transform:uppercase;">{s.st2.l}</div>
				<div use:fit={{ auto: true }} data-rt data-fit="auto" data-layer="stat.secondary.value" style="font-weight:600; font-size:11cqw; line-height:0.84; font-variant-numeric:tabular-nums; white-space:nowrap;">{s.st2.v}</div>
			</div>
			<div data-layer="stat.tertiary" style="display:flex; flex-direction:column; justify-content:flex-end; gap:0.8cqw; padding:1.8cqw 2.4cqw 2cqw;">
				<div data-rt data-layer="stat.tertiary.label" style="font-weight:600; font-size:3.2cqw; line-height:1; letter-spacing:0.08em; text-transform:uppercase;">{s.st3.l}</div>
				<div use:fit={{ auto: true }} data-rt data-fit="auto" data-layer="stat.tertiary.value" style="font-weight:600; font-size:11cqw; line-height:0.84; font-variant-numeric:tabular-nums; white-space:nowrap;">{s.st3.v}</div>
			</div>
		</div>

		<div data-rt data-layer="photo.caption" style={`position:absolute; left:14cqw; bottom:4cqw; font-weight:600; font-size:3cqw; line-height:1; letter-spacing:0.07em; text-transform:uppercase; white-space:nowrap; color:${s.k.ink};`}>{s.caption}</div>
	</div>
</div>
