/** A child of an endpoint-normalized Gosper curve: z → start + axis * z (complex multiplication). */
export interface GosperChild {
	start: readonly [number, number];
	axis: readonly [number, number];
	kind: 0 | 1;
}

export const GOSPER_MAX_DETAIL = 8;
export const GOSPER_BOUND_RADIUS = 1;

const RULES = ['A-B--B+A++AA+B-', '+A-BB--B-A++A+B'] as const;
const H = Math.sqrt(3) / 2;
const DIRECTIONS = [[1, 0], [0.5, H], [-0.5, H], [-1, 0], [-0.5, -H], [0.5, -H]] as const;

// Both productions end at D = (5/2, -sqrt(3)/2), with their original heading.
// Dividing by D keeps every order's endpoints at 0 and 1, and contracts by 1/sqrt(7).
function divideByEndpoint(x: number, y: number): readonly [number, number] {
	return [(2.5 * x - H * y) / 7, (H * x + 2.5 * y) / 7];
}

/** Seven A children followed by seven B children; only these fourteen transforms enter the shader. */
export const GOSPER_CHILDREN: readonly GosperChild[] = RULES.flatMap(rule => {
	const children: GosperChild[] = [];
	let x = 0;
	let y = 0;
	let heading = 0;
	for (const symbol of rule) {
		if (symbol === '+') heading = (heading + 1) % 6;
		else if (symbol === '-') heading = (heading + 5) % 6;
		else {
			const [dx, dy] = DIRECTIONS[heading];
			children.push({ start: divideByEndpoint(x, y), axis: divideByEndpoint(dx, dy), kind: symbol === 'A' ? 0 : 1 });
			x += dx;
			y += dy;
		}
	}
	return children;
});

// The unit segment lies in the disk centred at 1/2 with radius 1. Each production's furthest
// child-disk centre is 3/(2*sqrt(7)) from 1/2, so its disk fits inside radius
// (3/2 + 1)/sqrt(7) < 1. Induction therefore bounds every finite descendant, not only its chord.
