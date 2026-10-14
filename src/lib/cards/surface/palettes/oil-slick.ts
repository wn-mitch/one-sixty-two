import { definePalette } from '../films/film.ts';

/** Oil slick: thin-film interference, magenta and teal through bronze and deep blue. */
export default definePalette({ name: 'oil-slick', glsl: 'return 0.5 + 0.5 * cos(6.28318 * (t * vec3(1.0, 1.1, 0.9) + vec3(0.85, 0.35, 0.55)));' });
