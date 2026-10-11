import { SvelteMap } from 'svelte/reactivity';
import type { PlacedSticker } from './stickers.ts';

/**
 * The stickers card faces show, keyed by player-season. The application fills it from the device
 * database; workshop stories set fixtures. Cards never wait on it: an unloaded store shows no stickers.
 */
const stickers = new SvelteMap<string, readonly PlacedSticker[]>();

export function cardStickers(seasonId: string | undefined): readonly PlacedSticker[] {
 return seasonId ? stickers.get(seasonId) ?? [] : [];
}

export function replaceStickers(next: ReadonlyMap<string, readonly PlacedSticker[]>): void {
 for (const key of [...stickers.keys()]) if (!next.has(key)) stickers.delete(key);
 for (const [key, value] of next) stickers.set(key, value);
}

/** Reloads every card's stickers from the device database; failures leave the faces as they were. */
export async function refreshStickers(): Promise<void> {
 try {
  const [{ deviceDb }, { loadStickers }] = await Promise.all([import('../storage/db.ts'), import('./collection.ts')]);
  replaceStickers(await loadStickers((await deviceDb()).db));
 } catch { /* stickers are decoration; blocked storage shows none */ }
}
