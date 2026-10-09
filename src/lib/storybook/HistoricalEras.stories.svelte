<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import HistoricalEraGallery from './HistoricalEraGallery.svelte';

	const { Story } = defineMeta({
		title: 'Cards/Eras',
		component: HistoricalEraGallery,
		parameters: { mediaState: 'runtime' },
		args: { width: 240 },
		argTypes: {
			width: { control: { type: 'range', min: 160, max: 410, step: 1 } }
		}
	});
</script>

<script lang="ts">
	import StoryFrame from './StoryFrame.svelte';
	import type { CardEra } from '#lib/cards/view-model.ts';
	import type { HistoricalEraGalleryProps } from './HistoricalEraGallery.svelte';

	let gallery: HistoricalEraGallery;

	function resetStory(): void {
		gallery?.reset();
	}
</script>

{#snippet template(args: HistoricalEraGalleryProps)}
	<StoryFrame onReset={resetStory} wide fixtureNotice="Historical runtime data. Nothing is saved or uploaded.">
		<HistoricalEraGallery bind:this={gallery} {...args} />
	</StoryFrame>
{/snippet}

<Story exportName="Era1950s" name="1950s" args={{ era: '1950s' satisfies CardEra, width: 240 }} parameters={{ mediaState: 'runtime' }} {template} />
<Story exportName="Era1960s" name="1960s" args={{ era: '1960s' satisfies CardEra, width: 240 }} parameters={{ mediaState: 'runtime' }} {template} />
<Story exportName="Era1970s" name="1970s" args={{ era: '1970s' satisfies CardEra, width: 240 }} parameters={{ mediaState: 'runtime' }} {template} />
<Story exportName="Era1980s" name="1980s" args={{ era: '1980s' satisfies CardEra, width: 240 }} parameters={{ mediaState: 'runtime' }} {template} />
<Story exportName="Era1990s" name="1990s" args={{ era: '1990s' satisfies CardEra, width: 240 }} parameters={{ mediaState: 'runtime' }} {template} />
<Story exportName="Era2000s" name="2000s" args={{ era: '2000s' satisfies CardEra, width: 240 }} parameters={{ mediaState: 'runtime' }} {template} />
<Story exportName="Era2010s" name="2010s" args={{ era: '2010s' satisfies CardEra, width: 240 }} parameters={{ mediaState: 'runtime' }} {template} />
<Story exportName="Era2020s" name="2020s" args={{ era: '2020s' satisfies CardEra, width: 240 }} parameters={{ mediaState: 'runtime' }} {template} />
