<script lang="ts">
	import { fit } from '../fit.ts';
	import LogoSlot from '../parts/LogoSlot.svelte';
	import PhotoMask from '../parts/PhotoMask.svelte';
	import type { CardViewModel } from '../view-model.ts';

	let { s }: { s: CardViewModel } = $props();
</script>

<div data-card="1990s" data-art={s.era} use:fit style="container-type:inline-size; contain:layout style; position:relative; width:100%; aspect-ratio:5/7;">
	<div data-layer="frame.field" style={`position:absolute; inset:0; overflow:hidden; border-radius:1.8cqw; background:${s.k.field}; color:${s.k.onField}; font-family:'Barlow Condensed', sans-serif;`}>
		{#if s.fin.gem}
			<div data-layer="material.gem-ring" style="position:absolute; left:1.9cqw; right:1.9cqw; top:28.5cqw; height:78.6cqw; border-radius:0.4cqw; background:conic-gradient(from var(--ang, 200deg), #ff6fc1, #ffe27a, #8dffb0, #6fd6ff, #b48cff, #ff6fc1);"></div>
		{/if}
		{#if s.fin.emboss}
			<div data-layer="material.photo-bevel" style="position:absolute; left:3.2cqw; right:3.2cqw; top:29.8cqw; height:76cqw; border-radius:0; box-shadow:calc(var(--lx, -0.45) * -0.8cqw) calc(var(--ly, -0.75) * -0.8cqw) 1cqw rgba(0,0,0,0.45), calc(var(--lx, -0.45) * 0.5cqw) calc(var(--ly, -0.75) * 0.5cqw) 0.6cqw rgba(255,255,255,0.6);"></div>
		{/if}
		<div data-layer="frame.photo-keyline" style={`position:absolute; left:3.2cqw; right:3.2cqw; top:29.8cqw; height:76cqw; background:var(--stamp, ${s.k.paper});`}></div>
		<div data-layer="photo.mask" style={`position:absolute; left:4.4cqw; right:4.4cqw; top:31cqw; height:73.6cqw; overflow:hidden; background:${s.k.accent};`}>
			<PhotoMask s={s} emptyStyle={`background:repeating-linear-gradient(135deg, rgba(255,255,255,.08) 0 1.1cqw, rgba(0,0,0,0) 1.1cqw 2.2cqw), ${s.k.accent};`} />
		</div>

		<div data-layer="logo.disc" style={`position:absolute; top:4.4cqw; right:4.4cqw; width:22cqw; height:22cqw; border-radius:50%; background:var(--stamp, ${s.k.paper}); box-shadow:inset 0 0 0 0.9cqw ${s.k.accent};`}>
			<LogoSlot s={s} markStyle="left:3cqw; top:3cqw; width:16cqw; height:16cqw;" fallbackStyle={`font-weight:800; font-style:italic; font-size:7.4cqw; color:${s.k.fieldOnPaper};`} />
		</div>

		<div data-layer="name.group" style="position:absolute; left:5cqw; width:66cqw; max-width:66cqw; min-width:0; bottom:112cqw; display:flex; flex-direction:column; align-items:flex-start;">
			<div data-rt data-layer="name.given.chip" style={`margin:0 0 -0.6cqw 0.8cqw; padding:0.5cqw 2.2cqw 0.4cqw 1.8cqw; background:${s.k.accent}; transform:skewX(-10deg); max-width:60cqw;`}>
				<div use:fit={{ max: 6.8, min: 5 }} data-fit data-max="6.8" data-min="5" style={`transform:skewX(10deg); font-weight:700; font-style:italic; font-size:6.8cqw; line-height:1; white-space:nowrap; color:${s.k.onAccent}; max-width:56cqw;`}>{s.given}</div>
			</div>
			<div use:fit={{ max: 19, min: 11.5, wrapMin: 7, lines: 2, maxH: 17 }} data-rt data-layer="name.family" data-fit data-max="19" data-min="11.5" data-wrap-min="7" data-lines="2" data-max-h="17" style={`width:100%; max-width:100%; padding-right:1.2cqw; box-sizing:border-box; font-weight:900; font-style:italic; font-size:19cqw; line-height:0.84; letter-spacing:-0.005em; text-transform:uppercase; white-space:nowrap; overflow-wrap:anywhere; text-wrap:balance; color:${s.k.onField}; text-shadow:0.7cqw 0.7cqw 0 ${s.k.echo}, var(--emb, 0 0 0 transparent);`}>{s.family}</div>
		</div>

		<div data-rt data-layer="season.chip" style={`position:absolute; left:3.2cqw; top:101.2cqw; height:8cqw; padding:0 2.4cqw; display:flex; align-items:center; background:var(--stamp, ${s.k.paper}); transform:skewX(-10deg); transform-origin:0 100%;`}>
			<div style={`transform:skewX(10deg); display:flex; align-items:center; gap:1.6cqw; font-weight:800; font-style:italic; font-size:5.6cqw; line-height:1; color:${s.k.fieldOnPaper};`}>
				<span data-layer="season.year">{s.year}</span>
				<span style={`width:0.5cqw; height:4.2cqw; background:${s.k.fieldOnPaper};`}></span>
				<span data-layer="season.position">{s.pos}</span>
			</div>
		</div>
		<div data-rt data-layer="team.strip" style={`position:absolute; right:3.2cqw; top:101.2cqw; height:8cqw; padding:0 2.6cqw; display:flex; align-items:center; background:${s.k.accent}; transform:skewX(-10deg); transform-origin:100% 0;`}>
			<div use:fit={{ max: 4.8, min: 3.4 }} data-layer="team.name" data-fit data-max="4.8" data-min="3.4" style={`transform:skewX(10deg); font-weight:800; font-style:italic; font-size:4.8cqw; line-height:1; letter-spacing:0.03em; text-transform:uppercase; white-space:nowrap; max-width:52cqw; color:${s.k.onAccent};`}>{s.team}</div>
		</div>

		<div data-layer="stats" style="position:absolute; left:5cqw; right:5cqw; top:113cqw; display:grid; grid-template-columns:auto auto auto; justify-content:space-between; align-items:end;">
			<div data-layer="stat.primary" style="display:flex; flex-direction:column; gap:0.9cqw;">
				<div data-rt data-layer="stat.primary.label" style="font-weight:700; font-size:3.4cqw; line-height:1; letter-spacing:0.05em; text-transform:uppercase;">{s.st1.l}</div>
				<div data-rt data-layer="stat.primary.value" style="font-weight:900; font-style:italic; font-size:17cqw; line-height:0.8; font-variant-numeric:tabular-nums; letter-spacing:-0.01em;">{s.st1.v}</div>
			</div>
			<div data-layer="stat.secondary" style={`display:flex; flex-direction:column; gap:0.9cqw; padding-left:3.2cqw; border-left:0.6cqw solid ${s.k.echo}; min-height:15cqw; justify-content:flex-end;`}>
				<div data-rt data-layer="stat.secondary.label" style="font-weight:700; font-size:3.4cqw; line-height:1; letter-spacing:0.05em; text-transform:uppercase;">{s.st2.l}</div>
				<div data-rt data-layer="stat.secondary.value" style="font-weight:800; font-style:italic; font-size:12.6cqw; line-height:0.8; font-variant-numeric:tabular-nums;">{s.st2.v}</div>
			</div>
			<div data-layer="stat.tertiary" style={`display:flex; flex-direction:column; gap:0.9cqw; padding-left:3.2cqw; border-left:0.6cqw solid ${s.k.echo}; min-height:15cqw; justify-content:flex-end;`}>
				<div data-rt data-layer="stat.tertiary.label" style="font-weight:700; font-size:3.4cqw; line-height:1; letter-spacing:0.05em; text-transform:uppercase;">{s.st3.l}</div>
				<div data-rt data-layer="stat.tertiary.value" style="font-weight:800; font-style:italic; font-size:12.6cqw; line-height:0.8; font-variant-numeric:tabular-nums;">{s.st3.v}</div>
			</div>
		</div>

		<div data-layer="footer" style="position:absolute; left:5cqw; right:5cqw; bottom:3.4cqw; display:flex; justify-content:space-between; align-items:baseline; gap:2cqw;">
			<div data-rt data-layer="photo.caption" style="font-weight:600; font-size:3cqw; line-height:1; letter-spacing:0.07em; text-transform:uppercase; white-space:nowrap;">{s.caption}</div>
			<div data-layer="brand" style="font-weight:800; font-style:italic; font-size:3.6cqw; line-height:1;">162-0</div>
		</div>
	</div>
</div>
