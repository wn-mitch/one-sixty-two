import { describe, expect, it } from 'vitest';
import { assertMatchingVideoEndpoints, exportLabVideo, LAB_VIDEO, videoPose } from './video.ts';
import { START } from './controls.ts';
import { sceneOf } from './scene.ts';

describe('offline lab video', () => {
	it('defines exactly six seconds of 60 fps samples at 1080 square', () => {
		expect(LAB_VIDEO).toEqual({ width: 1080, height: 1080, fps: 60, seconds: 6, frames: 360 });
		const timestamps = Array.from({ length: LAB_VIDEO.frames }, (_, frame) => frame / LAB_VIDEO.fps);
		expect(timestamps[0]).toBe(0);
		expect(timestamps.at(-1)! + 1 / LAB_VIDEO.fps).toBe(6);
		expect(new Set(timestamps).size).toBe(360);
	});

	it('independently evaluates identical tilt, light, projection and film clock at both endpoints', () => {
		expect(videoPose(359)).toStrictEqual(videoPose(0));
		const poses = Array.from({ length: LAB_VIDEO.frames }, (_, frame) => videoPose(frame));
		// One left/right cycle and two up/down cycles form one complete figure eight.
		expect(poses[90]!.ry).toBeGreaterThan(0.3);
		expect(poses[270]!.ry).toBeLessThan(-0.3);
		expect(poses[45]!.rx).toBeGreaterThan(0.2);
		expect(poses[135]!.rx).toBeLessThan(-0.2);
		expect(poses[225]!.rx).toBeGreaterThan(0.2);
		expect(poses[315]!.rx).toBeLessThan(-0.2);
		for (let frame = 1; frame < poses.length; frame++) {
			const previous = poses[frame - 1]!;
			const current = poses[frame]!;
			expect(Math.abs(current.filmTime - previous.filmTime)).toBeLessThan(0.053);
			expect(Math.abs(current.rx - previous.rx)).toBeLessThan(0.008);
			expect(Math.abs(current.ry - previous.ry)).toBeLessThan(0.006);
		}
		// Animated films really move, then ease back to their exact start instead of cutting time at the seam.
		expect(poses[180]!.filmTime).toBeGreaterThan(5.99);
		expect(poses[1]!.filmTime).toBeLessThan(0.001);
		expect(poses[358]!.filmTime).toBeCloseTo(poses[1]!.filmTime, 12);
	});

	it('refuses an off-by-one frame rather than rendering a seventh-second sample', () => {
		for (const frame of [-1, 360, 0.5, NaN]) expect(() => videoPose(frame)).toThrow(RangeError);
	});

	it('checks every raw endpoint channel, including alpha, before an MP4 is returned', () => {
		const first = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
		expect(() => assertMatchingVideoEndpoints(first, first.slice())).not.toThrow();
		const last = first.slice();
		last[7] = 254;
		expect(() => assertMatchingVideoEndpoints(first, last)).toThrow('raw pixel channel 7 differs');
		expect(() => assertMatchingVideoEndpoints(first, last.subarray(0, 4))).toThrow('different pixel dimensions');
	});

	it('reports the browser capability requirement through the export API', async () => {
		await expect(exportLabVideo({ scene: sceneOf(START), front: null })).rejects.toThrow('WebCodecs H.264');
	});

	it('honours cancellation before mounting or importing browser rendering', async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(exportLabVideo({ scene: sceneOf(START), front: null, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
	});
});
