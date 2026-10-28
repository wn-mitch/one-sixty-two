import {
 compareId,
 BULLPEN_SLOTS,
 CURRENT_REPLAY_SCHEMA_VERSION,
 defaultReliefRoles,
 HITTER_SLOTS,
 STARTER_SLOTS,
 validateReliefRoles,
 type Candidate,
 type Draft,
 isJackpot,
 type DraftAction,
 type HitterSlot,
 type Manifest,
 type Pick,
 RULES_VERSION,
 type Replay,
 type ReplaySchemaVersion,
 type Roll,
 type Slot,
 type TeamRoll
} from './types.ts';
import { analyzeDraft, canFinishDraft, isViableForSlot, type DraftAnalysis } from './draft-analysis.ts';
import { randomStream, shuffle } from './random.ts';
import { dailySeed, dailyStadium, isDailyDate } from './daily.ts';
import { draftRules, type DraftRulePolicy } from './rules.ts';

function requireCurrentRules(draft: Draft): DraftRulePolicy {
 if (draft.schemaVersion !== CURRENT_REPLAY_SCHEMA_VERSION) throw new Error('Saved draft is incompatible');
 return draftRules(CURRENT_REPLAY_SCHEMA_VERSION);
}

function emptyDraft(manifest: Manifest, seed: number, daily?: string, bonusPack?: true): Draft {
 const policy = draftRules(CURRENT_REPLAY_SCHEMA_VERSION);
 return {
  schemaVersion: CURRENT_REPLAY_SCHEMA_VERSION,
  dataVersion: manifest.dataVersion,
  modelVersion: policy.modelVersion,
  rulesVersion: RULES_VERSION,
  seed,
  homeStadium: null,
  picks: [],
  currentRoll: null,
  packs: [],
  passed: [],
  battingOrder: [],
  starterOrder: [],
  reliefRoles: [],
  actions: [],
  ...(daily === undefined ? {} : { daily }),
  ...(bonusPack ? { bonusPack } : {})
 };
}

/** A Classic draft; `bonusPack` grants a device's first draft one extra pack beyond the rules' allowance. */
export function createDraft(manifest: Manifest, seed: number, bonusPack = false): Draft {
 if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Invalid draft seed');
 return emptyDraft(manifest, seed, undefined, bonusPack ? true : undefined);
}

/** The daily run for `date`: its seed and home stadium are the day's, already pinned. */
export function createDailyDraft(manifest: Manifest, date: string): Draft {
 return applyStadium(emptyDraft(manifest, dailySeed(date), date), manifest, dailyStadium(date, manifest).ref.id, null);
}

export function openSlots(draft: Draft): Slot[] {
 const occupied = new Set(draft.picks.map(pick => pick.slot));
 return draftRules(draft.schemaVersion).slots.filter(slot => !occupied.has(slot));
}

export function legalSlots(draft: Draft, candidate: Candidate, manifest: Manifest): Slot[] {
 const analysis = analyzeDraft(draft, manifest);
 if (!analysis.unusedSeasons.has(candidate.seasonId)) return [];
 return analysis.slots.filter(slot =>
  candidate.eligibleSlots.includes(slot) && isViableForSlot(analysis, candidate, slot)
 );
}

/** Whether a season belongs to a pack: its franchise-decade, or one of a jackpot's dealt seasons. */
export function rollContains(roll: Roll, candidate: Candidate): boolean {
 if (isJackpot(roll)) return roll.jackpot.includes(candidate.seasonId);
 return candidate.franchiseId === roll.franchiseId && candidate.decade === roll.decade;
}

/** A stable identity for a pack on the table. */
export function rollKey(roll: Roll): string {
 return isJackpot(roll) ? `jackpot:${roll.jackpot.join('|')}` : `${roll.franchiseId}-${roll.decade}`;
}

