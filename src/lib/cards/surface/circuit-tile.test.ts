import { describe, expect, it } from 'vitest';
import { growWires, rasterizeWires, type Wire } from './circuit-tile.ts';

const SIZE = 24;
const wrap = (value: number) => ((value % SIZE) + SIZE) % SIZE;
const key = (x: number, y: number) => `${wrap(x)},${wrap(y)}`;
/** One step of a wire, unwrapped across the tile's edge. */
const step = (a: readonly [number, number], b: readonly [number, number]) => {
	const delta = (from: number, to: number) => { const d = to - from; return Math.abs(d) > 1 ? d - Math.sign(d) * SIZE : d; };
	return [delta(a[0], b[0]), delta(a[1], b[1])] as const;
};

describe('circuit tile', () => {
	const wires = growWires(SIZE, 7);

	it('grows wires that never share a cell, move one cell at a time, and never cross diagonals', () => {
		const claimed = new Set<string>();
		const diagonals = new Set<string>();
		for (const wire of wires) {
			for (const [x, y] of wire) {
				expect(claimed.has(key(x, y))).toBe(false);
				claimed.add(key(x, y));
			}
			for (let i = 1; i < wire.length; i++) {
				const [dx, dy] = step(wire[i - 1]!, wire[i]!);
				expect(Math.max(Math.abs(dx), Math.abs(dy))).toBe(1);
				if (dx && dy) {
					// A diagonal is named by its square's top-left cell and its slant; the other slant across the same square crosses it.
					const [x, y] = wire[i - 1]!;
					const left = dx > 0 ? x : x - 1;
					const top = dy > 0 ? y : y - 1;
					const slant = dx === dy ? '\\' : '/';
					expect(diagonals.has(`${key(left, top)}${slant === '\\' ? '/' : '\\'}`)).toBe(false);
					diagonals.add(`${key(left, top)}${slant}`);
				}
			}
		}
	});

	it('runs long, mostly straight wires that fill most of the board', () => {
		const cells = wires.reduce((sum, wire) => sum + wire.length, 0);
		expect(cells / (SIZE * SIZE)).toBeGreaterThan(0.6);
		const lengths = wires.map(wire => wire.length).sort((a, b) => a - b);
		expect(lengths[Math.floor(lengths.length / 2)]!).toBeGreaterThanOrEqual(5);
		let straight = 0;
		let steps = 0;
		for (const wire of wires) for (let i = 2; i < wire.length; i++) {
			const a = step(wire[i - 2]!, wire[i - 1]!);
			const b = step(wire[i - 1]!, wire[i]!);
			steps++;
			if (a[0] === b[0] && a[1] === b[1]) straight++;
		}
		expect(straight / steps).toBeGreaterThan(0.55);
	});

	it('rasterizes without a seam: shifting every wire by a cell only rolls the texture', () => {
		const perCell = 4;
		const side = SIZE * perCell;
		const shifted: Wire[] = wires.map(wire => wire.map(([x, y]) => [wrap(x + 1), wrap(y + 1)] as const));
		const original = rasterizeWires(wires, SIZE, perCell);
		const rolled = rasterizeWires(shifted, SIZE, perCell);
		let mismatches = 0;
		for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
			const from = (y * side + x) * 4;
			const to = (((y + perCell) % side) * side + ((x + perCell) % side)) * 4;
			if (Math.abs(original[from]! - rolled[to]!) > 1 || Math.abs(original[from + 1]! - rolled[to + 1]!) > 1) mismatches++;
		}
		expect(mismatches).toBe(0);
		// Traces actually reach the texture.
		expect(original.filter((_, index) => index % 4 === 0).filter(value => value > 200).length).toBeGreaterThan(side * side * 0.04);
	});
});
