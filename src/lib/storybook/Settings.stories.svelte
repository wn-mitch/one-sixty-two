<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Settings from '#lib/components/Settings.svelte';

	const { Story } = defineMeta({
		title: 'Controls/Settings',
		component: Settings
	});
</script>

<Story exportName="Preferences" name="Preferences" />
