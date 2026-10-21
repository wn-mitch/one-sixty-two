<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { ComponentProps } from 'svelte';
	import SeasonReelWorkshop from './SeasonReelWorkshop.svelte';

	type Args = ComponentProps<typeof SeasonReelWorkshop>;

	const { Story } = defineMeta({
		title: 'Simulation/Season reel',
		component: SeasonReelWorkshop,
		args: { simulating: false }
	});
</script>

{#snippet template(args: Args)}
	<SeasonReelWorkshop {...args} />
{/snippet}

<Story name="Reveal" exportName="Reveal" {template} />
<Story name="Simulating" exportName="Simulating" args={{ simulating: true }} {template} />