/** A pack's spoken name: the franchise and era, or the jackpot. */
export function rollLabel(roll: Roll, manifest: Manifest): string {
 if (isJackpot(roll)) return `Jackpot pack of ${roll.jackpot.length} elite seasons`;
 return `${manifest.franchises.find(franchise => franchise.id === roll.franchiseId)?.name}, ${manifest.coverage.find(coverage => coverage.decade === roll.decade)?.label}`;
}

/** The roll's era, bounded by the decade's data coverage and the draft's year limits. */
export function rollYears(roll: TeamRoll, manifest: Manifest, schemaVersion: ReplaySchemaVersion): { first: number; last: number } {
 const policy = draftRules(schemaVersion);
 const coverage = manifest.coverage.find(item => item.decade === roll.decade);
 return {
  first: Math.max(policy.minYear, coverage?.firstYear ?? roll.decade),
  last: Math.min(policy.maxYear, coverage?.lastYear ?? roll.decade + 9)
 };
}

export function availableCandidates(draft: Draft, manifest: Manifest, roll: Roll | null = draft.currentRoll): Candidate[] {
 return legalCandidates(analyzeDraft(draft, manifest), roll);
}

function legalCandidates(analysis: DraftAnalysis, roll: Roll | null): Candidate[] {
 return analysis.unused.filter(candidate => {
  if (roll && !rollContains(roll, candidate)) return false;
  return analysis.slots.some(slot =>
   candidate.eligibleSlots.includes(slot) && isViableForSlot(analysis, candidate, slot)
  );
 });
}

/**
 * A uniformly random franchise with legal seasons left, then one of its legal decades. A pack passed over
 * for an added pack is not dealt again, and an added pack avoids the franchises already on the table, or
 * failing that their exact decades, each while anything else remains.
 */
function nextTeamRoll(all: readonly Candidate[], random: () => number, table: readonly Roll[], passed: readonly TeamRoll[]): TeamRoll {
 const fresh = all.filter(candidate => !passed.some(roll => roll.franchiseId === candidate.franchiseId && roll.decade === candidate.decade));
 const legal = fresh.length ? fresh : all;
 const teams = table.filter((roll): roll is TeamRoll => !isJackpot(roll));
 const newFranchises = legal.filter(candidate => !teams.some(roll => roll.franchiseId === candidate.franchiseId));
 const newDecades = legal.filter(candidate => !teams.some(roll => roll.franchiseId === candidate.franchiseId && roll.decade === candidate.decade));
 const candidates = newFranchises.length ? newFranchises : newDecades.length ? newDecades : legal;
 const franchises = [...new Set(candidates.map(candidate => candidate.franchiseId))].sort(compareId);
 if (!franchises.length) throw new Error('Dataset error: no legal candidates remain. Your draft is preserved.');
 const franchiseId = franchises[Math.floor(random() * franchises.length)];
 const decades = [...new Set(candidates
  .filter(candidate => candidate.franchiseId === franchiseId)
  .map(candidate => candidate.decade))].sort((a, b) => a - b);
 return { franchiseId, decade: decades[Math.floor(random() * decades.length)] };
}

/**
 * Deal round-robin across open slots from their best remaining distinct players. Unseen players
 * lead each slot's shortlist; previously dealt, undrafted players return only when that supply ends.
 */
