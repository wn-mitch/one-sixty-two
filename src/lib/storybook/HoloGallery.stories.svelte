<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import HoloGallery from './HoloGallery.svelte';

	const { Story } = defineMeta({
		title: 'Cards/Holo gallery',
		component: HoloGallery
	});
</script>

<Story exportName="AllFilms" name="All films" />
