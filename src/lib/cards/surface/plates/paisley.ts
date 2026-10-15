import { botehGlsl } from '../films/paisley.ts';
import { definePlate } from './plate.ts';

/**
 * Paisley: embossed, interlocking boteh teardrops in brick-laid rows. Each outline and inner ring stands as a rounded
 * ridge with domed beads and an eye inside; the oversized motifs overlap, so the entire foil is sculpted rather than
 * leaving a pressed-down ground between isolated shapes.
 */
export default definePlate({
	name: 'paisley',
	feature: 0.075,
	gain: 0.75,
	params: {
		density: { value: 1.0, min: 0.3, max: 4, step: 0.01, note: 'Botehs per card unit; higher packs more, smaller motifs.' },
		size: { value: 1.92, min: 1.35, max: 2.4, step: 0.01, note: 'Size of each boteh against its cell; higher overlaps the tessellation more.' },
		pitch: { value: 0.55, min: 0.4, max: 0.9, step: 0.01, note: 'Distance between rows against the spacing along a row; lower nests the rows more tightly.' },
		tail: { value: 0.72, min: 0.32, max: 0.9, step: 0.01, note: 'How far the tail reaches past the bulb.' },
		curl: { value: 1.75, min: 0, max: 3, step: 0.01, note: 'How far the tail hooks over at its tip, in radians.' },
		outline: { value: 0.045, min: 0.005, max: 0.08, step: 0.001, note: 'Width of the raised outline and rings.' },
		rings: { value: 1, min: 0, max: 4, step: 1, note: 'Inner outlines echoing the teardrop inside each boteh.' },
		dots: { value: 12, min: 0, max: 32, step: 1, note: 'Domed dots round the outer band of each boteh; 0 leaves them out.' },
		tilt: { value: 0.2, min: -3.14159, max: 3.14159, step: 0.01, note: 'Turn of every boteh, in radians.' },
		jitter: { value: 0.12, min: 0, max: 3.14159, step: 0.01, note: 'Random turn of each boteh, in radians.' }
	},
	helpers: `${botehGlsl('paisleyPlate')}
// The embossed paisley's height at q (cell units): rounded ridges on the outlines and rings, domed dots and eye, and
// a shallow relief following every overlapping boteh.
float paisleyPlateHeight(vec2 q, float size, float pitch, float tail, float curl, float outline, float rings, float dots, float tilt, float jitter) {
	vec4 frame;
	float d = paisleyPlateNearest(q, size, pitch, tail, curl, tilt, jitter, frame);
	vec3 lines = paisleyPlateLines(frame.xy, d, size, rings, dots);
	float across = clamp(lines.x / outline, 0.0, 1.0);
	float ridge = sqrt(1.0 - across * across);
	float bead = sqrt(clamp(-lines.y / outline, 0.0, 1.0));
	float woven = 0.2 + 0.2 * smoothstep(0.28 * size, -0.16 * size, d);
	return max(max(ridge, bead), woven);
}
`,
	height: `
	return paisleyPlateHeight(p * density, size, pitch, tail, curl, outline, rings, dots, tilt, jitter) * 0.22 / density;
`
});
