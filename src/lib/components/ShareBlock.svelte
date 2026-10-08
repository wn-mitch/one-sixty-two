<script lang="ts">
	import ShareArtwork from '#lib/share/ShareArtwork.svelte';
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
	let format = $state<ShareFormat>('scorecard');
	let publishedImage = $derived(publication?.images[format] ?? null);
	let previewRecord = $derived(publication?.record ?? model.record);
	let statusIsError = $derived(/unavailable|could not|denied|incompatible|cannot be published/i.test(status));

	const LABELS: Record<ShareFormat, string> = {
		scorecard: 'Scorecard',
		diamond: 'Diamond',
		wide: 'Wide'
	};

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
		<div class="format-picker" aria-label="Share image format">
			{#each SHARE_FORMATS as option}
				<button
					type="button"
					class:active={format === option}
					aria-pressed={format === option}
					disabled={sharing}
					onclick={() => format = option}
				>{LABELS[option]}</button>
			{/each}
		</div>
	</header>

	<div class="preview">
		{#if publishedImage}
			<img
				src={publishedImage.url}
				width={publishedImage.width}
				height={publishedImage.height}
				alt={`${previewRecord.wins}-${previewRecord.losses} season ${LABELS[format].toLowerCase()} share image`}
			/>
		{:else}
			<ShareArtwork {model} {format} />
		{/if}
	</div>
	<p class="preview-state">
		{#if publishedImage}
			Published PNG · {SHARE_DIMENSIONS[format].width}×{SHARE_DIMENSIONS[format].height}
		{:else}
			Local preview · The replay link is prepared when you share.
		{/if}
	</p>

	<div class="primary-actions">
		<button class="primary" type="button" disabled={sharing} onclick={() => onShare('challenge', format)}>Challenge a friend</button>
		<button class="secondary" type="button" disabled={sharing} onclick={() => onShare('copy-link', format)}>Copy link</button>
	</div>
	<div class="image-actions">
		<button class="secondary" type="button" disabled={sharing} onclick={() => onShare('download', format)}>Download PNG</button>
		<button class="secondary" type="button" disabled={sharing} onclick={() => onShare('copy-image', format)}>Copy image</button>
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
	.format-picker {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.format-picker button {
		min-height: 2.25rem;
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface);
		color: var(--muted);
		font: inherit;
		font-size: var(--text-xs);
		font-weight: 700;
		cursor: pointer;
	}
	.format-picker button:hover:not(:disabled),
	.format-picker button:focus-visible,
	.format-picker button.active {
		border-color: var(--text);
		color: var(--text);
	}
	.format-picker button.active { background: var(--surface-raised); }
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
	.preview-state {
		margin: calc(var(--space-3) * -1) 0 0;
		color: var(--muted);
		font-size: var(--text-xs);
	}
	.primary-actions, .image-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}
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
	@media (max-width: 40rem) {
		header { align-items: start; flex-direction: column; }
		.format-picker { width: 100%; }
		.format-picker button { flex: 1; }
		.primary-actions, .image-actions { display: grid; grid-template-columns: 1fr 1fr; }
		.primary-actions .primary { grid-column: 1 / -1; }
	}
</style>
