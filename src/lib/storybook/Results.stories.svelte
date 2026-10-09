<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { ComponentProps } from 'svelte';
	import ResultsWorkshop from './ResultsWorkshop.svelte';

	type Args = ComponentProps<typeof ResultsWorkshop>;

	const { Story } = defineMeta({
		title: 'Results/Season',
		component: ResultsWorkshop,
		args: { initial: 'complete' }
	});
</script>

{#snippet template(args: Args)}
	<ResultsWorkshop {...args} />
{/snippet}

<Story name="Complete" exportName="Complete" {template} />

<Story
	name="Share link"
	exportName="ShareLink"
	args={{ initial: 'shareLink' }}
	{template}
/>

<Story
	name="Share unavailable"
	exportName="ShareUnavailable"
	args={{ initial: 'shareUnavailable' }}
	{template}
/>
