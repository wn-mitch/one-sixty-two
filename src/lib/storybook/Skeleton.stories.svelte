<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SkeletonWorkshop from './SkeletonWorkshop.svelte';
	const { Story } = defineMeta({
		title: 'Application/Skeleton', component: SkeletonWorkshop,
		args: { skeleton: true, loaded: true },
		argTypes: {
			screen: { control: 'select', options: ['stadium', 'draft-pack', 'draft-pool', 'lineup', 'season', 'results', 'draft-mode'] },
			skeleton: { control: 'boolean' },
			loaded: { control: 'boolean' }
		}
	});
</script>
<script lang="ts">
	import type { SkeletonWorkshopProps } from './SkeletonWorkshop.svelte';
</script>
{#snippet template(args: SkeletonWorkshopProps)}<SkeletonWorkshop {...args} />{/snippet}
<!-- Real 2025 parks, as in the stadium deck's own stories. -->
<Story exportName="Stadiums" args={{ screen: 'stadium' }} parameters={{ mediaState: 'runtime' }} {template} />
<Story exportName="DraftPack" name="Draft pack" args={{ screen: 'draft-pack' }} {template} />
<Story exportName="DraftPool" name="Draft pool" args={{ screen: 'draft-pool' }} {template} />
<Story exportName="Lineup" args={{ screen: 'lineup' }} {template} />
<Story exportName="Season" args={{ screen: 'season' }} {template} />
<Story exportName="Results" args={{ screen: 'results' }} {template} />
<Story exportName="DraftMode" name="Draft Mode" args={{ screen: 'draft-mode' }} {template} />
