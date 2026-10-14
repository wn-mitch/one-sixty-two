import { definePalette } from '../films/film.ts';

/** Gold leaf: warm golds from deep amber to pale champagne, with no blue at all. */
export default definePalette({ name: 'gold-leaf', glsl: 'float x = 0.5 + 0.5 * cos(6.28318 * t); return mix(vec3(0.55, 0.32, 0.08), vec3(1.0, 0.93, 0.7), x);' });
