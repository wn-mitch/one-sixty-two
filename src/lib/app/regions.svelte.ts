import { createSubscriber } from 'svelte/reactivity';

/**
 * Reserved regions the iOS app reports for its web view (`ios/Sources/ReservedRegionBridge.swift`): the
 * iPhone Duo fold (`division`) and camera and status cutouts (`occlusion`), in CSS pixels of the viewport. The website
 * and devices without reserved regions report none.
 */
export interface HostRegion {
	kind: 'division' | 'occlusion';
	active: boolean;
	x: number;
	y: number;
	width: number;
	height: number;
	/** Top, right, bottom, left: the part of the frame kept clear only for interactive content. */
	margins: [number, number, number, number];
}

export interface HostRegions {
	width: number;
	height: number;
	regions: HostRegion[];
}

/** A fold running top to bottom; `start` and `end` bound the band, margins included, that content avoids. */
export interface VerticalFold {
	start: number;
	end: number;
	/** True while the device is partly folded; a fully open device keeps the fold as a layout boundary. */
	active: boolean;
}

export const HOST_REGIONS_EVENT = '162-host-regions';

/** Narrowest pane either side of the fold that still holds a usable layout. */
export const MIN_FOLD_PANE = 320;

declare global {
	interface Window {
		__hostRegions?: HostRegions | null;
	}
}

/** The fold that splits the viewport into a left and right pane, or null when there is none worth splitting at. */
export function verticalFold(host: HostRegions | null | undefined, minPane = MIN_FOLD_PANE): VerticalFold | null {
	if (!host) return null;
	for (const region of host.regions) {
		if (region.kind !== 'division' || region.height < host.height || region.width >= region.height) continue;
		const start = Math.max(0, region.x);
		const end = Math.min(host.width, region.x + region.width);
		if (start < minPane || host.width - end < minPane) continue;
		return { start, end, active: region.active };
	}
	return null;
}

/** An active occlusion against the viewport's left or right edge, such as the iPhone Duo outer display's
 * time and Wi-Fi block; the host runs the web view under that edge's status column. */
export interface EdgeOcclusion {
	side: 'left' | 'right';
	x: number;
	y: number;
	width: number;
	height: number;
	/** True when the occlusion also meets the top edge, so the page's top bars keep clear of it. */
	top: boolean;
}

/** Tolerance for frames reported in fractional points. */
const EDGE_SLOP = 0.5;

export function edgeOcclusions(host: HostRegions | null | undefined): EdgeOcclusion[] {
	if (!host) return [];
	return host.regions.flatMap(region => {
		if (region.kind !== 'occlusion' || !region.active || region.height >= host.height - EDGE_SLOP) return [];
		const left = region.x <= EDGE_SLOP;
		const right = region.x + region.width >= host.width - EDGE_SLOP;
		if (left === right) return [];
		const { x, y, width, height } = region;
		return [{ side: left ? 'left' : 'right', x, y, width, height, top: y <= EDGE_SLOP }];
	});
}

const subscribe = createSubscriber(update => {
	window.addEventListener(HOST_REGIONS_EVENT, update);
	return () => window.removeEventListener(HOST_REGIONS_EVENT, update);
});

/** The current vertical fold, re-read whenever the host reports new regions. */
export const hostFold = {
	get current(): VerticalFold | null {
		if (typeof window === 'undefined') return null;
		subscribe();
		return verticalFold(window.__hostRegions);
	}
};

/** The current edge occlusions, re-read whenever the host reports new regions. */
export const hostEdgeOcclusions = {
	get current(): EdgeOcclusion[] {
		if (typeof window === 'undefined') return [];
		subscribe();
		return edgeOcclusions(window.__hostRegions);
	}
};
