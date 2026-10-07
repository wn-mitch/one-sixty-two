<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { CardFront } from '../view-model.ts';

	export interface PhotoMaskProps {
		s: Pick<CardFront, 'full' | 'photo' | 'hasPhoto' | 'noPhoto' | 'photoNote' | 'k'>;
		style?: string;
		imageStyle?: string;
		emptyStyle?: string;
		emptyColor?: string;
		focus?: string;
		children?: Snippet;
	}

	let {
		s,
		style = '',
		imageStyle = '',
		emptyStyle = '',
		emptyColor,
		focus = '50% 22%',
		children
	}: PhotoMaskProps = $props();
	let failed = $state(false);
	let previousUrl = $state('');

	$effect(() => {
		if (previousUrl !== s.photo) {
			previousUrl = s.photo;
			failed = false;
		}
	});

	function markUnavailable(): void {
		failed = true;
	}
</script>

<div data-layer="photo.content" style={`position:absolute; inset:0; ${style}`}>
	{#if s.hasPhoto && s.photo && !failed}
		<img
			data-rt
			data-layer="photo.image"
			src={s.photo}
			alt={`${s.full} photo`}
			style={`position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:${focus}; display:block; ${imageStyle}`}
			onerror={markUnavailable}
		/>
	{:else}
		<div
			data-layer="photo.empty"
			role="img"
			aria-label={failed ? 'Photo unavailable' : s.photoNote}
			style={`position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:repeating-linear-gradient(135deg, rgba(255,255,255,.1) 0 1.1cqw, rgba(0,0,0,0) 1.1cqw 2.2cqw), ${s.k.accent}; ${emptyStyle}`}
		>
			<span style={`font-weight:700; font-size:3.4cqw; line-height:1; letter-spacing:.14em; text-transform:uppercase; color:${emptyColor ?? s.k.onAccent};`}>
				{failed ? 'Photo unavailable' : s.photoNote}
			</span>
		</div>
	{/if}
	{@render children?.()}
</div>
