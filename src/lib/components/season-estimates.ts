import type { Profile, Slot } from '../game/types.ts';
import { isHitter } from './candidate-ranking.ts';

const positionNames: Record<string, string> = { C: 'catcher', '1B': 'first base', '2B': 'second base', '3B': 'third base', SS: 'shortstop', LF: 'left field', CF: 'center field', RF: 'right field' };
const pitchingFacts: Record<string, string> = { G: 'games pitched', GS: 'games started', IPouts: 'innings pitched', H: 'hits allowed', HR: 'home runs allowed', BB: 'walks allowed', HBP: 'hit batters', SO: 'strikeouts', ER: 'earned runs', SV: 'saves' };
const unknownNote = 'Another source value is marked as estimated. Its exact method is not described here; it should not be treated as a measured historical fact.';

/** Restrict compiler-wide flags to the role the user can actually assign. */
export function seasonEstimates(profile: Pick<Profile, 'estimatedFields'>, legalSlots: Slot[], selectedSlot: Slot | null = null): string[] {
 const roles = selectedSlot && legalSlots.includes(selectedSlot) ? [selectedSlot] : legalSlots;
 const batting = roles.some(isHitter), pitching = roles.some(slot => !isHitter(slot));
 const notes = new Set<string>();
 for (const field of profile.estimatedFields) {
  if (field.startsWith('fielding.')) {
   const [, position, ...method] = field.split('.');
   if (!positionNames[position]) { notes.add(unknownNote); continue; }
   if (!roles.includes(position as Slot)) continue;
   const label = positionNames[position];
   if (method.join('.') === 'league') notes.add(`At ${label}, missing individual fielding counts are replaced by that season and league's error rate at the position. This estimates reliability, not defensive range.`);
   else if (method.join('.') === 'genericOF') notes.add(`At ${label}, reliability uses this player's combined outfield putouts, assists and errors because separate positional counts are unavailable.`);
   else if (method.join('.') === 'InnOuts.unavailable') notes.add(`At ${label}, recorded innings are unavailable. Fielding reliability still uses recorded putouts, assists and errors, not invented innings.`);
   else notes.add(unknownNote);
  } else if (field.startsWith('catcherCS.')) {
   if (!roles.includes('C')) continue;
   if (field === 'catcherCS.league') notes.add(profile.estimatedFields.includes('catcherCS.prior2025')
    ? 'Missing catcher stolen-base and caught-stealing counts use the combined 2025 league caught-stealing rate; the season-league baseline is unavailable.'
    : "Missing catcher stolen-base and caught-stealing counts use that season and league's caught-stealing rate.");
   else if (field === 'catcherCS.prior2025') notes.add('The catcher caught-stealing prior uses the combined 2025 league rate because that season and league has no recorded attempts.');
   else notes.add(unknownNote);
  } else if (field.startsWith('pitching.')) {
   if (!pitching) continue;
   if (field === 'pitching.allowedExtraBaseHits.league') notes.add("The source does not record doubles and triples allowed. Non-home-run hits are divided into singles, doubles and triples using that season and league's batting proportions.");
   else if (field === 'pitching.BFP.estimated') notes.add('Missing batters faced are estimated from pitching outs plus hits, walks and hit batters.');
   else {
    const match = /^pitching\.([^.]+)\.estimated$/.exec(field);
    const fact = match && pitchingFacts[match[1]];
    notes.add(fact ? `The source has missing ${fact}. The displayed count retains only available records (zero when none are present), not a verified complete season total.` : unknownNote);
   }
  } else if (field === 'bats.neutral') {
   if (batting) notes.add('Batting handedness is unknown, so the model applies no batter platoon adjustment.');
  } else if (field === 'throws.neutral') {
   if (pitching) notes.add('Throwing handedness is unknown, so the model applies no pitcher platoon adjustment.');
  } else if (field === 'BPF.neutral' || field === 'PPF.neutral') {
   if (field === 'BPF.neutral' ? batting : pitching) notes.add(`The historical ${field === 'BPF.neutral' ? 'batting' : 'pitching'} park factor is missing, so era adjustment treats this park as neutral.`);
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
