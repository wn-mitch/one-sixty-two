import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CSS_MOTION } from './motion-timing.ts';

const layout = readFileSync(new URL('../routes/layout.css', import.meta.url), 'utf8');
const declared = (name: string) => layout.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();

describe('motion timing', () => {
	it('keeps the CSS custom properties equal to the shared constants', () => {
		for (const [name, value] of Object.entries(CSS_MOTION)) expect(declared(name), name).toBe(value);
	});
});
