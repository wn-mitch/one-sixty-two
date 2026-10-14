<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ModuleLab from './ModuleLab.svelte';

	/** One story per finish, each with a dial for every one of its settings. */
	const { Story } = defineMeta({
		title: 'Workshop/Film finishes',
		component: ModuleLab
	});
</script>

<Story exportName="Smooth" name="smooth" args={{ kind: 'finish', name: 'smooth' }} />
<Story exportName="Bump" name="bump" args={{ kind: 'finish', name: 'bump' }} />
<Story exportName="Brushed" name="brushed" args={{ kind: 'finish', name: 'brushed' }} />
<Story exportName="Etched" name="etched" args={{ kind: 'finish', name: 'etched' }} />
<Story exportName="Sparkle" name="sparkle" args={{ kind: 'finish', name: 'sparkle' }} />
<Story exportName="Hammered" name="hammered" args={{ kind: 'finish', name: 'hammered' }} />
