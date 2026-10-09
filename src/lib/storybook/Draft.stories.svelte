<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import type { ComponentProps } from 'svelte';
	import DraftWorkshop from './DraftWorkshop.svelte';

	type Args = ComponentProps<typeof DraftWorkshop>;

	const { Story } = defineMeta({
		title: 'Draft/Board',
		component: DraftWorkshop,
		argTypes: {
			initial: { control: 'inline-radio', options: ['ready', 'revealing', 'choosing', 'partial'] },
			loading: { control: 'boolean' },
			busy: { control: 'boolean' },
			commitError: { control: 'boolean' },
			rankingState: { control: 'inline-radio', options: ['ready', 'loading', 'unavailable'] }
		},
		args: {
			initial: 'ready',
			loading: false,
			busy: false,
			commitError: false,
			rankingState: 'ready'
		}
	});
</script>

{#snippet template(args: Args)}
	<DraftWorkshop {...args} />
{/snippet}

<Story name="Ready" exportName="Ready" {template} />

<Story
	name="Revealing"
	exportName="Revealing"
	args={{ initial: 'revealing' }}
	{template}
/>

<Story
	name="Choosing"
	exportName="Choosing"
	args={{ initial: 'choosing' }}
	{template}
/>

<Story
	name="Partial roster"
	exportName="PartialRoster"
	args={{ initial: 'partial' }}
	{template}
/>

<Story
	name="Loading"
	exportName="Loading"
	args={{ initial: 'choosing', loading: true }}
	{template}
/>

<Story
	name="Commit failure"
	exportName="CommitFailure"
	args={{ initial: 'choosing', commitError: true }}
	{template}
/>

<Story
	name="Rankings loading"
	exportName="RankingsLoading"
	args={{ initial: 'choosing', rankingState: 'loading' }}
	{template}
/>

<Story
	name="Rankings unavailable"
	exportName="RankingsUnavailable"
	args={{ initial: 'choosing', rankingState: 'unavailable' }}
	{template}
/>
