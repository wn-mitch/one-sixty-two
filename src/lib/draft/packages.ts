import { randomStream, shuffle } from '../game/random.ts';
import { HITTER_SLOTS, POSITIONS, type Position, type Profile } from '../game/types.ts';
import { LEAGUE_CHAPTERS, MAX_PARK_FAMILIARITY, type CrowdTrigger, type ParkPackage } from '../sim/league-types.ts';
import type { DraftSlot } from './types.ts';
import { gloveGrade, withSkill, type TrainingKind, type Upgrade } from './training.ts';

/**
 * Franchise packages: economic, development or physical park perks a franchise brings to every
 * run, at any seat. A park condition applies to both clubs at the franchise's home games; its
 * strength lives in the engine (`engine/src/park_package.rs`), as does a crowd trigger's
 * (`engine/src/crowd.rs`). A franchise without an entry plays the ordinary rules. A package
 * earns an entry by being worth roughly five to ten wins a season to a roster built around it,
 * measured natively. A park package pairs its condition with a familiarity edge that grows
 * with the active players who know the park. Every number is provisional; `design/draft-mode/catalog.md`
 * tracks which premises are active.
 */
export interface FranchisePackage {
 name: string;
 /** What the player is told when choosing the franchise. */
 summary: string;
 /** Change to the salary cap, as a share of the table cap. */
 capShare?: number;
 /** Multiplier on every training price. */
 trainingPrice?: number;
 /** Multiplier on the gain of the listed trainings. */
 trainingGain?: Partial<Record<TrainingKind, number>>;
 /** Trainings offered at every stop, on top of that stop's specials. */
 alwaysOffered?: readonly TrainingKind[];
 /** Extra training gain for each original-tier common on the active roster, up to `commonBoostMax`. */
 commonBoost?: number;
 commonBoostMax?: number;
 /** Cash for each home win, credited with the payday. */
 homeWinCash?: number;
 /** The exaggerated condition of the franchise's home park. */
 park?: ParkPackage;
 /** Which active players know the home park, and the familiarity edge (`engine/src/park_package.rs`) each adds there. */
 familiar?: { rule: FamiliarRule; perPlayer: number };
 /** How the franchise's home crowd reacts during a game. */
 crowd?: CrowdTrigger;
 /**
  * Fielding know-how: for each active fielder with a printed glove grade of at least `minGrade` at his slot,
  * every fielder's hit prevention rises by `perPlayer` at every game, up to `MAX_KNOW_HOW`.
  */
 knowHow?: { minGrade: number; perPlayer: number };
 /**
  * A free hitting training at each payday for every hitter who batted in that stop, its gain scaled
  * by `step` for each consecutive stop he has batted in, up to `max`.
  */
 ironMan?: { step: number; max: number };
 /** Cash, as a multiple of the club's own training spend on a card, for trading that card away; once per card per run. */
 saleBonus?: number;
 /**
  * An exchange rate that turns each chapter: with a strong dollar training costs `price` less, home
  * stands fill `fill` less and tickets cost `ticket` more; a weak dollar reverses each (tickets cost
  * 1 / (1 + `ticket`)).
  */
 exchangeRate?: { price: number; fill: number; ticket: number };
 /**
  * Franchises whose park packages the club borrows at home, one each chapter in a seeded order with
  * no repeat until every one has been used; their familiarity rules come with them, each player's
  * edge multiplied by `familiarity` because no roster can be built for every park.
  */
 relocation?: { hosts: readonly string[]; familiarity: number };
 /** Pitch information at home games (`LeagueClubInput.information`), which visitors wear down by changing signs. */
 information?: number;
 /**
  * Home grounds set by a funding vote for each chapter: each state's park condition and who knows
  * it. The club votes at each chapter stop; an AI club, or a player who does not vote, takes the
  * state its active roster knows better (`suitedFunding`).
  */
 funding?: Readonly<Record<Funding, ParkCondition>>;
}

/** A park condition and which active players know it, if any do. */
export interface ParkCondition { park: ParkPackage; familiar?: { rule: FamiliarRule; perPlayer: number } }

