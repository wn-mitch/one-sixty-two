<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import WelcomeWorkshop from './WelcomeWorkshop.svelte';
	const { Story } = defineMeta({
		title: 'Application/Welcome', component: WelcomeWorkshop,
		args: { initial: 'start' },
		argTypes: { initial: { control: 'select', options: ['start', 'resume', 'loading', 'daily-done'] } }
	});
</script>
<script lang="ts">
	import type { WelcomeWorkshopProps } from './WelcomeWorkshop.svelte';
</script>
{#snippet template(args: WelcomeWorkshopProps)}<WelcomeWorkshop {...args} />{/snippet}
<Story exportName="Start" args={{ initial: 'start' }} {template} />
<Story exportName="ResumeAvailable" name="Resume available" args={{ initial: 'resume' }} {template} />
<Story exportName="Loading" args={{ initial: 'loading' }} {template} />
<Story exportName="DailyFinished" name="Daily finished" args={{ initial: 'daily-done' }} {template} />
