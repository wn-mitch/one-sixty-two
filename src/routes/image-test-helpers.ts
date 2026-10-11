import { crc32, deflateSync } from 'node:zlib';
import type { Page } from '@playwright/test';

export interface ImagePixelDigest {
	width: number;
	height: number;
	sha256: string;
}

/** Compare displayed pixels when a browser or clipboard may re-encode the PNG. */
export async function imagePixelDigest(
	page: Page,
	source: { base64: string } | { url: string } | { clipboard: true }
): Promise<ImagePixelDigest> {
	return page.evaluate(async input => {
		let blob: Blob;
		if ('clipboard' in input) {
			const items = await navigator.clipboard.read();
			const item = items.find(candidate => candidate.types.includes('image/png'));
			if (!item) throw new Error('Clipboard has no PNG image');
			blob = await item.getType('image/png');
		} else {
			const response = await fetch('url' in input ? input.url : `data:image/png;base64,${input.base64}`);
			if (!response.ok) throw new Error(`PNG inspection request failed: ${response.status}`);
			blob = await response.blob();
		}
		const bitmap = await createImageBitmap(blob);
		try {
			const { width, height } = bitmap;
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext('2d', { willReadFrequently: true });
			if (!context) throw new Error('Canvas pixel inspection is unavailable');
			context.drawImage(bitmap, 0, 0);
			const pixels = context.getImageData(0, 0, width, height).data;
			const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', pixels));
			return { width, height, sha256: [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('') };
		} finally {
			bitmap.close();
		}
	}, source);
}

/** A valid single-colour RGB PNG, standing in for artwork a browser would capture. */
export function solidPng(width: number, height: number, rgb: [number, number, number] = [16, 64, 40]): Buffer {
	const chunk = (type: string, data: Buffer) => {
		const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
		const framed = Buffer.alloc(body.length + 8);
		framed.writeUInt32BE(data.length, 0);
		body.copy(framed, 4);
		framed.writeUInt32BE(crc32(body), body.length + 4);
		return framed;
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header.set([8, 2, 0, 0, 0], 8);
	const row = Buffer.alloc(1 + width * 3);
	for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3);
	const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
	return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', pixels), chunk('IEND', Buffer.alloc(0))]);
}
