<script lang="ts">
	import type { CardViewModel } from './view-model.ts';

	export interface MaterialProps {
		s: CardViewModel;
		layer: 'under' | 'over';
		capture?: boolean;
	}

	let { s, layer, capture = false }: MaterialProps = $props();
	const silver = $derived(s.fin.foil && !s.fin.emboss);
	const gold = $derived(s.fin.emboss && !s.fin.gem);
	const gem = $derived(s.fin.gem);
</script>

{#if layer === 'under'}
	<div class="material-root" data-layer="material.under" data-capture={capture} style="container-type:inline-size; position:absolute; inset:0; pointer-events:none; transform-style:preserve-3d;">
		<div data-layer="material.shadow" data-capture-transform="shadow" style="position:absolute; inset:-4%; transform:translateZ(-36px) translate(calc(var(--lx) * -5cqw), calc(var(--ly) * -6cqw)); background:radial-gradient(ellipse 50% 50% at 50% 50%, rgba(0,0,0,0.55) 0, rgba(0,0,0,0.3) 55%, rgba(0,0,0,0) 72%); opacity:calc((0.45 + var(--lift) * 0.45) * var(--depth, 1));"></div>
		<div data-layer="material.slab" style="position:absolute; inset:0; border-radius:1.8cqw; transform:translateZ(-1px); background:#d4cfc4; opacity:var(--depth, 1);"></div>
		<div data-layer="material.slab" style="position:absolute; inset:0; border-radius:1.8cqw; transform:translateZ(-2px); background:#f2efe8; opacity:var(--depth, 1);"></div>
		<div data-layer="material.slab" style="position:absolute; inset:0; border-radius:1.8cqw; transform:translateZ(-3px); background:#d4cfc4; opacity:var(--depth, 1);"></div>
		<div data-layer="material.slab" style="position:absolute; inset:0; border-radius:1.8cqw; transform:translateZ(-4px); background:#a9a397; opacity:var(--depth, 1);"></div>
	</div>
{:else}
	<div class="material-root" data-layer="material" data-finish={s.fin.tier} data-capture={capture} style="container-type:inline-size; position:absolute; inset:0; pointer-events:none; border-radius:1.8cqw; transform-style:preserve-3d; --k:1;">
		<div data-layer="material.face-bevel" style="position:absolute; inset:0; border-radius:1.8cqw; transform:translateZ(0.5px); box-shadow:inset calc(var(--lx) * -0.5cqw) calc(var(--ly) * -0.5cqw) 0.4cqw -0.1cqw rgba(255,255,255,0.35), inset calc(var(--lx) * 0.5cqw) calc(var(--ly) * 0.5cqw) 0.5cqw -0.1cqw rgba(0,0,0,0.35);"></div>
		{#if silver}
			<div data-layer="material.silver-ring" style="position:absolute; inset:0; box-sizing:border-box; padding:calc(var(--k) * 2cqw); border-radius:1.8cqw; background:var(--holo-silver, linear-gradient(115deg, #8f99a4 0%, #f4f6f8 16%, #aeb7c0 30%, #ffffff 44%, #a3adb7 58%, #e9edf1 74%, #8a949f 100%) var(--mx) var(--my) / 300% 300%); -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite:xor; mask:linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); transform:translateZ(2px);"></div>
			<div data-layer="material.silver-brush" style="position:absolute; inset:0; box-sizing:border-box; padding:calc(var(--k) * 2cqw); border-radius:1.8cqw; transform:translateZ(2px); background:repeating-linear-gradient(0deg, rgba(255,255,255,0.35) 0 0.12cqw, rgba(0,0,0,0.12) 0.12cqw 0.3cqw, rgba(0,0,0,0) 0.3cqw 0.5cqw); -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite:xor; mask:linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);"></div>
			<div data-layer="material.silver-keyline" style="position:absolute; inset:calc(var(--k) * 2cqw); border-radius:0.6cqw; box-shadow:0 0 0 0.3cqw #ffffff, 0 0 1.2cqw rgba(255,255,255,0.35); transform:translateZ(2.2px);"></div>
			<div data-layer="material.silver-sheen" style="position:absolute; inset:0; background:linear-gradient(115deg, rgba(255,255,255,0) 38%, rgba(255,255,255,0.75) 48%, rgba(255,255,255,0) 58%) var(--mx) 0 / 260% 100% no-repeat; opacity:calc(var(--lift) * 0.4 * var(--k)); transform:translateZ(2.5px);"></div>
		{/if}
		{#if gold}
			<div data-layer="material.gold-ring" style="position:absolute; inset:0; box-sizing:border-box; padding:calc(var(--k) * 2cqw); border-radius:1.8cqw; background:linear-gradient(115deg, #9a6c22 0%, #f7df9a 15%, #c4953a 29%, #fff3c8 43%, #b5832d 57%, #f2d58a 73%, #8f6420 100%) var(--mx) var(--my) / 300% 300%; -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite:xor; mask:linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); transform:translateZ(3px);"></div>
			<div data-layer="material.gold-hatch" style="position:absolute; inset:0; box-sizing:border-box; padding:calc(var(--k) * 2cqw); border-radius:1.8cqw; background:repeating-linear-gradient(45deg, rgba(80,50,10,0.28) 0 0.25cqw, rgba(0,0,0,0) 0.25cqw 0.75cqw), repeating-linear-gradient(-45deg, rgba(255,250,220,0.3) 0 0.25cqw, rgba(0,0,0,0) 0.25cqw 0.75cqw); -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite:xor; mask:linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); transform:translateZ(3.2px);"></div>
			<div data-layer="material.gold-ridges" style="position:absolute; inset:0; box-sizing:border-box; padding:calc(var(--k) * 2cqw); border-radius:1.8cqw; transform:translateZ(3.5px); background:repeating-linear-gradient(90deg, rgba(255,250,225,0.55) 0 0.3cqw, rgba(70,40,0,0.35) 0.3cqw 0.65cqw, rgba(0,0,0,0) 0.65cqw 1.3cqw) calc(var(--lx) * 3cqw) 0 / auto, repeating-linear-gradient(0deg, rgba(255,250,225,0.55) 0 0.3cqw, rgba(70,40,0,0.35) 0.3cqw 0.65cqw, rgba(0,0,0,0) 0.65cqw 1.3cqw) 0 calc(var(--ly) * 3cqw) / auto; -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite:xor; mask:linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);"></div>
			<div data-layer="material.gold-bevel-out" style="position:absolute; inset:0; border-radius:1.8cqw; box-shadow:inset calc(var(--lx) * -0.7cqw) calc(var(--ly) * -0.7cqw) 0.5cqw -0.1cqw rgba(255,248,220,0.8), inset calc(var(--lx) * 0.7cqw) calc(var(--ly) * 0.7cqw) 0.5cqw -0.1cqw rgba(60,35,0,0.55); transform:translateZ(3.6px);"></div>
			<div data-layer="material.gold-bevel-in" style="position:absolute; inset:calc(var(--k) * 2cqw); border-radius:0.6cqw; box-shadow:0 0 0 0.3cqw #7a5216, calc(var(--lx) * 0.5cqw) calc(var(--ly) * 0.5cqw) 0.5cqw rgba(0,0,0,0.45); transform:translateZ(3.4px);"></div>
			<div data-layer="material.gold-corner" data-capture-transform="rotate-0" style="position:absolute; left:calc(var(--k) * 0.35cqw); top:calc(var(--k) * 0.35cqw); width:calc(var(--k) * 6cqw); height:calc(var(--k) * 6cqw); transform:translateZ(7px) rotate(0deg); background:linear-gradient(115deg, #9a6c22 0%, #f7df9a 15%, #c4953a 29%, #fff3c8 43%, #b5832d 57%, #f2d58a 73%, #8f6420 100%) var(--mx) var(--my) / 400% 400%; clip-path:polygon(0 0, 100% 0, 100% 26%, 26% 26%, 26% 100%, 0 100%); border-radius:1.2cqw 0 0 0; filter:drop-shadow(calc(var(--lx) * -0.25cqw) calc(var(--ly) * -0.25cqw) 0 rgba(255,255,255,0.6)) drop-shadow(calc(var(--lx) * 0.3cqw) calc(var(--ly) * 0.3cqw) 0.2cqw rgba(0,0,0,0.45));"></div>
			<div data-layer="material.gold-corner" data-capture-transform="rotate-90" style="position:absolute; right:calc(var(--k) * 0.35cqw); top:calc(var(--k) * 0.35cqw); width:calc(var(--k) * 6cqw); height:calc(var(--k) * 6cqw); transform:translateZ(7px) rotate(90deg); background:linear-gradient(115deg, #9a6c22 0%, #f7df9a 15%, #c4953a 29%, #fff3c8 43%, #b5832d 57%, #f2d58a 73%, #8f6420 100%) var(--mx) var(--my) / 400% 400%; clip-path:polygon(0 0, 100% 0, 100% 26%, 26% 26%, 26% 100%, 0 100%); border-radius:1.2cqw 0 0 0; filter:drop-shadow(calc(var(--lx) * -0.25cqw) calc(var(--ly) * -0.25cqw) 0 rgba(255,255,255,0.6)) drop-shadow(calc(var(--lx) * 0.3cqw) calc(var(--ly) * 0.3cqw) 0.2cqw rgba(0,0,0,0.45));"></div>
			<div data-layer="material.gold-corner" data-capture-transform="rotate-180" style="position:absolute; right:calc(var(--k) * 0.35cqw); bottom:calc(var(--k) * 0.35cqw); width:calc(var(--k) * 6cqw); height:calc(var(--k) * 6cqw); transform:translateZ(7px) rotate(180deg); background:linear-gradient(115deg, #9a6c22 0%, #f7df9a 15%, #c4953a 29%, #fff3c8 43%, #b5832d 57%, #f2d58a 73%, #8f6420 100%) var(--mx) var(--my) / 400% 400%; clip-path:polygon(0 0, 100% 0, 100% 26%, 26% 26%, 26% 100%, 0 100%); border-radius:1.2cqw 0 0 0; filter:drop-shadow(calc(var(--lx) * -0.25cqw) calc(var(--ly) * -0.25cqw) 0 rgba(255,255,255,0.6)) drop-shadow(calc(var(--lx) * 0.3cqw) calc(var(--ly) * 0.3cqw) 0.2cqw rgba(0,0,0,0.45));"></div>
			<div data-layer="material.gold-corner" data-capture-transform="rotate-270" style="position:absolute; left:calc(var(--k) * 0.35cqw); bottom:calc(var(--k) * 0.35cqw); width:calc(var(--k) * 6cqw); height:calc(var(--k) * 6cqw); transform:translateZ(7px) rotate(270deg); background:linear-gradient(115deg, #9a6c22 0%, #f7df9a 15%, #c4953a 29%, #fff3c8 43%, #b5832d 57%, #f2d58a 73%, #8f6420 100%) var(--mx) var(--my) / 400% 400%; clip-path:polygon(0 0, 100% 0, 100% 26%, 26% 26%, 26% 100%, 0 100%); border-radius:1.2cqw 0 0 0; filter:drop-shadow(calc(var(--lx) * -0.25cqw) calc(var(--ly) * -0.25cqw) 0 rgba(255,255,255,0.6)) drop-shadow(calc(var(--lx) * 0.3cqw) calc(var(--ly) * 0.3cqw) 0.2cqw rgba(0,0,0,0.45));"></div>
			<div data-layer="material.gold-sheen" style="position:absolute; inset:0; background:linear-gradient(115deg, rgba(255,230,150,0) 36%, rgba(255,236,170,0.7) 48%, rgba(255,230,150,0) 60%) var(--mx) 0 / 260% 100% no-repeat; opacity:calc(var(--lift) * 0.45 * var(--k)); transform:translateZ(4px);"></div>
		{/if}
		{#if gem}
			<div data-layer="material.prism-wash" style="position:absolute; inset:0; border-radius:1.8cqw; background:linear-gradient(125deg, #ff5fb7 0%, #ffd34f 18%, #6dffa8 36%, #4fd2ff 54%, #a57bff 72%, #ff5fb7 90%) var(--mx) var(--my) / 260% 260%; opacity:calc((0.13 + var(--lift) * 0.08) * var(--k)); transform:translateZ(0.6px);"></div>
			<div data-layer="material.prism-ring" style="position:absolute; inset:0; box-sizing:border-box; padding:calc(var(--k) * 3.2cqw); border-radius:1.8cqw; background:conic-gradient(from var(--ang), #ff3fa4, #ffb800, #ffee55, #3dff8a, #22c8ff, #7a5cff, #ff3fa4); -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite:xor; mask:linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); transform:translateZ(4px);"></div>
			<div data-layer="material.prism-facets" style="position:absolute; inset:0; box-sizing:border-box; padding:calc(var(--k) * 3.2cqw); border-radius:1.8cqw; background:repeating-linear-gradient(60deg, rgba(255,255,255,0.45) 0 0.35cqw, rgba(255,255,255,0) 0.35cqw 2.2cqw), repeating-linear-gradient(-60deg, rgba(255,255,255,0.3) 0 0.35cqw, rgba(255,255,255,0) 0.35cqw 2.2cqw); -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite:xor; mask:linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); transform:translateZ(4.2px);"></div>
			<div data-layer="material.gem-lenticular" style="position:absolute; inset:0; box-sizing:border-box; padding:calc(var(--k) * 3.2cqw); border-radius:1.8cqw; transform:translateZ(4.5px); background:repeating-linear-gradient(90deg, rgba(255,255,255,0.55) 0 0.22cqw, rgba(0,0,0,0.22) 0.22cqw 0.5cqw, rgba(255,255,255,0) 0.5cqw 0.9cqw) calc(var(--mx) * 0.2) 0 / auto; -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite:xor; mask:linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);"></div>
			<div data-layer="material.gem-bevel" style="position:absolute; inset:0; border-radius:1.8cqw; box-shadow:inset calc(var(--lx) * -0.7cqw) calc(var(--ly) * -0.7cqw) 0.5cqw -0.1cqw rgba(255,255,255,0.7), inset calc(var(--lx) * 0.7cqw) calc(var(--ly) * 0.7cqw) 0.5cqw -0.1cqw rgba(0,0,0,0.45); transform:translateZ(4.6px);"></div>
			<div data-layer="material.gem-spark" data-capture-transform="spark-0" style="position:absolute; left:6%; top:4%; width:14cqw; height:14cqw; transform:translateZ(10px) translate(-50%, -50%) rotate(0deg); background:radial-gradient(circle, #fff 0 6%, rgba(255,255,255,0.55) 12%, rgba(255,255,255,0) 30%), linear-gradient(90deg, rgba(255,255,255,0), #fff 50%, rgba(255,255,255,0)) center / 100% 0.4cqw no-repeat, linear-gradient(0deg, rgba(255,255,255,0), #fff 50%, rgba(255,255,255,0)) center / 0.4cqw 100% no-repeat; opacity:calc(0.35 + var(--g1) * 0.65);"></div>
			<div data-layer="material.gem-spark" data-capture-transform="spark-45" style="position:absolute; left:95%; top:30%; width:10cqw; height:10cqw; transform:translateZ(10px) translate(-50%, -50%) rotate(45deg); background:radial-gradient(circle, #fff 0 6%, rgba(255,255,255,0.55) 12%, rgba(255,255,255,0) 30%), linear-gradient(90deg, rgba(255,255,255,0), #fff 50%, rgba(255,255,255,0)) center / 100% 0.4cqw no-repeat, linear-gradient(0deg, rgba(255,255,255,0), #fff 50%, rgba(255,255,255,0)) center / 0.4cqw 100% no-repeat; opacity:calc(0.35 + var(--g3) * 0.65);"></div>
			<div data-layer="material.gem-spark" data-capture-transform="spark-45" style="position:absolute; left:4%; top:63%; width:9cqw; height:9cqw; transform:translateZ(10px) translate(-50%, -50%) rotate(45deg); background:radial-gradient(circle, #fff 0 6%, rgba(255,255,255,0.55) 12%, rgba(255,255,255,0) 30%), linear-gradient(90deg, rgba(255,255,255,0), #fff 50%, rgba(255,255,255,0)) center / 100% 0.4cqw no-repeat, linear-gradient(0deg, rgba(255,255,255,0), #fff 50%, rgba(255,255,255,0)) center / 0.4cqw 100% no-repeat; opacity:calc(0.35 + var(--g1) * 0.65);"></div>
			<div data-layer="material.gem-spark" data-capture-transform="spark-0" style="position:absolute; left:94%; top:95%; width:16cqw; height:16cqw; transform:translateZ(10px) translate(-50%, -50%) rotate(0deg); background:radial-gradient(circle, #fff 0 6%, rgba(255,255,255,0.55) 12%, rgba(255,255,255,0) 30%), linear-gradient(90deg, rgba(255,255,255,0), #fff 50%, rgba(255,255,255,0)) center / 100% 0.4cqw no-repeat, linear-gradient(0deg, rgba(255,255,255,0), #fff 50%, rgba(255,255,255,0)) center / 0.4cqw 100% no-repeat; opacity:calc(0.35 + var(--g2) * 0.65);"></div>
			<div data-layer="material.gem-spark" data-capture-transform="spark-45" style="position:absolute; left:52%; top:1.6%; width:8cqw; height:8cqw; transform:translateZ(10px) translate(-50%, -50%) rotate(45deg); background:radial-gradient(circle, #fff 0 6%, rgba(255,255,255,0.55) 12%, rgba(255,255,255,0) 30%), linear-gradient(90deg, rgba(255,255,255,0), #fff 50%, rgba(255,255,255,0)) center / 100% 0.4cqw no-repeat, linear-gradient(0deg, rgba(255,255,255,0), #fff 50%, rgba(255,255,255,0)) center / 0.4cqw 100% no-repeat; opacity:calc(0.35 + var(--g3) * 0.65);"></div>
			<div data-layer="material.gem-spark" data-capture-transform="spark-45" style="position:absolute; left:30%; top:98.4%; width:9cqw; height:9cqw; transform:translateZ(10px) translate(-50%, -50%) rotate(45deg); background:radial-gradient(circle, #fff 0 6%, rgba(255,255,255,0.55) 12%, rgba(255,255,255,0) 30%), linear-gradient(90deg, rgba(255,255,255,0), #fff 50%, rgba(255,255,255,0)) center / 100% 0.4cqw no-repeat, linear-gradient(0deg, rgba(255,255,255,0), #fff 50%, rgba(255,255,255,0)) center / 0.4cqw 100% no-repeat; opacity:calc(0.35 + var(--g2) * 0.65);"></div>
		{/if}
		<div data-layer="material.glare" style="position:absolute; inset:0; background:radial-gradient(ellipse 70% 55% at var(--mx) var(--my), rgba(255,255,255,1) 0, rgba(255,255,255,0) 70%); opacity:var(--glare); transform:translateZ(1px);"></div>
	</div>
{/if}

<style>
	/* Trusted captures retain the finish layers and their depth paint order, but
	   express them as a stable 2D stack instead of browser-composited 3D planes. */
	.material-root[data-capture='true'] {
		transform-style: flat !important;
	}
	.material-root[data-capture='true'] [data-layer] {
		transform: none !important;
		transform-style: flat !important;
	}
	.material-root[data-capture='true'] [data-capture-transform='shadow'] {
		transform: translate(calc(var(--lx) * -5cqw), calc(var(--ly) * -6cqw)) !important;
	}
	.material-root[data-capture='true'] [data-capture-transform='rotate-0'] { transform: rotate(0deg) !important; }
	.material-root[data-capture='true'] [data-capture-transform='rotate-90'] { transform: rotate(90deg) !important; }
	.material-root[data-capture='true'] [data-capture-transform='rotate-180'] { transform: rotate(180deg) !important; }
	.material-root[data-capture='true'] [data-capture-transform='rotate-270'] { transform: rotate(270deg) !important; }
	.material-root[data-capture='true'] [data-capture-transform='spark-0'] { transform: translate(-50%, -50%) rotate(0deg) !important; }
	.material-root[data-capture='true'] [data-capture-transform='spark-45'] { transform: translate(-50%, -50%) rotate(45deg) !important; }
	.material-root[data-capture='true'] [data-layer='material.shadow'] { z-index: -36; }
	/* Slabs are declared nearest-first; flat painting must retain that depth order. */
	.material-root[data-capture='true'] [data-layer='material.slab']:nth-child(2) { z-index: -1; }
	.material-root[data-capture='true'] [data-layer='material.slab']:nth-child(3) { z-index: -2; }
	.material-root[data-capture='true'] [data-layer='material.slab']:nth-child(4) { z-index: -3; }
	.material-root[data-capture='true'] [data-layer='material.slab']:nth-child(5) { z-index: -4; }
	.material-root[data-capture='true'] [data-layer='material.face-bevel'] { z-index: 5; }
	.material-root[data-capture='true'] [data-layer='material.prism-wash'] { z-index: 6; }
	.material-root[data-capture='true'] [data-layer='material.glare'] { z-index: 10; }
	.material-root[data-capture='true'] [data-layer='material.silver-ring'],
	.material-root[data-capture='true'] [data-layer='material.silver-brush'] { z-index: 20; }
	.material-root[data-capture='true'] [data-layer='material.silver-keyline'] { z-index: 22; }
	.material-root[data-capture='true'] [data-layer='material.silver-sheen'] { z-index: 25; }
	.material-root[data-capture='true'] [data-layer='material.gold-ring'] { z-index: 30; }
	.material-root[data-capture='true'] [data-layer='material.gold-hatch'] { z-index: 32; }
	.material-root[data-capture='true'] [data-layer='material.gold-bevel-in'] { z-index: 34; }
	.material-root[data-capture='true'] [data-layer='material.gold-ridges'] { z-index: 35; }
	.material-root[data-capture='true'] [data-layer='material.gold-bevel-out'] { z-index: 36; }
	.material-root[data-capture='true'] [data-layer='material.gold-sheen'],
	.material-root[data-capture='true'] [data-layer='material.prism-ring'] { z-index: 40; }
	.material-root[data-capture='true'] [data-layer='material.prism-facets'] { z-index: 42; }
	.material-root[data-capture='true'] [data-layer='material.gem-lenticular'] { z-index: 45; }
	.material-root[data-capture='true'] [data-layer='material.gem-bevel'] { z-index: 46; }
	.material-root[data-capture='true'] [data-layer='material.gold-corner'] { z-index: 70; }
	.material-root[data-capture='true'] [data-layer='material.gem-spark'] { z-index: 100; }
</style>
