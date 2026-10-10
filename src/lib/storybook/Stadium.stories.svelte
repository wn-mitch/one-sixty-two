<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import StadiumWorkshop from './StadiumWorkshop.svelte';
	const { Story } = defineMeta({
		title: 'Draft/Stadium', component: StadiumWorkshop,
		args: { initial: 'choosing' },
		// Real 2025 parks, so their real team colours and ballpark photos.
		parameters: { mediaState: 'runtime' },
		argTypes: { initial: { control: 'inline-radio', options: ['choosing', 'selected', 'busy'] } }
	});
</script>
<script lang="ts">
	import type { StadiumWorkshopProps } from './StadiumWorkshop.svelte';
</script>
{#snippet template(args: StadiumWorkshopProps)}<StadiumWorkshop {...args} />{/snippet}
<Story exportName="Choosing" args={{ initial: 'choosing' }} {template} />
<Story exportName="Selected" args={{ initial: 'selected' }} {template} />
<Story exportName="Busy" args={{ initial: 'busy' }} {template} />
