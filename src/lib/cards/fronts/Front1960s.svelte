<script lang="ts">
	import { fit } from '../fit.ts';
	import type { CardViewModel } from '../view-model.ts';
	import PhotoMask from '../parts/PhotoMask.svelte';
	import LogoSlot from '../parts/LogoSlot.svelte';

	let { s }: { s: CardViewModel } = $props();
</script>

<div data-card="1960s" data-art={s.fin.tier} use:fit style="container-type:inline-size; contain:layout style; position:relative; width:100%; aspect-ratio:5/7;">
	<div data-layer="frame.field" style={`position:absolute; inset:0; overflow:hidden; border-radius:1.8cqw; background:${s.k.field}; color:${s.k.onField}; font-family:'Barlow Condensed', sans-serif; display:flex; flex-direction:column; padding:6cqw 6cqw 4.6cqw; box-sizing:border-box;`}>
		<div data-layer="identity" style="flex:none;">
			<div use:fit={{ max: 15.5, min: 10.5, wrapMin: 8.5, lines: 2, maxH: 20 }} data-rt data-layer="name.full" data-fit data-max="15.5" data-min="10.5" data-wrap-min="8.5" data-lines="2" data-max-h="20" style="text-shadow:var(--emb, 0 0 0 transparent); width:100%; font-weight:800; font-size:15.5cqw; line-height:.86; letter-spacing:.005em; text-transform:uppercase; white-space:nowrap; text-wrap:balance;">{s.full}</div>
			<div use:fit={{ max: 4.8, min: 3.4 }} data-rt data-layer="team.name" data-fit data-max="4.8" data-min="3.4" style="margin-top:1.8cqw; width:100%; font-weight:700; font-size:4.8cqw; line-height:1; letter-spacing:.1em; text-transform:uppercase; white-space:nowrap;">{s.team}</div>
		</div>

		<div data-layer="photo.area" style="flex:1 1 auto; min-height:0; margin-top:3.8cqw; position:relative;">
			{#if s.fin.gem}
				<div data-layer="material.gem-ring" style="position:absolute; inset:-1.3cqw; border-radius:3.9cqw; background:conic-gradient(from var(--ang, 200deg), #ff6fc1, #ffe27a, #8dffb0, #6fd6ff, #b48cff, #ff6fc1);"></div>
			{/if}
			{#if s.fin.emboss}
				<div data-layer="material.photo-bevel" style="position:absolute; inset:0; border-radius:2.6cqw; box-shadow:calc(var(--lx, -.45) * -.8cqw) calc(var(--ly, -.75) * -.8cqw) 1cqw rgba(0,0,0,.45), calc(var(--lx, -.45) * .5cqw) calc(var(--ly, -.75) * .5cqw) .6cqw rgba(255,255,255,.6);"></div>
			{/if}
			<div data-layer="photo.mask" style={`position:absolute; inset:0; border-radius:2.6cqw; overflow:hidden; background:${s.k.accent};`}>
				<PhotoMask {s} />
			</div>
			<div data-rt data-layer="season.pill" style={`position:absolute; left:2.6cqw; top:2.6cqw; padding:1cqw 2.6cqw; border-radius:99cqw; background:${s.k.accent}; color:${s.k.onAccent}; display:flex; align-items:center; gap:1.4cqw; font-weight:800; font-size:4.8cqw; line-height:1;`}>
				<span data-layer="season.year">{s.year}</span>
				<span aria-hidden="true" style={`width:.9cqw; height:.9cqw; border-radius:50%; background:${s.k.onAccent};`}></span>
				<span data-layer="season.position">{s.pos}</span>
			</div>
			<div data-layer="logo.disc" style={`position:absolute; right:2.6cqw; bottom:2.6cqw; width:19cqw; height:19cqw; border-radius:50%; background:var(--stamp, ${s.k.paper}); box-shadow:0 0 0 1.1cqw ${s.k.field};`}>
				<LogoSlot {s} markStyle="left:2.6cqw; top:2.6cqw; width:13.8cqw; height:13.8cqw;" fallbackStyle={`font-size:6.4cqw; color:${s.k.fieldOnPaper};`} />
			</div>
		</div>

		<div data-layer="stats" style="flex:none; margin-top:4.4cqw; display:grid; grid-template-columns:auto auto auto; justify-content:space-between; align-items:end;">
			<div data-layer="stat.primary" style="display:flex; flex-direction:column; gap:.9cqw;">
				<div data-rt data-layer="stat.primary.label" style="font-weight:700; font-size:3.4cqw; line-height:1; letter-spacing:.06em; text-transform:uppercase;">{s.st1.l}</div>
				<div data-rt data-layer="stat.primary.value" style="font-weight:800; font-size:18.5cqw; line-height:.8; font-variant-numeric:tabular-nums;">{s.st1.v}</div>
			</div>
			<div data-layer="stat.secondary" style="display:flex; flex-direction:column; gap:.9cqw; padding-left:2cqw;">
				<div data-rt data-layer="stat.secondary.label" style="font-weight:700; font-size:3.4cqw; line-height:1; letter-spacing:.06em; text-transform:uppercase;">{s.st2.l}</div>
				<div data-rt data-layer="stat.secondary.value" style="font-weight:800; font-size:12.2cqw; line-height:.8; font-variant-numeric:tabular-nums;">{s.st2.v}</div>
			</div>
			<div data-layer="stat.tertiary" style="display:flex; flex-direction:column; gap:.9cqw; padding-left:2cqw;">
				<div data-rt data-layer="stat.tertiary.label" style="font-weight:700; font-size:3.4cqw; line-height:1; letter-spacing:.06em; text-transform:uppercase;">{s.st3.l}</div>
				<div data-rt data-layer="stat.tertiary.value" style="font-weight:800; font-size:12.2cqw; line-height:.8; font-variant-numeric:tabular-nums;">{s.st3.v}</div>
			</div>
		</div>

		<div data-layer="footer" style={`flex:none; margin-top:2.8cqw; padding-top:1.8cqw; border-top:.5cqw solid ${s.k.onField}; display:flex; justify-content:space-between; align-items:baseline; gap:2cqw;`}>
			<div data-rt data-layer="photo.caption" style="font-weight:600; font-size:3cqw; line-height:1; letter-spacing:.07em; text-transform:uppercase; white-space:nowrap;">{s.caption}</div>
			<div data-layer="brand" style="font-weight:800; font-style:italic; font-size:3.6cqw; line-height:1;">162-0</div>
		</div>
	</div>
</div>
