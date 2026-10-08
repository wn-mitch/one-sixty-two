import { describe, expect, it } from 'vitest';
import { selectPhoto, validateMedia } from './client.ts';
import { captureLabel, comparePhotos, exactSeason, isCaptureDate, photoLabel, photoTier } from './photo-policy.ts';
import type { CaptureDate, MediaManifest, PlayerPhoto } from './types.ts';
import { canonicalJSON } from '../../../scripts/data/compile.ts';
import { digest } from '../../../scripts/media/cache.ts';
import { validateReviews } from '../../../scripts/media/reviews.ts';
import type { ApprovedPhotoReview } from '../../../scripts/media/types.ts';

const version = 'a'.repeat(64);
const url = 'https://example.invalid/source';
function photo(id: string, date: CaptureDate, uniform: PlayerPhoto['uniform'] = 'mlb', context: PlayerPhoto['context'] = 'playing'): PlayerPhoto {
	return { url: `/media/${version}/${digest(id)}.webp`, width: 300, height: 384, sourceUrl: url,
		license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', credit: 'Synthetic creator',
		sourceId: id, captureDate: date, ...(date.kind === 'exact' ? { year: date.year } : {}), uniform, context, review: 'approved',
		...(date.kind !== 'unknown' ? { captureEvidenceUrl: url } : {}),
		evidence: { identityUrl: url, uniformUrl: url, contextUrl: url, rightsUrl: url, rightsBasis: 'Creator release', sourceChecksum: digest(id), snapshotChecksum: digest(id) } };
}
function manifest(photos: PlayerPhoto[]): MediaManifest {
	return { schemaVersion: 3, version, dataVersion: version, modifications: 'Cropped and resized',
		teams: { A: { name: 'Club A', color: '#123456', logo: null, historical: [] } },
		players: { player: { name: 'Synthetic Player', firstYear: 1990, lastYear: 2001, photos } }, atmosphere: {},
		diagnostics: { playersSearched: 1, playersWithPhotos: Number(photos.length > 0), photos: photos.length, logos: 0, historicalLogos: 0, atmospherePhotos: 0, excluded: 0 } };
}
const exact = (year: number): CaptureDate => ({ kind: 'exact', year });

describe('uniform and era preference', () => {
	it('orders every tier and retains pre-debut minor-league and later uniforms', () => {
		const photos = [photo('decade', exact(1991)), photo('mlb', exact(1989)), photo('minor', exact(1996), 'minor'),
			photo('other', exact(1996), 'other'), photo('later', exact(2015), 'mlb', 'later')];
		expect(photos.map(p => photoTier(p, 1996))).toEqual([0, 1, 2, 3, 4]);
		for (let i = 0; i < photos.length; i++) expect(selectPhoto(manifest(photos.slice(i).reverse()), 'player', 1996)?.sourceId).toBe(photos[i].sourceId);
		const minor = photo('pre-debut', exact(1988), 'minor');
		expect(() => validateMedia(manifest([minor]), version)).not.toThrow();
		expect(selectPhoto(manifest([minor]), 'player', 1996)).toBe(minor);
	});
	it('ranks date before team, team before quality, and unknown dates last within a tier', () => {
		const close = photo('close', exact(1995)), team = { ...photo('team', exact(1994)), franchiseId: 'A' };
		expect(selectPhoto(manifest([team, close]), 'player', 1996, 'A')).toBe(close);
		const large = { ...photo('large', exact(1994)), width: 384, height: 384 };
		expect(selectPhoto(manifest([large, team]), 'player', 1996, 'A')).toBe(team);
		expect(selectPhoto(manifest([large, photo('small', exact(1994))]), 'player', 1996)).toBe(large);
		const undated = photo('unknown', { kind: 'unknown' });
		expect(selectPhoto(manifest([undated, photo('dated', exact(1980))]), 'player', 1996)?.sourceId).toBe('dated');
		expect(selectPhoto(manifest([undated, photo('minor', exact(1996), 'minor')]), 'player', 1996)).toBe(undated);
	});
	it('retains same-year alternatives and breaks complete ties by source identity', () => {
		const a = photo('a', exact(1996)), b = photo('b', exact(1996));
		expect(selectPhoto(manifest([b, a]), 'player', 1996)).toBe(a);
		expect(comparePhotos(a, b, 1996)).toBeLessThan(0);
		expect(selectPhoto(manifest([a, { ...b, franchiseId: 'A' }]), 'player', 1996, 'A')?.sourceId).toBe('b');
	});
	it('never manufactures a uniform classification from a legacy approval', () => {
		const legacy = { ...photo('legacy', exact(1996)), review: 'legacy' as const, uniform: 'unclassified' as const, context: 'unclassified' as const };
		expect(photoTier(legacy, 1996)).toBe(5);
		expect(selectPhoto(manifest([legacy]), 'player', 1996)).toBe(legacy);
		expect(selectPhoto(manifest([legacy, photo('later', exact(2010), 'mlb', 'later')]), 'player', 1996)?.sourceId).toBe('later');
		expect(() => validateMedia(manifest([{ ...legacy, uniform: 'mlb' }]), version)).toThrow('Legacy');
	});
});

