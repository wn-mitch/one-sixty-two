<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TeamCardWorkshop from './TeamCardWorkshop.svelte';

	const { Story } = defineMeta({
		title: 'Cards/Team cards',
		component: TeamCardWorkshop,
		args: { face: 'front', interactive: true, fixture: 'current' },
		argTypes: {
			face: { control: 'inline-radio', options: ['front', 'back'] },
			interactive: { control: 'boolean' },
			fixture: { control: 'inline-radio', options: ['current', 'retired'] }
		},
		parameters: { layout: 'fullscreen' }
	});
</script>
<script lang="ts">
	import type { TeamCardWorkshopProps } from './TeamCardWorkshop.svelte';
</script>

{#snippet template(args: TeamCardWorkshopProps)}
	<TeamCardWorkshop {...args} />
{/snippet}

<Story name="Nine-grade finishes" exportName="NineGrades" {template} />
