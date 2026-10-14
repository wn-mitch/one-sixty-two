import { definePalette } from '../films/film.ts';

/** Aurora: greens and teals that fade into violet. */
export default definePalette({ name: 'aurora', glsl: 'return 0.5 + 0.5 * cos(6.28318 * (t * vec3(0.8, 0.6, 1.0) + vec3(0.55, 0.0, 0.25))) * vec3(0.6, 1.0, 0.9);' });
