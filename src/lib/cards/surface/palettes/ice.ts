import { definePalette } from '../films/film.ts';

/** Ice: cold whites, cyans and a hint of lilac. */
export default definePalette({ name: 'ice', glsl: 'return 0.72 + 0.28 * cos(6.28318 * (t + vec3(0.5, 0.15, 0.0)));' });
