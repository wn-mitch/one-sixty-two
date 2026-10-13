import {
 CURRENT_REPLAY_SCHEMA_VERSION,
 MAX_SEASON_YEAR,
 MIN_SEASON_YEAR,
 MODEL_VERSION,
 SLOTS,
 type ReplaySchemaVersion,
 type Slot
} from './types.ts';

export interface DraftRulePolicy {
 schemaVersion: ReplaySchemaVersion;
 uniqueFranchises: true;
 slots: readonly Slot[];
 minYear: number;
 maxYear: number;
 modelVersion: typeof MODEL_VERSION;
 /** Extra franchise packs per draft a pending roll may add before the player chooses one of them. */
 extraPacks: number;
 /**
  * Jackpot packs: `guaranteed` of the draft's rolls (seeded positions) are jackpots, and every other
  * roll or added pack is one with probability `chance`. Each deals `size` elite seasons.
  */
 jackpots: { guaranteed: number; chance: number; size: number };
}

const CURRENT_RULE_POLICY: DraftRulePolicy = {
 schemaVersion: CURRENT_REPLAY_SCHEMA_VERSION,
 uniqueFranchises: true,
 slots: SLOTS,
 minYear: MIN_SEASON_YEAR,
 maxYear: MAX_SEASON_YEAR,
 modelVersion: MODEL_VERSION,
 extraPacks: 2,
 jackpots: { guaranteed: 2, chance: 0.2, size: 6 }
};

export function draftRules(schemaVersion: ReplaySchemaVersion): DraftRulePolicy {
 if (schemaVersion !== CURRENT_REPLAY_SCHEMA_VERSION) throw new Error('Saved draft is incompatible');
 return CURRENT_RULE_POLICY;
}
