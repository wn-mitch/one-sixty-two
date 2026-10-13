/**
 * Card tilt pose math, free of the DOM so the app, the workshop and the tuning page share it.
 *
 * The card pivots on a fulcrum (its center by default) that stays on the resting plane. The pointer acts
 * as a weight pressing that spot into the table: that side sinks and the opposite side rises by the
 * same amount. A uniform shrink, sized for the largest tilt the press can reach in any direction, keeps
 * every layer inside the resting footprint, and every term is continuous so the card never jumps.
 */

export type TiltEasing = 'exponential' | 'spring';

export interface TiltTuning {
	/** Largest pointer tilt, in degrees, at the middle of an edge. */
	maxTilt: number;
	/** Viewing distance in px; shorter exaggerates the near/far size difference. */
	perspective: number;
	/** Time constant in ms while a pointer or focus holds the card (exponential easing). */
	pressMs: number;
	/** Time constant in ms while the card settles back (exponential easing). */
	releaseMs: number;
	/** Passive drift amplitude; 0 holds idle cards still. */
	idleAmount: number;
	/** Exponent on the pointer's distance from the fulcrum; 1 is linear, above 1 softens the middle. */
	falloff: number;
	/** Shortest weight bar, as a fraction of the half size: a press nearer the fulcrum still tilts as if it were this far out. 0 lets the center sit flat. */
	minArm: number;
	/** Fulcrum offset from the center, as a fraction of the half width and half height. */
	fulcrumX: number;
	fulcrumY: number;
	easing: TiltEasing;
	/** Spring easing only. */
	stiffness: number;
	damping: number;
}

/** The shipped tuning. Workshops edit it live; the app reads it every frame. */
export const TILT: TiltTuning = {
	maxTilt: 7.5,
	perspective: 900,
	pressMs: 72,
	releaseMs: 220,
	idleAmount: 3,
	falloff: 1,
	minArm: 0.39,
	fulcrumX: 0,
	fulcrumY: 0,
	easing: 'exponential',
	stiffness: 105,
	damping: 26
};

export const TILT_DEFAULTS: Readonly<TiltTuning> = Object.freeze({ ...TILT });

/** The frontmost material layer (gold corner) sits this far in front of the face, in px. */
export const FACE_DEPTH = 7;
/** Below this envelope, in degrees, perspective fades out so flat and tilted cards meet without a pop. */
const PERSPECTIVE_FADE = 1.5;

/** Target rotation for a pointer at (x, y), each -1..1 across the card. */
export function pointerTilt(x: number, y: number, tuning: TiltTuning = TILT): { rx: number; ry: number } {
	const distance = Math.hypot(x, y);
	if (distance < 1e-6) return { rx: 0, ry: 0 };
	const arm = Math.max(distance, Math.min(1, Math.max(0, tuning.minArm)));
	const gain = tuning.maxTilt * arm ** tuning.falloff / distance;
	return { rx: -y * gain, ry: x * gain };
}

/** The largest tilt a pointer can reach, at a corner. */
export function pointerEnvelope(tuning: TiltTuning = TILT): number {
	return tuning.maxTilt * Math.SQRT2 ** tuning.falloff;
}

/** Fades perspective in over the first degrees of the envelope; 0 is flat, 1 is full perspective. */
export function engagement(envelope: number): number {
	const t = Math.min(1, Math.max(0, envelope / PERSPECTIVE_FADE));
	return t * t * (3 - 2 * t);
}

/** Smooth max of 1 and value, never below either; softness 0 is the hard max. */
function softMax1(value: number, softness: number): number {
	return (1 + value + Math.sqrt((value - 1) ** 2 + softness ** 2)) / 2;
}

export interface TiltPose {
	transform: string;
	angle: number;
	scale: number;
	perspective: number;
	/** Rotation axis in the card plane, unit length, or 0,0 when flat. */
	axisX: number;
	axisY: number;
	pivotX: number;
	pivotY: number;
}

/**
 * The pose for rotation (rx, ry) in degrees with a press envelope in degrees.
 * The envelope, not the momentary angle, sizes the footprint correction, so moving the pointer never pumps the card's size.
 */
