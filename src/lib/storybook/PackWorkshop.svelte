<script lang="ts">
	import FoilPack, { type DealtPack } from '#lib/components/FoilPack.svelte';
	import StoryFrame from './StoryFrame.svelte';

	/** The sealed franchise pack; tapping it deals a franchise card, or a jackpot when `jackpot` is set. */
	let { jackpot = false }: { jackpot?: boolean } = $props();

	let packs = $state<DealtPack[]>([]);
	let instance = $state(0);
	const deal = () => {
		packs = jackpot
			? [{ roll: { jackpot: ['jackpot-1', 'jackpot-2', 'jackpot-3', 'jackpot-4', 'jackpot-5'] } }]
			: [{ roll: { franchiseId: 'NYY', decade: 1950 }, name: 'New York Yankees', years: { first: 1950, last: 1959 } }];
	};
</script>

<StoryFrame onReset={() => { packs = []; instance++; }}>
	{#key instance}
		<FoilPack {packs} pickNumber={1} pickCount={26} marks={['NYY', 'BOS', 'LAD', 'CHC']} flyTarget={() => null} onOpen={deal} onArrive={() => {}} onDealt={() => {}} />
	{/key}
</StoryFrame>
