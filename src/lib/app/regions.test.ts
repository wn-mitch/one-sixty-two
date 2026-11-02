import { describe, expect, it } from 'vitest';
import { verticalFold, type HostRegion, type HostRegions } from './regions.svelte.ts';

// Geometry the iPhone Duo simulator reports with the device open, in landscape and rotated to portrait.
const fold = (overrides: Partial<HostRegion> = {}): HostRegion => ({ kind: 'division', active: false, x: 455.5, y: 0, width: 40, height: 669, margins: [0, 20, 0, 20], ...overrides });
const open = (regions: HostRegion[]): HostRegions => ({ width: 867, height: 635, regions });

describe('verticalFold', () => {
	it('splits at the reported band whether the device is fully open or partly folded', () => {
		expect(verticalFold(open([fold()]))).toEqual({ start: 455.5, end: 495.5, active: false });
		expect(verticalFold(open([fold({ active: true })]))?.active).toBe(true);
	});

	it('ignores the camera occlusion and a closed display without a fold', () => {
		const camera: HostRegion = { kind: 'occlusion', active: false, x: 677, y: 21, width: 58, height: 37, margins: [0, 0, 0, 0] };
		expect(verticalFold(open([camera]))).toBeNull();
		expect(verticalFold({ width: 382, height: 644, regions: [] })).toBeNull();
		expect(verticalFold(null)).toBeNull();
	});

	it('keeps one layout when the fold runs across the display', () => {
		expect(verticalFold({ width: 669, height: 867, regions: [fold({ x: 0, y: 455.5, width: 669, height: 40 })] })).toBeNull();
	});

	it('refuses a split that leaves either pane too narrow', () => {
		expect(verticalFold(open([fold({ x: 300 })]))).toBeNull();
		expect(verticalFold(open([fold({ x: 520 })]))).toBeNull();
	});
});
