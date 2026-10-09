<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import CardWorkshop from './CardWorkshop.svelte';

	const { Story } = defineMeta({
		title: 'Cards/States',
		component: CardWorkshop,
		args: {
			era: '2020s',
			role: 'hitter',
			finish: 'base',
			width: 280,
			mode: 'interactive'
		},
		argTypes: {
			era: { control: 'select', options: ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'] },
			role: { control: 'select', options: ['hitter', 'starter', 'closer', 'two-way', 'bullpen'] },
			finish: { control: 'select', options: ['base', 'foil', 'emboss', 'gem'] },
			width: { control: { type: 'range', min: 160, max: 410, step: 1 } },
			mode: { control: 'select', options: ['interactive', 'idle', 'wall', 'flip', 'gallery', 'compact'] },
			missingPhoto: { control: 'boolean' },
			longIdentity: { control: 'boolean' }
		}
	});
</script>

<script lang="ts">
	import type { CardWorkshopProps } from './CardWorkshop.svelte';
</script>

{#snippet workshopTemplate(args: CardWorkshopProps)}
	<CardWorkshop {...args} />
{/snippet}

<Story exportName="Interactive" name="Interactive" args={{ era: '2020s', role: 'hitter', finish: 'base', width: 280, mode: 'interactive' }} template={workshopTemplate} />
<Story exportName="EraSamples" name="Era samples" args={{ era: '2020s', role: 'hitter', finish: 'foil', width: 220, mode: 'gallery' }} template={workshopTemplate} />
<Story exportName="CompactReview" name="Compact review" args={{ role: 'hitter', finish: 'base', width: 72, mode: 'compact' }} template={workshopTemplate} />
<Story exportName="TwoWay" name="Two-way" args={{ era: '2020s', role: 'two-way', finish: 'gem', width: 280, mode: 'interactive' }} template={workshopTemplate} />
<Story exportName="Bullpen" name="Bullpen" args={{ era: '2020s', role: 'bullpen', finish: 'base', width: 280, mode: 'interactive' }} template={workshopTemplate} />
<Story exportName="MissingPhoto" name="Missing photo" args={{ era: '2020s', role: 'hitter', finish: 'base', width: 280, mode: 'interactive', missingPhoto: true }} parameters={{ mediaState: 'missing' }} template={workshopTemplate} />
<Story exportName="LongIdentity" name="Long identity" args={{ era: '2020s', role: 'hitter', finish: 'foil', width: 280, mode: 'interactive', longIdentity: true }} template={workshopTemplate} />
