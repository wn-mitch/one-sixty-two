import { LEGACY_SLOTS, MAX_SEASON_YEAR, MIN_SEASON_YEAR, MODEL_VERSION, SLOTS, type ReplaySchemaVersion, type Slot } from './types.ts';

export interface DraftRulePolicy {
 schemaVersion: ReplaySchemaVersion;
 uniqueFranchises: boolean;
 slots: readonly Slot[];
 minYear: number;
 maxYear: number;
 modelVersion: string;
}

const RULE_POLICIES: Record<ReplaySchemaVersion, DraftRulePolicy> = {
 1: { schemaVersion: 1, uniqueFranchises: false, slots: LEGACY_SLOTS, minYear: 1961, maxYear: MAX_SEASON_YEAR, modelVersion: 'pa-v1' },
 2: { schemaVersion: 2, uniqueFranchises: true, slots: LEGACY_SLOTS, minYear: 1961, maxYear: MAX_SEASON_YEAR, modelVersion: 'pa-v1' },
 3: { schemaVersion: 3, uniqueFranchises: true, slots: SLOTS, minYear: MIN_SEASON_YEAR, maxYear: MAX_SEASON_YEAR, modelVersion: MODEL_VERSION }
};

export function draftRules(schemaVersion: ReplaySchemaVersion): DraftRulePolicy {
 const policy = RULE_POLICIES[schemaVersion];
 if (!policy) throw new Error('Saved draft is incompatible');
 return policy;
}
