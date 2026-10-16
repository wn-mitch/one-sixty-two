<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { CardFront } from '../view-model.ts';
	import { resolvePhotoFit } from '../../media/framing.ts';
	import { photoCropGeometry } from '../photo-geometry.ts';

	export interface PhotoMaskProps {
		s: Pick<CardFront, 'full' | 'photo' | 'hasPhoto' | 'noPhoto' | 'photoNote' | 'caption' | 'k'> & Partial<Pick<CardFront, 'selectedPhoto' | 'era'>>;
		front?: boolean;
		style?: string;
		imageStyle?: string;
		emptyStyle?: string;
		emptyColor?: string;
		focus?: string;
		children?: Snippet;
	}

	let {
		s,
		front = false,
		style = '',
		imageStyle = '',
		emptyStyle = '',
		emptyColor,
		focus = '50% 22%',
		children
	}: PhotoMaskProps = $props();
	let failed = $state(false);
	let previousUrl = $state('');
	const reviewedFit = $derived(front && s.era ? resolvePhotoFit(s.selectedPhoto?.framing, s.era) : undefined);
	const framingStyle = $derived(reviewedFit ? `object-fit:${reviewedFit.mode}; object-position:${reviewedFit.position.x * 100}% ${reviewedFit.position.y * 100}%; background:${s.k.accent};` : '');
	let root: HTMLDivElement;
	let frame = $state({ width: 0, height: 0 });
	const cropped = $derived(reviewedFit?.displayCrop ? photoCropGeometry(s.selectedPhoto?.width ?? 0, s.selectedPhoto?.height ?? 0, frame.width, frame.height, reviewedFit) : undefined);
	$effect(() => {
		if (!root || !reviewedFit?.displayCrop) return;
		const measure = () => { frame = { width: root.clientWidth, height: root.clientHeight }; };
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(root);
		return () => observer.disconnect();
	});

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

<div bind:this={root} data-layer="photo.content" style={`position:absolute; inset:0; ${cropped ? `background:${s.k.accent};` : ''} ${style}`}>
	{#if s.hasPhoto && s.photo && !failed}
		<div data-layer="photo.viewport" style={cropped?.viewport ?? 'display:contents;'}>
		<img
			data-rt
			data-layer="photo.image"
			src={s.photo}
			alt={s.selectedPhoto?.subject === 'team' ? `${s.selectedPhoto.contextLabel} · ${s.caption}` : `${s.full} · ${s.caption}`}
			style={`position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:${focus}; display:block; ${imageStyle}; ${s.selectedPhoto?.subject === 'team' ? `object-fit:contain; object-position:center; background:${s.k.accent};` : ''} ${framingStyle} ${cropped?.image ?? ''}`}
			onerror={markUnavailable}
		/>
		</div>
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
