<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, waitFor, within } from 'storybook/test';
	import type { ComponentProps } from 'svelte';
	import DraftWorkshop from './DraftWorkshop.svelte';

	type Args = ComponentProps<typeof DraftWorkshop>;

	const { Story } = defineMeta({
		title: 'Interactions/Draft',
		component: DraftWorkshop,
		args: {
			loading: false,
			busy: false,
			commitError: false,
			rankingState: 'ready'
		}
	});

	type Play = NonNullable<ComponentProps<typeof Story>['play']>;

	function visible<T extends HTMLElement>(elements: Iterable<T>): T | undefined {
		return [...elements].find((element) => element.getClientRects().length > 0);
	}

	function candidateByPlayer(canvasElement: HTMLElement, playerId: string): HTMLElement | undefined {
		return [...canvasElement.querySelectorAll<HTMLElement>('.candidate-card')]
			.find((candidate) => candidate.dataset.candidateGroup === playerId);
	}

	const exactSeasonPlay: Play = async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await canvas.findByRole('region', { name: 'Choose a historical player season' });

		const wideSeason = visible(
			[...canvasElement.querySelectorAll<HTMLSelectElement>('.wide-season-picker select')]
				.filter((select) => select.options.length > 1)
		);

		if (wideSeason) {
			const candidate = wideSeason.closest<HTMLElement>('.candidate-card');
			const playerId = candidate?.dataset.candidateGroup;
			const alternate = [...wideSeason.options].find((option) => option.value !== wideSeason.value);
			if (!playerId || !alternate) throw new Error('The exact-season example candidate is unavailable.');

			await userEvent.selectOptions(wideSeason, alternate.value);
			await waitFor(() => expect(candidateByPlayer(canvasElement, playerId)).toBeUndefined());

			const pagination = canvas.getByRole('navigation', { name: 'Player card pages' });
			await userEvent.click(within(pagination).getByRole('button', { name: 'Next' }));
			await waitFor(() => {
				const retained = candidateByPlayer(canvasElement, playerId)?.querySelector<HTMLElement>('.player-card');
				expect(retained).toHaveAttribute('data-season-id', alternate.value);
			});
			return;
		}

		const candidate = [...canvasElement.querySelectorAll<HTMLElement>('.candidate-card')]
			.find((entry) => !entry.dataset.candidateGroup?.startsWith('candidate-'));
		if (!candidate) throw new Error('The exact-season example candidate is unavailable.');

		await userEvent.click(within(candidate).getByRole('button', { name: /^Select / }));
		const field = await canvas.findByRole('dialog', { name: 'Your field' });
		const season = within(field).getByRole<HTMLSelectElement>('combobox', { name: /^Exact season for / });
		const alternate = [...season.options].find((option) => option.value !== season.value);
		if (!alternate) throw new Error('The selected example candidate has no alternate season.');

		await userEvent.selectOptions(season, alternate.value);
		await expect(season).toHaveValue(alternate.value);
		await expect(field).toBeVisible();
	};

	const placementPreviewPlay: Play = async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await canvas.findByRole('region', { name: 'Choose a historical player season' });
		const candidate = candidateByPlayer(canvasElement, 'candidate-06');
		if (!candidate) throw new Error('Candidate 06 is unavailable.');

		const widePreview = visible(candidate.querySelectorAll<HTMLButtonElement>('.wide-controls .placement'));
		if (widePreview) {
			const preview2B = within(candidate).getByRole('button', { name: /^Preview .+ at 2B$/ });
			await userEvent.click(preview2B);
			const field = canvasElement.querySelector<HTMLElement>('.field-panel');
			if (!field) throw new Error('The wide field panel is unavailable.');
			await expect(field.querySelector('.pick-confirmation')).toHaveAttribute('data-pending-slot', '2B');
			await expect(canvasElement.querySelector('.picked-count')).toHaveTextContent('0 / 14');
			return;
		}

		await userEvent.click(within(candidate).getByRole('button', { name: /^Select / }));
		const field = await canvas.findByRole('dialog', { name: 'Your field' });
		await userEvent.click(within(field).getByRole('button', { name: /^2B, open\. Place at open 2B\./ }));
		await expect(field.querySelector('.pick-confirmation')).toHaveAttribute('data-pending-slot', '2B');
		await expect(field).toBeVisible();
		await expect(canvasElement.querySelector('.picked-count')).toHaveTextContent('0 / 14');
	};

	const rosterReviewPlay: Play = async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const openField = canvas.queryByRole('button', { name: /Open your field 6 \/ 14/ });
		if (openField) await userEvent.click(openField);

		const owner = openField
			? await canvas.findByRole('dialog', { name: 'Your field' })
			: canvasElement.querySelector<HTMLElement>('.field-panel');
		if (!owner) throw new Error('The roster field is unavailable.');

		const committed = within(owner).getByRole('button', { name: /^2B,/ });
		await userEvent.click(committed);
		// Move-first uses the first click to enter move mode; Review-first opens the reader immediately.
		if (!owner.querySelector('[data-card-reader]:popover-open')) await userEvent.click(committed);

		const review = await within(owner).findByRole('region', { name: /.+ · \d{4}/ });
		await expect(review.querySelector('[data-cardbox]')).toHaveAttribute('data-face', 'front');
		expect(canvasElement.ownerDocument.activeElement).toBe(within(review).getByRole('button', { name: 'Turn over' }));
		if (openField) await expect(owner).toBeVisible();
	};
</script>

{#snippet template(args: Args)}
	<DraftWorkshop {...args} />
{/snippet}

<Story
	name="Exact season"
	exportName="ExactSeason"
	args={{ initial: 'choosing' }}
	play={exactSeasonPlay}
	{template}
/>

<Story
	name="Placement preview"
	exportName="PlacementPreview"
	args={{ initial: 'choosing' }}
	play={placementPreviewPlay}
	{template}
/>

<Story
	name="Roster review"
	exportName="RosterReview"
	args={{ initial: 'partial' }}
	play={rosterReviewPlay}
	{template}
/>
