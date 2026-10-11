<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import CollectionWorkshop from './CollectionWorkshop.svelte';
	const { Story } = defineMeta({
		title: 'Modes/Collection', component: CollectionWorkshop,
		args: { initial: 'binder' },
		argTypes: { initial: { control: 'inline-radio', options: ['binder', 'empty', 'blocked'] } }
	});
</script>
<script lang="ts">
	import type { CollectionWorkshopProps } from './CollectionWorkshop.svelte';
</script>
{#snippet template(args: CollectionWorkshopProps)}<CollectionWorkshop {...args} />{/snippet}
<Story exportName="Binder" args={{ initial: 'binder' }} {template} />
<Story exportName="Empty" args={{ initial: 'empty' }} {template} />
<Story name="Storage blocked" exportName="StorageBlocked" args={{ initial: 'blocked' }} {template} />
