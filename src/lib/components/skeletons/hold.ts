/** A load that finishes sooner than this never shows its skeleton. */
export const SKELETON_DELAY = 120;
/** Once shown, a skeleton stays at least this long so it never flashes. */
export const SKELETON_HOLD = 360;

let visibleSince: number | null = null;
let visible = 0;

/** Records a skeleton coming on screen; the returned function records it leaving. */
export function skeletonShown(): () => void {
	visible++;
	visibleSince ??= performance.now();
	let released = false;
	return () => {
		if (released) return;
		released = true;
		if (--visible === 0) visibleSince = null;
	};
}

/** Resolves once any skeleton on screen has been visible for the minimum hold; at once when none is. */
export function skeletonSettled(): Promise<void> {
	if (visibleSince === null) return Promise.resolve();
	const wait = visibleSince + SKELETON_HOLD - performance.now();
	return wait > 0 ? new Promise(resolve => setTimeout(resolve, wait)) : Promise.resolve();
}
