<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import PackWorkshop from './PackWorkshop.svelte';

	const { Story } = defineMeta({
		title: 'Draft/Foil pack',
		component: PackWorkshop
	});
</script>

<Story exportName="Franchise" name="Franchise" args={{ jackpot: false }} />
<Story exportName="Jackpot" name="Jackpot" args={{ jackpot: true }} />
