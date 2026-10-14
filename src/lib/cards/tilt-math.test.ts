import { describe, expect, it } from 'vitest';
import { FACE_DEPTH, TILT_DEFAULTS, idleDrift, pointerTilt, restingTilt, stepTilt, tiltPose, type DriftRhythm, type TiltPose } from './tilt-math.ts';

const HALF_WIDTH = 140;
const HALF_HEIGHT = 196;

/** Projects a card-space point through a pose exactly as CSS composes it. */
function project(pose: TiltPose, x: number, y: number, z: number): [number, number] {
	const radians = pose.angle * Math.PI / 180;
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);
	const { axisX: ax, axisY: ay } = pose;
	const px = x - pose.pivotX;
	const py = y - pose.pivotY;
	const dot = ax * px + ay * py;
	const rx = px * cos + ay * z * sin + ax * dot * (1 - cos) + pose.pivotX;
	const ry = py * cos - ax * z * sin + ay * dot * (1 - cos) + pose.pivotY;
	const rz = z * cos + (ax * py - ay * px) * sin;
	const projection = pose.perspective / (pose.perspective - rz);
	return [rx * pose.scale * projection, ry * pose.scale * projection];
}

function overhang(pose: TiltPose): number {
	let worst = 0;
	for (const x of [-HALF_WIDTH, HALF_WIDTH]) for (const y of [-HALF_HEIGHT, HALF_HEIGHT]) for (const z of [0, FACE_DEPTH]) {
		const [px, py] = project(pose, x, y, z);
		worst = Math.max(worst, Math.abs(px) - HALF_WIDTH, Math.abs(py) - HALF_HEIGHT);
	}
	return worst;
}

describe('tilt pose', () => {
	it('never projects any layer past the resting footprint, even while the press lags the tilt', () => {
		for (const tuning of [TILT_DEFAULTS, { ...TILT_DEFAULTS, minArm: 0.4 }, { ...TILT_DEFAULTS, perspective: 400, fulcrumX: 0.5, fulcrumY: -0.3 }]) {
			for (let x = -1; x <= 1; x += 0.25) for (let y = -1; y <= 1; y += 0.25) {
				const { rx, ry } = pointerTilt(x, y, tuning);
				for (const lag of [0, 0.5, 1]) {
					const pose = tiltPose(rx, ry, Math.hypot(rx, ry) * lag, HALF_WIDTH, HALF_HEIGHT, tuning);
					if (pose.transform) expect(overhang(pose), `${x},${y} lag ${lag}`).toBeLessThan(0.05);
				}
			}
		}
	});

	it('changes scale and perspective continuously across the center and the flat threshold', () => {
		let previous: TiltPose | undefined;
		// A straight sweep through the center while the press settles to nothing.
		for (let step = 0; step <= 400; step++) {
			const t = step / 400;
			const { rx, ry } = pointerTilt(-1 + 2 * t, 0.3 - 0.6 * t);
			const envelope = 3 * (1 - t);
			const pose = tiltPose(rx * (1 - t), ry * (1 - t), envelope, HALF_WIDTH, HALF_HEIGHT);
			if (previous) {
				expect(Math.abs(pose.scale - previous.scale)).toBeLessThan(0.002);
				const reach = (p: TiltPose) => p.transform ? 1 / p.perspective : 0;
				expect(Math.abs(reach(pose) - reach(previous))).toBeLessThan(1e-4);
			}
			previous = pose;
		}
	});

	it('keeps a held card at one size while the pointer moves', () => {
		let state = restingTilt();
		const scales: number[] = [];
		for (let frame = 0; frame < 240; frame++) {
			const target = pointerTilt(Math.sin(frame / 15), Math.cos(frame / 23));
			const step = stepTilt(state, { targetX: target.rx, targetY: target.ry, holding: true, pressing: true }, 16);
			state = step.state;
			if (frame > 120) scales.push(tiltPose(step.rx, step.ry, step.envelope, HALF_WIDTH, HALF_HEIGHT).scale);
		}
		expect(Math.max(...scales) - Math.min(...scales)).toBeLessThan(0.001);
	});
});

describe('minimum weight bar', () => {
	const tiltOf = (x: number, y: number, minArm: number) => {
		const { rx, ry } = pointerTilt(x, y, { ...TILT_DEFAULTS, minArm });
		return Math.hypot(rx, ry);
	};

	it('tilts a press near the fulcrum as if it were at the minimum arm, in the press direction', () => {
		expect(tiltOf(.05, 0, .4)).toBeCloseTo(TILT_DEFAULTS.maxTilt * .4, 6);
		const { rx, ry } = pointerTilt(0, .05, { ...TILT_DEFAULTS, minArm: .4 });
		expect(ry).toBeCloseTo(0, 6);
		expect(rx).toBeLessThan(0);
	});

	it('leaves presses beyond the minimum arm, and a zero minimum, unchanged', () => {
		expect(tiltOf(.8, 0, .4)).toBeCloseTo(tiltOf(.8, 0, 0), 6);
		expect(tiltOf(.05, 0, 0)).toBeCloseTo(TILT_DEFAULTS.maxTilt * .05, 6);
	});
});

describe('fulcrum', () => {
	it('stays on the resting plane: the pose never pushes the card back', () => {
		const { rx, ry } = pointerTilt(1, 1);
		const pose = tiltPose(rx, ry, Math.hypot(rx, ry), HALF_WIDTH, HALF_HEIGHT);
		expect(pose.transform).not.toMatch(/translateZ/);
		// The pivot is the one point the rotation leaves in place, so it projects to itself.
		const [px, py] = project(pose, pose.pivotX, pose.pivotY, 0);
		expect(Math.abs(px - pose.pivotX * pose.scale)).toBeLessThan(1e-6);
		expect(Math.abs(py - pose.pivotY * pose.scale)).toBeLessThan(1e-6);
	});
});

describe('idle drift', () => {
	const rhythm: DriftRhythm = {
		phaseX1: 0.3, phaseX2: 1.1, phaseY1: 2.2, phaseY2: 0.7,
		frequencyX1: 0.11, frequencyX2: 0.07, frequencyY1: 0.09, frequencyY2: 0.13,
		swellPhaseX: 0, swellPhaseY: Math.PI, swellFrequencyX: 0.02, swellFrequencyY: 0.02
	};
	const widest = (from: number, to: number, axis: 'rx' | 'ry') => {
		let most = 0;
		for (let t = from; t < to; t += 0.05) most = Math.max(most, Math.abs(idleDrift(t, rhythm, 1)[axis]));
		return most;
	};

	it('swells and shrinks the swing over time instead of rocking at one width', () => {
		// Swell peaks near 12.5s and bottoms near 37.5s at 0.02 Hz.
		expect(widest(5, 20, 'rx')).toBeGreaterThan(widest(30, 45, 'rx') * 1.8);
	});

	it('keeps the swing inside the base drift range scaled by the swell ceiling', () => {
		expect(widest(0, 120, 'rx')).toBeLessThanOrEqual(2.4 * TILT_DEFAULTS.idleAmount * 1.35 + 1e-9);
		expect(widest(0, 120, 'ry')).toBeLessThanOrEqual(3.4 * TILT_DEFAULTS.idleAmount * 1.35 + 1e-9);
	});
});
