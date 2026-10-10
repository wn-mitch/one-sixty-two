<script lang="ts">
	import ShareArtwork from '#lib/share/ShareArtwork.svelte';
	import {
		SHARE_DIMENSIONS,
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
	const format: ShareFormat = 'field';
	let publishedImage = $derived(publication?.images[format] ?? null);
	let previewRecord = $derived(publication?.record ?? model.record);
	// The live preview renders at the published pixel size and scales down, so compact card minimums
	// lay out exactly as they do in the captured PNG.
	let previewWidth = $state(0);
	let previewScale = $derived(previewWidth / SHARE_DIMENSIONS[format].width);
	let statusIsError = $derived(/unavailable|could not|denied|incompatible|cannot be published/i.test(status));

	function selectLink(event: FocusEvent | MouseEvent): void {
		(event.currentTarget as HTMLInputElement).select();
	}
</script>

<section class="share-panel" aria-labelledby="share-art-heading" aria-busy={sharing}>
	<header>
		<div>
			<p class="eyebrow">Share the season</p>
			<h3 id="share-art-heading">Challenge a friend</h3>
		</div>
	</header>

	<div class="preview" bind:clientWidth={previewWidth} style:aspect-ratio={publishedImage ? undefined : `${SHARE_DIMENSIONS[format].width} / ${SHARE_DIMENSIONS[format].height}`}>
		{#if publishedImage}
			<img
				src={publishedImage.url}
				width={publishedImage.width}
				height={publishedImage.height}
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
	{#if status}
		<p class:error={statusIsError} class="share-status" role={statusIsError ? 'alert' : 'status'} aria-live="polite">{status}</p>
	{/if}
</section>

<style>
	.share-panel {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
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
	.eyebrow { margin: 0; }
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
	.stage { position: absolute; top: 0; left: 0; transform-origin: 0 0; }
	.preview-state {
		margin: calc(var(--space-3) * -1) 0 0;
		color: var(--muted);
		font-size: var(--text-xs);
	}
	/* One primary action, then the secondary ways to share joined into a single control. */
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}
	.action-group {
		display: inline-flex;
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
	.share-status { margin: 0; color: var(--muted); }
	.share-status.error { color: var(--error); }
	/* Wide screens keep the preview at a readable size and set the controls beside it. */
	@media (min-width: 64rem) {
		.share-panel { grid-template-columns: minmax(0, 30rem) minmax(0, 1fr); column-gap: var(--space-8); align-content: start; }
		.share-panel > * { grid-column: 2; }
		.share-panel > .preview { grid-column: 1; grid-row: 1 / span 8; align-self: start; }
		.share-panel > .preview-state { margin-top: 0; }
		header { flex-direction: column; align-items: start; }
	}
	@media (max-width: 40rem) {
		header { align-items: start; flex-direction: column; }
		.actions .primary, .action-group { width: 100%; }
		.action-group button { flex: 1; min-width: 0; padding-inline: var(--space-2); white-space: normal; line-height: 1.15; }
	}
</style>
