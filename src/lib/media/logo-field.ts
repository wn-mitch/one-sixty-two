/**
 * The field of a team mark: the solid colour its artwork is printed on, read from the image border.
 * Marks drawn on transparency, roundels, and art that runs off the edge have no field.
 */

/** Share of border samples that must be opaque and agree with the median colour. */
const AGREEMENT = .85;
/** Largest per-channel distance from the median that still counts as the same ink. */
const TOLERANCE = 24;
/** Border samples sit this far inside the edge, past resampling fringes. */
const INSET = 2;

/** Returns `rgb(r g b)` for a uniform opaque border in RGBA pixel data, otherwise null. */
export function fieldColor(data: ArrayLike<number>, width: number, height: number): string | null {
	if (width <= INSET * 2 || height <= INSET * 2) return null;
	const samples: [number, number, number][] = [];
	let total = 0;
	const take = (x: number, y: number) => {
		total += 1;
		const i = (y * width + x) * 4;
		if (data[i + 3]! >= 250) samples.push([data[i]!, data[i + 1]!, data[i + 2]!]);
	};
	for (let x = INSET; x < width - INSET; x++) { take(x, INSET); take(x, height - 1 - INSET); }
	for (let y = INSET + 1; y < height - 1 - INSET; y++) { take(INSET, y); take(width - 1 - INSET, y); }
	if (samples.length < total * AGREEMENT) return null;
	const median = [0, 1, 2].map(channel => samples.map(sample => sample[channel]!).sort((a, b) => a - b)[samples.length >> 1]!);
	const agreeing = samples.filter(sample => sample.every((value, channel) => Math.abs(value - median[channel]!) <= TOLERANCE)).length;
	return agreeing >= total * AGREEMENT ? `rgb(${median.join(' ')})` : null;
}

const fields = new Map<string, Promise<string | null>>();

/** Reads the field of a same-origin mark once per URL; failures resolve to null. */
export function logoField(url: string): Promise<string | null> {
	let field = fields.get(url);
	if (!field) {
		field = new Promise<string | null>(resolve => {
			const image = new Image();
			image.decoding = 'async';
			image.onload = () => {
				try {
					const canvas = document.createElement('canvas');
					canvas.width = image.naturalWidth;
					canvas.height = image.naturalHeight;
					const context = canvas.getContext('2d', { willReadFrequently: true });
					if (!context) return resolve(null);
					context.drawImage(image, 0, 0);
					resolve(fieldColor(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height));
				} catch {
					resolve(null);
				}
			};
			image.onerror = () => resolve(null);
			image.src = url;
		});
		fields.set(url, field);
	}
	return field;
}
