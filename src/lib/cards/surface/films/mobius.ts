import { defineFilm } from './film.ts';

/**
 * Möbius: a gallery hung inside itself, the way Escher's Print Gallery twists the plane through a complex
 * logarithm. Square gilt frames nest one inside the next, the nesting twisted into a spiral so one turn around
 * the centre steps one frame deeper, and the whole gallery keeps zooming in on itself.
 */
export default defineFilm({
	name: 'mobius',
	animated: true,
	ground: 0.62,
	params: {
		span: { value: 8, min: 1, max: 40, step: 0.1, note: 'Card units the gallery spans out from the centre; higher shows fewer, larger frames.' },
		levelStep: { value: 1.0986, min: 0.2, max: 3, step: 0.0001, note: 'Log of how much larger each frame is than the one inside it; 1.0986 is three times.' },
		turns: { value: 1, min: -4, max: 4, step: 0.05, note: 'Frames stepped deeper per turn around the centre; 0 makes plain nested rings.' },
		shear: { value: 2.2, min: -6, max: 6, step: 0.05, note: 'How far the panels curve with depth, bending the frames into the spiral.' },
		speed: { value: 0.06, min: -1, max: 1, step: 0.01, note: 'How fast the gallery zooms in on itself; below 0 it zooms out.' },
		panels: { value: 8, min: 1, max: 32, step: 1, note: 'Paintings around each turn.' }
	},
	glsl: `
	vec2 z = (p - v_view.zw - CARD * 0.5) / (span / filmScale);
	float twist = levelStep * turns / 6.28318;
	float angle = atan(z.y, z.x);
	// Square rings, so the frames read as frames rather than circles.
	float squareRadius = max(max(abs(z.x), abs(z.y)), 1e-4);
	// A conformal twist mixes both log-polar axes: depth shears with the angle and the angle with depth,
	// so the frames curve into the spiral instead of only stepping along it.
	float logRadius = log(squareRadius);
	float depth = logRadius - twist * angle - u_time * speed;
	float turned = angle + twist * shear * logRadius;
	float level = floor(depth / levelStep);
	float within = depth - level * levelStep;
	// Frames at the edge of each level and halfway in, and between the eight panels around a turn.
	float scaleHere = squareRadius;
	float ring = min(min(within, levelStep - within), abs(within - levelStep * 0.5)) * scaleHere;
	float sector = 6.28318 / panels;
	float spoke = abs(mod(turned + sector * 0.5, sector) - sector * 0.5) * scaleHere;
	float frame = smoothstep(0.045, 0.025, min(ring, spoke * 0.8));
	cellSize = 0.12 * scaleHere;
	vec2 panel = vec2(level * 2.0 + step(levelStep * 0.5, within), floor((turned + 3.14159) / sector));
	// Each panel is a painting: its own colour, with brushwork texture across it.
	float paint = noise(vec2(within * 9.0, turned * 6.0) + panel * 7.3);
	vec2 radial = normalize(z + 1e-4);
	groove = normalize(mix(vec2(radial.y, -radial.x) * (paint - 0.5) * 2.0 + radial * 0.4, radial, frame) + 1e-4);
	seed = mix(hash(panel) + paint * 0.25, 0.08, frame);
	vivid = mix(0.75, 0.35, frame);
	copper = mix(0.55, 0.0, frame);
	copperPad = frame;
`
});
