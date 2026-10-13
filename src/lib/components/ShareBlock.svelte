<script lang="ts">
	import { challengeUrl } from '#lib/game/share.ts';
	import { onDestroy } from 'svelte';
	import ShareArtwork from '#lib/share/ShareArtwork.svelte';
	import { renderSharePng } from '#lib/share/render.ts';
	import { toasts } from '#lib/toast.svelte.ts';
	import {
		SHARE_DIMENSIONS,
		SHARE_FORMATS,
		type ShareAction,
		type ShareFormat,
		type SharePublication,
		type ShareRenderModel
	} from '#lib/share/types.ts';

	interface Props {
		model: ShareRenderModel;
		publication: SharePublication | null;
		sharing: boolean;
		status: string;
		onShare: (action: ShareAction, format: ShareFormat) => void;
	}

	let { model, publication, sharing, status, onShare }: Props = $props();
	const FORMAT_LABELS: Record<ShareFormat, string> = { field: 'Field', fan: 'Cards' };
	let format = $state<ShareFormat>(SHARE_FORMATS[0]);
	let publishedImage = $derived(publication?.images[format] ?? null);
	let previewRecord = $derived(publication?.record ?? model.record);
	// The live preview renders at the published pixel size and scales down, so compact card minimums
	// lay out exactly as they do in the captured PNG.
	let previewWidth = $state(0);
	let previewScale = $derived(previewWidth / SHARE_DIMENSIONS[format].width);
	/**
	 * Before publication the preview is a PNG drawn on this device, so it can be copied or saved straight
	 * away; the live artwork shows until it is ready, or if this browser cannot draw it.
	 */
	let localImages = $state<Record<string, string>>({});
	const drawing = new Set<string>();
	let destroyed = false;
	/** The model is rebuilt as media and rankings arrive; a drawing belongs to the content it shows. */
	const modelKey = $derived(`${model.dataVersion}:${model.mediaVersion}:${model.rankingVersion}:${model.record.wins}-${model.record.losses}:${model.battingOrder.join(',')}`);
	const imageKey = $derived(`${modelKey}|${format}`);
	/**
	 * Drawing clones the whole artwork and inlines its styles, so it waits until the panel is near
	 * the screen and the content has stopped changing (media and rankings land after the results
	 * appear), then runs while the browser is idle. Each content change would otherwise draw again.
	 */
	let near = $state(false);
	const SETTLE_MS = 1000;
	$effect(() => {
		const key = imageKey;
		const [current, wanted] = [model, format];
		if (!near || publishedImage || localImages[key] || drawing.has(key)) return;
		let idle = 0;
		const timer = setTimeout(() => {
			const draw = () => {
				drawing.add(key);
				renderSharePng(current, wanted).then(blob => {
					if (!destroyed) localImages = { ...localImages, [key]: URL.createObjectURL(blob) };
				}).catch(() => {}).finally(() => drawing.delete(key));
			};
			if ('requestIdleCallback' in window) idle = requestIdleCallback(draw, { timeout: 2000 });
			else draw();
		}, SETTLE_MS);
		return () => { clearTimeout(timer); if (idle) cancelIdleCallback(idle); };
	});
	function nearScreen(node: HTMLElement) {
		const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { near = true; observer.disconnect(); } }, { rootMargin: '600px 0px' });
		observer.observe(node);
		return { destroy: () => observer.disconnect() };
	}
	onDestroy(() => {
		destroyed = true;
		for (const url of Object.values(localImages)) URL.revokeObjectURL(url);
	});
	let localImage = $derived(publishedImage ? null : localImages[imageKey] ?? null);
	let statusIsError = $derived(/unavailable|could not|denied|incompatible|cannot be published/i.test(status));

	// Share progress and outcomes are toasts; one slot so an outcome replaces its progress message.
	$effect(() => { if (status) toasts.show(status, { id: 'share', tone: statusIsError ? 'error' : 'info' }); });

	function selectLink(event: FocusEvent | MouseEvent): void {
		(event.currentTarget as HTMLInputElement).select();
	}
</script>

