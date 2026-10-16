import { expect, it } from 'vitest';
import { photoPixelHash, type PixelGeometry } from '../../../scripts/media/framing-pixels.ts';

const geometry: PixelGeometry = { mask: { x: 1, y: 1, width: 2, height: 2 }, shape: 'rounded', labels: [], ignoredInk: [] };
const tile = { x: 0, y: 0, width: 4, height: 4 };

it('compares actual photo and overlaid artwork pixels while excluding statistics outside the mask', () => {
	const original = Buffer.alloc(4 * 4 * 4, 120);
	const statsChanged = Buffer.from(original);
	statsChanged[0] = 0;
	expect(photoPixelHash(original, 4, tile, geometry)).toBe(photoPixelHash(statsChanged, 4, tile, geometry));
	const faceOrLogoChanged = Buffer.from(original);
	faceOrLogoChanged[(1 * 4 + 1) * 4] = 0;
	expect(photoPixelHash(original, 4, tile, geometry)).not.toBe(photoPixelHash(faceOrLogoChanged, 4, tile, geometry));
});

it('does not accept different mask geometry or label obstruction despite equal sampled pixels', () => {
	const pixels = Buffer.alloc(64, 120);
	const largerLabel = { ...geometry, labels: [{ layer: 'season.tab', rect: { x: 1, y: 1, width: 2, height: 1 }, shape: 'opaque' }] };
	expect(photoPixelHash(pixels, 4, tile, geometry)).not.toBe(photoPixelHash(pixels, 4, tile, largerLabel));
	expect(photoPixelHash(pixels, 4, tile, geometry)).not.toBe(photoPixelHash(pixels, 4, tile, { ...geometry, shape: 'square' }));
});

it('rejects screenshot bounds errors instead of hashing truncated pixel evidence', () => {
	expect(() => photoPixelHash(Buffer.alloc(64), 4, { ...tile, x: 4 }, geometry)).toThrow('outside screenshot');
});
