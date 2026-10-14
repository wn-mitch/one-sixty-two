<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ModuleLab from './ModuleLab.svelte';

	/** One story per plate, each with a dial for every one of its settings. */
	const { Story } = defineMeta({
		title: 'Workshop/Foil plates',
		component: ModuleLab
	});
</script>

<Story exportName="Brushed" name="brushed" args={{ kind: 'plate', name: 'brushed' }} />
<Story exportName="Hammered" name="hammered" args={{ kind: 'plate', name: 'hammered' }} />
<Story exportName="Guilloche" name="guilloche" args={{ kind: 'plate', name: 'guilloche' }} />
<Story exportName="Sunburst" name="sunburst" args={{ kind: 'plate', name: 'sunburst' }} />
<Story exportName="DiamondPlate" name="diamond-plate" args={{ kind: 'plate', name: 'diamond-plate' }} />
<Story exportName="Pinstripe" name="pinstripe" args={{ kind: 'plate', name: 'pinstripe' }} />
<Story exportName="Spun" name="spun" args={{ kind: 'plate', name: 'spun' }} />
<Story exportName="Carbon" name="carbon" args={{ kind: 'plate', name: 'carbon' }} />
<Story exportName="Knurl" name="knurl" args={{ kind: 'plate', name: 'knurl' }} />
<Story exportName="Damascus" name="damascus" args={{ kind: 'plate', name: 'damascus' }} />
<Story exportName="Stain" name="stain" args={{ kind: 'plate', name: 'stain' }} />
<Story exportName="Weld" name="weld" args={{ kind: 'plate', name: 'weld' }} />
<Story exportName="Perlage" name="perlage" args={{ kind: 'plate', name: 'perlage' }} />
<Story exportName="Scales" name="scales" args={{ kind: 'plate', name: 'scales' }} />
<Story exportName="Crackle" name="crackle" args={{ kind: 'plate', name: 'crackle' }} />
<Story exportName="Leaf" name="leaf" args={{ kind: 'plate', name: 'leaf' }} />
<Story exportName="Paisley" name="paisley" args={{ kind: 'plate', name: 'paisley' }} />
