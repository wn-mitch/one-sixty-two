<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SurfaceWorkshop from './SurfaceWorkshop.svelte';

	const { Story } = defineMeta({
		title: 'Cards/Surface',
		component: SurfaceWorkshop,
		args: { era: '1990s', finish: 'emboss', width: 300 }
	});
</script>

<Story exportName="NameRelief" name="Name relief" />
<Story exportName="GemNames" name="Gem names" args={{ finish: 'gem', era: '2010s' }} />