function nextJackpot(analysis: DraftAnalysis, legal: readonly Candidate[], manifest: Manifest, random: () => number, shown: ReadonlySet<string>, policy: DraftRulePolicy['jackpots']): Roll | null {
 const bySeason = new Map(legal.map(candidate => [candidate.seasonId, candidate]));
 const ranked = manifest.jackpot.flatMap(seasonId => {
  const candidate = bySeason.get(seasonId);
  return candidate ? [candidate] : [];
 });
 const pools = shuffle(analysis.slots.flatMap(slot => {
  const players = new Set<string>();
  const unseen: Candidate[] = [];
  const seen: Candidate[] = [];
  for (const candidate of ranked) {
   if (players.has(candidate.playerId) || !candidate.eligibleSlots.includes(slot) || !isViableForSlot(analysis, candidate, slot)) continue;
   players.add(candidate.playerId);
   (shown.has(candidate.playerId) ? seen : unseen).push(candidate);
  }
  return players.size ? [{ unseen, seen }] : [];
 }), random);
 const dealt = new Set<string>();
 const seasons: string[] = [];
 while (seasons.length < policy.size) {
  const before = seasons.length;
  for (const pool of pools) {
   const options: Candidate[] = [];
   for (const candidates of [pool.unseen, pool.seen]) {
    for (const candidate of candidates) {
     if (dealt.has(candidate.playerId)) continue;
     options.push(candidate);
     if (options.length === policy.shortlist) break;
    }
    if (options.length) break;
   }
   if (!options.length) continue;
   const chosen = options[Math.floor(random() * options.length)];
   dealt.add(chosen.playerId);
   seasons.push(chosen.seasonId);
   if (seasons.length === policy.size) break;
  }
  if (seasons.length === before) break;
 }
 return seasons.length ? { jackpot: seasons.sort(compareId) } : null;
}

/** Roll indexes, by pick number, that are guaranteed jackpots for this seed. */
function guaranteedJackpots(seed: number, policy: DraftRulePolicy): Set<number> {
 const order = shuffle(policy.slots.map((_, index) => index), randomStream(seed, 'jackpot'));
 return new Set(order.slice(0, policy.jackpots.guaranteed));
}

/** The next pack from the draft stream: a jackpot when forced or on the per-roll chance, otherwise a franchise. */
function nextRoll(draft: Draft, manifest: Manifest, random: () => number, table: readonly Roll[], forced: boolean, shown: ReadonlySet<string>): Roll {
 const policy = draftRules(draft.schemaVersion);
 const analysis = analyzeDraft(draft, manifest);
 const legal = legalCandidates(analysis, null);
 const lucky = random() < policy.jackpots.chance;
 const jackpot = forced || lucky ? nextJackpot(analysis, legal, manifest, random, shown, policy.jackpots) : null;
 return jackpot ?? nextTeamRoll(legal, random, table, draft.passed);
}

function applyStadium(draft: Draft, manifest: Manifest, stadiumId: string, stadiumVersion: string | null): Draft {
 if (draft.homeStadium || draft.actions.length || draft.picks.length || draft.currentRoll) throw new Error('The home stadium is already chosen');
 const stadium = manifest.stadiums.find(item => item.ref.id === stadiumId);
 if (!stadium || (stadiumVersion !== null && stadium.ref.version !== stadiumVersion)) throw new Error('Choose a stadium from the current deck');
 if (draft.daily !== undefined && stadium.ref.id !== dailyStadium(draft.daily, manifest).ref.id) throw new Error('The daily run plays in the day’s stadium');
 const { id, version } = stadium.ref;
 return { ...draft, homeStadium: { id, version }, actions: [{ type: 'select-stadium', stadiumId: id, stadiumVersion: version }] };
}

/** Pins the home stadium as the sole first action of an unstarted draft. */
export function selectHomeStadium(draft: Draft, manifest: Manifest, stadiumId: string): Draft {
 requireCurrentRules(draft);
 return applyStadium(draft, manifest, stadiumId, null);
}

function appendAction(draft: Draft, action: DraftAction): DraftAction[] {
 return [...draft.actions, action];
}

function applyRoll(draft: Draft, manifest: Manifest, random: () => number, record: boolean, shown: ReadonlySet<string>): Draft {
 const policy = draftRules(draft.schemaVersion);
 if (!draft.homeStadium) throw new Error('Choose a home stadium before rolling');
 if (draft.currentRoll) throw new Error('A draft roll is already pending');
 if (draft.picks.length === policy.slots.length) throw new Error('The roster is complete');
 const roll = nextRoll(draft, manifest, random, [], guaranteedJackpots(draft.seed, policy).has(draft.picks.length), shown);
 const result = { ...draft, currentRoll: roll, packs: [roll] } as Draft;
 if (record) return { ...result, actions: appendAction(draft, { type: 'roll' }) } as Draft;
 return result;
}

