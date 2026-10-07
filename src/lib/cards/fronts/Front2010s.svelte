<script lang="ts">
	import { fit } from '../fit.ts';
	import LogoSlot from '../parts/LogoSlot.svelte';
	import PhotoMask from '../parts/PhotoMask.svelte';
	import type { CardViewModel } from '../view-model.ts';

	let { s }: { s: CardViewModel } = $props();
</script>

<div use:fit data-card="2010s" data-art={s.fin.tier} style="container-type:inline-size; contain:layout style; position:relative; width:100%; aspect-ratio:5/7;">
	<div data-layer="frame.field" style={`position:absolute; inset:0; overflow:hidden; border-radius:1.8cqw; background:${s.k.field}; color:${s.k.onField}; font-family:'Barlow Condensed', sans-serif;`}>
		{#if s.fin.gem}
			<div data-layer="material.gem-ring" style="position:absolute; left:0; right:0; top:0; height:101.8cqw; border-radius:0; background:conic-gradient(from var(--ang, 200deg), #ff6fc1, #ffe27a, #8dffb0, #6fd6ff, #b48cff, #ff6fc1);"></div>
		{/if}
		{#if s.fin.emboss}
			<div data-layer="material.photo-bevel" style="position:absolute; left:0; right:0; top:0; height:100cqw; border-radius:0; box-shadow:calc(var(--lx, -0.45) * -0.8cqw) calc(var(--ly, -0.75) * -0.8cqw) 1cqw rgba(0,0,0,0.45), calc(var(--lx, -0.45) * 0.5cqw) calc(var(--ly, -0.75) * 0.5cqw) 0.6cqw rgba(255,255,255,0.6);"></div>
		{/if}
		<div data-layer="photo.mask" style={`position:absolute; left:0; right:0; top:0; height:100cqw; overflow:hidden; background:${s.k.accent};`}>
			<PhotoMask {s} />
		</div>

		<div data-rt data-layer="season.chip" style={`position:absolute; top:4.4cqw; left:4.4cqw; padding:1.1cqw 2.4cqw; background:${s.k.field}; color:${s.k.onField}; display:flex; align-items:center; gap:1.4cqw; font-weight:800; font-size:5cqw; line-height:1;`}>
			<span data-layer="season.year">{s.year}</span>
			<span aria-hidden="true" style={`width:0.45cqw; height:3.8cqw; background:${s.k.onField};`}></span>
			<span data-layer="season.position">{s.pos}</span>
		</div>
		<div data-layer="logo.disc" style={`position:absolute; top:4.4cqw; right:4.4cqw; width:16cqw; height:16cqw; border-radius:50%; background:var(--stamp, ${s.k.paper});`}>
			<LogoSlot {s} markStyle="left:2.2cqw; top:2.2cqw; width:11.6cqw; height:11.6cqw;" fallbackStyle={`font-size:5.2cqw; color:${s.k.fieldOnPaper};`} />
		</div>

		<div data-layer="identity.tab" style={`position:absolute; left:0; bottom:40cqw; min-width:52cqw; max-width:90cqw; box-sizing:border-box; padding:3cqw 7cqw 1.6cqw 5cqw; background:${s.k.field}; clip-path:polygon(0 0, calc(100% - 4.4cqw) 0, 100% 4.4cqw, 100% 100%, 0 100%);`}>
			<div data-rt data-layer="name.full" data-fit data-max="13" data-min="8.5" data-wrap-min="6" data-lines="2" data-max-h="12.5" style="text-shadow:var(--emb, 0 0 0 transparent); max-width:78cqw; font-weight:800; font-size:13cqw; line-height:0.86; text-transform:uppercase; white-space:nowrap; text-wrap:balance;">{s.full}</div>
			<div data-rt data-layer="team.name" data-fit data-max="4.2" data-min="3.2" style="margin-top:1.3cqw; max-width:78cqw; font-weight:700; font-size:4.2cqw; line-height:1; letter-spacing:0.08em; text-transform:uppercase; white-space:nowrap;">{s.team}</div>
		</div>

		<div data-layer="stats" style="position:absolute; left:5cqw; right:5cqw; top:104.6cqw; display:grid; grid-template-columns:auto auto auto; justify-content:space-between; align-items:end;">
			<div data-layer="stat.primary" style="display:flex; flex-direction:column; gap:0.9cqw;">
				<div data-rt data-layer="stat.primary.label" style="font-weight:700; font-size:3.3cqw; line-height:1; letter-spacing:0.06em; text-transform:uppercase;">{s.st1.l}</div>
				<div data-rt data-layer="stat.primary.value" style="font-weight:800; font-size:18cqw; line-height:0.8; font-variant-numeric:tabular-nums;">{s.st1.v}</div>
			</div>
			<div data-layer="stat.secondary" style={`display:flex; flex-direction:column; gap:0.9cqw; padding-left:3cqw; border-left:0.5cqw solid ${s.k.echo}; min-height:15cqw; justify-content:flex-end;`}>
				<div data-rt data-layer="stat.secondary.label" style="font-weight:700; font-size:3.3cqw; line-height:1; letter-spacing:0.06em; text-transform:uppercase;">{s.st2.l}</div>
				<div data-rt data-layer="stat.secondary.value" style="font-weight:800; font-size:12cqw; line-height:0.8; font-variant-numeric:tabular-nums;">{s.st2.v}</div>
			</div>
			<div data-layer="stat.tertiary" style={`display:flex; flex-direction:column; gap:0.9cqw; padding-left:3cqw; border-left:0.5cqw solid ${s.k.echo}; min-height:15cqw; justify-content:flex-end;`}>
				<div data-rt data-layer="stat.tertiary.label" style="font-weight:700; font-size:3.3cqw; line-height:1; letter-spacing:0.06em; text-transform:uppercase;">{s.st3.l}</div>
				<div data-rt data-layer="stat.tertiary.value" style="font-weight:800; font-size:12cqw; line-height:0.8; font-variant-numeric:tabular-nums;">{s.st3.v}</div>
			</div>
		</div>

		<div data-layer="footer" style="position:absolute; left:5cqw; right:5cqw; bottom:3.6cqw; display:flex; justify-content:space-between; align-items:baseline; gap:2cqw;">
			<div data-rt data-layer="photo.caption" style="font-weight:600; font-size:3cqw; line-height:1; letter-spacing:0.07em; text-transform:uppercase; white-space:nowrap;">{s.caption}</div>
			<div data-layer="brand" style="font-weight:800; font-style:italic; font-size:3.6cqw; line-height:1;">162-0</div>
		</div>
	</div>
</div>
