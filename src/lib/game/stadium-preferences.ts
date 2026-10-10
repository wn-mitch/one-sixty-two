/** Per-viewer stadium deck conveniences; losing them only resets the deck's order. */
export const STADIUM_PREFERENCES_STORAGE_KEY = '162-zero:stadium-deck:v1';

export type StadiumSort = 'stadium' | 'team';

export interface StadiumPreferences {
	sort: StadiumSort;
	favorites: string[];
}

const DEFAULTS: StadiumPreferences = { sort: 'stadium', favorites: [] };

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

function storage(): PreferenceStorage | null {
	try { return typeof window === 'undefined' ? null : window.localStorage; }
	catch { return null; }
}

/** Reads saved preferences, falling back to defaults when storage is blocked or the value is unusable. */
export function loadStadiumPreferences(source: PreferenceStorage | null = storage()): StadiumPreferences {
	try {
		const value = JSON.parse(source?.getItem(STADIUM_PREFERENCES_STORAGE_KEY) ?? 'null') as Partial<StadiumPreferences> | null;
		if (!value || typeof value !== 'object') return { ...DEFAULTS };
		return {
			sort: value.sort === 'team' ? 'team' : 'stadium',
			favorites: Array.isArray(value.favorites) ? value.favorites.filter((id): id is string => typeof id === 'string') : []
		};
	} catch {
		return { ...DEFAULTS };
	}
}

/** Saves preferences; returns false when storage is unavailable so the deck can say favorites will not persist. */
export function saveStadiumPreferences(preferences: StadiumPreferences, target: PreferenceStorage | null = storage()): boolean {
	if (!target) return false;
	try {
		target.setItem(STADIUM_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
		return true;
	} catch {
		return false;
	}
}

/** Favorites first, then the rest; each group by stadium name, or by club name with stadium name breaking ties. */
export function orderStadiums<T extends { name: string; franchiseId: string; ref: { id: string } }>(
	stadiums: readonly T[],
	sort: StadiumSort,
	favorites: ReadonlySet<string>,
	franchiseName: (id: string) => string
): T[] {
	const byName = (a: T, b: T) => a.name.localeCompare(b.name);
	const compare = sort === 'team'
		? (a: T, b: T) => franchiseName(a.franchiseId).localeCompare(franchiseName(b.franchiseId)) || byName(a, b)
		: byName;
	return [...stadiums].sort((a, b) =>
		Number(favorites.has(b.ref.id)) - Number(favorites.has(a.ref.id)) || compare(a, b) || a.ref.id.localeCompare(b.ref.id));
}
