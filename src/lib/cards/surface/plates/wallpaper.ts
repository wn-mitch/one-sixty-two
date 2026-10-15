import { wallpaperGlsl, wallpaperParams } from '../wallpaper-ornament.ts';
import { definePlate } from './plate.ts';

/**
 * An engraved damask die: alternating palmette bouquets, hooked acanthus, open scrolls and beaded leaf borders.
 * The film uses this same geometry, so raised contours and diffraction describe the same ornament.
 */
export default definePlate({
	name: 'wallpaper',
	feature: 0.09,
	gain: 0.82,
	params: wallpaperParams,
	helpers: wallpaperGlsl('wallpaperPlate'),
	height: `
	vec2 flow;
	float variant;
	vec3 marks = wallpaperPlateOrnament(p * density, aspect, petal, curl, spread, ridge, veins, beads, flow, variant);
	// Use the screen footprint captured before branching, also valid for the offset normal samples.
	float aa = max(footprint * plateScale * scale * density * 0.55, 0.0002);
	float body = 1.0 - smoothstep(-aa, aa + ridge * 2.0, marks.x);
	float crest = 1.0 - smoothstep(0.0, ridge + aa, marks.y);
	float bead = 1.0 - smoothstep(-aa, aa, marks.z);
	float resolved = ridge / (ridge + aa);
	return (body * 0.22 + crest * crest * resolved * 0.6 + bead * resolved * 0.18) * 0.075 / density;
`
});
