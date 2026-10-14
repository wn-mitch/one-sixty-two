import { definePlate } from './plate.ts';

/** Brushed: plain brushed grain, drawn by the light pass itself, with no pattern pressed into the metal. */
export default definePlate({
	name: 'brushed',
	feature: 0.2,
	params: {}
});
