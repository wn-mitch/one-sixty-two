import { definePalette } from '../films/film.ts';

/** Rainbow: the full spectrum a diffraction grating splits white light into. */
export default definePalette({ name: 'rainbow', glsl: 'return 0.55 + 0.45 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));' });
