import { MediaQuery } from 'svelte/reactivity';
import { hostFold } from '../../app/regions.svelte.ts';

/** The draft board's two-column layout query; DraftBoard and its skeletons switch on the same condition. */
export const BOARD_WIDE_QUERY = '(min-width: 1100px), (min-width: 1024px) and (orientation: landscape)';

const wideQuery = new MediaQuery(BOARD_WIDE_QUERY);

/** Two columns on wide screens, and on either side of an iPhone Duo fold reported by the iOS app. */
export const boardWide = {
	get current(): boolean {
		return wideQuery.current || !!hostFold.current;
	}
};
