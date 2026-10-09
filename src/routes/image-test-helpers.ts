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