export function tiltPose(rx: number, ry: number, envelope: number, halfWidth: number, halfHeight: number, tuning: TiltTuning = TILT): TiltPose {
	const angle = Math.hypot(rx, ry);
	// Perspective follows the eased press, so it fades in and out even when the angle moves quickly.
	const fade = engagement(envelope);
	const pivotX = tuning.fulcrumX * halfWidth;
	const pivotY = tuning.fulcrumY * halfHeight;
	const flat: TiltPose = { transform: '', angle: 0, scale: 1, perspective: Infinity, axisX: 0, axisY: 0, pivotX, pivotY };
	if ((fade < 1e-4 && angle < 1e-4) || !halfWidth || !halfHeight) return flat;
	const axisX = angle > 1e-6 ? rx / angle : 0;
	const axisY = angle > 1e-6 ? ry / angle : 0;
	const distance = Math.max(1, tuning.perspective) / Math.max(fade, 1e-4);
	// The fulcrum stays on the resting plane, so the rising side comes toward the viewer. The shrink is
	// sized for the worst direction at the larger of the envelope and the live angle, so it holds steady
	// while the pointer moves and the card never projects past its resting footprint.
	const bound = Math.max(angle, Math.min(90, Math.max(0, envelope)));
	let overshoot = 0;
	for (let index = 0; index < FOOTPRINT_DIRECTIONS; index += 1) {
		const turn = index / FOOTPRINT_DIRECTIONS * Math.PI;
		overshoot = Math.max(overshoot, footprintOvershoot(Math.cos(turn), Math.sin(turn), bound, distance, halfWidth, halfHeight, pivotX, pivotY));
	}
	overshoot = Math.max(overshoot, footprintOvershoot(axisX, axisY, angle, distance, halfWidth, halfHeight, pivotX, pivotY));
	// A soft knee keeps the correction continuous; it shrinks the card only as far as it would overhang.
	const scale = 1 / softMax1(overshoot, 0.004 * fade);
	const pivot = pivotX || pivotY;
	const transform = `perspective(${distance.toFixed(1)}px) scale(${scale.toFixed(5)})`
		+ (pivot ? ` translate(${pivotX.toFixed(2)}px, ${pivotY.toFixed(2)}px)` : '')
		+ ` rotate3d(${axisX.toFixed(4)}, ${axisY.toFixed(4)}, 0, ${angle.toFixed(3)}deg)`
		+ (pivot ? ` translate(${(-pivotX).toFixed(2)}px, ${(-pivotY).toFixed(2)}px)` : '');
	return { transform, angle, scale, perspective: distance, axisX, axisY, pivotX, pivotY };
}

/** Axis directions sampled when sizing the footprint correction; the rotation axis is a line, so half a turn covers it. */
const FOOTPRINT_DIRECTIONS = 16;

/** The largest projected reach of any face corner, as a multiple of the resting half size, for one rotation. */
function footprintOvershoot(axisX: number, axisY: number, angle: number, distance: number, halfWidth: number, halfHeight: number, pivotX: number, pivotY: number): number {
	const radians = angle * Math.PI / 180;
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);
	let overshoot = 0;
	for (const x of [-halfWidth, halfWidth]) for (const y of [-halfHeight, halfHeight]) for (const z of [0, FACE_DEPTH]) {
		const px = x - pivotX;
		const py = y - pivotY;
		const dot = axisX * px + axisY * py;
		// Rodrigues rotation about the in-plane axis, matching CSS rotate3d.
		const rx = px * cos + axisY * z * sin + axisX * dot * (1 - cos);
		const ry = py * cos - axisX * z * sin + axisY * dot * (1 - cos);
		const rz = z * cos + (axisX * py - axisY * px) * sin;
		const projection = distance / Math.max(1, distance - rz);
		overshoot = Math.max(overshoot, Math.abs(rx + pivotX) * projection / halfWidth, Math.abs(ry + pivotY) * projection / halfHeight);
	}
	return overshoot;
}

/** How far, in px, the pose's farthest layer projects past the resting footprint; negative stays inside. */
export function poseOverhang(pose: TiltPose, halfWidth: number, halfHeight: number): number {
	if (!pose.transform) return 0;
	const radians = pose.angle * Math.PI / 180;
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);
	let worst = -Infinity;
	for (const x of [-halfWidth, halfWidth]) for (const y of [-halfHeight, halfHeight]) for (const z of [0, FACE_DEPTH]) {
		const px = x - pose.pivotX;
		const py = y - pose.pivotY;
		const dot = pose.axisX * px + pose.axisY * py;
		const rx = px * cos + pose.axisY * z * sin + pose.axisX * dot * (1 - cos) + pose.pivotX;
		const ry = py * cos - pose.axisX * z * sin + pose.axisY * dot * (1 - cos) + pose.pivotY;
		const rz = z * cos + (pose.axisX * py - pose.axisY * px) * sin;
		const projection = pose.scale * pose.perspective / (pose.perspective - rz);
		worst = Math.max(worst, Math.abs(rx) * projection - halfWidth, Math.abs(ry) * projection - halfHeight);
	}
	return worst;
}

