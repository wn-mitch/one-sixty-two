<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { ComponentProps } from 'svelte';
	import LineupWorkshop from './LineupWorkshop.svelte';

	type Args = ComponentProps<typeof LineupWorkshop>;

	const { Story } = defineMeta({
		title: 'Lineup/Editor',
		component: LineupWorkshop,
		argTypes: {
			busy: { control: 'boolean' },
			missingProfile: { control: 'boolean' }
		},
		args: { busy: false, missingProfile: false }
	});
</script>

{#snippet template(args: Args)}
	<LineupWorkshop {...args} />
{/snippet}

<Story name="Complete" exportName="Complete" {template} />
<Story name="Busy" exportName="Busy" args={{ busy: true }} {template} />
<Story name="Missing profile" exportName="MissingProfile" args={{ missingProfile: true }} {template} />
