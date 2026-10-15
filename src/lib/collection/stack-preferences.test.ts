import { describe, expect, it } from 'vitest';
import { loadStackCoverPreferences, saveStackCoverPreferences, type PreferenceStorage } from './stack-preferences.ts';

function memory(initial: string | null = null): PreferenceStorage & { value: string | null } {
	return {
		value: initial,
		getItem: () => initial,
		setItem(_key, value) { this.value = value; initial = value; }
	};
}

describe('collection stack cover preferences', () => {
	it('round-trips only string player and season ids', () => {
		const target = memory();
		expect(saveStackCoverPreferences({ player: 'player:2024:AL:AAA' }, target)).toBe(true);
		expect(target.value).toContain('player:2024:AL:AAA');
		expect(loadStackCoverPreferences(target)).toEqual({ player: 'player:2024:AL:AAA' });
	});

	it('reports blocked storage instead of claiming a preference persisted', () => {
		const target: PreferenceStorage = {
			getItem: () => null,
			setItem: () => { throw new Error('blocked'); }
		};
		expect(saveStackCoverPreferences({ player: 'season' }, target)).toBe(false);
	});
});
