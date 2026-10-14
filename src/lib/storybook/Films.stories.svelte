<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ModuleLab from './ModuleLab.svelte';

	/** One story per film, each with a dial for every one of its settings. */
	const { Story } = defineMeta({
		title: 'Workshop/Films',
		component: ModuleLab
	});
</script>

<Story exportName="Refractor" name="refractor" args={{ kind: 'film', name: 'refractor' }} />
<Story exportName="Prizm" name="prizm" args={{ kind: 'film', name: 'prizm' }} />
<Story exportName="CrackedIce" name="cracked-ice" args={{ kind: 'film', name: 'cracked-ice' }} />
<Story exportName="Spun" name="spun" args={{ kind: 'film', name: 'spun' }} />
<Story exportName="Brilliant" name="brilliant" args={{ kind: 'film', name: 'brilliant' }} />
<Story exportName="Shimmer" name="shimmer" args={{ kind: 'film', name: 'shimmer' }} />
<Story exportName="Atomic" name="atomic" args={{ kind: 'film', name: 'atomic' }} />
<Story exportName="Xfractor" name="xfractor" args={{ kind: 'film', name: 'xfractor' }} />
<Story exportName="Mojo" name="mojo" args={{ kind: 'film', name: 'mojo' }} />
<Story exportName="Geodesic" name="geodesic" args={{ kind: 'film', name: 'geodesic' }} />
<Story exportName="Carpet" name="carpet" args={{ kind: 'film', name: 'carpet' }} />
<Story exportName="Circuit" name="circuit" args={{ kind: 'film', name: 'circuit' }} />
<Story exportName="Dollar" name="dollar" args={{ kind: 'film', name: 'dollar' }} />
<Story exportName="Hgh" name="hgh" args={{ kind: 'film', name: 'hgh' }} />
<Story exportName="HghSequence" name="hgh-sequence" args={{ kind: 'film', name: 'hgh-sequence' }} />
<Story exportName="QrCode" name="qr-code" args={{ kind: 'film', name: 'qr-code' }} />
<Story exportName="DoubleHelix" name="double-helix" args={{ kind: 'film', name: 'double-helix' }} />
<Story exportName="Julia" name="julia" args={{ kind: 'film', name: 'julia' }} />
<Story exportName="Fibonacci" name="fibonacci" args={{ kind: 'film', name: 'fibonacci' }} />
<Story exportName="Mobius" name="mobius" args={{ kind: 'film', name: 'mobius' }} />
<Story exportName="OilPuddle" name="oil-puddle" args={{ kind: 'film', name: 'oil-puddle' }} />
<Story exportName="Galaxy" name="galaxy" args={{ kind: 'film', name: 'galaxy' }} />
<Story exportName="Jackpot" name="jackpot" args={{ kind: 'film', name: 'jackpot' }} />
<Story exportName="Paisley" name="paisley" args={{ kind: 'film', name: 'paisley' }} />
