<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import FoilGallery from './FoilGallery.svelte';

	const { Story } = defineMeta({
		title: 'Cards/Foil gallery',
		component: FoilGallery
	});
</script>

<Story exportName="AllPlates" name="All plates" />
