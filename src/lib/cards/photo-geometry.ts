import type { PhotoFit } from '../media/types.ts';

/** Position a clipped derivative crop as a cover/contain image without stretching it. */
export function photoCropGeometry(sourceWidth: number, sourceHeight: number, frameWidth: number, frameHeight: number, fit: PhotoFit): {
 viewport: string; image: string;
} | undefined {
 const crop = fit.displayCrop;
 if (!crop || ![sourceWidth, sourceHeight, frameWidth, frameHeight].every(value => Number.isFinite(value) && value > 0)) return undefined;
 const width = sourceWidth * crop.width;
 const height = sourceHeight * crop.height;
 const scale = (fit.mode === 'cover' ? Math.max : Math.min)(frameWidth / width, frameHeight / height);
 const scaledWidth = width * scale;
 const scaledHeight = height * scale;
 const left = (frameWidth - scaledWidth) * fit.position.x;
 const top = (frameHeight - scaledHeight) * fit.position.y;
 return {
  viewport: `position:absolute; overflow:hidden; left:${left}px; top:${top}px; width:${scaledWidth}px; height:${scaledHeight}px;`,
  image: `inset:auto; left:${-sourceWidth * crop.x * scale}px; top:${-sourceHeight * crop.y * scale}px; width:${sourceWidth * scale}px; height:${sourceHeight * scale}px; max-width:none; max-height:none; object-fit:fill;`
 };
}
