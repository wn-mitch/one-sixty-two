/** A stable 0..1 value for a string, so per-card rhythms survive re-renders. */
export function stableUnit(value: string, salt = 0): number {
	let hash = 2166136261 ^ salt;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) / 4294967296;
}
