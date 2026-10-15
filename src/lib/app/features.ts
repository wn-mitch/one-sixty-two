/**
 * Draft Mode is unfinished and stays out of the public game. Development servers and builds made with
 * `VITE_DRAFT_MODE=on` always include it; elsewhere a developer opts this device in by opening
 * `/draft?developer=on` (and out with `?developer=off`). Saved Draft Mode runs are kept either way.
 */
const DEVELOPER_KEY = '162-0:draft-mode-developer';

export const draftModeBuild = import.meta.env.DEV || import.meta.env.VITE_DRAFT_MODE === 'on';

export function draftModeEnabled(): boolean {
	if (draftModeBuild) return true;
	try { return localStorage.getItem(DEVELOPER_KEY) === 'on'; }
	catch { return false; }
}

/** Applies a `?developer=on|off` opt-in from the URL, then reports whether Draft Mode is available here. */
export function applyDraftModeOptIn(url: { searchParams: { get(name: string): string | null } }): boolean {
	const choice = url.searchParams.get('developer');
	try {
		if (choice === 'on') localStorage.setItem(DEVELOPER_KEY, 'on');
		else if (choice === 'off') localStorage.removeItem(DEVELOPER_KEY);
	} catch { /* storage blocked: the opt-in lasts for this visit only */ }
	return choice === 'on' || (choice !== 'off' && draftModeEnabled());
}
