<script lang="ts">
	import type { Roles } from '../tokens.ts';

	export interface BaseballBadgeProps {
		position: string;
		k: Pick<Roles, 'ink'>;
		style?: string;
		positionStyle?: string;
		seamStyle?: string;
	}

	let { position, k, style = '', positionStyle = '', seamStyle = '' }: BaseballBadgeProps = $props();
</script>

<div
	data-layer="badge.ball"
	style={`position:relative; flex:none; width:13cqw; height:13cqw; border-radius:50%; background:#f6f3ea; box-shadow:0 0 0 0.45cqw ${k.ink}; overflow:hidden; display:flex; align-items:center; justify-content:center; ${style}`}
>
	<div
		data-layer="badge.seam-left"
		aria-hidden="true"
		style={`position:absolute; left:-58%; top:4%; width:78%; height:92%; border-radius:50%; box-sizing:border-box; border:0.4cqw dashed #c4342d; ${seamStyle}`}
	></div>
	<div
		data-layer="badge.seam-right"
		aria-hidden="true"
		style={`position:absolute; right:-58%; top:4%; width:78%; height:92%; border-radius:50%; box-sizing:border-box; border:0.4cqw dashed #c4342d; ${seamStyle}`}
	></div>
	<div
		data-rt
		data-layer="badge.position"
		style={`position:relative; font-family:'Roboto Serif', serif; font-weight:800; font-style:italic; font-size:4.4cqw; line-height:1; color:${k.ink}; ${positionStyle}`}
	>
		{position}
	</div>
</div>
