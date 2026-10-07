<script lang="ts">
	import { fit } from '../fit.ts';
	import LogoSlot from '../parts/LogoSlot.svelte';
	import PhotoMask from '../parts/PhotoMask.svelte';
	import type { CardViewModel } from '../view-model.ts';

	let { s }: { s: CardViewModel } = $props();
</script>

<div data-card="1980s" data-art={s.fin.tier} style="container-type:inline-size; contain:layout style; position:relative; width:100%; height:100%;" use:fit>
	<div data-layer="frame.pinstripe" style={`position:absolute; inset:0; overflow:hidden; border-radius:1.8cqw; background:repeating-linear-gradient(90deg, ${s.k.stripe} 0 0.28cqw, rgba(0,0,0,0) 0.28cqw 3.3cqw), ${s.k.stock}; color:${s.k.fieldOnStock}; font-family:'Barlow Condensed', sans-serif;`}>
		{#if s.fin.gem}
			<div data-layer="material.gem-ring" style="position:absolute; left:4cqw; right:4cqw; top:4cqw; height:90cqw; border-radius:.4cqw; background:conic-gradient(from var(--ang, 200deg), #ff6fc1, #ffe27a, #8dffb0, #6fd6ff, #b48cff, #ff6fc1);"></div>
		{/if}
		{#if s.fin.emboss}
			<div data-layer="material.photo-bevel" style="position:absolute; left:5.3cqw; right:5.3cqw; top:5.3cqw; height:87.4cqw; border-radius:0; box-shadow:calc(var(--lx, -.45) * -.8cqw) calc(var(--ly, -.75) * -.8cqw) 1cqw rgba(0,0,0,.45), calc(var(--lx, -.45) * .5cqw) calc(var(--ly, -.75) * .5cqw) .6cqw rgba(255,255,255,.6);"></div>
		{/if}
		<div data-layer="photo.mask" style={`position:absolute; left:6cqw; right:6cqw; top:6cqw; height:86cqw; overflow:hidden; background:${s.k.accent}; box-shadow:0 0 0 .7cqw ${s.k.fieldOnStock};`}>
			<PhotoMask {s} focus="50% 22%" />
		</div>

		<div data-layer="logo.disc" style={`position:absolute; top:2.4cqw; left:2.4cqw; width:15.5cqw; height:15.5cqw; border-radius:50%; background:var(--stamp, ${s.k.paper}); box-shadow:0 0 0 .7cqw ${s.k.fieldOnStock};`}>
			<LogoSlot {s} markStyle="left:2.2cqw; top:2.2cqw; width:11.1cqw; height:11.1cqw;" fallbackStyle={`color:${s.k.fieldOnPaper};`} />
		</div>
		<div data-rt data-layer="season.chip" style={`position:absolute; top:6cqw; right:6cqw; padding:1.1cqw 2.4cqw; background:${s.k.field}; color:${s.k.onField}; display:flex; align-items:center; gap:1.4cqw; font-weight:800; font-style:italic; font-size:5cqw; line-height:1;`}>
			<span data-layer="season.year">{s.year}</span>
			<span aria-hidden="true" style={`width:.45cqw; height:3.8cqw; background:${s.k.onField}; transform:skewX(-10deg);`}></span>
			<span data-layer="season.position">{s.pos}</span>
		</div>

		<div data-layer="identity.band" style="position:absolute; left:-4cqw; top:89.5cqw; width:108cqw; transform:rotate(-6deg); transform-origin:0 0;">
			<div data-layer="name.band" style={`padding:2.2cqw 10cqw 1.6cqw; background:repeating-linear-gradient(90deg, ${s.k.stripeOnField} 0 .28cqw, rgba(0,0,0,0) .28cqw 3.3cqw), ${s.k.field}; color:${s.k.onField};`}>
				<div use:fit data-rt data-layer="name.full" data-fit data-max="12.5" data-min="8.5" data-wrap-min="6.5" data-lines="2" data-max-h="12.5" style="text-shadow:var(--emb, 0 0 0 transparent); width:86cqw; font-weight:800; font-style:italic; font-size:12.5cqw; line-height:.88; text-transform:uppercase; white-space:nowrap; text-wrap:balance;">{s.full}</div>
			</div>
			<div data-layer="team.band" style={`padding:1.1cqw 10cqw; background:${s.k.accent}; color:${s.k.onAccent};`}>
				<div use:fit data-rt data-layer="team.name" data-fit data-max="4.4" data-min="3.4" style="width:70cqw; font-weight:700; font-style:italic; font-size:4.4cqw; line-height:1; letter-spacing:.08em; text-transform:uppercase; white-space:nowrap;">{s.team}</div>
			</div>
		</div>

		<div data-layer="stats.panel" style={`position:absolute; left:6cqw; right:6cqw; top:114.5cqw; bottom:3.4cqw; background:${s.k.stock}; border-top:.8cqw solid ${s.k.fieldOnStock}; padding:1cqw 2.4cqw 6.4cqw; box-sizing:border-box; display:grid; grid-template-columns:auto auto auto; justify-content:space-between; align-items:end;`}>
			<div data-layer="stat.primary" style="display:flex; flex-direction:column; gap:.8cqw;">
				<div data-rt data-layer="stat.primary.label" style="font-weight:700; font-size:3.2cqw; line-height:1; letter-spacing:.06em; text-transform:uppercase;">{s.st1.l}</div>
				<div data-rt data-layer="stat.primary.value" style="font-weight:800; font-style:italic; font-size:12cqw; line-height:.82; font-variant-numeric:tabular-nums;">{s.st1.v}</div>
			</div>
			<div data-layer="stat.secondary" style={`display:flex; flex-direction:column; gap:.8cqw; padding-left:2.6cqw; border-left:.35cqw solid ${s.k.fieldOnStock};`}>
				<div data-rt data-layer="stat.secondary.label" style="font-weight:700; font-size:3.2cqw; line-height:1; letter-spacing:.06em; text-transform:uppercase;">{s.st2.l}</div>
				<div data-rt data-layer="stat.secondary.value" style="font-weight:800; font-style:italic; font-size:10cqw; line-height:.82; font-variant-numeric:tabular-nums;">{s.st2.v}</div>
			</div>
			<div data-layer="stat.tertiary" style={`display:flex; flex-direction:column; gap:.8cqw; padding-left:2.6cqw; border-left:.35cqw solid ${s.k.fieldOnStock};`}>
				<div data-rt data-layer="stat.tertiary.label" style="font-weight:700; font-size:3.2cqw; line-height:1; letter-spacing:.06em; text-transform:uppercase;">{s.st3.l}</div>
				<div data-rt data-layer="stat.tertiary.value" style="font-weight:800; font-style:italic; font-size:10cqw; line-height:.82; font-variant-numeric:tabular-nums;">{s.st3.v}</div>
			</div>
		</div>

		<div data-layer="footer" style="position:absolute; left:6cqw; right:6cqw; bottom:3.4cqw; padding:1cqw 2.4cqw; display:flex; justify-content:space-between; align-items:baseline; gap:2cqw;">
			<div data-rt data-layer="photo.caption" style={`font-weight:600; font-size:3cqw; line-height:1; letter-spacing:.07em; text-transform:uppercase; white-space:nowrap; color:${s.k.ink};`}>{s.caption}</div>
			<div data-layer="brand" style="font-weight:800; font-style:italic; font-size:3.6cqw; line-height:1;">162-0</div>
		</div>
	</div>
</div>
