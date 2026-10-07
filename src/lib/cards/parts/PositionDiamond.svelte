<script lang="ts">
	import type { Roles } from '../tokens.ts';
	import type { CardPositions } from '../view-model.ts';

	type PositionKey = keyof CardPositions;
	type DiamondStyle = 'root' | 'outfieldClip' | 'outfield' | 'infield' | 'spot' | 'chip' | 'label' | 'games' | 'empty';

	const spots = [
		{ key: 'c', label: 'C', left: 50, top: 88 },
		{ key: 'b1', label: '1B', left: 76, top: 66 },
		{ key: 'b2', label: '2B', left: 61, top: 48 },
		{ key: 'ss', label: 'SS', left: 39, top: 48 },
		{ key: 'b3', label: '3B', left: 24, top: 66 },
		{ key: 'lf', label: 'LF', left: 20, top: 30 },
		{ key: 'cf', label: 'CF', left: 50, top: 17 },
		{ key: 'rf', label: 'RF', left: 80, top: 30 },
		{ key: 'p', label: 'P', left: 50, top: 70 },
		{ key: 'dh', label: 'DH', left: 86, top: 86 }
	] as const satisfies readonly { key: PositionKey; label: string; left: number; top: number }[];

	export interface PositionDiamondProps {
		dia: CardPositions;
		k: Pick<Roles, 'field' | 'onField' | 'fieldOnStock'>;
		style?: string;
		styles?: Record<string, string>;
	}

	let { dia, k, style = '', styles = {} }: PositionDiamondProps = $props();

	function authored(name: DiamondStyle, fallback: string): string {
		return `${fallback} ${styles[name] ?? ''}`;
	}
</script>

<div data-layer="positions.diamond" style={authored('root', `position:relative; flex:none; width:30cqw; height:30cqw; ${style}`)}>
	<div data-layer="frame.diamond-outfield-clip" aria-hidden="true" style={authored('outfieldClip', 'position:absolute; left:0; top:0; width:100%; height:45%; overflow:hidden;')}>
		<div data-layer="frame.diamond-outfield" style={authored('outfield', `position:absolute; left:-20%; top:40%; width:140%; height:311%; box-sizing:border-box; border-radius:50%; border:0.3cqw solid rgba(0,0,0,0); border-top-color:${k.fieldOnStock};`)}></div>
	</div>
	<div data-layer="frame.diamond-infield" aria-hidden="true" style={authored('infield', `position:absolute; left:35.2%; top:55.2%; width:29.6%; height:29.6%; box-sizing:border-box; border:0.3cqw solid ${k.fieldOnStock}; transform:rotate(45deg);`)}></div>
	{#each spots as spot (spot.key)}
		{@const position = dia[spot.key]}
		<div data-layer={`positions.${spot.key}`} style={authored('spot', `position:absolute; left:${spot.left}%; top:${spot.top}%; transform:translate(-50%, -50%); display:flex; flex-direction:column; align-items:center;`)}>
			{#if position.on}
				<div style={authored('chip', `display:flex; flex-direction:column; align-items:center; gap:0.25cqw; padding:0.5cqw 1cqw 0.6cqw; border-radius:1cqw; background:${k.field}; color:${k.onField};`)}>
					<div style={authored('label', 'font-size:2.6cqw; line-height:1; letter-spacing:0.04em; font-weight:700;')}>{spot.label}</div>
					<div data-rt data-layer="positions.games" style={authored('games', "font-size:3.8cqw; line-height:0.9; font-variant-numeric:tabular-nums; font-family:'Roboto Serif', serif; font-weight:700;")}>{position.g}</div>
				</div>
			{:else if position.off}
				<div data-layer="positions.empty" aria-hidden="true" style={authored('empty', `width:1.3cqw; height:1.3cqw; border-radius:50%; background:${k.fieldOnStock}; opacity:0.55;`)}></div>
			{/if}
		</div>
	{/each}
</div>
