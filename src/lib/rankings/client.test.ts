import { describe, expect, it } from 'vitest';
import { validateRankings, validateRankingsPointer } from './client.ts';
import type { WarRankings } from './types.ts';

const dataVersion = 'a'.repeat(64);
const rankingVersion = 'b'.repeat(64);
const manifest: WarRankings = {
	schemaVersion: 1,
	dataVersion,
	rankingVersion,
	source: {
		name: 'Synthetic WAR source',
		url: 'https://example.invalid/source',
		licenceUrl: 'https://example.invalid/license',
		licenceText: 'MIT License',
		commit: 'c'.repeat(40),
		description: 'Synthetic source snapshot.'
	},
	seasons: {
		'player:1970:AL:OLD': { battingWAR162: -0.5, pitchingWAR162: null },
		'pitcher:2025:NL:NEW': { battingWAR162: null, pitchingWAR162: 0 }
	},
	coverage: { candidates: 2, batting: 1, pitching: 1, missing: 0 }
};

describe('rankings manifest validation', () => {
	it('accepts nullable, negative, and zero role values', () => {
		expect(() => validateRankings(manifest, dataVersion, rankingVersion)).not.toThrow();
	});

	it('rejects non-finite values and incompatible versions', () => {
		expect(() => validateRankings({ ...manifest, seasons: { bad: { battingWAR162: Number.NaN, pitchingWAR162: null } } }, dataVersion, rankingVersion)).toThrow('bad');
		expect(() => validateRankings(manifest, 'd'.repeat(64), rankingVersion)).toThrow('incompatible');
	});

	it('validates the atomic current pointer target', () => {
		const pointer = { schemaVersion: 1, dataVersion, rankingVersion, manifestUrl: `/rankings/${rankingVersion}/manifest.json` };
		expect(() => validateRankingsPointer(pointer, dataVersion)).not.toThrow();
		expect(() => validateRankingsPointer({ ...pointer, manifestUrl: '/rankings/other/manifest.json' }, dataVersion)).toThrow('incompatible');
	});
});