describe('capture dates and public provenance', () => {
	it('labels uncertainty and does not call approximate or spanning dates exact-season photos', () => {
		const approximate = photo('approx', { kind: 'approximate', year: 1996 });
		const range = photo('range', { kind: 'range', firstYear: 1989, lastYear: 1992 });
		expect(captureLabel(approximate)).toBe('c. 1996');
		expect(exactSeason(approximate, 1996)).toBe(false);
		expect(captureLabel(range)).toBe('1989–1992');
		expect(photoTier(range, 1996)).toBe(1);
		expect(photoLabel(photo('unknown', { kind: 'unknown' }, 'minor'))).toBe('Photo date unknown · Minor-league photo');
		expect(photoLabel(photo('later', exact(2015), 'mlb', 'later'))).toContain('Later uniform');
	});
	it('rejects malformed dates, invented exact years, missing reviews, and unsafe evidence', () => {
		for (const date of [{ kind: 'range', firstYear: 2001, lastYear: 1990 }, { kind: 'unknown', year: 1996 }, { kind: 'exact', year: 0 }]) expect(isCaptureDate(date)).toBe(false);
		const p = photo('unknown', { kind: 'unknown' });
		expect(() => validateMedia(manifest([{ ...p, year: 1996 }]), version)).toThrow('capture');
		expect(() => validateMedia(manifest([{ ...p, review: undefined }]), version)).toThrow('review');
		expect(() => validateMedia(manifest([{ ...p, license: 'CC BY-NC 4.0' }]), version)).toThrow('review');
		expect(() => validateMedia(manifest([{ ...photo('dated', exact(1996)), captureEvidenceUrl: undefined }]), version)).toThrow('review');
		expect(() => validateMedia(manifest([{ ...p, evidence: { ...p.evidence!, rightsUrl: 'http://example.invalid' } }]), version)).toThrow('evidence');
		expect(() => validateMedia(manifest([{ ...p, crop: { x: .9, y: 0, width: .2, height: 1 } }]), version)).toThrow('crop');
	});
});

function review(): ApprovedPhotoReview {
	const metadata = { title: 'Synthetic photograph.jpg', pageId: 1, sourceId: 'commons:1', width: 300, height: 350, mime: 'image/jpeg', downloadUrl: 'https://example.invalid/image.jpg', sourceUrl: url,
		dateOriginal: 'Uploaded in 2025', description: 'Photographic card extract', license: 'Public domain', licenseUrl: 'https://example.invalid/rights', credit: 'Synthetic publisher' };
	return { playerId: 'player', sourceId: 'commons:1', status: 'approved', metadata, captureDate: { kind: 'unknown' }, uniform: 'minor', context: 'playing',
		evidence: { identityUrl: url, uniformUrl: url, contextUrl: url, rightsUrl: url, rightsBasis: 'Documented underlying publication rights', sourceChecksum: digest('image'), snapshotChecksum: digest(canonicalJSON(metadata)) },
		notes: 'Inspected individual photographic extract and publication evidence', visualReview: true, rights: { kind: 'reproduction', underlyingRightsUrl: url } };
}
describe('explicit review gate', () => {
	const players = new Set(['player']), franchises = new Set(['A']);
	it('accepts reviewed card photographs without interpreting upload dates as capture evidence', () => {
		const r = review();
		expect(() => validateReviews([r], players, franchises)).not.toThrow();
		expect(r.captureDate).toEqual({ kind: 'unknown' });
	});
	it('rejects unreviewed images, stale snapshots, and reproduction rights inferred from uploader licenses', () => {
		expect(() => validateReviews([{ ...review(), visualReview: false } as unknown as ApprovedPhotoReview], players, franchises)).toThrow('reviewed');
		const changed = review(); changed.metadata.credit = 'Different owner';
		expect(() => validateReviews([changed], players, franchises)).toThrow('snapshot');
		const reproduction = review(); reproduction.rights = { kind: 'reproduction' };
		expect(() => validateReviews([reproduction], players, franchises)).toThrow('Underlying');
		expect(() => validateReviews([review(), review()], players, franchises)).toThrow('duplicate');
	});
});
