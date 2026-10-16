import { expect, it } from 'vitest';
import { photoCropGeometry } from './photo-geometry.ts';
import type { PhotoFit } from '../media/types.ts';

const fit: PhotoFit = { mode: 'cover', position: { x: .5, y: 0 }, displayCrop: { x: .25, y: .25, width: .5, height: .5 } };
it('zooms a distant subject without distorting its source aspect ratio', () => {
 const result = photoCropGeometry(800, 400, 200, 200, fit)!;
 expect(result.viewport).toContain('left:-100px; top:0px; width:400px; height:200px');
 expect(result.image).toContain('left:-200px; top:-100px; width:800px; height:400px');
});
it('contains only the selected crop, leaving surrounding source pixels clipped behind the matte', () => {
 const result = photoCropGeometry(800, 400, 200, 200, { ...fit, mode: 'contain', position: { x: .5, y: .5 } })!;
 expect(result.viewport).toContain('overflow:hidden; left:0px; top:50px; width:200px; height:100px');
 expect(result.image).toContain('left:-100px; top:-50px; width:400px; height:200px');
});
it('recomputes responsive geometry and leaves ordinary photo rendering alone', () => {
 expect(photoCropGeometry(800, 400, 100, 100, fit)?.image).toContain('width:400px; height:200px');
 expect(photoCropGeometry(800, 400, 0, 100, fit)).toBeUndefined();
 expect(photoCropGeometry(800, 400, 100, 100, { mode: 'cover', position: { x: .5, y: .22 } })).toBeUndefined();
});
