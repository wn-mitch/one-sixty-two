<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import CardWorkshop from './CardWorkshop.svelte';
	import type { CardWorkshopProps } from './CardWorkshop.svelte';

	const { Story } = defineMeta({
		title: 'Cards/Motion',
		component: CardWorkshop,
		args: { era: '2020s', role: 'hitter', finish: 'foil', width: 280, mode: 'idle' }
	});
</script>

{#snippet template(args: CardWorkshopProps)}
	<CardWorkshop {...args} />
{/snippet}

<Story exportName="IdleDrift" name="Idle drift" {template} />
<Story exportName="WallFinishes" name="Wall finishes" args={{ mode: 'wall', width: 230, finish: 'base' }} {template} />
