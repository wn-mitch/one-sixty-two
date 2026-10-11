import { mount, unmount } from 'svelte';
import { waitForShareCapture } from './capture.ts';
import ShareArtwork from './ShareArtwork.svelte';
import { SHARE_DIMENSIONS, type ShareFormat, type ShareRenderModel } from './types.ts';

/**
 * Renders the share artwork off screen at its published pixel size and rasterizes it in this
 * browser. The published PNG is exactly what this device draws; nothing is recomputed elsewhere.
 */
export async function renderSharePng(model: ShareRenderModel, format: ShareFormat): Promise<Blob> {
 const { width, height } = SHARE_DIMENSIONS[format];
 const host = document.createElement('div');
 host.setAttribute('aria-hidden', 'true');
 host.inert = true;
 // The host is the artwork's query container, so its cqw lengths resolve against the 1080px frame, not this device's viewport.
 host.style.cssText = `position:fixed;left:-${width * 4}px;top:0;width:${width}px;container-type:inline-size;pointer-events:none;contain:layout paint;`;
 document.body.append(host);
 // Lazy images never load outside the viewport, so every image in the capture host loads eagerly.
 const eager = (node: ParentNode) => node.querySelectorAll('img[loading="lazy"]').forEach(image => { (image as HTMLImageElement).loading = 'eager'; });
 const observer = new MutationObserver(() => eager(host));
 observer.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ['loading'] });
 const component = mount(ShareArtwork, { target: host, props: { model, format } });
 eager(host);
 try {
  const root = host.querySelector<HTMLElement>('[data-share-artwork]');
  if (!root) throw new Error('The share artwork did not render.');
  await waitForShareCapture(root, format);
  const { domToBlob } = await import('modern-screenshot');
  const blob = await domToBlob(root, { width, height, scale: 1, type: 'image/png', backgroundColor: null, timeout: 15_000 });
  if (!blob || blob.type !== 'image/png') throw new Error('This browser could not draw the share image.');
  return blob;
 } finally {
  observer.disconnect();
  await unmount(component);
  host.remove();
 }
}
