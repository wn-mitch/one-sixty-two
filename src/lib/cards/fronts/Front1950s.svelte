<script lang="ts">
	import { fit } from '../fit.ts';
	import LogoSlot from '../parts/LogoSlot.svelte';
	import PhotoMask from '../parts/PhotoMask.svelte';
	import type { CardViewModel } from '../view-model.ts';

	export interface Front1950sProps { s: CardViewModel }

	let { s }: Front1950sProps = $props();
</script>

<div use:fit data-card="1950s" data-art={s.fin.tier} style="container-type:inline-size; contain:layout style; position:relative; width:100%; aspect-ratio:5/7;">
	<div data-layer="frame.stock" style={`position:absolute; inset:0; overflow:hidden; border-radius:1.8cqw; background:${s.k.stock}; color:${s.k.fieldOnStock}; font-family:'Barlow Condensed', sans-serif;`}>
		<div data-layer="frame.rule" aria-hidden="true" style={`position:absolute; inset:2.2cqw; border:0.35cqw solid ${s.k.fieldOnStock}; border-radius:1cqw;`}></div>
		{#if s.fin.gem}
			<div data-layer="material.gem-ring" aria-hidden="true" style="position:absolute; left:3.7cqw; right:3.7cqw; top:3.7cqw; height:95.6cqw; border-radius:1.6cqw; background:conic-gradient(from var(--ang, 200deg), #ff6fc1, #ffe27a, #8dffb0, #6fd6ff, #b48cff, #ff6fc1);"></div>
		{/if}
		{#if s.fin.emboss}
			<div data-layer="material.photo-bevel" aria-hidden="true" style="position:absolute; left:5cqw; right:5cqw; top:5cqw; height:93cqw; border-radius:0.8cqw; box-shadow:calc(var(--lx, -0.45) * -0.8cqw) calc(var(--ly, -0.75) * -0.8cqw) 1cqw rgba(0,0,0,0.45), calc(var(--lx, -0.45) * 0.5cqw) calc(var(--ly, -0.75) * 0.5cqw) 0.6cqw rgba(255,255,255,0.6);"></div>
		{/if}
		<div data-layer="photo.mask" style={`position:absolute; left:5cqw; right:5cqw; top:5cqw; height:93cqw; overflow:hidden; border-radius:0.8cqw; background:${s.k.accent};`}>
			<PhotoMask s={s}>
				<div data-layer="frame.photo-hairline" aria-hidden="true" style="position:absolute; inset:1.4cqw; border:0.3cqw solid rgba(255,255,255,.9); border-radius:0.4cqw; pointer-events:none;"></div>
			</PhotoMask>
		</div>

		<div data-layer="season.tab" style={`position:absolute; top:5cqw; right:5cqw; padding:1.2cqw 2.2cqw 1.5cqw 2.8cqw; border-bottom-left-radius:1.8cqw; background:var(--stamp, ${s.k.stock}); display:flex; align-items:center; gap:1.4cqw; font-weight:800; font-size:5cqw; line-height:1;`}>
			<span data-rt data-layer="season.year">{s.year}</span>
			<span data-rt aria-hidden="true" style={`width:1cqw; height:1cqw; border-radius:50%; background:${s.k.fieldOnStock};`}></span>
			<span data-rt data-layer="season.position">{s.pos}</span>
		</div>

		<div data-layer="logo.medallion" style={`position:absolute; top:8.6cqw; left:8.6cqw; width:15cqw; height:15cqw; border-radius:${s.logoShape === 'square' ? '0' : '50%'}; background:var(--stamp, ${s.k.stock}); box-shadow:0 0 0 0.6cqw ${s.k.fieldOnStock};`}>
			<LogoSlot s={s} />
		</div>

		<div data-layer="nameplate.anchor" style="position:absolute; left:6cqw; right:6cqw; bottom:29cqw; display:flex; justify-content:center;">
			<div data-layer="nameplate" style={`position:relative; min-width:58cqw; max-width:88cqw; box-sizing:border-box; padding:2.7cqw 6cqw 2.9cqw; text-align:center; color:${s.k.onField};`}>
				<div data-layer="frame.plate" aria-hidden="true" style={`position:absolute; inset:0; background:${s.k.field}; clip-path:polygon(2.4cqw 0, calc(100% - 2.4cqw) 0, 100% 2.4cqw, 100% calc(100% - 2.4cqw), calc(100% - 2.4cqw) 100%, 2.4cqw 100%, 0 calc(100% - 2.4cqw), 0 2.4cqw);`}></div>
				<div data-layer="frame.plate-hairline" aria-hidden="true" style={`position:absolute; inset:0.9cqw; background:var(--stamp, ${s.k.onField}); clip-path:polygon(1.9cqw 0, calc(100% - 1.9cqw) 0, 100% 1.9cqw, 100% calc(100% - 1.9cqw), calc(100% - 1.9cqw) 100%, 1.9cqw 100%, 0 calc(100% - 1.9cqw), 0 1.9cqw);`}></div>
				<div data-layer="frame.plate-inner" aria-hidden="true" style={`position:absolute; inset:1.25cqw; background:${s.k.field}; clip-path:polygon(1.75cqw 0, calc(100% - 1.75cqw) 0, 100% 1.75cqw, 100% calc(100% - 1.75cqw), calc(100% - 1.75cqw) 100%, 1.75cqw 100%, 0 calc(100% - 1.75cqw), 0 1.75cqw);`}></div>
				<div data-rt data-layer="name.full" data-fit data-max="9.6" data-min="6.8" data-wrap-min="6" data-lines="2" data-max-h="13" style="text-shadow:var(--emb, 0 0 0 transparent); position:relative; max-width:76cqw; margin:0 auto; font-family:'Roboto Serif', serif; font-weight:700; font-style:italic; font-size:9.6cqw; line-height:1.02; letter-spacing:-0.01em; white-space:nowrap; text-wrap:balance;">{s.full}</div>
				<div style="position:relative; margin-top:1.1cqw; display:flex; align-items:center; justify-content:center; gap:1.8cqw;">
					<span aria-hidden="true" style={`flex:none; width:4cqw; height:0.3cqw; background:${s.k.onField};`}></span>
					<span data-rt data-layer="team.name" data-fit data-max="3.6" data-min="3" style="max-width:60cqw; font-weight:700; font-size:3.6cqw; line-height:1; letter-spacing:0.18em; text-transform:uppercase; white-space:nowrap;">{s.team}</span>
					<span aria-hidden="true" style={`flex:none; width:4cqw; height:0.3cqw; background:${s.k.onField};`}></span>
				</div>
			</div>
		</div>

		<div data-layer="stats" style="position:absolute; left:6cqw; right:6cqw; top:114.5cqw; display:grid; grid-template-columns:auto auto auto; justify-content:space-between; align-items:stretch;">
			<div data-layer="stat.primary" style="display:flex; flex-direction:column; justify-content:flex-end; gap:0.8cqw;">
				<div data-rt data-layer="stat.primary.label" style="font-weight:700; font-size:3.3cqw; line-height:1; letter-spacing:0.07em; text-transform:uppercase;">{s.st1.l}</div>
				<div data-rt data-layer="stat.primary.value" style="font-family:'Roboto Serif', serif; font-weight:700; font-size:13.5cqw; line-height:0.86; font-variant-numeric:tabular-nums; letter-spacing:-0.02em;">{s.st1.v}</div>
			</div>
			<div data-layer="stat.secondary" style={`display:flex; flex-direction:column; justify-content:flex-end; gap:0.8cqw; padding-left:3.4cqw; border-left:0.3cqw solid ${s.k.fieldOnStock};`}>
				<div data-rt data-layer="stat.secondary.label" style="font-weight:700; font-size:3.3cqw; line-height:1; letter-spacing:0.07em; text-transform:uppercase;">{s.st2.l}</div>
				<div data-rt data-layer="stat.secondary.value" style="font-family:'Roboto Serif', serif; font-weight:700; font-size:9.6cqw; line-height:0.86; font-variant-numeric:tabular-nums; letter-spacing:-0.02em;">{s.st2.v}</div>
			</div>
			<div data-layer="stat.tertiary" style={`display:flex; flex-direction:column; justify-content:flex-end; gap:0.8cqw; padding-left:3.4cqw; border-left:0.3cqw solid ${s.k.fieldOnStock};`}>
				<div data-rt data-layer="stat.tertiary.label" style="font-weight:700; font-size:3.3cqw; line-height:1; letter-spacing:0.07em; text-transform:uppercase;">{s.st3.l}</div>
				<div data-rt data-layer="stat.tertiary.value" style="font-family:'Roboto Serif', serif; font-weight:700; font-size:9.6cqw; line-height:0.86; font-variant-numeric:tabular-nums; letter-spacing:-0.02em;">{s.st3.v}</div>
			</div>
		</div>

		<div data-layer="footer" style="position:absolute; left:6cqw; right:6cqw; bottom:4.4cqw; display:flex; justify-content:space-between; align-items:baseline; gap:2cqw;">
			<div data-layer="brand" style="font-weight:800; font-style:italic; font-size:3.6cqw; line-height:1;">162-0</div>
			<div data-rt data-layer="photo.caption" style={`font-weight:600; font-size:3cqw; line-height:1; letter-spacing:0.07em; text-transform:uppercase; white-space:nowrap; color:${s.k.ink};`}>{s.caption}</div>
		</div>
	</div>
</div>
