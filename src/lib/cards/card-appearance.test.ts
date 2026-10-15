import { describe, expect, it } from 'vitest';
import { resolveCardAppearance } from './card-appearance.ts';

const equipped = { film: 'galaxy', plate: 'damascus', palette: 8 } as const;

describe('resolveCardAppearance', () => {
	it('distinguishes equipped, original-default, and isolated preview appearances', () => {
		expect(resolveCardAppearance('gem', equipped, undefined)).toEqual({ film: 'galaxy', palette: 8 });
		expect(resolveCardAppearance('gem', equipped, null)).toEqual({ film: undefined, palette: undefined });
		expect(resolveCardAppearance('gem', equipped, { film: 'mojo', palette: 2 })).toEqual({ film: 'mojo', palette: 2 });
	});

	it('restricts shop cosmetics to the card tier without changing that tier', () => {
		expect(resolveCardAppearance('base', equipped, undefined)).toEqual({});
		expect(resolveCardAppearance('foil', equipped, undefined)).toEqual({ plate: 'damascus' });
		expect(resolveCardAppearance('emboss', equipped, undefined)).toEqual({ plate: 'damascus' });
		expect(resolveCardAppearance('gem', equipped, undefined)).toEqual({ film: 'galaxy', palette: 8 });
		expect(resolveCardAppearance('foil', equipped, { film: 'mojo', plate: 'brushed', palette: 2 })).toEqual({ plate: 'brushed' });
		expect(resolveCardAppearance('gem', equipped, { film: 'mojo', plate: 'brushed', palette: 2 })).toEqual({ film: 'mojo', palette: 2 });
	});

	it('keeps workshop props final and prevents them inheriting equipped cosmetics', () => {
		expect(resolveCardAppearance('gem', equipped, undefined, 'mojo')).toEqual({ film: 'mojo' });
		expect(resolveCardAppearance('emboss', equipped, undefined, undefined, 'brushed')).toEqual({ plate: 'brushed' });
		expect(resolveCardAppearance('gem', equipped, { film: 'galaxy', palette: 8 }, 'mojo', 'brushed')).toEqual({ film: 'mojo', palette: 8, plate: 'brushed' });
	});
});
