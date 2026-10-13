import { MediaQuery } from 'svelte/reactivity';

/** The draft board's two-column layout query; DraftBoard and its skeletons switch on the same condition. */
export const BOARD_WIDE_QUERY = '(min-width: 1100px), (min-width: 1024px) and (orientation: landscape)';

export const boardWide = new MediaQuery(BOARD_WIDE_QUERY);
