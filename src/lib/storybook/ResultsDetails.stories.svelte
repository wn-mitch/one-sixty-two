<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { ComponentProps } from 'svelte';
	import ResultsDetailsWorkshop from './ResultsDetailsWorkshop.svelte';

	type Args = ComponentProps<typeof ResultsDetailsWorkshop>;

	const { Story } = defineMeta({
		title: 'Results/Details',
		component: ResultsDetailsWorkshop,
		args: { initial: 'game' }
	});
</script>

{#snippet template(args: Args)}
	<ResultsDetailsWorkshop {...args} />
{/snippet}

<Story name="Game" exportName="Game" {template} />

<Story
	name="Turning points"
	exportName="TurningPoints"
	args={{ initial: 'turningPoints' }}
	{template}
/>

<Story
	name="No turning points"
	exportName="NoTurningPoints"
	args={{ initial: 'noTurningPoints' }}
	{template}
/>
