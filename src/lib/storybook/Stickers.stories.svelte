<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import StickersWorkshop from './StickersWorkshop.svelte';
	const { Story } = defineMeta({
		title: 'Cards/Stickers', component: StickersWorkshop,
		args: { view: 'sheet', width: 280, fresh: false },
		argTypes: {
			view: { control: 'inline-radio', options: ['sheet', 'cards', 'tiers', 'sizes'] },
			width: { control: { type: 'range', min: 160, max: 410, step: 1 } },
			fresh: { control: 'boolean' }
		}
	});
</script>
<script lang="ts">
	import type { StickersWorkshopProps } from './StickersWorkshop.svelte';
</script>
{#snippet template(args: StickersWorkshopProps)}<StickersWorkshop {...args} />{/snippet}
<Story exportName="Sheet" args={{ view: 'sheet' }} {template} />
<Story name="On cards" exportName="OnCards" args={{ view: 'cards', width: 280 }} {template} />
<Story name="Just earned" exportName="JustEarned" args={{ view: 'cards', width: 280, fresh: true }} {template} />
<Story name="Tiers and hiding" exportName="TiersAndHiding" args={{ view: 'tiers', width: 240 }} {template} />
<Story exportName="Sizes" args={{ view: 'sizes' }} {template} />
