import { average, historicalBatting, historicalEra, innings } from '../../game/format.ts';
import type { Profile } from '../../game/types.ts';
import type { DraftCard } from '../../draft/types.ts';

/** Salary units are $0.1M. */
export const money = (salary: number): string => `$${(salary / 10).toFixed(1)}M`;


/** The roles a card can fill, as the table names them: starters as SP, any closer-eligible arm as RP, a cross-trained position with a +. */
export function rolesLabel(card: DraftCard): string {
 const slots = card.eligibleSlots;
 const roles: string[] = slots.filter(slot => !slot.startsWith('SP') && !slot.startsWith('RP') && slot !== 'CL').map(slot => card.learned?.includes(slot) ? `${slot}+` : slot);
 if (slots.some(slot => slot.startsWith('SP'))) roles.push('SP');
 if (slots.includes('CL')) roles.push('RP');
 return roles.join(' · ');
}

/** One line of the card's historical season: slash line and homers, or ERA, strikeouts and innings. */
export function historicalLine(profile: Profile, card: DraftCard): string {
 const pitcher = card.eligibleSlots.some(slot => slot.startsWith('SP') || slot === 'CL');
 if (pitcher && profile.pitching) return `${historicalEra(profile.pitching).toFixed(2)} ERA · ${profile.pitching.SO} SO · ${innings(profile.pitching.IPouts)} IP`;
 if (profile.batting) {
  const line = historicalBatting(profile.batting);
  return `${average(line.avg)}/${average(line.obp)}/${average(line.slg)} · ${profile.batting.HR} HR`;
 }
 return '';
}
