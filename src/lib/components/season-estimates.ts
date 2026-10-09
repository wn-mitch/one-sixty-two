import { formatDefEstimate } from '../game/format.ts';
import { POSITIONS } from '../game/types.ts';
import type { DefensiveEvidence, DefensiveSkillName, DefensivePosition, Position, Profile, Slot } from '../game/types.ts';
import { isHitter } from './candidate-ranking.ts';

const positionNames: Record<Position, string> = { C: 'catcher', '1B': 'first base', '2B': 'second base', '3B': 'third base', SS: 'shortstop', LF: 'left field', CF: 'center field', RF: 'right field' };
const pitchingFacts: Record<string, string> = { G: 'games pitched', GS: 'games started', IPouts: 'innings pitched', H: 'hits allowed', HR: 'home runs allowed', BB: 'walks allowed', HBP: 'hit batters', SO: 'strikeouts', ER: 'earned runs', SV: 'saves' };
const unknownNote = 'Another source value is marked as estimated. Its exact method is not described here; it should not be treated as a measured historical fact.';
const defensiveSkills: readonly [DefensiveSkillName, string, string][] = [
 ['hitPrevention', 'estimated hit prevention', 'fielding outs'],
 ['errorAvoidance', 'error avoidance', 'handled chances'],
 ['doublePlay', 'double-play participation', 'fielding outs'],
 ['outfieldThrowing', 'outfield throwing', 'fielding outs'],
 ['catcherThrowing', 'catcher throwing', 'attempted steals']
];

function signed(value: number, digits: number): string {
 const rounded = Number(value.toFixed(digits));
 const normalized = Object.is(rounded, -0) ? 0 : rounded;
 return `${normalized > 0 ? '+' : ''}${normalized.toFixed(digits)}`;
}

function evidenceText(evidence: DefensiveEvidence, unit: string): string {
 if (evidence.status === 'notApplicable') return 'not applicable at this position';
 const status = evidence.status === 'exact'
  ? 'exact-position evidence'
  : evidence.status === 'genericOutfield'
   ? 'broad generic-outfield evidence at half strength'
   : 'neutral because individual evidence is missing';
 const exposure = Number.isFinite(evidence.exposure) && evidence.exposure >= 0
  ? `; exposure ${evidence.exposure} ${unit}`
  : '';
 return `${status}${exposure}${evidence.reason ? `; ${evidence.reason}` : ''}`;
}

function defensivePositionNotes(position: Position, defense: DefensivePosition | undefined): string[] {
 const label = positionNames[position];
 if (!defense) {
  return [`At ${label}, the required pre-season defensive record is unavailable. An absent record is invalid input, not neutral evidence.`];
 }
 const projection = defense.expectedRunsSaved162 === null
  ? `At ${label}, aggregate DEF is unavailable because complete joined fielding-run and exposure evidence is missing. Unavailable is not zero; independently evidenced component skills still affect simulation.`
  : `At ${label}, DEF est. is ${formatDefEstimate(defense.expectedRunsSaved162)} runs saved per 1,458 reference innings. This is a pre-season, position-specific projection, not realized season defense.`;
 const clamp = defense.residualClamped
  ? ' The residual hit-prevention solve reached its probability bound, so the displayed projection is the achieved clamped value.'
  : ' The residual hit-prevention solve remained within its probability bound and was not clamped.';
 const skills = defensiveSkills.map(([skill, name, unit]) =>
  `${name} ${signed(defense[skill], 2)} (${evidenceText(defense.evidence[skill], unit)})`
 ).join('; ');
 return [`${projection}${clamp}`, `At ${label}, normalized defensive skills (-1 to +1): ${skills}.`];
}

