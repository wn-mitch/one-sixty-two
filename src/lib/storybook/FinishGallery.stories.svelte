<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import FinishGallery from './FinishGallery.svelte';
	import { HOLO_PATTERNS } from '#lib/cards/surface/holo-films.ts';
	import { FOIL_PLATES } from '#lib/cards/surface/foil-plates.ts';

	const { Story } = defineMeta({
		title: 'Cards/Finish gallery',
		component: FinishGallery,
		// Real photos, marks and team colours from the prepared media index.
		parameters: { mediaState: 'runtime' },
		// Declared options let links carry the string settings, which Storybook otherwise ignores in URL args.
		argTypes: {
			nameProfile: { control: 'select', options: ['pillow', 'groove', 'etched'] },
			markFoil: { control: 'select', options: ['off', 'foil', 'emboss', 'gem'] },
			holoPattern: { control: 'select', options: ['era', ...HOLO_PATTERNS] },
			foilPlate: { control: 'select', options: ['era', ...FOIL_PLATES] }
		}
	});
</script>

<Story exportName="AllEras" name="All eras" />
