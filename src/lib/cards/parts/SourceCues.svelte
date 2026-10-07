<script lang="ts">
	import { fit } from '../fit.ts';
	import type { CardBack } from '../view-model.ts';

	export interface SourceCuesProps {
		back: CardBack;
		onDetails: () => void;
		style?: string;
		statsStyle?: string;
		photoStyle?: string;
		buttonStyle?: string;
	}

	let {
		back,
		onDetails,
		style = '',
		statsStyle = '',
		photoStyle = '',
		buttonStyle = ''
	}: SourceCuesProps = $props();
</script>

<div data-layer="sources" style={`display:flex; justify-content:space-between; align-items:flex-end; gap:3cqw; ${style}`}>
	<div style="display:flex; flex-direction:column; gap:0.8cqw; min-width:0;">
		<div use:fit={{ max: 2.8, min: 2.3 }} data-rt data-fit data-max="2.8" data-min="2.3" data-layer="sources.stats" style={`font-size:2.8cqw; line-height:1; letter-spacing:0.05em; text-transform:uppercase; white-space:nowrap; font-weight:600; ${statsStyle}`}>{back.srcStats}</div>
		<div use:fit={{ max: 2.8, min: 2.3 }} data-rt data-fit data-max="2.8" data-min="2.3" data-layer="sources.photo" style={`font-size:2.8cqw; line-height:1; letter-spacing:0.05em; text-transform:uppercase; white-space:nowrap; font-weight:600; ${photoStyle}`}>{back.srcPhoto}</div>
	</div>
	<button type="button" data-layer="sources.cue" aria-label={`Open details for ${back.name}`} onclick={onDetails} style={`flex:none; display:flex; align-items:center; gap:1cqw; min-height:0; min-width:0; padding:0; border:0; border-radius:0; background:transparent; color:inherit; font:inherit; font-size:2.8cqw; line-height:1; letter-spacing:0.05em; text-transform:uppercase; font-weight:700; cursor:pointer; transition:none; ${buttonStyle}`}>
		{back.srcCue}
	</button>
</div>
