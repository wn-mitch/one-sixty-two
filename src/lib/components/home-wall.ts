import type { CardEra } from '../cards/view-model.ts';

interface WallIdentity {
	playerId: string;
	model: { era: CardEra };
}

/** Neighboring rows use disjoint eras, so independent drift cannot create a matching border. */
export function arrangeHomeWall<T extends WallIdentity>(cards: readonly T[], rowCount: 3 | 4): T[][] {
	const players = new Set<string>();
	const eras = new Map<CardEra, T[]>();
	for (const card of cards) {
		if (players.has(card.playerId)) continue;
		players.add(card.playerId);
		const bucket = eras.get(card.model.era);
		if (bucket) bucket.push(card);
		else eras.set(card.model.era, [card]);
	}

	const rows: T[][] = Array.from({ length: rowCount }, () => []);
	for (const [era, bucket] of [...eras].sort(([left], [right]) => left.localeCompare(right))) {
		const parity = ((Number.parseInt(era, 10) - 1950) / 10) % 2;
		for (const card of bucket) {
			let target = parity;
			for (let row = parity + 2; row < rowCount; row += 2) {
				if (rows[row]!.length < rows[target]!.length) target = row;
			}
			rows[target]!.push(card);
		}
	}
	return rows.map(separateEras);
}

function separateEras<T extends WallIdentity>(cards: readonly T[]): T[] {
	const eras = new Map<CardEra, T[]>();
	for (const card of cards) {
		const bucket = eras.get(card.model.era);
		if (bucket) bucket.push(card);
		else eras.set(card.model.era, [card]);
	}
	const groups = [...eras.values()].sort((left, right) => right.length - left.length);
	if (groups.length < 2) return [];

	// A circular row needs at least one different-era card between every pair.
	// Keep the available alternatives rather than repeating a player to fill a gap.
	const alternatives = cards.length - groups[0]!.length;
	groups[0]!.length = Math.min(groups[0]!.length, alternatives);
	const count = groups.reduce((total, group) => total + group.length, 0);
	const result = new Array<T>(count);
	let index = 0;
	for (const group of groups) {
		for (const card of group) {
			result[index] = card;
			index += 2;
			if (index >= count) index = 1;
		}
	}
	return result;
}
