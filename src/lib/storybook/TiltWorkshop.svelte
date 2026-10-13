<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { createDialKitController } from 'dialkit/svelte';
	import { TILT, TILT_DEFAULTS, type TiltEasing } from '#lib/cards/tilt-math.ts';
	import CardWorkshop, { type CardWorkshopProps } from './CardWorkshop.svelte';

	let { footprint = true, ...props }: CardWorkshopProps & { footprint?: boolean } = $props();

	const dials = createDialKitController('Card tilt', untrack(() => ({
		maxTilt: [TILT.maxTilt, 0, 24, 0.5] as [number, number, number, number],
		perspective: [TILT.perspective, 300, 2400, 10] as [number, number, number, number],
		pressMs: [TILT.pressMs, 10, 400, 1] as [number, number, number, number],
		releaseMs: [TILT.releaseMs, 20, 1000, 5] as [number, number, number, number],
		idleAmount: [TILT.idleAmount, 0, 6, 0.1] as [number, number, number, number],
		falloff: [TILT.falloff, 0.3, 3, 0.05] as [number, number, number, number],
		minArm: [TILT.minArm, 0, 1, 0.01] as [number, number, number, number],
		fulcrumX: [TILT.fulcrumX, -1, 1, 0.01] as [number, number, number, number],
		fulcrumY: [TILT.fulcrumY, -1, 1, 0.01] as [number, number, number, number],
		easing: { type: 'select' as const, options: ['exponential', 'spring'], default: TILT.easing },
		stiffness: [TILT.stiffness, 40, 800, 5] as [number, number, number, number],
		damping: [TILT.damping, 4, 80, 1] as [number, number, number, number],
		footprint
	})));
	$effect(() => {
		const values = dials.values;
		TILT.maxTilt = values.maxTilt as number;
		TILT.perspective = values.perspective as number;
		TILT.pressMs = values.pressMs as number;
		TILT.releaseMs = values.releaseMs as number;
		TILT.idleAmount = values.idleAmount as number;
		TILT.falloff = values.falloff as number;
		TILT.minArm = values.minArm as number;
		TILT.fulcrumX = values.fulcrumX as number;
		TILT.fulcrumY = values.fulcrumY as number;
		TILT.easing = values.easing as TiltEasing;
		TILT.stiffness = values.stiffness as number;
		TILT.damping = values.damping as number;
	});
	// Other stories and the app always see the shipped tilt.
	onDestroy(() => Object.assign(TILT, TILT_DEFAULTS));
</script>

<div class="tilt-workshop" data-footprint={dials.values.footprint}>
	<CardWorkshop {...props} />
</div>

<style>
	/* The untransformed shell is the resting footprint; the tilted card must stay inside it. */
	.tilt-workshop[data-footprint='true'] :global(.card-shell) { outline: 1px dashed oklch(70% 0.2 30); outline-offset: 0; }
</style>
