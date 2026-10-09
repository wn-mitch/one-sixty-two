<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, waitFor, within } from 'storybook/test';
	import type { ComponentProps } from 'svelte';
	import LineupWorkshop from './LineupWorkshop.svelte';

	type Args = ComponentProps<typeof LineupWorkshop>;

	const { Story } = defineMeta({
		title: 'Interactions/Lineup',
		component: LineupWorkshop,
		args: { busy: false, missingProfile: false }
	});

	type Play = NonNullable<ComponentProps<typeof Story>['play']>;

	function reorderPlay(kind: 'batting' | 'starter'): Play {
		return async ({ canvasElement }) => {
			const canvas = within(canvasElement);
			const listName = kind === 'batting' ? 'Batting order' : 'Starting rotation';
			const destination = kind === 'batting' ? 'batting position' : 'rotation position';
			const list = await canvas.findByRole('list', { name: listName });
			const first = list.querySelector<HTMLElement>('li');
			if (!first?.dataset.seasonId) throw new Error(`The first ${listName.toLowerCase()} entry is unavailable.`);
			const seasonId = first.dataset.seasonId;
			const down = within(first).getByRole('button', { name: new RegExp(`^Move .+ down in ${listName.toLowerCase()}$`) });

			await userEvent.click(down);
			await waitFor(() => {
				const reordered = list.querySelectorAll<HTMLElement>('li');
				expect(reordered[1]).toHaveAttribute('data-season-id', seasonId);
			});
			await expect(canvasElement.querySelector('.announcement')).toHaveTextContent(`moved to ${destination} 2.`);
		};
	}

	const battingOrderPlay = reorderPlay('batting');
	const startingRotationPlay = reorderPlay('starter');
</script>

{#snippet template(args: Args)}
	<LineupWorkshop {...args} />
{/snippet}

<Story
	name="Batting order"
	exportName="BattingOrder"
	play={battingOrderPlay}
	{template}
/>

<Story
	name="Starting rotation"
	exportName="StartingRotation"
	play={startingRotationPlay}
	{template}
/>