/** Extra packs the whole draft may add: the rules' allowance plus a first draft's bonus pack. */
export function extraPackAllowance(draft: Draft): number {
 return draftRules(draft.schemaVersion).extraPacks + (draft.bonusPack ? 1 : 0);
}

/** Extra packs this draft may still add to a pending roll. */
export function extraPacksLeft(draft: Draft): number {
 return extraPackAllowance(draft) - draft.actions.filter(action => action.type === 'add-pack').length;
}

/** The most packs one roll can hold: its own plus the rules' extra packs. A bonus pack never widens one roll's table. */
export function maxPacks(draft: Draft): number {
 return 1 + draftRules(draft.schemaVersion).extraPacks;
}

function applyAddPack(draft: Draft, manifest: Manifest, random: () => number, shown: ReadonlySet<string>): Draft {
 if (!draft.packs.length) throw new Error('Roll before adding a pack');
 if (extraPacksLeft(draft) <= 0) throw new Error('No extra packs left');
 if (draft.packs.length >= maxPacks(draft)) throw new Error('This roll holds no more packs');
 const packs = [...draft.packs, nextRoll(draft, manifest, random, draft.packs, false, shown)];
 return { ...draft, currentRoll: null, packs, actions: appendAction(draft, { type: 'add-pack' }) } as Draft;
}

function applyChoosePack(draft: Draft, pack: number): Draft {
 if (draft.packs.length < 2) throw new Error('There is no pack to choose');
 const chosen = draft.packs[pack];
 if (!chosen) throw new Error('Choose one of the open packs');
 const passed = draft.packs.filter((roll, index): roll is TeamRoll => index !== pack && !isJackpot(roll));
 return { ...draft, currentRoll: chosen, packs: [chosen], passed: [...draft.passed, ...passed], actions: appendAction(draft, { type: 'choose-pack', pack }) } as Draft;
}

function commitPickWithPolicy(
 draft: Draft,
 manifest: Manifest,
 seasonId: string,
 slot: Slot,
 policy: DraftRulePolicy,
 record: boolean
): Draft {
 if (!draft.currentRoll) throw new Error('Roll before choosing a player');
 const candidate = manifest.candidates.find(item => item.seasonId === seasonId);
 if (!candidate || !rollContains(draft.currentRoll, candidate)) {
  throw new Error('Choose a season from the current roll');
 }
 const year = Number(candidate.seasonId.split(':')[1]);
 if (!Number.isInteger(year) || year < policy.minYear || year > policy.maxYear) {
  throw new Error('Season is outside the supported era');
 }
 if (!policy.slots.includes(slot) || !legalSlots(draft, candidate, manifest).includes(slot)) {
  throw new Error('Player is not eligible for that empty slot');
 }
 const pick: Pick = { franchiseId: candidate.franchiseId, decade: candidate.decade, seasonId, slot };
 const picks: Pick[] = [...draft.picks, isJackpot(draft.currentRoll) ? { ...pick, jackpot: true } : pick];
 let result = { ...draft, picks, currentRoll: null, packs: [] } as Draft;
 if (picks.length === policy.slots.length) {
  result = {
   ...result,
   battingOrder: HITTER_SLOTS.map(position => picks.find(pick => pick.slot === position)!.seasonId),
   starterOrder: STARTER_SLOTS.map(position => picks.find(pick => pick.slot === position)!.seasonId),
   reliefRoles: defaultReliefRoles(BULLPEN_SLOTS)
  } as Draft;
 }
 if (record) return { ...result, actions: appendAction(draft, { type: 'pick', seasonId, slot }) } as Draft;
 return result;
}


