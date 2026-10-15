/** Per-device cover choices for player stacks; losing them only resets presentation. */
export const COLLECTION_STACK_PREFERENCES_KEY = '162-zero:collection-stacks:v1';

export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type StackCoverPreferences = Readonly<Record<string, string>>;

function storage(): PreferenceStorage | null {
	try { return typeof window === 'undefined' ? null : window.localStorage; }
	catch { return null; }
}

/** Reads cover choices, ignoring malformed entries and unavailable browser storage. */
export function loadStackCoverPreferences(source: PreferenceStorage | null = storage()): StackCoverPreferences {
	try {
		const value = JSON.parse(source?.getItem(COLLECTION_STACK_PREFERENCES_KEY) ?? 'null') as unknown;
		if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
		return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'));
	} catch {
		return {};
	}
}

/** Saves cover choices; false tells the UI that the preference could not persist. */
export function saveStackCoverPreferences(preferences: StackCoverPreferences, target: PreferenceStorage | null = storage()): boolean {
	if (!target) return false;
	try {
		target.setItem(COLLECTION_STACK_PREFERENCES_KEY, JSON.stringify(preferences));
		return true;
	} catch {
		return false;
	}
}
