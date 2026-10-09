<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import MediaWorkshop from './MediaWorkshop.svelte';
	const { Story } = defineMeta({
		title: 'Media/States', component: MediaWorkshop,
		args: { mode: 'ready', credits: false },
		argTypes: {
			mode: { control: 'select', options: ['ready', 'loading', 'missing', 'unavailable', 'brokenImage'] },
			credits: { control: 'boolean' }
		}
	});
</script>
<script lang="ts">
	import type { MediaWorkshopProps } from './MediaWorkshop.svelte';
</script>
{#snippet template(args: MediaWorkshopProps)}<MediaWorkshop {...args} />{/snippet}
<Story exportName="Ready" args={{ mode: 'ready' }} {template} />
<Story exportName="Loading" args={{ mode: 'loading' }} parameters={{ mediaState: 'loading' }} {template} />
<Story exportName="Missing" args={{ mode: 'missing' }} parameters={{ mediaState: 'missing' }} {template} />
<Story exportName="Unavailable" args={{ mode: 'unavailable' }} parameters={{ mediaState: 'unavailable' }} {template} />
<Story exportName="BrokenImage" name="Broken image" args={{ mode: 'brokenImage' }} parameters={{ mediaState: 'brokenImage' }} {template} />
<Story exportName="Credits" args={{ mode: 'ready', credits: true }} {template} />
<Story exportName="CreditsUnavailable" name="Credits unavailable" args={{ mode: 'unavailable', credits: true }} parameters={{ mediaState: 'unavailable' }} {template} />