/** A funding vote's outcome for a chapter of home games. */
export const FUNDINGS = ['funded', 'shutdown'] as const;
export type Funding = typeof FUNDINGS[number];

/** What a chapter's conditions do to a club: its training price multiplier, the shift in its home stands' fill and its ticket price multiplier. */
export interface Exchange { price: number; fill: number; ticket: number }
export const PAR: Exchange = Object.freeze({ price: 1, fill: 0, ticket: 1 });

/** The cap on a club's fielding know-how, in hit-prevention skill. */
export const MAX_KNOW_HOW = .18;

/**
 * Who knows a home park, read from the printed card: left-handed or switch hitters, right-handed
 * hitters, hitters with 20 or more home runs, pitchers with at least a strikeout an inning, starters
 * with at least a strikeout an inning, infielders whose glove grades 60 or better at their slot,
 * hitters with a speed of 0.7 or more, or outfielders with a speed of 0.7 or more.
 */
export type FamiliarRule = 'leftyHitter' | 'rightyHitter' | 'slugger' | 'strikeoutPitcher' | 'strikeoutStarter' | 'infieldGlove' | 'fastRunner' | 'fastOutfielder';

/** The Deep Freeze's weather by chapter (`FREEZE_CALENDAR` in `engine/src/park_package.rs`). */
export const FREEZE_CALENDAR = ['cold', 'thaw', 'warm', 'warm', 'cool', 'cold'] as const;

/** Who knows a park, as each stop names them. */
export const FAMILIAR_LABELS: Readonly<Record<FamiliarRule, string>> = {
 leftyHitter: 'left-handed and switch hitters', rightyHitter: 'right-handed hitters', slugger: '20-homer hitters', strikeoutPitcher: 'strikeout pitchers',
 strikeoutStarter: 'strikeout starters', infieldGlove: 'infielders with a 60+ glove', fastRunner: 'fast runners', fastOutfielder: 'fast outfielders'
};

const isHitterSlot = (slot: DraftSlot) => (HITTER_SLOTS as readonly string[]).includes(slot);
const FAMILIAR: Record<FamiliarRule, (profile: Profile, slot: DraftSlot) => boolean> = {
 leftyHitter: (profile, slot) => isHitterSlot(slot) && (profile.bats === 'L' || profile.bats === 'B'),
 rightyHitter: (profile, slot) => isHitterSlot(slot) && profile.bats === 'R',
 slugger: (profile, slot) => isHitterSlot(slot) && (profile.batting?.HR ?? 0) >= 20,
 strikeoutPitcher: (profile, slot) => !isHitterSlot(slot) && !!profile.pitching && profile.pitching.SO * 3 >= profile.pitching.IPouts,
 strikeoutStarter: (profile, slot) => slot.startsWith('SP') && !!profile.pitching && profile.pitching.SO * 3 >= profile.pitching.IPouts,
 infieldGlove: (profile, slot) => (['1B', '2B', '3B', 'SS'] as DraftSlot[]).includes(slot) && gloveGrade(profile, slot as Position) >= 60,
 fastRunner: (profile, slot) => isHitterSlot(slot) && profile.speed >= .7,
 fastOutfielder: (profile, slot) => (['LF', 'CF', 'RF'] as DraftSlot[]).includes(slot) && profile.speed >= .7
};

