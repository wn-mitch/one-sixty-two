<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { FILMS, type HoloPattern } from '#lib/cards/surface/holo-films.ts';
	import HoloPoseSheet from './HoloPoseSheet.svelte';

	/** Each holo experiment as still frames at fixed leans and turns, for comparing its states side by side. */
	const { Story } = defineMeta({
		title: 'Workshop/Holo pose sheets',
		component: HoloPoseSheet
	});
	const experiments = FILMS.filter(film => film.experimental).map(film => film.name as HoloPattern);
</script>

<Story exportName="AllExperiments" name="All experiments" args={{ films: experiments }} />
<Story exportName="RollingSnowflake" name="Rolling snowflake" args={{ films: ['rolling-snowflake'] }} />
<Story exportName="ChasingRosette" name="Chasing rosette" args={{ films: ['chasing-rosette'] }} />
<Story exportName="ChannelFlip" name="Channel flip" args={{ films: ['channel-flip'] }} />
<Story exportName="FloatingConstellation" name="Floating constellation" args={{ films: ['floating-constellation'] }} />
<Story exportName="TurningBaseball" name="Turning baseball" args={{ films: ['turning-baseball'] }} />
<Story exportName="MintedCrest" name="Minted crest" args={{ films: ['minted-crest'] }} />
<Story exportName="SecretInning" name="Secret inning" args={{ films: ['secret-inning'] }} />
<Story exportName="QuarterTurn" name="Quarter-turn reveal" args={{ films: ['quarter-turn'] }} />
<Story exportName="SilverInversion" name="Silver inversion" args={{ films: ['silver-inversion'] }} />
<Story exportName="QuietIsland" name="Quiet silver island" args={{ films: ['quiet-island'] }} />
<Story exportName="LensLettering" name="Lens lettering" args={{ films: ['lens-lettering'] }} />
<Story exportName="ColorLock" name="Color lock" args={{ films: ['color-lock'] }} />
<Story exportName="WireframeJewel" name="Wireframe jewel" args={{ films: ['wireframe-jewel'] }} />
<Story exportName="MorphingGeometry" name="Morphing geometry" args={{ films: ['morphing-geometry'] }} />
