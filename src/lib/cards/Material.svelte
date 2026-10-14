<script lang="ts">
	import type { CardViewModel } from './view-model.ts';

	export interface MaterialProps {
		s: CardViewModel;
		layer: 'under' | 'over';
		/**
		 * Paints the finish in CSS. Off on a card lit by the WebGL canvas: the shader draws every metal,
		 * holo, bevel and glint, so only the tagged shapes stay, unpainted, for the surface map to read.
		 */
		paint?: boolean;
	}

	let { s, layer, paint = true }: MaterialProps = $props();
	const MASK = '-webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite:xor; mask:linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);';
	const GOLD_FOIL = 'linear-gradient(115deg, #9a6c22 0%, #f7df9a 15%, #c4953a 29%, #fff3c8 43%, #b5832d 57%, #f2d58a 73%, #8f6420 100%)';
	/** A tagged shape's CSS paint, or nothing when the light canvas prints it. */
	const fill = (css: string) => paint ? css : '';
	const silver = $derived(s.fin.foil && !s.fin.emboss);
	const gold = $derived(s.fin.emboss && !s.fin.gem);
	const gem = $derived(s.fin.gem);
</script>

{#if layer === 'under'}
	<div class="material-root" data-layer="material.under" style="container-type:inline-size; position:absolute; inset:0; pointer-events:none; ">
		<div data-layer="material.shadow" style="position:absolute; inset:-4%; transform:translate(calc(var(--lx) * -5cqw), calc(var(--ly) * -6cqw)); background:radial-gradient(ellipse 50% 50% at 50% 50%, rgba(0,0,0,0.55) 0, rgba(0,0,0,0.3) 55%, rgba(0,0,0,0) 72%); opacity:calc((0.45 + var(--lift) * 0.45) * var(--depth, 1));"></div>
		<div data-layer="material.slab" style="position:absolute; inset:0; border-radius:1.8cqw; background:#d4cfc4; opacity:var(--depth, 1);"></div>
		<div data-layer="material.slab" style="position:absolute; inset:0; border-radius:1.8cqw; background:#f2efe8; opacity:var(--depth, 1);"></div>
		<div data-layer="material.slab" style="position:absolute; inset:0; border-radius:1.8cqw; background:#d4cfc4; opacity:var(--depth, 1);"></div>
		<div data-layer="material.slab" style="position:absolute; inset:0; border-radius:1.8cqw; background:#a9a397; opacity:var(--depth, 1);"></div>
	</div>
{:else}
	<div class="material-root" data-layer="material" data-finish={s.fin.tier} style="container-type:inline-size; position:absolute; inset:0; pointer-events:none; border-radius:1.8cqw; --k:calc(var(--finish-ring, 1) * var(--rim-era, 1));">
		{#if paint}
			<div data-layer="material.face-bevel" style="position:absolute; inset:0; border-radius:1.8cqw; box-shadow:inset calc(var(--lx) * -0.5cqw) calc(var(--ly) * -0.5cqw) 0.4cqw -0.1cqw rgba(255,255,255,0.35), inset calc(var(--lx) * 0.5cqw) calc(var(--ly) * 0.5cqw) 0.5cqw -0.1cqw rgba(0,0,0,0.35);"></div>
		{/if}
		{#if silver}
			<div data-layer="material.silver-ring" data-surface="ring" data-surface-shape="frame" style={`position:absolute; inset:0 0 0 var(--rim-left, 0); box-sizing:border-box; padding:calc(var(--k) * 2cqw); border-radius:var(--rim-left-radius, 1.8cqw) 1.8cqw 1.8cqw var(--rim-left-radius, 1.8cqw); ${fill(`background:var(--holo-silver, linear-gradient(115deg, #8f99a4 0%, #f4f6f8 16%, #aeb7c0 30%, #ffffff 44%, #a3adb7 58%, #e9edf1 74%, #8a949f 100%) var(--mx) var(--my) / 300% 300%); ${MASK}`)}`}></div>
			{#if paint}
				<div data-layer="material.silver-brush" style={`position:absolute; inset:0 0 0 var(--rim-left, 0); box-sizing:border-box; padding:calc(var(--k) * 2cqw); border-radius:var(--rim-left-radius, 1.8cqw) 1.8cqw 1.8cqw var(--rim-left-radius, 1.8cqw); background:repeating-linear-gradient(0deg, rgba(255,255,255,0.35) 0 0.12cqw, rgba(0,0,0,0.12) 0.12cqw 0.3cqw, rgba(0,0,0,0) 0.3cqw 0.5cqw); ${MASK}`}></div>
			{/if}
			<!-- A keyline inside the foil ring. Lit, it is only a pressed line in the surface map, beneath bands printed across the edge. -->
			<div data-layer="material.silver-keyline" data-surface="frame" data-surface-shape="frame" style={`position:absolute; inset:calc(var(--k) * 2cqw - 0.3cqw) calc(var(--k) * 2cqw - 0.3cqw) calc(var(--k) * 2cqw - 0.3cqw) calc(var(--rim-left, 0px) + var(--k) * 2cqw - 0.3cqw); box-sizing:border-box; border:0.3cqw solid ${paint ? '#ffffff' : 'transparent'}; border-radius:0.9cqw; ${fill('box-shadow:0 0 1.2cqw rgba(255,255,255,0.35);')}`}></div>
			{#if paint}
				<div data-layer="material.silver-sheen" style="position:absolute; inset:0; background:linear-gradient(115deg, rgba(255,255,255,0) 38%, rgba(255,255,255,0.75) 48%, rgba(255,255,255,0) 58%) var(--mx) 0 / 260% 100% no-repeat; opacity:calc(var(--lift) * 0.4 * var(--k)); "></div>
			{/if}
		{/if}
		{#if gold}
			<div data-layer="material.gold-ring" data-surface="ring" data-surface-shape="frame" style={`position:absolute; inset:0 0 0 var(--rim-left, 0); box-sizing:border-box; padding:calc(var(--k) * 2cqw); border-radius:var(--rim-left-radius, 1.8cqw) 1.8cqw 1.8cqw var(--rim-left-radius, 1.8cqw); ${fill(`background:${GOLD_FOIL} var(--mx) var(--my) / 300% 300%; ${MASK}`)}`}></div>
			{#if paint}
				<div data-layer="material.gold-hatch" style={`position:absolute; inset:0 0 0 var(--rim-left, 0); box-sizing:border-box; padding:calc(var(--k) * 2cqw); border-radius:var(--rim-left-radius, 1.8cqw) 1.8cqw 1.8cqw var(--rim-left-radius, 1.8cqw); background:repeating-linear-gradient(45deg, rgba(80,50,10,0.28) 0 0.25cqw, rgba(0,0,0,0) 0.25cqw 0.75cqw), repeating-linear-gradient(-45deg, rgba(255,250,220,0.3) 0 0.25cqw, rgba(0,0,0,0) 0.25cqw 0.75cqw); ${MASK}`}></div>
				<div data-layer="material.gold-ridges" style={`position:absolute; inset:0 0 0 var(--rim-left, 0); box-sizing:border-box; padding:calc(var(--k) * 2cqw); border-radius:var(--rim-left-radius, 1.8cqw) 1.8cqw 1.8cqw var(--rim-left-radius, 1.8cqw); background:repeating-linear-gradient(90deg, rgba(255,250,225,0.55) 0 0.3cqw, rgba(70,40,0,0.35) 0.3cqw 0.65cqw, rgba(0,0,0,0) 0.65cqw 1.3cqw) calc(var(--lx) * 3cqw) 0 / auto, repeating-linear-gradient(0deg, rgba(255,250,225,0.55) 0 0.3cqw, rgba(70,40,0,0.35) 0.3cqw 0.65cqw, rgba(0,0,0,0) 0.65cqw 1.3cqw) 0 calc(var(--ly) * 3cqw) / auto; ${MASK}`}></div>
				<div data-layer="material.gold-bevel-out" style="position:absolute; inset:0; border-radius:1.8cqw; box-shadow:inset calc(var(--lx) * -0.7cqw) calc(var(--ly) * -0.7cqw) 0.5cqw -0.1cqw rgba(255,248,220,0.8), inset calc(var(--lx) * 0.7cqw) calc(var(--ly) * 0.7cqw) 0.5cqw -0.1cqw rgba(60,35,0,0.55); "></div>
			{/if}
			<div data-layer="material.gold-bevel-in" data-surface="frame" data-surface-shape="frame" style={`position:absolute; inset:calc(var(--k) * 2cqw - 0.3cqw) calc(var(--k) * 2cqw - 0.3cqw) calc(var(--k) * 2cqw - 0.3cqw) calc(var(--rim-left, 0px) + var(--k) * 2cqw - 0.3cqw); box-sizing:border-box; border:0.3cqw solid ${paint ? '#7a5216' : 'transparent'}; border-radius:0.9cqw; ${fill('box-shadow:calc(var(--lx) * 0.5cqw) calc(var(--ly) * 0.5cqw) 0.5cqw rgba(0,0,0,0.45);')}`}></div>
			{#if paint}
				<div data-layer="material.gold-sheen" style="position:absolute; inset:0; background:linear-gradient(115deg, rgba(255,230,150,0) 36%, rgba(255,236,170,0.7) 48%, rgba(255,230,150,0) 60%) var(--mx) 0 / 260% 100% no-repeat; opacity:calc(var(--lift) * 0.45 * var(--k)); "></div>
			{/if}
		{/if}
		{#if gem}
			{#if paint}
				<div data-layer="material.prism-wash" style="position:absolute; inset:0; border-radius:1.8cqw; background:linear-gradient(125deg, #ff5fb7 0%, #ffd34f 18%, #6dffa8 36%, #4fd2ff 54%, #a57bff 72%, #ff5fb7 90%) var(--mx) var(--my) / 260% 260%; opacity:calc((0.13 + var(--lift) * 0.08) * var(--k)); "></div>
			{/if}
			<div data-layer="material.prism-ring" data-surface="ring" data-surface-shape="frame" style={`position:absolute; inset:0 0 0 var(--rim-left, 0); box-sizing:border-box; padding:calc(var(--k) * 2cqw); border-radius:var(--rim-left-radius, 1.8cqw) 1.8cqw 1.8cqw var(--rim-left-radius, 1.8cqw); ${fill(`background:conic-gradient(from var(--ang), #ff3fa4, #ffb800, #ffee55, #3dff8a, #22c8ff, #7a5cff, #ff3fa4); ${MASK}`)}`}></div>
			{#if paint}
				<div data-layer="material.prism-facets" style={`position:absolute; inset:0 0 0 var(--rim-left, 0); box-sizing:border-box; padding:calc(var(--k) * 2cqw); border-radius:var(--rim-left-radius, 1.8cqw) 1.8cqw 1.8cqw var(--rim-left-radius, 1.8cqw); background:repeating-linear-gradient(60deg, rgba(255,255,255,0.45) 0 0.35cqw, rgba(255,255,255,0) 0.35cqw 2.2cqw), repeating-linear-gradient(-60deg, rgba(255,255,255,0.3) 0 0.35cqw, rgba(255,255,255,0) 0.35cqw 2.2cqw); ${MASK}`}></div>
				<div data-layer="material.gem-lenticular" style={`position:absolute; inset:0 0 0 var(--rim-left, 0); box-sizing:border-box; padding:calc(var(--k) * 2cqw); border-radius:var(--rim-left-radius, 1.8cqw) 1.8cqw 1.8cqw var(--rim-left-radius, 1.8cqw); background:repeating-linear-gradient(90deg, rgba(255,255,255,0.55) 0 0.22cqw, rgba(0,0,0,0.22) 0.22cqw 0.5cqw, rgba(255,255,255,0) 0.5cqw 0.9cqw) calc(var(--mx) * 0.2) 0 / auto; ${MASK}`}></div>
				<div data-layer="material.gem-bevel" style="position:absolute; inset:0; border-radius:1.8cqw; box-shadow:inset calc(var(--lx) * -0.7cqw) calc(var(--ly) * -0.7cqw) 0.5cqw -0.1cqw rgba(255,255,255,0.7), inset calc(var(--lx) * 0.7cqw) calc(var(--ly) * 0.7cqw) 0.5cqw -0.1cqw rgba(0,0,0,0.45); "></div>
				<div data-layer="material.gem-spark" style="position:absolute; left:6%; top:4%; width:14cqw; height:14cqw; transform:translate(-50%, -50%) rotate(0deg); background:radial-gradient(circle, #fff 0 6%, rgba(255,255,255,0.55) 12%, rgba(255,255,255,0) 30%), linear-gradient(90deg, rgba(255,255,255,0), #fff 50%, rgba(255,255,255,0)) center / 100% 0.4cqw no-repeat, linear-gradient(0deg, rgba(255,255,255,0), #fff 50%, rgba(255,255,255,0)) center / 0.4cqw 100% no-repeat; opacity:calc(0.35 + var(--g1) * 0.65);"></div>
				<div data-layer="material.gem-spark" style="position:absolute; left:95%; top:30%; width:10cqw; height:10cqw; transform:translate(-50%, -50%) rotate(45deg); background:radial-gradient(circle, #fff 0 6%, rgba(255,255,255,0.55) 12%, rgba(255,255,255,0) 30%), linear-gradient(90deg, rgba(255,255,255,0), #fff 50%, rgba(255,255,255,0)) center / 100% 0.4cqw no-repeat, linear-gradient(0deg, rgba(255,255,255,0), #fff 50%, rgba(255,255,255,0)) center / 0.4cqw 100% no-repeat; opacity:calc(0.35 + var(--g3) * 0.65);"></div>
				<div data-layer="material.gem-spark" style="position:absolute; left:4%; top:63%; width:9cqw; height:9cqw; transform:translate(-50%, -50%) rotate(45deg); background:radial-gradient(circle, #fff 0 6%, rgba(255,255,255,0.55) 12%, rgba(255,255,255,0) 30%), linear-gradient(90deg, rgba(255,255,255,0), #fff 50%, rgba(255,255,255,0)) center / 100% 0.4cqw no-repeat, linear-gradient(0deg, rgba(255,255,255,0), #fff 50%, rgba(255,255,255,0)) center / 0.4cqw 100% no-repeat; opacity:calc(0.35 + var(--g1) * 0.65);"></div>
				<div data-layer="material.gem-spark" style="position:absolute; left:94%; top:95%; width:16cqw; height:16cqw; transform:translate(-50%, -50%) rotate(0deg); background:radial-gradient(circle, #fff 0 6%, rgba(255,255,255,0.55) 12%, rgba(255,255,255,0) 30%), linear-gradient(90deg, rgba(255,255,255,0), #fff 50%, rgba(255,255,255,0)) center / 100% 0.4cqw no-repeat, linear-gradient(0deg, rgba(255,255,255,0), #fff 50%, rgba(255,255,255,0)) center / 0.4cqw 100% no-repeat; opacity:calc(0.35 + var(--g2) * 0.65);"></div>
				<div data-layer="material.gem-spark" style="position:absolute; left:52%; top:1.6%; width:8cqw; height:8cqw; transform:translate(-50%, -50%) rotate(45deg); background:radial-gradient(circle, #fff 0 6%, rgba(255,255,255,0.55) 12%, rgba(255,255,255,0) 30%), linear-gradient(90deg, rgba(255,255,255,0), #fff 50%, rgba(255,255,255,0)) center / 100% 0.4cqw no-repeat, linear-gradient(0deg, rgba(255,255,255,0), #fff 50%, rgba(255,255,255,0)) center / 0.4cqw 100% no-repeat; opacity:calc(0.35 + var(--g3) * 0.65);"></div>
				<div data-layer="material.gem-spark" style="position:absolute; left:30%; top:98.4%; width:9cqw; height:9cqw; transform:translate(-50%, -50%) rotate(45deg); background:radial-gradient(circle, #fff 0 6%, rgba(255,255,255,0.55) 12%, rgba(255,255,255,0) 30%), linear-gradient(90deg, rgba(255,255,255,0), #fff 50%, rgba(255,255,255,0)) center / 100% 0.4cqw no-repeat, linear-gradient(0deg, rgba(255,255,255,0), #fff 50%, rgba(255,255,255,0)) center / 0.4cqw 100% no-repeat; opacity:calc(0.35 + var(--g2) * 0.65);"></div>
			{/if}
		{/if}
		{#if paint}
			<div data-layer="material.glare" style="position:absolute; inset:0; background:radial-gradient(ellipse 70% 55% at var(--mx) var(--my), rgba(255,255,255,1) 0, rgba(255,255,255,0) 70%); opacity:var(--glare); "></div>
		{/if}
	</div>
{/if}

<style>
	/* Layers stack in depth order: shadow and slabs under the face, foil and sheen over it. */
	.material-root [data-layer='material.shadow'] { z-index: -36; }
	/* Slabs are declared nearest-first; flat painting must retain that depth order. */
	.material-root [data-layer='material.slab']:nth-child(2) { z-index: -1; }
	.material-root [data-layer='material.slab']:nth-child(3) { z-index: -2; }
	.material-root [data-layer='material.slab']:nth-child(4) { z-index: -3; }
	.material-root [data-layer='material.slab']:nth-child(5) { z-index: -4; }
	.material-root [data-layer='material.face-bevel'] { z-index: 5; }
	.material-root [data-layer='material.prism-wash'] { z-index: 6; }
	.material-root [data-layer='material.glare'] { z-index: 10; }
	.material-root [data-layer='material.silver-ring'],
	.material-root [data-layer='material.silver-brush'] { z-index: 20; }
	.material-root [data-layer='material.silver-keyline'] { z-index: 22; }
	.material-root [data-layer='material.silver-sheen'] { z-index: 25; }
	.material-root [data-layer='material.gold-ring'] { z-index: 30; }
	.material-root [data-layer='material.gold-hatch'] { z-index: 32; }
	.material-root [data-layer='material.gold-bevel-in'] { z-index: 34; }
	.material-root [data-layer='material.gold-ridges'] { z-index: 35; }
	.material-root [data-layer='material.gold-bevel-out'] { z-index: 36; }
	.material-root [data-layer='material.gold-sheen'],
	.material-root [data-layer='material.prism-ring'] { z-index: 40; }
	.material-root [data-layer='material.prism-facets'] { z-index: 42; }
	.material-root [data-layer='material.gem-lenticular'] { z-index: 45; }
	.material-root [data-layer='material.gem-bevel'] { z-index: 46; }
	.material-root [data-layer='material.gem-spark'] { z-index: 100; }
</style>