export const PACKAGES: Readonly<Record<string, FranchisePackage>> = {
 TEX: { name: 'The Ryan Express', summary: 'Strikeout-pitch training is on offer at every stop and gains half as much again.', trainingGain: { strikeout: 1.5 }, alwaysOffered: ['strikeout'] },
 CHC: { name: 'Home Run Happy Hour', summary: 'Every Cubs homer, home or away, fills the crowd\'s hype meter. At Wrigley, hype leans the strike zone their way; it fades a little after every game.', crowd: 'homeRunHappyHour' },
 CLE: { name: 'Guard the Lead', summary: 'Every scoreless inning in the field, home or away, fills the crowd\'s hype meter. At home, hype leans the strike zone their way; it fades a little after every game.', crowd: 'guardTheLead' },
 CHW: { name: 'Winning Ugly', summary: 'Every run scored in an inning without a homer fills the crowd\'s hype meter: walks, singles and hustle. At home, hype leans the strike zone their way; it fades a little after every game.', crowd: 'winningUgly' },
 LAD: { name: 'Front-Runners', summary: 'Every Dodgers win fills the crowd\'s hype meter, which fades a little after every game. At home, hype leans the strike zone their way, and the crowd roars louder with a lead and heads for the exits when trailing late. Fans are fair-weather.', crowd: 'frontRunners' },
 SDP: { name: 'Trevor Time', summary: 'Every time the closer enters to protect a lead, home or away, the crowd\'s hype meter jumps. At Petco, hype leans the strike zone their way; it fades a little after every game.', crowd: 'closingTime' },
 COL: { name: 'Mile High-er', summary: 'An earthquake raised Coors Field another 3,000 feet: fly balls carry for both clubs. Your sluggers know the air. For each active hitter with 20 or more homers on the card, your batted balls come off the bat harder at home and the visitors\' softer.', park: 'thinAir', familiar: { rule: 'slugger', perPlayer: .0025 } },
 SEA: { name: 'Marine Layer', summary: 'Heavy sea air kills carry for both clubs. Your strikeout arms know how to pitch in it. For each active pitcher with at least a strikeout an inning on the card, your batted balls come off the bat harder at home and the visitors\' softer.', park: 'heavyAir', familiar: { rule: 'strikeoutPitcher', perPlayer: .003 } },
 BOS: { name: 'The Greenest Monster', summary: 'The left-field wall has grown two and a half times taller, turning homers into doubles for both clubs. Your right-handed hitters know every dent. For each one active, your batted balls come off the bat harder at home and the visitors\' softer.', park: 'tallLeftWall', familiar: { rule: 'rightyHitter', perPlayer: .0022 } },
 NYY: { name: 'The Shortest Porch', summary: 'Right field keeps creeping toward the plate, for both clubs. Your left-handed and switch hitters know it. For each one active, your batted balls come off the bat harder at home and the visitors\' softer. Fans are fair-weather.', park: 'shortRightField', familiar: { rule: 'leftyHitter', perPlayer: .0015 } },
 SFG: { name: 'Splash Zone', summary: 'A steady wind blows out toward McCovey Cove, carrying balls hit to right for both clubs. Your left-handed and switch hitters know it. For each one active, your batted balls come off the bat harder at home and the visitors\' softer.', park: 'windToRight', familiar: { rule: 'leftyHitter', perPlayer: .0015 } },
 ARI: { name: 'The Hot Corner', summary: 'A baked, rock-hard infield sends ground balls through twice as fast, for both clubs. Your sure-handed infielders know the hops. For each active infielder with a glove grade of 60 or better at his position, your batted balls come off the bat harder at home and the visitors\' softer.', park: 'hotCorner', familiar: { rule: 'infieldGlove', perPlayer: .005 } },
 FLA: { name: 'Everglades', summary: 'The swamp has reclaimed the field: soggy turf slows ground balls and every runner, for both clubs. Your fast runners still find footing. For each active hitter with a speed of 0.7 or more on the card, your batted balls come off the bat harder at home and the visitors\' softer.', park: 'everglades', familiar: { rule: 'fastRunner', perPlayer: .0022 } },
 TBD: { name: 'Catwalk Baseball', summary: 'The new roof\'s four catwalk rings hang low: a fly ball off the two upper rings stays live and can be caught; off the two lower rings it is a home run. Your sluggers know the angles. For each active hitter with 20 or more homers on the card, your batted balls come off the bat harder at home and the visitors\' softer.', park: 'catwalk', familiar: { rule: 'slugger', perPlayer: .0022 } },
 MIL: { name: 'Seventh-Inning Fermentation', summary: 'From the seventh-inning stretch on, everyone at the ballpark has had a few: batted balls fly harder and fielders get sloppy, for both clubs. Your sluggers handle it best. For each active hitter with 20 or more homers on the card, your batted balls come off the bat harder at home and the visitors\' softer.', park: 'fermentation', familiar: { rule: 'slugger', perPlayer: .0022 } },
 MIN: { name: 'The Deep Freeze', summary: 'The season runs cold, thaw, warm, warm, cool, cold. In the cold, starters tire far sooner and the ball dies in the heavy air, for both clubs. Your strikeout starters thrive in it. For each active starter with at least a strikeout an inning on the card, your batted balls come off the bat harder at home and the visitors\' softer.', park: 'deepFreeze', familiar: { rule: 'strikeoutStarter', perPlayer: .0065 } },
 CIN: { name: 'The Crosley Cliff', summary: 'A steep terrace rises in front of the whole outfield fence, for both clubs: fielders climbing it reach balls late, and a ball rolling onto it runs back down at them. Your fast outfielders know the footing. For each active outfielder with a speed of 0.7 or more on the card, your batted balls come off the bat harder at home and the visitors\' softer.', park: 'terrace', familiar: { rule: 'fastOutfielder', perPlayer: .0065 } },
 WSN: {
  name: 'Government Shutdown', summary: 'At every chapter stop you vote on the groundskeeping budget for the chapter\'s home games, for both clubs. Funded, a freshly cut field sends ground balls through faster and lets balls roll to the wall; your infielders with a 60+ glove know it. Shut down, long grass slows every ball on the ground; your fast runners beat out the slow rollers. For each active player who knows the chapter\'s grounds, your batted balls come off the bat harder at home and the visitors\' softer.',
  funding: { funded: { park: 'fundedGrounds', familiar: { rule: 'infieldGlove', perPlayer: .005 } }, shutdown: { park: 'shutdownGrounds', familiar: { rule: 'fastRunner', perPlayer: .0022 } } }
 },
 ATL: { name: 'The Cherokee Commute', summary: 'A sweetheart stadium deal raises the salary cap by half. The park is a long drive out, so fewer fans come and the crowd leans less.', capShare: .5 },
 BAL: { name: 'Iron Man', summary: 'The cap is 10% tighter and the fans expect less. At every payday each hitter who batted in that stop gets a free hitting training, growing with each stop in a row he has played, up to ten stops.', capShare: -.1, ironMan: { step: .025, max: .25 } },
 KCR: { name: 'Royal Flush', summary: 'Kauffman is a casino. The cap is 10% tighter, but every home win pays 8 cash with the payday.', capShare: -.1, homeWinCash: 8 },
 OAK: { name: 'The House Always Wins', summary: 'The cap is 12% tighter, but every training costs 55% less.', capShare: -.12, trainingPrice: .45 },
 STL: { name: 'The Cardinal Way', summary: 'Fundamentals. For each active fielder with a glove grade of 60 or better at his position on the card, every fielder reaches balls a little quicker, home and away.', knowHow: { minGrade: 60, perPlayer: .025 } },
 HOU: { name: 'Trash Can Confidential', summary: 'Houston\'s hitters know what\'s coming at home: a strike zone that leans their way and harder contact. Each game a visitor plays at Houston in a chapter, it changes its signs and the edge against it halves; every visitor starts fresh the next chapter.', information: .25 },
 ANA: { name: 'Relocation', summary: 'Ownership moves the club every chapter. Each chapter\'s home games are played under another club\'s park condition, thin air, heavy air, the giant wall, the short porch or the wind to right, with twice that park\'s familiarity edge for each active player who fits it. Each stop shows this chapter\'s park and the next.', relocation: { hosts: ['COL', 'SEA', 'BOS', 'NYY', 'SFG'], familiarity: 2 } },
 TOR: { name: 'The Exchange Rate', summary: 'The dollar turns every chapter, half the season each way. A strong dollar makes training 40% cheaper but tickets dearer and the stands thinner; a weak one makes training 40% dearer and the stands fuller. Each stop shows this chapter\'s rate and the next.', exchangeRate: { price: .4, fill: .15, ticket: .3 } },
 PIT: { name: 'The Farm Team', summary: 'The cap is 10% tighter. Trade away a card you paid to train and you get back twice what you spent on him, once per card, when the chapter market closes.', capShare: -.1, saleBonus: 2 },
 DET: { name: 'The Assembly Line', summary: 'Every training gains 5% more for each common on the active roster, up to 40%.', commonBoost: .05, commonBoostMax: .4 }
};