/** Restrict compiler-wide flags and canonical defensive evidence to roles the user can actually assign. */
export function seasonEstimates(
 profile: Pick<Profile, 'estimatedFields' | 'defense'>,
 legalSlots: Slot[],
 selectedSlot: Slot | null = null
): string[] {
 const roles = selectedSlot && legalSlots.includes(selectedSlot) ? [selectedSlot] : legalSlots;
 const batting = roles.some(isHitter), pitching = roles.some(slot => !isHitter(slot));
 const defensivePositions = POSITIONS.filter(position => roles.includes(position));
 const notes = new Set<string>();
 for (const position of defensivePositions) {
  for (const note of defensivePositionNotes(position, profile.defense.positions[position])) notes.add(note);
 }
 if (defensivePositions.length) {
  notes.add('Aggregate DEF starts from joined historical fld162 fielding runs above average per 162 team games, not WAR or positional runs, and residualizes error, double-play, and throwing effects to avoid counting the same value twice.');
  notes.add('Component rates are normalized and shrunk toward the season, league, and position cohort; a same-year combined-league cohort is used when needed, and genuinely missing evidence stays explicitly neutral.');
  notes.add('Double-play and outfield-assist rates per inning are context-affected opportunity proxies; an outfield assist rate is not an observed throw-out percentage. Putouts do not invent range, framing, blocking, throwing velocity, or other unsupported skills.');
 }
 for (const field of profile.estimatedFields) {
  if (field.startsWith('fielding.') || field.startsWith('catcherCS.')) {
   continue;
  } else if (field.startsWith('pitching.')) {
   if (!pitching) continue;
   if (field === 'pitching.allowedExtraBaseHits.league') notes.add("The source does not record doubles and triples allowed. Non-home-run hits are divided into singles, doubles and triples using that season and league's batting proportions.");
   else if (field === 'pitching.BFP.estimated') notes.add('Missing batters faced are estimated from pitching outs plus hits, walks and hit batters.');
   else {
    const match = /^pitching\.([^.]+)\.estimated$/.exec(field);
    const fact = match && pitchingFacts[match[1]];
    notes.add(fact ? `The source has missing ${fact}. The displayed count retains only available records (zero when none are present), not a verified complete season total.` : unknownNote);
   }
  } else if (field === 'batting.SF.estimated') {
   if (batting) notes.add('Sacrifice flies are not fully recorded for this source season. Batting counts retain available records (zero when absent), and plate appearances use only recorded components. Because the sacrifice-fly denominator is incomplete, displayed OBP and OPS are unavailable rather than presented as measured historical rates.');
  } else if (field === 'bats.neutral') {
   if (batting) notes.add('Batting handedness is unknown, so the model applies no batter platoon adjustment.');
  } else if (field === 'throws.neutral') {
   if (pitching && profile.estimatedFields.includes('pooledRelief.BFPWeighted')) {
    notes.add('The pooled bullpen uses neutral throwing handedness, so the model applies no pitcher platoon adjustment.');
    continue;
   }
   if (pitching) notes.add('Throwing handedness is unknown, so the model applies no pitcher platoon adjustment.');
  } else if (field === 'BPF.neutral' || field === 'PPF.neutral') {
   if (field === 'BPF.neutral' ? batting : pitching) notes.add(`The historical ${field === 'BPF.neutral' ? 'batting' : 'pitching'} park factor is missing, so era adjustment treats this park as neutral.`);
  } else if (field === 'pooledRelief.BFPWeighted') {
   if (pitching) notes.add('This team-season remainder pools relief-dominant pitcher-seasons after excluding the saves leader. Normalized pitching rates are weighted by batters faced. These are not reconstructed relief-only innings; support workload is unlimited.');
  } else if (field === 'baserunning.league') {
   if (batting) notes.add("Missing stolen-base or caught-stealing counts use that season and league's steal-attempt and success rates.");
  } else if (field === 'doublePlay.league') {
   if (batting) notes.add("Missing grounded-into-double-play counts use that season and league's double-play probability.");
  } else if (field === 'speed.league') {
   if (batting) notes.add('Missing individual baserunning evidence uses a neutral middle-of-the-pack speed estimate for extra-base advancement, not measured running speed.');
  } else notes.add(unknownNote);
 }
 return [...notes];
}