<section class="share-panel" aria-labelledby="share-art-heading" aria-busy={sharing} use:nearScreen>
	<header>
		<div>
			<h3 id="share-art-heading">Challenge a friend</h3>
		</div>
	</header>

	<div class="formats" role="radiogroup" aria-label="Share image layout">
		{#each SHARE_FORMATS as option (option)}
			<button type="button" role="radio" aria-checked={format === option} onclick={() => (format = option)}>{FORMAT_LABELS[option]}</button>
		{/each}
	</div>

	<div class="preview" bind:clientWidth={previewWidth} style:aspect-ratio={publishedImage ? undefined : `${SHARE_DIMENSIONS[format].width} / ${SHARE_DIMENSIONS[format].height}`}>
		{#if publishedImage}
			<img
				src={publishedImage.url}
				width={publishedImage.width}
				height={publishedImage.height}
				alt={`${previewRecord.wins}-${previewRecord.losses} season share image`}
			/>
		{:else if localImage}
			<img
				src={localImage}
				width={SHARE_DIMENSIONS[format].width}
				height={SHARE_DIMENSIONS[format].height}
				alt={`${previewRecord.wins}-${previewRecord.losses} season share image`}
			/>
		{:else}
			<div class="stage" style:width="{SHARE_DIMENSIONS[format].width}px" style:transform="scale({previewScale})">
				<ShareArtwork {model} {format} />
			</div>
		{/if}
	</div>
	{#if publishedImage}
		<p class="preview-state">Published PNG · {SHARE_DIMENSIONS[format].width}×{SHARE_DIMENSIONS[format].height}</p>
	{/if}
	<div class="actions">
		<button class="primary" type="button" disabled={sharing} onclick={() => onShare('challenge', format)}>Challenge a friend</button>
		<div class="action-group" role="group" aria-label="More ways to share">
			<button type="button" disabled={sharing} onclick={() => onShare('copy-link', format)}>Copy link</button>
			<button type="button" disabled={sharing} onclick={() => onShare('download', format)}>Download PNG</button>
			<button type="button" disabled={sharing} onclick={() => onShare('copy-image', format)}>Copy image</button>
		</div>
	</div>

	{#if publication}
		<label for="published-challenge-link">Challenge link</label>
		<input
			id="published-challenge-link"
			class="share-link"
			type="url"
			readonly
			value={challengeUrl(publication)}
			onfocus={selectLink}
			onclick={selectLink}
		/>
		<label for="published-share-link">Replay link</label>
		<input
			id="published-share-link"
			class="share-link"
			type="url"
			readonly
			value={publication.replayUrl}
			onfocus={selectLink}
			onclick={selectLink}
		/>
	{/if}
</section>

<style>
	/* One centered column at the preview's width: the image, then every share action beneath it. */
	.share-panel {
		display: grid;
		grid-template-columns: minmax(0, 30rem);
		justify-content: center;
		gap: var(--space-4);
		min-width: 0;
		padding-block: var(--space-6);
		border-block: 1px solid var(--border);
	}
	header {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: var(--space-4);
	}
	h3 { margin: var(--space-1) 0 0; }
	.preview {
		position: relative;
		width: 100%;
		min-width: 0;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.preview img { display: block; width: 100%; height: auto; }
	/* The stage is the artwork's query container, so its cqw padding matches the published 1080px frame. */
	.stage { position: absolute; top: 0; left: 0; transform-origin: 0 0; container-type: inline-size; }
	.preview-state {
		margin: calc(var(--space-3) * -1) 0 0;
		color: var(--muted);
		font-size: var(--text-xs);
	}
	/* Layout choice: two equal segments above the preview. */
	.formats {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}
	.formats button {
		min-height: 2.5rem;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 700;
	}
	.formats button + button { border-left: 1px solid var(--border); }
	.formats button[aria-checked='true'] { background: var(--surface-raised); color: var(--text); box-shadow: inset 0 -2px 0 var(--accent); }
	/* One primary action, then the secondary ways to share joined into a single control. */
	.actions {
		display: grid;
		gap: var(--space-2);
	}
	.actions .primary { min-height: 3rem; }
	.action-group {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}
	.action-group button {
		min-height: 2.75rem;
		padding: 0 var(--space-4);
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 650;
		white-space: nowrap;
	}
	.action-group button { padding-inline: var(--space-2); }
	.action-group button + button { border-left: 1px solid var(--border); }
	.action-group button:hover:not(:disabled) { background: var(--surface-raised); }
	.share-panel button:disabled { cursor: wait; opacity: .58; }
	label {
		font-size: var(--text-xs);
		font-weight: 700;
		color: var(--muted);
	}
	.share-link {
		width: 100%;
		min-height: 2.75rem;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
		font: inherit;
	}
	@media (max-width: 40rem) {
		header { align-items: start; flex-direction: column; }
		.action-group button { white-space: normal; line-height: 1.15; }
	}
</style>