function reassignedDraft(
 draft: Draft,
 manifest: Manifest,
 seasonId: string,
 destination: HitterSlot,
 record: boolean
): Draft {
 requireCurrentRules(draft);
 const selectedPick = draft.picks.find(pick => pick.seasonId === seasonId);
 const selectedCandidate = selectedPick && manifest.candidates.find(candidate => candidate.seasonId === selectedPick.seasonId);
 if (!selectedPick || !selectedCandidate || !HITTER_SLOTS.includes(selectedPick.slot as HitterSlot)) {
  throw new Error('Choose a drafted position player');
 }
 const origin = selectedPick.slot as HitterSlot;
 if (origin === destination) return draft;
 if (!HITTER_SLOTS.includes(destination) || !selectedCandidate.eligibleSlots.includes(destination)) {
  throw new Error('Player does not qualify for that position');
 }
 const otherPick = draft.picks.find(pick => pick.slot === destination);
 if (otherPick) {
  const otherCandidate = manifest.candidates.find(candidate => candidate.seasonId === otherPick.seasonId);
  if (!otherCandidate?.eligibleSlots.includes(origin)) {
   throw new Error('The other player cannot move to the original position');
  }
 }
 const picks = draft.picks.map(pick => {
  if (pick.seasonId === seasonId) return { ...pick, slot: destination };
  if (otherPick && pick.seasonId === otherPick.seasonId) return { ...pick, slot: origin };
  return pick;
 });
 const result = { ...draft, picks } as Draft;
 if (!canFinishDraft(result, manifest)) throw new Error('This move would prevent completing the roster');
 if (result.packs.some(pack => availableCandidates(result, manifest, pack).length === 0)) {
  throw new Error('This move would leave the current roll without a legal pick');
 }
 if (record) {
  return { ...result, actions: appendAction(draft, { type: 'reassign', seasonId, slot: destination }) } as Draft;
 }
 return result;
}

export interface LegalReassignment {
 slot: HitterSlot;
 swapWith: string | null;
}

export function legalReassignments(draft: Draft, manifest: Manifest, seasonId: string): LegalReassignment[] {
 requireCurrentRules(draft);
 const selected = draft.picks.find(pick => pick.seasonId === seasonId);
 if (!selected || !HITTER_SLOTS.includes(selected.slot as HitterSlot)) return [];
 const result: LegalReassignment[] = [];
 for (const slot of HITTER_SLOTS) {
  if (slot === selected.slot) continue;
  try {
   const reassigned = reassignedDraft(draft, manifest, seasonId, slot, false);
   const occupant = draft.picks.find(pick => pick.slot === slot);
   if (reassigned !== draft) result.push({ slot, swapWith: occupant?.seasonId ?? null });
  } catch (error) {
   if (error instanceof Error && (
    error.message === 'Player does not qualify for that position' ||
    error.message === 'The other player cannot move to the original position' ||
    error.message === 'This move would prevent completing the roster' ||
    error.message === 'This move would leave the current roll without a legal pick'
   )) continue;
   throw error;
  }
 }
 return result;
}

export function reassignPick(draft: Draft, manifest: Manifest, seasonId: string, destination: HitterSlot): Draft {
 return reassignedDraft(draft, manifest, seasonId, destination, true);
}

