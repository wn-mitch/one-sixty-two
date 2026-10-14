/**
 * The circuit holo film's trace layout: wires grown cell by cell on a grid that wraps at its edges, so the
 * tile repeats seamlessly. Each wire starts at a random free cell and walks mostly straight, turning 45
 * degrees now and then, until it runs out of length or room; wires never share a cell or cross diagonals,
 * and each ends in a drilled pad. A shader cannot grow wires per pixel, so the layout is rasterized once
 * into a texture the film samples.
 */

/** Cells along each side of the tile. */
export const CIRCUIT_CELLS = 64;
/** Texels per cell. */
export const CIRCUIT_TEXELS_PER_CELL = 8;
/** Distances in the texture saturate at this many cells. */
export const CIRCUIT_RANGE = 0.5;

// 0:up-left 1:up 2:up-right 3:right 4:down-right 5:down 6:down-left 7:left
const DIRS: readonly (readonly [number, number])[] = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];

/** A wire as the cells it passes through, in order. */
export type Wire = readonly (readonly [number, number])[];

function random(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const wrap = (value: number, size: number) => ((value % size) + size) % size;

/** Grows the tile's wires. Wires of two cells or fewer still claim their cells but are not drawn. */
export function growWires(size = CIRCUIT_CELLS, seed = 162): Wire[] {
	const rnd = random(seed);
	const free = new Uint8Array(size * size).fill(1);
	const isFree = (x: number, y: number) => free[wrap(y, size) * size + wrap(x, size)] === 1;
	const claim = (x: number, y: number) => { free[wrap(y, size) * size + wrap(x, size)] = 0; };
	// A diagonal step may not cut through another wire's diagonal across the same square.
	const validDiagonal = (dir: number, x: number, y: number) => {
		if (dir === 0) return isFree(x + 1, y) || isFree(x, y + 1);
		if (dir === 2) return isFree(x - 1, y) || isFree(x, y + 1);
		if (dir === 4) return isFree(x - 1, y) || isFree(x, y - 1);
		if (dir === 6) return isFree(x + 1, y) || isFree(x, y - 1);
		return true;
	};
	const order = Array.from({ length: size * size }, (_, index) => index);
	for (let i = order.length - 1; i > 0; i--) {
		const j = Math.floor(rnd() * (i + 1));
		[order[i], order[j]] = [order[j]!, order[i]!];
	}
	const wires: Wire[] = [];
	for (const start of order) {
		if (!free[start]) continue;
		free[start] = 0;
		let x = start % size;
		let y = Math.floor(start / size);
		const cells: [number, number][] = [[x, y]];
		let heading = Math.floor(rnd() * 8);
		// Lengths vary so long buses and short stubs mix.
		const length = 6 + Math.floor(rnd() * rnd() * 30);
		while (cells.length < length) {
			// Straight on is by far the likeliest; a 45 degree turn either way otherwise.
			const turns = rnd() < 0.5 ? [0, 1, -1] : [0, -1, 1];
			let moved = false;
			while (turns.length && !moved) {
				const turn = turns.splice(Math.floor(rnd() ** 7 * turns.length), 1)[0]!;
				const dir = wrap(heading + turn, 8);
				const nx = x + DIRS[dir]![0];
				const ny = y + DIRS[dir]![1];
				if (isFree(nx, ny) && validDiagonal(dir, nx, ny)) {
					claim(nx, ny);
					cells.push([nx, ny]);
					x = nx;
					y = ny;
					heading = dir;
					moved = true;
				}
			}
			if (!moved) break;
		}
		if (cells.length > 2) wires.push(cells);
	}
	return wires;
}

/**
 * Rasterizes wires into RGBA texels: R is closeness to the nearest trace, G closeness to the nearest pad
 * centre (both 1 on the line, 0 from CIRCUIT_RANGE cells away), B the trace's direction class (across,
 * down-right, down, up-right) and A a per-wire seed. Cell coordinates are unwrapped along each wire, and
 * texels wrap, so the tile repeats without seams.
 */
export function rasterizeWires(wires: readonly Wire[], size = CIRCUIT_CELLS, perCell = CIRCUIT_TEXELS_PER_CELL): Uint8Array<ArrayBuffer> {
	const side = size * perCell;
	const trace = new Float32Array(side * side).fill(CIRCUIT_RANGE);
	const pad = new Float32Array(side * side).fill(CIRCUIT_RANGE);
	const data = new Uint8Array(side * side * 4);
	const reach = CIRCUIT_RANGE * perCell;
	const visit = (cx: number, cy: number, extent: number, each: (index: number, px: number, py: number) => void) => {
		for (let ty = Math.floor((cy - extent) * perCell - reach); ty <= Math.ceil((cy + extent) * perCell + reach); ty++) {
			for (let tx = Math.floor((cx - extent) * perCell - reach); tx <= Math.ceil((cx + extent) * perCell + reach); tx++) {
				each(wrap(ty, side) * side + wrap(tx, side), (tx + 0.5) / perCell, (ty + 0.5) / perCell);
			}
		}
	};
	wires.forEach((wire, number) => {
		const seed = Math.floor(random(number * 7919 + 1)() * 255);
		// Unwrap the path so a wire crossing the tile's edge stays one continuous line.
		const path: [number, number][] = [[wire[0]![0] + 0.5, wire[0]![1] + 0.5]];
		for (let i = 1; i < wire.length; i++) {
			const [px, py] = path[i - 1]!;
			let dx = wire[i]![0] - wire[i - 1]![0];
			let dy = wire[i]![1] - wire[i - 1]![1];
			if (Math.abs(dx) > 1) dx -= Math.sign(dx) * size;
			if (Math.abs(dy) > 1) dy -= Math.sign(dy) * size;
			path.push([px + dx, py + dy]);
		}
		for (let i = 1; i < path.length; i++) {
			const [ax, ay] = path[i - 1]!;
			const [bx, by] = path[i]!;
			const dx = bx - ax;
			const dy = by - ay;
			const direction = dy === 0 ? 0 : dx === 0 ? 2 : dx === dy ? 1 : 3;
			const lengthSquared = dx * dx + dy * dy;
			visit((ax + bx) / 2, (ay + by) / 2, 0.75, (index, px, py) => {
				const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
				const distance = Math.hypot(px - ax - dx * t, py - ay - dy * t);
				if (distance >= trace[index]!) return;
				trace[index] = distance;
				data[index * 4 + 2] = Math.round(((direction + 0.5) / 4) * 255);
				data[index * 4 + 3] = seed;
			});
		}
		for (const [ex, ey] of [path[0]!, path[path.length - 1]!]) {
			visit(ex, ey, 0, (index, px, py) => {
				pad[index] = Math.min(pad[index]!, Math.hypot(px - ex, py - ey));
			});
		}
	});
	for (let index = 0; index < side * side; index++) {
		data[index * 4] = Math.round((1 - trace[index]! / CIRCUIT_RANGE) * 255);
		data[index * 4 + 1] = Math.round((1 - pad[index]! / CIRCUIT_RANGE) * 255);
	}
	return data;
}
