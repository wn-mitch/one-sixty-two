<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import StickerSlotsWorkshop from './StickerSlotsWorkshop.svelte';
	const { Story } = defineMeta({
		title: 'Cards/Sticker slots', component: StickerSlotsWorkshop,
		args: { mode: 'era', width: 300, overlay: false },
		argTypes: {
			era: { control: 'select', options: [undefined, '1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'] },
			mode: { control: 'inline-radio', options: ['era', 'legacy', 'none'] },
			width: { control: { type: 'range', min: 160, max: 410, step: 1 } },
			overlay: { control: 'boolean' }
		}
	});
</script>
<script lang="ts">
	import type { StickerSlotsWorkshopProps } from './StickerSlotsWorkshop.svelte';
</script>
{#snippet template(args: StickerSlotsWorkshopProps)}<StickerSlotsWorkshop {...args} />{/snippet}
<Story name="Every era" exportName="EveryEra" args={{ mode: 'era', overlay: true }} {template} />
<Story name="One era, every variant" exportName="OneEra" args={{ era: '1990s', mode: 'era' }} {template} />
<Story name="Old shared spots" exportName="Legacy" args={{ mode: 'legacy', overlay: true }} {template} />