/** One eased value with its velocity. */
export interface Eased {
	value: number;
	velocity: number;
}

/** Moves an eased value toward its target over delta ms; holding uses the press time, otherwise the release time. */
export function easeToward(current: Eased, target: number, delta: number, holding: boolean, tuning: TiltTuning = TILT): Eased {
	const ms = Math.max(delta, 1);
	if (tuning.easing === 'spring') {
		let { value, velocity } = current;
		// Fixed substeps keep the spring stable through long frames.
		const steps = Math.ceil(Math.min(ms, 100) / 8);
		const dt = Math.min(ms, 100) / steps / 1000;
		for (let step = 0; step < steps; step++) {
			velocity += (tuning.stiffness * (target - value) - tuning.damping * velocity) * dt;
			value += velocity * dt;
		}
		return { value, velocity };
	}
	const response = 1 - Math.exp(-ms / Math.max(1, holding ? tuning.pressMs : tuning.releaseMs));
	return { value: current.value + (target - current.value) * response, velocity: 0 };
}

/** True once an eased value has settled close enough to stop requesting frames. */
export function settled(current: Eased, target: number, tolerance: number): boolean {
	return Math.abs(current.value - target) <= tolerance && Math.abs(current.velocity) <= tolerance * 10;
}

/** Per-card drift rhythm, derived from the card's identity so neighbours never move in step. */
export interface DriftRhythm {
	phaseX1: number;
	phaseX2: number;
	phaseY1: number;
	phaseY2: number;
	frequencyX1: number;
	frequencyX2: number;
	frequencyY1: number;
	frequencyY2: number;
}

/** Passive drift in degrees at time seconds, scaled by weight (0 while held). */
export function idleDrift(seconds: number, rhythm: DriftRhythm, weight: number, tuning: TiltTuning = TILT): { rx: number; ry: number } {
	const turn = Math.PI * 2;
	return {
		rx: 2.4 * tuning.idleAmount * weight * (
			0.62 * Math.sin(seconds * rhythm.frequencyX1 * turn + rhythm.phaseX1) +
			0.38 * Math.sin(seconds * rhythm.frequencyX2 * turn + rhythm.phaseX2)
		),
		ry: 3.4 * tuning.idleAmount * weight * (
			0.62 * Math.sin(seconds * rhythm.frequencyY1 * turn + rhythm.phaseY1) +
			0.38 * Math.sin(seconds * rhythm.frequencyY2 * turn + rhythm.phaseY2)
		)
	};
}

export interface TiltState {
	x: Eased;
	y: Eased;
	envelope: Eased;
}

export const restingTilt = (): TiltState => ({ x: { value: 0, velocity: 0 }, y: { value: 0, velocity: 0 }, envelope: { value: 0, velocity: 0 } });

export interface TiltInput {
	/** Pointer target rotation in degrees, or 0,0 when nothing holds the card. */
	targetX: number;
	targetY: number;
	/** A pointer or focus holds the card; uses the press time. */
	holding: boolean;
	/** A pointer presses the card, which keeps it pressed for its whole reach. */
	pressing: boolean;
	/** Rotation added after easing, such as drift or a wall spotlight. */
	offsetX?: number;
	offsetY?: number;
}

/**
 * Advances one frame and returns the rotation to draw with its press envelope.
 * A pressed card stays pressed for its whole reach, so moving the pointer never changes its size;
 * otherwise the press follows the angle. The press always eases exponentially at the settling pace so it
 * never snaps or wobbles; while it lags the tilt, the pose's soft correction keeps the card in its footprint.
 */
export function stepTilt(state: TiltState, input: TiltInput, delta: number, tuning: TiltTuning = TILT): { state: TiltState; rx: number; ry: number; envelope: number } {
	const x = easeToward(state.x, input.targetX, delta, input.holding, tuning);
	const y = easeToward(state.y, input.targetY, delta, input.holding, tuning);
	const rx = x.value + (input.offsetX ?? 0);
	const ry = y.value + (input.offsetY ?? 0);
	const pressTarget = Math.max(input.pressing ? pointerEnvelope(tuning) : 0, Math.hypot(rx, ry));
	let envelope = easeToward(state.envelope, pressTarget, delta, false, { ...tuning, easing: 'exponential' });
	if (!input.pressing && envelope.value <= 0.01 && pressTarget <= 0.01) envelope = { value: 0, velocity: 0 };
	return { state: { x, y, envelope }, rx, ry, envelope: envelope.value };
}
