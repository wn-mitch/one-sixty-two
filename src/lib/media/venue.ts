import { compareId } from '../game/types.ts';
import type { AtmospherePhoto, MediaManifest } from './types.ts';

/** The ballpark photo printed on a franchise's stadium card: its first atmosphere photo by ID. */
export function venuePhoto(media: MediaManifest | null | undefined, franchiseId: string): AtmospherePhoto | null {
	if (!media) return null;
	return Object.values(media.atmosphere)
		.filter(candidate => candidate.franchiseId === franchiseId)
		.sort((a, b) => compareId(a.id, b.id))[0] ?? null;
}
