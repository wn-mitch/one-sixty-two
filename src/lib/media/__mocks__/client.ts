import { loadMedia as realLoadMedia } from '../client.ts';
import type { MediaManifest } from '../types.ts';

export * from '../client.ts';

let loader = realLoadMedia;

// Keep media selectors uninstrumented: each call receives the complete runtime index.
export function loadMedia(): Promise<MediaManifest> {
	return loader();
}

export function setMediaLoader(override?: () => Promise<MediaManifest>): void {
	loader = override ?? realLoadMedia;
}