type Printed = readonly { profile: Profile; slot: DraftSlot }[];

/** How many of `roster`'s printed cards fit `rule`. */
export const familiarUnder = (rule: FamiliarRule, roster: Printed): number => roster.filter(({ profile, slot }) => FAMILIAR[rule](profile, slot)).length;

/** How many of `roster`'s printed cards know the franchise's home park, or null when the franchise has no such rule. */
export function familiarCount(franchiseId: string, roster: Printed): number | null {
 const rule = PACKAGES[franchiseId]?.familiar?.rule;
 return rule ? familiarUnder(rule, roster) : null;
}

/** The familiarity edge under `condition` with `roster` active, times `scale` (a relocating club's multiplier), up to the engine's cap. */
export const conditionFamiliarity = ({ familiar }: ParkCondition, roster: Printed, scale = 1): number =>
 familiar ? Math.min(MAX_PARK_FAMILIARITY, familiarUnder(familiar.rule, roster) * familiar.perPlayer * scale) : 0;

/**
 * The familiarity edge at home games under `franchiseId`'s park with `roster` active, times `scale`
 * (a relocating club's multiplier), up to the engine's cap.
 */
export function familiarityFor(franchiseId: string, roster: Printed, scale = 1): number {
 const pack = PACKAGES[franchiseId];
 return pack?.park ? conditionFamiliarity({ park: pack.park, familiar: pack.familiar }, roster, scale) : 0;
}

