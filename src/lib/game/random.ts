export function mulberry32(seed: number): () => number {
 let state = seed >>> 0;
 return () => {
  state = (state + 0x6D2B79F5) >>> 0;
  let value = Math.imul(state ^ (state >>> 15), state | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
 };
}
export function streamSeed(seed: number, stream: string): number {
 let hash = 2166136261;
 for (const char of `${seed}:${stream}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
 return hash;
}
export const randomStream = (seed: number, stream: string) => mulberry32(streamSeed(seed, stream));
/** Per-game streams named `game:{n}:pa|contact|fielding|advancement`. */
export function gameRandomStreams(seed: number, gameNumber: number): { pa: () => number; contact: () => number; fielding: () => number; advancement: () => number } {
 return {
  pa: randomStream(seed, `game:${gameNumber}:pa`),
  contact: randomStream(seed, `game:${gameNumber}:contact`),
  fielding: randomStream(seed, `game:${gameNumber}:fielding`),
  advancement: randomStream(seed, `game:${gameNumber}:advancement`)
 };
}
export function newSeed(): number { return crypto.getRandomValues(new Uint32Array(1))[0]; }
export function shuffle<T>(items: T[], random: () => number): T[] {
 for (let i = items.length - 1; i > 0; i--) {
  const j = Math.floor(random() * (i + 1));
  [items[i], items[j]] = [items[j], items[i]];
 }
 return items;
}
