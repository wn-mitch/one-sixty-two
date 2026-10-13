import type { EntryGenerator } from './$types';

export const prerender = true;

// The welcome screen and the game share one page, so moving between them keeps the session alive.
export const entries: EntryGenerator = () => [{ mode: undefined }, { mode: 'classic' }];
