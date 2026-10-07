import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { finishFor } from './finish.ts';
import { contrast, INK, KRAFT, mix, PAPER, roles, STOCK } from './tokens.ts';
import type { Profile } from '../game/types.ts';
import type { MediaManifest } from '../media/types.ts';
import { createCardViewModel, eraForYear } from './view-model.ts';

const teams = JSON.parse(readFileSync('scripts/media/team-sources.json', 'utf8')) as Record<string, { color: string }>;

describe('card ink contrast', () => {
 it('keeps each normal ink legible across every shipped franchise color', () => {
  for (const { color } of Object.values(teams)) {
   for (const secondary of [color, PAPER, INK, STOCK]) {
    const k = roles({ primary: color, secondary });
    for (const [ink, ground] of [[k.onField, k.field], [k.onAccent, k.accent], [k.fieldOnPaper, PAPER], [k.fieldOnStock, STOCK], [k.accentOnStock, STOCK], [k.fieldOnKraft, KRAFT], [k.tintOnDark, k.dark], [k.mutedOnDark, k.dark], [k.onRaised, k.raised], [k.onRaised, mix(k.raised, '#ffffff', 0.07)]]) {
     expect(contrast(ink, ground), `${ink} on ${ground}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(k.display, STOCK)).toBeGreaterThanOrEqual(3);
    expect(contrast(k.accentOnKraft, KRAFT)).toBeGreaterThanOrEqual(3);
   }
  }
 });
});

describe('fixed cosmetic finishes', () => {
 for (const role of ['hitter', 'starter', 'closer'] as const) {
  const cuts = role === 'closer' ? [0.5, 1.5, 2.5] : [2, 4, 6];
  it(`uses inclusive ${role} tier boundaries without changing stats`, () => {
   const value = (war: number) => role === 'hitter' ? finishFor(role, war, null) : finishFor(role, null, war);
   expect(value(cuts[0] - 0.00001)).toBe('base');
   expect(value(cuts[0])).toBe('foil');
   expect(value(cuts[1] - 0.00001)).toBe('foil');
   expect(value(cuts[1])).toBe('emboss');
   expect(value(cuts[2] - 0.00001)).toBe('emboss');
   expect(value(cuts[2])).toBe('gem');
  });
 }
 it('uses the highest finite two-way WAR, independent of the represented role', () => {
  expect(finishFor('hitter', 3.4, 6.1)).toBe('gem');
  expect(finishFor('starter', 6.1, 3.4)).toBe('gem');
  expect(finishFor('hitter', null, 4)).toBe('emboss');
  expect(finishFor('starter', 4, Number.NaN)).toBe('emboss');
  expect(finishFor('hitter', Number.POSITIVE_INFINITY, 2)).toBe('foil');
 });
 it('keeps bullpen units and wholly unavailable WAR at Base', () => {
  expect(finishFor('bullpen', 12, 12)).toBe('base');
  expect(finishFor('hitter', null, undefined)).toBe('base');
  expect(finishFor('starter', Number.NaN, Number.NEGATIVE_INFINITY)).toBe('base');
 });
});

const batting = { AB: 100, H: 30, doubles: 5, triples: 1, HR: 4, BB: 10, HBP: 2, SO: 20, SH: 1, SF: 3, SB: 2, CS: 1, GIDP: 2, PA: 116 };
const pitching = { G: 28, GS: 28, IPouts: 498, H: 124, HR: 14, BB: 44, HBP: 2, SO: 219, BFP: 660, ER: 43, SV: 0 };
const profile: Profile = {
 seasonId: 'player:2022:AL:AAA', playerId: 'player', displayName: 'Example Athlete',
 franchiseId: 'AAA', teamId: 'AAA', year: 2022, league: 'AL', historicalTeam: 'Example Club',
 teamGames: 162, bats: 'L', throws: 'R', eligibleSlots: ['DH'], appearances: {}, batting,
 fielding: {}, errorRates: { C: 0, '1B': 0, '2B': 0, '3B': 0, SS: 0, LF: 0, CF: 0, RF: 0 },
 catcherCS: 0, speed: 0, stealAttempt: 0, stealSuccess: 0, doublePlay: 0, estimatedFields: []
};

describe('card data boundaries', () => {
 it('clamps the represented season decade, independently of media', () => {
  expect(eraForYear(1940)).toBe('1950s');
  expect(eraForYear(1969)).toBe('1960s');
  expect(eraForYear(1970)).toBe('1970s');
  expect(eraForYear(2025)).toBe('2020s');
  expect(eraForYear(2030)).toBe('2020s');
 });
 it('keeps a two-way front role-specific while using the higher finish WAR', () => {
  const two = { ...profile, pitching, eligibleSlots: ['DH', 'SP1'] as const };
  const ranking = { battingWAR162: 3.49, pitchingWAR162: 6.01 };
  const bat = createCardViewModel({ profile: { ...two, eligibleSlots: [...two.eligibleSlots] }, slot: 'DH', ranking });
  const pit = createCardViewModel({ profile: { ...two, eligibleSlots: [...two.eligibleSlots] }, slot: 'SP1', ranking });
  expect(bat.st1).toMatchObject({ l: 'BAT WAR/162', v: '3.49' });
  expect(bat.st2.l).toBe('OPS');
  expect(bat.st3).toMatchObject({ l: 'HR', v: '4' });
  expect(pit.st1).toMatchObject({ l: 'PIT WAR/162', v: '6.01' });
  expect(pit.st2).toMatchObject({ l: 'ERA', v: '2.33' });
  expect(pit.st3).toMatchObject({ l: 'SO', v: '219' });
  expect(bat.fin.tier).toBe('gem');
  expect(pit.fin.tier).toBe('gem');
  const partial = createCardViewModel({ profile: { ...two, eligibleSlots: [...two.eligibleSlots] }, slot: 'DH', ranking: { battingWAR162: null, pitchingWAR162: 6.01 } });
  expect(partial.st1.v).toBe('—');
  expect(partial.fin.tier).toBe('gem');
  expect(bat.b.fams.map(f => [f.title, f.cols, f.counts.map(c => c.l)])).toEqual([
   ['Batting', 7, ['PA', 'AB', 'H', '2B', '3B', 'HR', 'BB', 'SO', 'HBP', 'SH', 'SF', 'SB', 'CS', 'GIDP']],
   ['Pitching', 9, ['G', 'GS', 'BFP', 'H', 'ER', 'HR', 'BB', 'HBP', 'SV']]
  ]);
  expect(bat.b.showDia).toBe(false);
  expect(bat.b.apps).toContain('P 28');
 });
 it('reports position games, distinguishes DH only, and never claims defensive range', () => {
  const dh = createCardViewModel({ profile });
  expect(dh.b.dia.dh).toEqual({ on: true, off: false, g: 'only' });
  const fielder = createCardViewModel({ profile: { ...profile, eligibleSlots: ['CF', 'DH'], appearances: { CF: 78, RF: 73 } } });
  expect(fielder.b.dia.cf.g).toBe('78');
  expect(fielder.b.dia.rf.g).toBe('73');
  expect(fielder.b.dia.dh.on).toBe(false);
  expect(fielder.b.apps).not.toMatch(/range/i);
  expect(fielder.b.fams[0].cols).toBe(5);
  const pitcher = createCardViewModel({ profile: { ...profile, eligibleSlots: ['SP1'], pitching } });
  expect(pitcher.b.fams.map(f => f.title)).toEqual(['Pitching · 2022']);
  expect(pitcher.b.dia.p.g).toBe('28');
  expect(pitcher.b.fams[0].key.find(c => c.l === 'IP')?.v).toBe('166.0');
 });
 it('renders missing and compiler-unavailable facts without inventing values', () => {
  const missing = createCardViewModel({ profile: { ...profile, batting: undefined } });
  expect(missing.st1.v).toBe('—');
  expect(missing.st2.v).toBe('—');
  expect(missing.st3.v).toBe('—');
  expect(missing.fin.tier).toBe('base');
  const incomplete = createCardViewModel({ profile: { ...profile, estimatedFields: ['batting.SF.estimated'] } });
  expect(incomplete.b.fams[0].counts.find(c => c.l === 'SF')?.v).toBe('—');
  expect(incomplete.b.fams[0].key.find(c => c.l === 'OPS')?.v).toBe('—');
 });
 it.each([0, 7])('does not present compiler-substituted or incomplete counts (%s) as historical facts', value => {
  const cases = [
   { flags: [], missing: [] },
   { flags: ['baserunning.league'], missing: ['SB', 'CS'] },
   { flags: ['doublePlay.league'], missing: ['GIDP'] },
   { flags: ['baserunning.league', 'doublePlay.league'], missing: ['SB', 'CS', 'GIDP'] }
  ];
  for (const { flags, missing } of cases) {
   const source = { ...profile, batting: { ...profile.batting!, SB: value, CS: value, GIDP: value }, estimatedFields: flags };
   const model = createCardViewModel({ profile: source });
   for (const field of ['SB', 'CS', 'GIDP']) {
    expect(model.b.fams[0].counts.find(stat => stat.l === field)?.v).toBe(missing.includes(field) ? '—' : String(value));
   }
   expect(source.batting).toMatchObject({ SB: value, CS: value, GIDP: value });
  }
 });
 it('keeps pooled relief at Base with member and saves-leader disclosure', () => {
  const bullpen = { members: [{ seasonId: 'member', playerId: 'member', displayName: 'Pool Member' }], excluded: { seasonId: 'excluded', playerId: 'excluded', displayName: 'Saves Leader' } };
  const model = createCardViewModel({ profile: { ...profile, eligibleSlots: ['BP'], pitching, bullpen }, ranking: { battingWAR162: 8, pitchingWAR162: 8 } });
  expect(model.fin.tier).toBe('base');
  expect(model.st1.v).toBe('—');
  expect(model.b.hasWar).toBe(false);
  expect(model.b.showDia).toBe(false);
  expect(model.b).toMatchObject({ given: profile.historicalTeam, family: 'Bullpen', name: `${profile.historicalTeam} bullpen` });
  expect(model.b.fams[0].key.map(c => [c.l, c.v])).toEqual([['ERA', '2.33'], ['IP', '166.0'], ['SO', '219'], ['Members', '1']]);
  expect(model.b.fams[0].cols).toBe(5);
  expect(model.details.sections[0].rows.map(r => r.v)).toEqual(expect.arrayContaining(['Pool Member', 'Saves Leader']));
  for (const mediaStatus of ['loading', 'unavailable'] as const) {
   const unit = createCardViewModel({ profile: { ...profile, eligibleSlots: ['BP'], pitching, bullpen }, mediaStatus });
   expect(unit.b.srcPhoto).toBe('Team-season pool · no photo');
   expect(unit.caption).toBe(unit.b.srcPhoto);
  }
 });
 it('labels exact and nearest career photos and current-logo fallback without losing credit links', () => {
  const asset = { url: '/media/example.webp', width: 768, height: 1024, credit: 'Example credit', license: 'Example licence', licenseUrl: 'https://example.com/license', sourceUrl: 'https://example.com/source' };
  const photo = { ...asset, year: 2021, captureEvidenceUrl: 'https://example.com/capture', identityEvidenceUrl: 'https://example.com/identity' };
  const media: MediaManifest = { schemaVersion: 2, version: 'example', dataVersion: 'example', modifications: 'Resized', teams: { AAA: { name: 'Example Club', color: '#224466', logo: asset, historical: [] } }, players: { player: { name: 'Example Athlete', firstYear: 2020, lastYear: 2025, photos: [photo] } }, atmosphere: {}, diagnostics: { playersSearched: 1, playersWithPhotos: 1, photos: 1, logos: 1, historicalLogos: 0, atmospherePhotos: 0, excluded: 0 } };
  const nearest = createCardViewModel({ profile, media });
  expect(nearest.caption).toBe('Photo 2021 · Career photo');
  expect(nearest.logoLabel).toBe('Current franchise mark');
  expect(nearest.selectedPhoto?.captureEvidenceUrl).toBe(photo.captureEvidenceUrl);
  expect(nearest.details.sections.find(s => s.h === 'Photo')?.rows).toEqual(expect.arrayContaining([expect.objectContaining({ href: asset.sourceUrl }), expect.objectContaining({ href: asset.licenseUrl }), expect.objectContaining({ href: photo.captureEvidenceUrl })]));
  const exact = createCardViewModel({ profile: { ...profile, year: 2021 }, media });
  expect(exact.caption).toBe('Photo 2021 · Selected season');
  media.teams.AAA.historical = [{ ...asset, firstYear: 2020, lastYear: 2025 }];
  expect(createCardViewModel({ profile, media }).logoLabel).toBe('Verified historical team mark');
 });
});
