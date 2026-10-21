<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ModuleLab from './ModuleLab.svelte';

	/**
	 * One story per holo experiment: each is a film studying one optical effect, named after ITW's effect
	 * category. They are workshop studies, not shop films. Scrub the tilt slowly both ways; the roll dial turns
	 * the card in its own plane.
	 */
	const { Story } = defineMeta({
		title: 'Workshop/Holo experiments',
		component: ModuleLab
	});
</script>

<Story exportName="RollingSnowflake" name="Rolling snowflake" args={{ kind: 'film', name: 'rolling-snowflake' }} />
<Story exportName="ChasingRosette" name="Chasing rosette" args={{ kind: 'film', name: 'chasing-rosette' }} />
<Story exportName="ChannelFlip" name="Three-image flip" args={{ kind: 'film', name: 'channel-flip' }} />
<Story exportName="ChannelFlipTwo" name="Two-image flip" args={{ kind: 'film', name: 'channel-flip', tune: { channels: 2 } }} />
<Story exportName="FloatingConstellation" name="Floating constellation" args={{ kind: 'film', name: 'floating-constellation' }} />
<Story exportName="TurningBaseball" name="Turning baseball" args={{ kind: 'film', name: 'turning-baseball' }} />
<Story exportName="MintedCrest" name="Minted crest" args={{ kind: 'film', name: 'minted-crest' }} />
<Story exportName="SecretInning" name="Secret inning" args={{ kind: 'film', name: 'secret-inning' }} />
<Story exportName="QuarterTurn" name="Quarter-turn reveal" args={{ kind: 'film', name: 'quarter-turn' }} />
<Story exportName="QuarterTurnTurned" name="Quarter-turn reveal, turned" args={{ kind: 'film', name: 'quarter-turn', roll: 90 }} />
<Story exportName="SilverInversion" name="Silver inversion" args={{ kind: 'film', name: 'silver-inversion' }} />
<Story exportName="QuietIsland" name="Quiet silver island" args={{ kind: 'film', name: 'quiet-island' }} />
<Story exportName="QuietIslandMatte" name="Quiet silver island, matte" args={{ kind: 'film', name: 'quiet-island', tune: { matte: 1 } }} />
<Story exportName="LensLettering" name="Lens lettering" args={{ kind: 'film', name: 'lens-lettering' }} />
<Story exportName="ColorLock" name="Color lock" args={{ kind: 'film', name: 'color-lock' }} />
<Story exportName="WireframeJewel" name="Wireframe jewel" args={{ kind: 'film', name: 'wireframe-jewel' }} />
<Story exportName="MorphingGeometry" name="Morphing geometry" args={{ kind: 'film', name: 'morphing-geometry' }} />
