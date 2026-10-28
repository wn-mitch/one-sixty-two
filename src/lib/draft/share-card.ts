import { mount, unmount } from 'svelte';
import DraftShareCard from '../components/draft-mode/DraftShareCard.svelte';
import type { DraftSharedReport } from './share-report.ts';

export const DRAFT_CARD_SIZE = { width: 1200, height: 630 } as const;

/**
 * Draws the shared season's card as a PNG in this browser: mounted off screen at its pixel size, then
 * rasterized once the fonts are ready. The card is text only, so nothing waits on images.
 */
export async function renderDraftCard(report: DraftSharedReport): Promise<Blob> {
 const { width, height } = DRAFT_CARD_SIZE;
 const host = document.createElement('div');
 host.setAttribute('aria-hidden', 'true');
 host.inert = true;
 host.style.cssText = `position:fixed;left:-${width * 4}px;top:0;width:${width}px;pointer-events:none;contain:layout paint;`;
 document.body.append(host);
 const component = mount(DraftShareCard, { target: host, props: { report } });
 try {
  const root = host.querySelector<HTMLElement>('[data-draft-card]');
  if (!root) throw new Error('The share card did not render.');
  await document.fonts?.ready;
  const { domToBlob } = await import('modern-screenshot');
  const blob = await domToBlob(root, { width, height, scale: 1, type: 'image/png', timeout: 15_000 });
  if (!blob || blob.type !== 'image/png') throw new Error('This browser could not draw the share card.');
  return blob;
 } finally {
  await unmount(component);
  host.remove();
 }
}