function validAction(value: unknown): DraftAction {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid draft action');
 const action = value as Record<string, unknown>;
 if (action.type === 'select-stadium') {
  if (Object.keys(action).length !== 3 || typeof action.stadiumId !== 'string' || typeof action.stadiumVersion !== 'string') throw new Error('Invalid draft action');
  return { type: 'select-stadium', stadiumId: action.stadiumId, stadiumVersion: action.stadiumVersion };
 }
 if (action.type === 'roll') {
  if (Object.keys(action).length !== 1) throw new Error('Invalid draft action');
  return { type: 'roll' };
 }
 if (action.type === 'add-pack') {
  if (Object.keys(action).length !== 1) throw new Error('Invalid draft action');
  return { type: 'add-pack' };
 }
 if (action.type === 'choose-pack') {
  if (Object.keys(action).length !== 2 || !Number.isInteger(action.pack)) throw new Error('Invalid draft action');
  return { type: 'choose-pack', pack: action.pack as number };
 }
 if (action.type === 'pick') {
  if (Object.keys(action).length !== 3 || typeof action.seasonId !== 'string' ||
   typeof action.slot !== 'string' || !draftRules(CURRENT_REPLAY_SCHEMA_VERSION).slots.includes(action.slot as Slot)) {
   throw new Error('Invalid draft action');
  }
  return { type: 'pick', seasonId: action.seasonId, slot: action.slot as Slot };
 }
 if (action.type === 'reassign') {
  if (Object.keys(action).length !== 3 || typeof action.seasonId !== 'string' ||
   typeof action.slot !== 'string' || !HITTER_SLOTS.includes(action.slot as HitterSlot)) {
   throw new Error('Invalid draft action');
  }
  return { type: 'reassign', seasonId: action.seasonId, slot: action.slot as HitterSlot };
 }
 throw new Error('Invalid draft action');
}

/** The players a roll's jackpot deals; none for a franchise pack. */
function jackpotPlayers(roll: Roll | undefined, manifest: Manifest): string[] {
 if (!roll || !isJackpot(roll)) return [];
 return roll.jackpot.map(seasonId => manifest.candidates.find(candidate => candidate.seasonId === seasonId)?.playerId ?? seasonId);
}

/** Called before each replayed pick with the draft as it stood and every pack dealt for that pick, even ones a `choose-pack` discarded. */
type PickObserver = (draft: Draft, slot: Slot, table: readonly Roll[]) => void;

/** Rebuilds the draft from its actions, with every player an earlier jackpot dealt. */
function replayActions(input: Replay, manifest: Manifest, onPick?: PickObserver): { draft: Draft; random: () => number; shown: Set<string> } {
 if (!Array.isArray(input.actions)) throw new Error('Invalid draft actions');
 if (input.daily !== undefined && (!isDailyDate(input.daily) || input.seed !== dailySeed(input.daily))) throw new Error('Invalid daily run');
 if (input.bonusPack !== undefined && (input.bonusPack !== true || input.daily !== undefined)) throw new Error('Invalid bonus pack');
 let draft = emptyDraft(manifest, input.seed, input.daily, input.bonusPack);
 const random = randomStream(input.seed, 'draft');
 const shown = new Set<string>();
 let table: readonly Roll[] = [];
 for (const value of input.actions) {
  const action = validAction(value);
  const previous = draft;
  if (action.type === 'select-stadium') draft = applyStadium(draft, manifest, action.stadiumId, action.stadiumVersion);
  else if (action.type === 'roll' || action.type === 'add-pack') {
   draft = action.type === 'roll' ? applyRoll(draft, manifest, random, true, shown) : applyAddPack(draft, manifest, random, shown);
   for (const playerId of jackpotPlayers(draft.packs.at(-1), manifest)) shown.add(playerId);
   table = draft.packs;
  }
  else if (action.type === 'choose-pack') draft = applyChoosePack(draft, action.pack);
  else if (action.type === 'pick') {
   onPick?.(draft, action.slot, table);
   draft = commitPickWithPolicy(draft, manifest, action.seasonId, action.slot, draftRules(CURRENT_REPLAY_SCHEMA_VERSION), true);
  } else {
   draft = reassignedDraft(draft, manifest, action.seasonId, action.slot, true);
   if (draft === previous) throw new Error('Invalid draft action');
  }
 }
 return { draft, random, shown };
}


