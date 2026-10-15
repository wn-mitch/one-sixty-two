<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SeriesWorkshop from './SeriesWorkshop.svelte';
	const { Story } = defineMeta({
		title: 'Modes/Head-to-head', component: SeriesWorkshop,
		args: { initial: 'setup' },
		argTypes: { initial: { control: 'inline-radio', options: ['setup', 'saved-replay', 'errors', 'running', 'results'] } }
	});
</script>
<script lang="ts">
	import type { SeriesWorkshopProps } from './SeriesWorkshop.svelte';
</script>
{#snippet template(args: SeriesWorkshopProps)}<SeriesWorkshop {...args} />{/snippet}
<Story exportName="Setup" args={{ initial: 'setup' }} {template} />
<Story name="Saved team and replay" exportName="SavedTeamAndReplay" args={{ initial: 'saved-replay' }} {template} />
<Story name="Link errors" exportName="LinkErrors" args={{ initial: 'errors' }} {template} />
<Story exportName="Running" args={{ initial: 'running' }} {template} />
<Story exportName="Results" args={{ initial: 'results' }} {template} />
