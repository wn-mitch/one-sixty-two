<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SeasonsWorkshop from './SeasonsWorkshop.svelte';
	const { Story } = defineMeta({
		title: 'Modes/My seasons', component: SeasonsWorkshop,
		args: { initial: 'leaders' },
		argTypes: { initial: { control: 'inline-radio', options: ['leaders', 'club', 'compare', 'empty', 'blocked'] } }
	});
</script>
<script lang="ts">
	import type { SeasonsWorkshopProps } from './SeasonsWorkshop.svelte';
</script>
{#snippet template(args: SeasonsWorkshopProps)}<SeasonsWorkshop {...args} />{/snippet}
<Story name="All-time leaders" exportName="Leaders" args={{ initial: 'leaders' }} {template} />
<Story exportName="Club" args={{ initial: 'club' }} {template} />
<Story name="Tale of the tape" exportName="Compare" args={{ initial: 'compare' }} {template} />
<Story exportName="Empty" args={{ initial: 'empty' }} {template} />
<Story name="Storage blocked" exportName="StorageBlocked" args={{ initial: 'blocked' }} {template} />
