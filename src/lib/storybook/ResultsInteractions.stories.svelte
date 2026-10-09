<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, within } from 'storybook/test';
	import type { ComponentProps } from 'svelte';
	import ResultsWorkshop from './ResultsWorkshop.svelte';

	type Args = ComponentProps<typeof ResultsWorkshop>;

	const { Story } = defineMeta({
		title: 'Interactions/Results',
		component: ResultsWorkshop,
		args: { initial: 'complete' }
	});

	type Play = NonNullable<ComponentProps<typeof Story>['play']>;

	function resultsPlay(mode: 'simulated' | 'actual'): Play {
		return async ({ canvasElement }) => {
			const canvas = within(canvasElement);
			const inspectable = await canvas.findAllByRole('button', { name: /^Inspect .+ award card$/ });
			await userEvent.click(inspectable[0]);

			const review = await canvas.findByRole('region', { name: /.+ · \d{4}/ });
			const simulated = within(review).getByRole('button', { name: '162-0 season' });
			const actual = within(review).getByRole('button', { name: 'Actual season' });
			if (mode === 'actual') await userEvent.click(actual);

			await expect(simulated).toHaveAttribute('aria-pressed', mode === 'simulated' ? 'true' : 'false');
			await expect(actual).toHaveAttribute('aria-pressed', mode === 'actual' ? 'true' : 'false');
			await expect(review.querySelector('[data-cardbox]')).toHaveAttribute('data-face', 'back');
		};
	}

	const simulatedSeasonPlay = resultsPlay('simulated');
	const actualSeasonPlay = resultsPlay('actual');
</script>

{#snippet template(args: Args)}
	<ResultsWorkshop {...args} />
{/snippet}

<Story
	name="Simulated season"
	exportName="SimulatedSeason"
	play={simulatedSeasonPlay}
	{template}
/>

<Story
	name="Actual season"
	exportName="ActualSeason"
	play={actualSeasonPlay}
	{template}
/>