/** For each pick in a complete replay, every legal season for the slot it filled across all packs dealt for that pick. */
export function pickOffers(input: Replay, manifest: Manifest): { seasonId: string; slot: Slot; offered: Candidate[] }[] {
 const offers: { slot: Slot; offered: Candidate[] }[] = [];
 const { draft } = replayChronology(input, manifest, (before, slot, table) => {
  const offered = new Map<string, Candidate>();
  for (const pack of table) {
   for (const candidate of availableCandidates(before, manifest, pack)) {
    if (legalSlots(before, candidate, manifest).includes(slot)) offered.set(candidate.seasonId, candidate);
   }
  }
  offers.push({ slot, offered: [...offered.values()] });
 });
 if (!samePicks(input.picks, draft.picks)) throw new Error('Invalid draft snapshot');
 return offers.map((offer, index) => ({ seasonId: draft.picks[index].seasonId, ...offer }));
}

function replayChronology(input: Replay, manifest: Manifest, onPick?: PickObserver): { draft: Draft; random: () => number; shown: Set<string> } {
 if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 0xffffffff) throw new Error('Invalid draft seed');
 return replayActions(input, manifest, onPick);
}

export function rollDraft(draft: Draft, manifest: Manifest): Draft {
 const policy = requireCurrentRules(draft);
 if (draft.packs.length) return draft;
 if (draft.picks.length === policy.slots.length) throw new Error('The roster is complete');
 const { draft: replayed, random, shown } = replayActions(draft, manifest);
 if (!samePicks(draft.picks, replayed.picks)) throw new Error('Invalid draft snapshot');
 return applyRoll(replayed, manifest, random, true, shown);
}

/** Deals another pack (a franchise, or on the jackpot chance an elite handful) beside the pending roll's from the draft's seeded stream; the player then chooses one. */
export function addPack(draft: Draft, manifest: Manifest): Draft {
 requireCurrentRules(draft);
 const { draft: replayed, random, shown } = replayActions(draft, manifest);
 if (!samePicks(draft.picks, replayed.picks)) throw new Error('Invalid draft snapshot');
 return applyAddPack(replayed, manifest, random, shown);
}

/** Keeps one of the open packs as the pending roll; the others are discarded. */
export function choosePack(draft: Draft, pack: number): Draft {
 requireCurrentRules(draft);
 return applyChoosePack(draft, pack);
}

export function commitPick(draft: Draft, manifest: Manifest, seasonId: string, slot: Slot): Draft {
 const policy = requireCurrentRules(draft);
 return commitPickWithPolicy(draft, manifest, seasonId, slot, policy, true);
}

function validateOrder(value: unknown, expected: string[]): string[] {
 if (!Array.isArray(value) || value.length !== expected.length ||
  value.some(item => typeof item !== 'string') ||
  new Set(value).size !== value.length ||
  value.some(item => !expected.includes(item))) {
  throw new Error('Invalid lineup order');
 }
 return value;
}

function sameRoll(left: Roll | null | undefined, right: Roll | null): boolean {
 if (left == null) return right === null;
 if (right === null || !left || typeof left !== 'object') return false;
 if (isJackpot(right)) {
  return Object.keys(left).length === 1 && isJackpot(left) && Array.isArray(left.jackpot) &&
   left.jackpot.length === right.jackpot.length && left.jackpot.every((seasonId, index) => seasonId === right.jackpot[index]);
 }
 return Object.keys(left).length === 2 && !isJackpot(left) && left.franchiseId === right.franchiseId && left.decade === right.decade;
}

function samePicks(value: Pick[], expected: Pick[]): boolean {
 if (value.length !== expected.length) return false;
 return value.every((pick, index) => {
  const other = expected[index];
  if (!pick || typeof pick !== 'object' || Object.keys(pick).length !== (other.jackpot ? 5 : 4)) return false;
  return pick.seasonId === other.seasonId && pick.slot === other.slot &&
   pick.franchiseId === other.franchiseId && pick.decade === other.decade && pick.jackpot === other.jackpot;
 });
}

