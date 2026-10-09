/**
 * Reviewed backing treatments for the current franchise marks in the media index.
 * Most marks are monograms or freeform silhouettes and read better in a square
 * tile. These three source assets are intentionally retained as roundels.
 */
export type LogoShape = 'square' | 'round';

const LOGO_SHAPE_BY_FRANCHISE: Record<string, LogoShape> = {
	CHC: 'round',
	CIN: 'round',
	MIN: 'round'
};

export function logoShapeFor(franchiseId: string): LogoShape {
	return LOGO_SHAPE_BY_FRANCHISE[franchiseId] ?? 'square';
}
