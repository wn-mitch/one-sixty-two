import type { MomentContact, SeasonMoment } from '../sim/types.ts';

/** Keep compound names and suffixes intact; the dataset supplies display names, not surnames. */
const name = (value: string) => value.trim();
const BASE = ['', 'first', 'second', 'third'];

/** Independent choices keep changes to one sentence from reshuffling the whole call. No game RNG. */
function chooser(moment: SeasonMoment, seed: number) {
 const key = JSON.stringify([seed, moment.gameNumber, moment.inning, moment.half, moment.batterSeasonId,
  moment.pitcherSeasonId, moment.outcome, moment.outsBefore, moment.basesBefore,
  moment.challengeRunsBefore, moment.opponentRunsBefore, moment.challengeRunsAfter, moment.opponentRunsAfter, moment.play]);
 return (part: string, choices: readonly string[]): string => {
  let hash = 2166136261;
  for (const char of `${key}:${part}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return choices[hash % choices.length];
 };
}
type Choose = ReturnType<typeof chooser>;

function direction(contact: MomentContact): string {
 const angle = contact.sprayAngleDeg;
 if (!contact.fair) return angle < 0 ? 'on the third-base side, in foul ground' : 'on the first-base side, in foul ground';
 if (angle < -30) return 'toward the left-field line';
 if (angle < -10) return 'to left';
 if (angle <= 10) return 'through the middle';
 if (angle <= 30) return 'to right';
 return 'toward the right-field line';
}

function flight(contact: MomentContact, B: string, choose: Choose): string {
 const d = direction(contact);
 const groundDirection = contact.sprayAngleDeg < -10 ? 'to the left side' : contact.sprayAngleDeg > 10 ? 'to the right side' : 'up the middle';
 const airborneDirection = d === 'through the middle' ? 'to center' : d;
 if (contact.fielding === 'ground' || (contact.fielding === 'hit' && contact.launchAngleDeg < 10)) {
  return contact.exitVelocityMph >= 95
   ? choose('flight', [`${B} hits a hard ground ball ${groundDirection}.`, `A sharp grounder ${groundDirection} from ${B}.`, `${B} sends one on the ground ${groundDirection}.`])
   : choose('flight', [`${B} bounces one ${groundDirection}.`, `Ground ball ${groundDirection} off the bat of ${B}.`, `${B} hits it on the ground ${groundDirection}.`]);
 }
 if (contact.launchAngleDeg < 25) {
  return contact.exitVelocityMph >= 95
   ? choose('flight', [`${B} drives one ${airborneDirection}!`, `A hard line drive ${airborneDirection} from ${B}!`, `${B} hits a liner ${airborneDirection}.`])
   : choose('flight', [`${B} lines one ${airborneDirection}.`, `A line drive ${airborneDirection} off the bat of ${B}.`, `${B} sends a liner ${airborneDirection}.`]);
 }
 return contact.launchAngleDeg >= 50
  ? choose('flight', [`${B} pops it up ${airborneDirection}.`, `A high pop fly ${airborneDirection} from ${B}.`, `${B} lifts a pop fly ${airborneDirection}.`])
  : choose('flight', [`${B} hits one in the air ${airborneDirection}.`, `Fly ball ${airborneDirection} off the bat of ${B}.`, `${B} lifts one ${airborneDirection}.`]);
}

function action(moment: SeasonMoment, choose: Choose): string {
 const B = name(moment.batterName), P = name(moment.pitcherName);
 const c = moment.play?.contact;
 const F = c?.fielderName ? name(c.fielderName) : 'the fielder';
 const lead = c ? `${flight(c, B, choose)} ` : '';
 switch (moment.outcome) {
  case 'homeRun': {
   const result = choose('result', ['It’s gone!', 'That ball is out of here!', 'And it clears the fence!', 'Home run!', 'Over the fence!']);
   const type = moment.runsScored === 4 ? 'A grand slam!' : moment.runsScored === 3 ? 'A three-run homer!' : moment.runsScored === 2 ? 'A two-run homer!' : 'A solo home run!';
   return `${lead || `${B} hits it out! `}${c ? `${result} ` : ''}${type}`;
  }
  case 'single': return lead + (c
   ? choose('result', ['And that’s a base hit!', 'That’s a single.', 'A base hit!', 'That’ll be a single.'])
   : choose('result', [`A base hit for ${B}!`, `${B} has a single.`, `${B} comes through with a base hit.`, `${B} singles!`]));
  case 'double': return lead + (moment.play?.runners.some(runner => runner.to === 0) && moment.play.outsAfter === 3 ? 'A base hit, credited as a double.' : c?.automaticDouble ? 'Out of play, and the award is two bases.' : c
   ? choose('result', ['A base hit, and he makes it to second!', 'He’s into second with a double.', 'That’s a double!', 'He has a two-base hit.'])
   : choose('result', [`${B} with a double!`, `A two-base hit for ${B}.`, `${B} makes it to second with a double.`, `${B} doubles!`]));
  case 'triple': return lead + (c
   ? choose('result', ['He’s going for third — safe! A triple!', 'He makes it all the way to third!', 'A base hit, and he’s in at third with a triple.', 'Three bases! He’s safe at third.'])
   : choose('result', [`${B} has a triple!`, `${B} makes it to third with a triple.`, `A three-base hit for ${B}!`]));
  case 'strikeout': return choose('result', [`Strike three! ${P} strikes out ${B}.`, `${P} gets the strikeout. ${B} is out.`, `${B} strikes out against ${P}.`, `${P} strikes him out!`, `Strike three to ${B}.`, `${P} gets ${B} on strikes.`]);
  case 'walk': return choose('result', [`Ball four. ${B} takes first.`, `${P} walks ${B}.`, `A walk to ${B}.`, `Ball four to ${B}.`, `${B} draws a walk.`, `${B} is aboard on a walk.`]);
  case 'hitByPitch': return choose('result', [`That pitch hits ${B}. He’ll take first.`, `${B} is hit by the pitch.`, `Hit him. ${B} is awarded first base.`, `${B} takes first after being hit by a pitch.`]);
  case 'groundedIntoDoublePlay': return lead + (c
   ? choose('result', [`${F} starts a double play!`, 'They turn two!', 'A double play!', 'And the defense gets two outs!'])
   : choose('result', [`${B} grounds into a double play!`, `Two outs on the ground ball from ${B}!`, `A ground-ball double play off the bat of ${B}.`]));
  case 'sacrificeFly': return lead + (c
   ? `${F} makes the catch.`
   : choose('result', [`${B} hits a sacrifice fly.`, `A sacrifice fly from ${B}.`, `${B} gets the run home with a sacrifice fly.`]));
  case 'out': return lead + (c
   ? c.fielding === 'air' ? choose('result', [`${F} makes the catch.`, `Caught by ${F}.`, `${F} has it for the out.`])
    : choose('result', [`${F} fields it, and they get the out at first.`, `${F} makes the play for the out.`, `${F} handles it. An out at first base.`])
   : choose('result', [`${B} is retired.`, `An out for ${P}.`, `They get ${B} for the out.`, `${P} retires ${B}.`]));
  case 'reachedOnError': return lead + (c
   ? `${B} reaches on an error by ${F}.`
   : choose('result', [`${B} reaches on an error.`, `An error puts ${B} aboard.`, `${B} is safe on the error.`]));
  case 'stolenBase': return choose('result', [`${B} goes for second — safe!`, `${B} steals second!`, `${B} takes off, and he has second base stolen.`, `Safe at second! A stolen base for ${B}.`]);
  case 'caughtStealing': return choose('result', [`${B} tries for second — out!`, `${B} is caught stealing second.`, `They get ${B} trying to steal second!`, `Out at second! ${B} is caught stealing.`]);
 }
}

function runners(moment: SeasonMoment, choose: Choose): string {
 if (moment.outcome === 'homeRun' || moment.outcome === 'stolenBase' || moment.outcome === 'caughtStealing') return '';
 const moves = moment.play?.runners;
 if (!moves?.length) return moment.runsScored > 0
  ? choose('runners', [moment.runsScored === 1 ? 'A run comes home.' : `${moment.runsScored} runs come home.`, moment.runsScored === 1 ? 'One run scores.' : `${moment.runsScored} runs score.`]) : '';
 // Resolve the lead runners first, as in the engine. Include outs as well as scoring.
 return [...moves].sort((a, b) => b.from - a.from).map(runner => {
  const R = name(runner.name);
  if (runner.to === 4) {
   if (moment.outcome === 'walk' || moment.outcome === 'hitByPitch') return `${R} is forced home.`;
   if (moment.outcome === 'sacrificeFly') return `${R} tags and scores.`;
   return choose(`runner-${runner.from}`, [`${R} scores from ${BASE[runner.from]}.`, `${R} comes home from ${BASE[runner.from]}.`, `In comes ${R}.`]);
  }
  if (runner.to === 0) return moment.outcome === 'groundedIntoDoublePlay' ? '' : `${R} is out on the play.`;
  return `${R} moves to ${BASE[runner.to]}.`;
 }).filter(Boolean).join(' ');
}

function finish(moment: SeasonMoment, walkOff: boolean, choose: Choose): string {
 const forBatting = (challenge: number, opponent: number) => moment.challengeBatting ? challenge : opponent;
 const before = forBatting(moment.challengeRunsBefore, moment.opponentRunsBefore);
 const after = forBatting(moment.challengeRunsAfter, moment.opponentRunsAfter);
 const against = forBatting(moment.opponentRunsAfter, moment.challengeRunsAfter);
 if (walkOff) return choose('finish', [`That wins it, ${after}–${against}!`, `And that’s the ballgame! ${after}–${against}.`, `It’s a walk-off! ${after}–${against}.`, `The winning run is home! ${after}–${against}, the final.`, `This one is over! They win it, ${after}–${against}.`]);
 if (moment.runsScored > 0) {
  if (after === against) return choose('finish', [`We’re tied at ${after}!`, `That ties it, ${after}–${against}!`, `It’s a ${after}–${against} game!`, `All even at ${after}.`]);
  if (before <= against && after > against) return choose('finish', [`That puts them ahead, ${after}–${against}!`, `They take the lead, ${after}–${against}!`, `It’s now ${after}–${against}, and they’re in front!`, `A ${after}–${against} lead!`]);
  if (after < against) return choose('finish', [`They trail ${against}–${after}.`, `That makes it ${against}–${after}.`, `The deficit is down to ${against - after}.`]);
  return choose('finish', [`The lead is now ${after}–${against}.`, `That makes it ${after}–${against}.`, `They’re up ${after - against} now.`]);
 }
 if (moment.play?.outsAfter === 3) {
  if (moment.inning >= 9 && (moment.half === 'bottom' || moment.isHome !== moment.challengeBatting) && against > after)
   return choose('finish', ['And that ends the ballgame!', 'That’s the final out!', 'The ballgame is over!']);
  return choose('finish', ['And that ends the inning.', 'That retires the side.', 'Three outs. The inning is over.']);
 }
 return '';
}

/** Original, authored calls assembled from the observed play. No invented counts, pitch types,
 * catch gestures, or broadcast catchphrases. Replays retain the same wording for the same seed. */
export function radioCall(moment: SeasonMoment, walkOff: boolean, seed = 0): string {
 // Intentional, user-requested Easter egg: retain the booth interruption.
 if (moment.outcome === 'homeRun' && /\bNick Castellanos\b/.test(moment.batterName)) {
  return `…and I just want to take a moment, as a man who tries to do things the right way, to say to everyone listening— and there's a drive into deep left field by Castellanos, that'll be a home run.${walkOff ? ' And that will end the ballgame.' : ''}`;
 }
 const choose = chooser(moment, seed);
 return [action(moment, choose), runners(moment, choose), finish(moment, walkOff, choose)].filter(Boolean).join(' ');
}
