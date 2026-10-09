<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { ComponentProps } from 'svelte';
	import SimulationWorkshop from './SimulationWorkshop.svelte';

	type Args = ComponentProps<typeof SimulationWorkshop>;

	const { Story } = defineMeta({
		title: 'Simulation/Season',
		component: SimulationWorkshop,
		argTypes: {
			initial: { control: 'inline-radio', options: ['computing', 'partial', 'replay'] },
			completed: { control: { type: 'range', min: 0, max: 162, step: 1 } },
			revealed: { control: { type: 'range', min: 0, max: 162, step: 1 } }
		},
		args: { initial: 'computing', completed: 24, revealed: 42 }
	});
</script>

{#snippet template(args: Args)}
	<SimulationWorkshop {...args} />
{/snippet}

<Story name="Computing" exportName="Computing" {template} />
<Story name="Partial reveal" exportName="PartialReveal" args={{ initial: 'partial', revealed: 42 }} {template} />
<Story name="Replay" exportName="Replay" args={{ initial: 'replay' }} {template} />