/** The funding state a roster knows better, funded on a tie; null for a franchise without funding votes. */
export function suitedFunding(franchiseId: string, roster: Printed): Funding | null {
 const funding = PACKAGES[franchiseId]?.funding;
 return funding ? (conditionFamiliarity(funding.shutdown, roster) > conditionFamiliarity(funding.funded, roster) ? 'shutdown' : 'funded') : null;
}

/** The park condition at a club's home games in a chapter and the multiplier on its familiarity edge. */
export interface HomeCondition { condition: ParkCondition; scale: number }

/**
 * The park condition at `franchiseId`'s home games in chapter `chapter` (0-5) of a run seeded
 * `seed`: the funded or shutdown grounds by the chapter's vote, a relocating club's host park, or
 * the franchise's own; null for the real park.
 */
export function homeCondition(franchiseId: string, seed: number, chapter: number, funding: Funding | null): HomeCondition | null {
 const pack = PACKAGES[franchiseId];
 if (pack?.funding) {
  if (!funding) throw new Error(`${franchiseId} plays chapter ${chapter} without a funding vote`);
  return { condition: pack.funding[funding], scale: 1 };
 }
 const host = PACKAGES[parkHost(franchiseId, seed, chapter)];
 return host?.park ? { condition: { park: host.park, familiar: host.familiar }, scale: pack?.relocation?.familiarity ?? 1 } : null;
}

const isFieldingSlot = (slot: DraftSlot): slot is Position => (POSITIONS as readonly string[]).includes(slot);

/** How many of `roster`'s printed fielders grade at the franchise's know-how bar at their slots, or null when it has none. */
export function knowHowCount(franchiseId: string, roster: readonly { profile: Profile; slot: DraftSlot }[]): number | null {
 const knowHow = PACKAGES[franchiseId]?.knowHow;
 return knowHow ? roster.filter(({ profile, slot }) => isFieldingSlot(slot) && gloveGrade(profile, slot) >= knowHow.minGrade).length : null;
}

