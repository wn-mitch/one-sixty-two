import { error } from '@sveltejs/kit';

/** Development-only capture page for `static/og.png` (see `npm run og:capture`). */
export const ssr = false;
export function load(): void {
	if (!import.meta.env.DEV) error(404, 'Not found');
}
