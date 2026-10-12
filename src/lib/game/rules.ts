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
 /** Times per draft a pending franchise and decade may be replaced before picking. */
 rerolls: number;
}

const CURRENT_RULE_POLICY: DraftRulePolicy = {
 schemaVersion: CURRENT_REPLAY_SCHEMA_VERSION,
 uniqueFranchises: true,
 slots: SLOTS,
 minYear: MIN_SEASON_YEAR,
 maxYear: MAX_SEASON_YEAR,
 modelVersion: MODEL_VERSION,
 rerolls: 2
};

export function draftRules(schemaVersion: ReplaySchemaVersion): DraftRulePolicy {
 if (schemaVersion !== CURRENT_REPLAY_SCHEMA_VERSION) throw new Error('Saved draft is incompatible');
 return CURRENT_RULE_POLICY;
}