/** The franchise's fielding know-how with `roster` active: hit prevention every fielder gains. */
export const knowHowFor = (franchiseId: string, roster: readonly { profile: Profile; slot: DraftSlot }[]): number =>
 Math.min(MAX_KNOW_HOW, (knowHowCount(franchiseId, roster) ?? 0) * (PACKAGES[franchiseId]?.knowHow?.perPlayer ?? 0));

/** The card with `edge` more hit prevention at every position it fields. */
export function withKnowHow(profile: Profile, edge: number): Profile {
 if (!(edge > 0)) return profile;
 const positions = Object.fromEntries(Object.entries(profile.defense.positions).map(([position, skills]) => [position, withSkill(skills, 'hitPrevention', Math.min(1, skills.hitPrevention + edge))]));
 return { ...profile, defense: { ...profile.defense, positions } };
}

export const franchisePackage = (franchiseId: string): FranchisePackage | null => PACKAGES[franchiseId] ?? null;

/** Whether the dollar is strong in chapter `chapter` (0-5): seeded, three strong chapters and three weak in a shuffled order. */
export const strongDollar = (seed: number, chapter: number): boolean =>
 shuffle(Array.from({ length: LEAGUE_CHAPTERS }, (_, index) => index < LEAGUE_CHAPTERS / 2), randomStream(seed, 'draft:exchange'))[Math.min(chapter, LEAGUE_CHAPTERS - 1)];

/** The franchise's exchange in chapter `chapter` of a run seeded `seed`; par for a franchise without an exchange rate. */
export function exchangeFor(franchiseId: string, seed: number, chapter: number): Exchange {
 const rate = PACKAGES[franchiseId]?.exchangeRate;
 if (!rate) return PAR;
 return strongDollar(seed, chapter) ? { price: 1 - rate.price, fill: -rate.fill, ticket: 1 + rate.ticket } : { price: 1 + rate.price, fill: rate.fill, ticket: 1 / (1 + rate.ticket) };
}

/**
 * The franchise whose park package plays at `franchiseId`'s home games in chapter `chapter` (0-5): a
 * relocating club's seeded host, every one used before any repeats and never the same twice running,
 * else the franchise itself.
 */
export function parkHost(franchiseId: string, seed: number, chapter: number): string {
 const hosts = PACKAGES[franchiseId]?.relocation?.hosts;
 if (!hosts?.length) return franchiseId;
 const random = randomStream(seed, 'draft:relocation');
 const venues: string[] = [];
 while (venues.length < LEAGUE_CHAPTERS) {
  const round = shuffle([...hosts], random);
  if (round[0] === venues.at(-1)) round.push(round.shift()!);
  venues.push(...round);
 }
 return venues[Math.min(chapter, LEAGUE_CHAPTERS - 1)];
}

/** What trading `cardId` away pays seat `seat` under its franchise's sale bonus: a multiple of what the seat has paid to train it. */
export function saleBonusFor(franchiseId: string, upgrades: readonly Upgrade[], seat: number, cardId: string): number {
 const multiple = PACKAGES[franchiseId]?.saleBonus ?? 0;
 return multiple * upgrades.reduce((sum, upgrade) => sum + (upgrade.cardId === cardId && upgrade.paidBy === seat && !upgrade.free ? upgrade.cost : 0), 0);
}

/** The franchise's price for a training listed at `price`, under the chapter's exchange. */
export const trainingPriceFor = (franchiseId: string, price: number, exchange: Exchange = PAR): number => Math.max(1, Math.round(price * (PACKAGES[franchiseId]?.trainingPrice ?? 1) * exchange.price));

/** The franchise's gain multiplier for `kind`, with `activeCommons` original-tier commons on its active roster. */
export function trainingGainFor(franchiseId: string, kind: TrainingKind, activeCommons: number): number {
 const pack = PACKAGES[franchiseId];
 if (!pack) return 1;
 const boost = pack.commonBoost ? Math.min(pack.commonBoostMax ?? Infinity, pack.commonBoost * activeCommons) : 0;
 return (pack.trainingGain?.[kind] ?? 1) * (1 + boost);
}
