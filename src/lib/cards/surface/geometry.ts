/**
 * Maps an element inside a card to the card's own untransformed coordinates. Layout offsets ignore
 * transforms, so this holds wherever the card sits on the page, including the rotated home wall.
 */

/** The element's border-box origin within `root`, before any transforms; null when it has no layout box. */
export function layoutOffset(element: HTMLElement, root: HTMLElement): { x: number; y: number } | null {
	let x = 0;
	let y = 0;
	let node: HTMLElement = element;
	while (node !== root) {
		const parent = node.offsetParent as HTMLElement | null;
		if (!parent || !root.contains(parent)) return null;
		x += node.offsetLeft;
		y += node.offsetTop;
		// Offsets are measured from the offset parent's padding edge.
		if (parent !== root) {
			x += parent.clientLeft;
			y += parent.clientTop;
		}
		node = parent;
	}
	return { x, y };
}

function angle(value: string): number {
	const match = /^(-?[\d.]+)(deg|rad|turn|grad)$/.exec(value.trim());
	if (!match) return 0;
	const amount = Number(match[1]);
	switch (match[2]) {
		case 'rad': return amount * 180 / Math.PI;
		case 'turn': return amount * 360;
		case 'grad': return amount * 0.9;
		default: return amount;
	}
}

function length(value: string | undefined, basis: number): number {
	if (!value) return 0;
	if (value.endsWith('%')) return Number.parseFloat(value) / 100 * basis;
	const number = Number.parseFloat(value);
	return Number.isFinite(number) ? number : 0;
}

/** The element's own transform about its origin, combining `translate`, `rotate`, `scale` and `transform` in CSS order. */
export function ownTransform(style: CSSStyleDeclaration, width: number, height: number): DOMMatrix {
	const matrix = new DOMMatrix();
	if (style.translate && style.translate !== 'none') {
		const [tx, ty] = style.translate.split(/\s+/);
		matrix.translateSelf(length(tx, width), length(ty, height));
	}
	if (style.rotate && style.rotate !== 'none') {
		// Only rotation about the view axis is meaningful on a flat card.
		const parts = style.rotate.split(/\s+/);
		matrix.rotateSelf(angle(parts[parts.length - 1]!));
	}
	if (style.scale && style.scale !== 'none') {
		const [sx, sy] = style.scale.split(/\s+/).map(Number);
		matrix.scaleSelf(sx ?? 1, sy ?? sx ?? 1);
	}
	if (style.transform && style.transform !== 'none') {
		const own = new DOMMatrix(style.transform);
		// Depth translations order the finish layers; on the map they collapse onto the card plane.
		matrix.multiplySelf(own.is2D ? own : DOMMatrix.fromMatrix({ a: own.a, b: own.b, c: own.c, d: own.d, e: own.e, f: own.f }));
	}
	return matrix;
}

/** Maps the element's border-box coordinates to `root` coordinates, or null when any part of the chain has no layout box. */
export function elementToRoot(element: HTMLElement, root: HTMLElement): DOMMatrix | null {
	const chain: HTMLElement[] = [];
	for (let node: HTMLElement | null = element; node && node !== root; node = node.parentElement) chain.push(node);
	let matrix = new DOMMatrix();
	// Outermost first, so each inner transform applies inside its ancestors'.
	for (let index = chain.length - 1; index >= 0; index -= 1) {
		const node = chain[index]!;
		const style = getComputedStyle(node);
		if (style.display === 'contents') continue;
		const offset = layoutOffset(node, root);
		if (!offset) return null;
		const own = ownTransform(style, node.offsetWidth, node.offsetHeight);
		if (own.isIdentity) continue;
		const [ox, oy] = style.transformOrigin.split(/\s+/).map(value => Number.parseFloat(value) || 0);
		matrix = matrix
			.translate(offset.x + ox!, offset.y + oy!)
			.multiply(own)
			.translate(-offset.x - ox!, -offset.y - oy!);
	}
	const offset = layoutOffset(element, root);
	return offset ? matrix.translate(offset.x, offset.y) : null;
}
