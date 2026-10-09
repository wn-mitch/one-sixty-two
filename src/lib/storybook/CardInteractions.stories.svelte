<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import CardWorkshop from './CardWorkshop.svelte';
	import type { CardWorkshopProps } from './CardWorkshop.svelte';

	const { Story } = defineMeta({
		title: 'Interactions/Cards',
		component: CardWorkshop,
		args: { era: '2020s', role: 'hitter', finish: 'emboss', width: 280, mode: 'interactive' }
	});
</script>

{#snippet template(args: CardWorkshopProps)}
	<CardWorkshop {...args} />
{/snippet}

<Story exportName="Flip" name="Flip" args={{ mode: 'flip' }} {template} />
<Story exportName="InlineReview" name="Inline review" args={{ initialTurned: true }} {template} />
<Story exportName="TextBack" name="Text back" args={{ initialTurned: true, initialTextBack: true }} {template} />