function sameStadium(value: unknown, expected: Draft['homeStadium']): boolean {
 if (value === null || expected === null) return value === expected;
 if (!value || typeof value !== 'object' || Object.keys(value).length !== 2) return false;
 const ref = value as Record<string, unknown>;
 return ref.id === expected.id && ref.version === expected.version;
}

function validateWithRules(value: unknown, manifest: Manifest, requireCurrentRoll: boolean, complete: boolean): Draft {
 if (!value || typeof value !== 'object') throw new Error('Invalid draft');
 const input = value as Draft;
 if (input.schemaVersion !== CURRENT_REPLAY_SCHEMA_VERSION) throw new Error('Saved draft is incompatible');
 const policy = draftRules(input.schemaVersion);
 if (input.dataVersion !== manifest.dataVersion || input.modelVersion !== policy.modelVersion || input.rulesVersion !== RULES_VERSION) {
  throw new Error('Saved draft is incompatible');
 }
 if (input.homeStadium && !manifest.stadiums.some(stadium => stadium.ref.id === input.homeStadium!.id && stadium.ref.version === input.homeStadium!.version)) {
  throw new Error('Saved draft is incompatible');
 }
 if (!Array.isArray(input.picks) ||
  input.picks.length > policy.slots.length ||
  complete && input.picks.length !== policy.slots.length ||
  input.picks.some(pick => !pick || typeof pick !== 'object')) {
  throw new Error('Invalid draft picks');
 }
 if (requireCurrentRoll && !Object.prototype.hasOwnProperty.call(input, 'currentRoll')) throw new Error('Invalid saved roll');
 const { draft } = replayChronology(input, manifest);
 if (!samePicks(input.picks, draft.picks) || !sameStadium(input.homeStadium, draft.homeStadium)) throw new Error('Invalid draft snapshot');
 if (draft.daily !== undefined && !draft.homeStadium) throw new Error('Invalid daily run');
 if (requireCurrentRoll && (!Array.isArray(input.packs) || input.packs.length !== draft.packs.length ||
  input.packs.some((pack, index) => !sameRoll(pack, draft.packs[index])))) throw new Error('Invalid saved roll');
 if (!sameRoll(input.currentRoll, draft.currentRoll)) {
  if (complete && input.currentRoll) throw new Error('Complete roster cannot have a pending roll');
  throw new Error('Invalid saved roll');
 }
 if (complete && draft.packs.length) throw new Error('Complete roster cannot have a pending roll');
 draft.battingOrder = validateOrder(input.battingOrder, draft.battingOrder);
 draft.starterOrder = validateOrder(input.starterOrder, draft.starterOrder);
 draft.reliefRoles = validateReliefRoles(input.reliefRoles, draft.picks.length === policy.slots.length);
 return draft;
}

/** Validate an ongoing save under the current draft rules only. */
export function validateDraft(value: unknown, manifest: Manifest, complete = false): Draft {
 return validateWithRules(value, manifest, true, complete);
}

/** Validate a completed immutable replay under the sole current replay contract. */
export function validateReplay(value: unknown, manifest: Manifest): Draft {
 return validateWithRules(value, manifest, false, true);
}

/** The replay contract in canonical key order; `daily` appears only on a daily run, so other drafts keep their keys. */
export function replayInput(draft: Draft): Replay {
 const { schemaVersion, dataVersion, modelVersion, rulesVersion, seed, homeStadium, picks, battingOrder, starterOrder, reliefRoles, actions, daily, bonusPack } = draft;
 return { schemaVersion, dataVersion, modelVersion, rulesVersion, seed, homeStadium, picks, battingOrder, starterOrder, reliefRoles, actions, ...(daily === undefined ? {} : { daily }), ...(bonusPack ? { bonusPack } : {}) };
}
