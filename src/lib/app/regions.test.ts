import { describe, expect, it } from 'vitest';
import { edgeOcclusions, verticalFold, type HostRegion, type HostRegions } from './regions.svelte.ts';

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

// Geometry the iPhone Duo simulator reports on the closed outer display: the time and Wi-Fi block against the right edge, the camera inside it.
const occlusion = (overrides: Partial<HostRegion> = {}): HostRegion => ({ kind: 'occlusion', active: true, x: 382, y: 0, width: 84, height: 174, margins: [0, 0, 0, 0], ...overrides });
const outer = (regions: HostRegion[]): HostRegions => ({ width: 466, height: 644, regions });

describe('edgeOcclusions', () => {
	it('keeps the status block against the right edge and drops the camera inside it', () => {
		const camera = occlusion({ x: 399.67, y: 29.33, width: 37, height: 37 });
		expect(edgeOcclusions(outer([camera, occlusion()]))).toEqual([{ side: 'right', x: 382, y: 0, width: 84, height: 174, top: true }]);
	});

	it('finds a block against the left edge away from the top', () => {
		expect(edgeOcclusions(outer([occlusion({ x: 0, y: 470 })]))).toEqual([{ side: 'left', x: 0, y: 470, width: 84, height: 174, top: false }]);
	});

	it('ignores inactive, full-height and full-width occlusions, folds, and the website', () => {
		expect(edgeOcclusions(outer([occlusion({ active: false })]))).toEqual([]);
		expect(edgeOcclusions(outer([occlusion({ height: 644 })]))).toEqual([]);
		expect(edgeOcclusions(outer([occlusion({ x: 0, width: 466, height: 30 })]))).toEqual([]);
		expect(edgeOcclusions(outer([occlusion({ kind: 'division' })]))).toEqual([]);
		expect(edgeOcclusions(null)).toEqual([]);
	});
});
