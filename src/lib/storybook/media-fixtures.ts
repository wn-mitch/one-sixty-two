import { mocked } from 'storybook/test';
import { loadMedia } from '#lib/media/client.ts';
import type { AtmospherePhoto, MediaAsset, MediaManifest, PlayerMedia, TeamMedia } from '#lib/media/types.ts';

export type MediaFixtureMode = 'ready' | 'missing' | 'loading' | 'unavailable' | 'brokenImage';

export interface MediaLoaderController {
	load: () => Promise<MediaManifest>;
	resolve: () => void;
	recover: () => void;
	dispose: () => void;
}
const FIXTURE_VERSION = 'f'.repeat(64);
const BROKEN_IMAGE_URL = 'data:image/svg+xml;base64,not-valid-base64!';
const rosterIds = Array.from({ length: 14 }, (_, index) => `roster-${index}`);
const candidateIds = Array.from({ length: 24 }, (_, index) => `candidate-${String(index + 1).padStart(2, '0')}`);
const playerIds = [...rosterIds, ...candidateIds];
const photoIds: Record<string, true> = Object.fromEntries([...rosterIds, ...candidateIds.slice(0, 8)].map(id => [id, true]));

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason: Error) => void;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (reason: Error) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

function exampleUrl(index: number, label: string): string {
	const hue = (index * 47 + 190) % 360;
	const accent = (hue + 84) % 360;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160" role="img" aria-label="${label}"><rect width="240" height="160" fill="hsl(${hue} 44% 21%)"/><path d="M20 128 92 28l48 66 36-44 44 78Z" fill="hsl(${accent} 68% 62%)"/><circle cx="178" cy="42" r="22" fill="hsl(${hue} 82% 74%)"/><path d="M26 140h188" stroke="white" stroke-opacity=".72" stroke-width="4"/></svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function asset(index: number, label: string): MediaAsset {
	const sourceId = `illustrative-geometry-${String(index).padStart(2, '0')}`;
	return {
		url: exampleUrl(index, label),
		width: 240,
		height: 160,
		sourceUrl: `https://example.invalid/storybook-media/${sourceId}`,
		license: 'CC0 1.0',
		licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
		credit: `Illustrative fixture geometry ${String(index).padStart(2, '0')}`
	};
}

function playerName(id: string): string {
	if (id.startsWith('roster-')) return `Illustrative roster example ${String(Number(id.slice(7)) + 1).padStart(2, '0')}`;
	return `Illustrative candidate example ${id.slice(-2)}`;
}

function players(withPhotos: boolean): Record<string, PlayerMedia> {
	let assetIndex = 3;
	return Object.fromEntries(playerIds.map(id => {
		const photo = withPhotos && photoIds[id] ? [{
			...asset(assetIndex++, playerName(id)),
			year: 2025
		}] : [];
		return [id, {
			name: playerName(id),
			firstYear: 1950,
			lastYear: 2025,
			photos: photo
		}];
	}));
}

function teams(withLogo: boolean): Record<string, TeamMedia> {
	return Object.fromEntries(Array.from({ length: 14 }, (_, index) => {
		const id = `F${index}`;
		return [id, {
			name: `Illustrative Club ${id}`,
			color: `#${((0x2d5c8a + index * 0x07130b) & 0xffffff).toString(16).padStart(6, '0')}`,
			logo: withLogo && id === 'F2' ? asset(1, 'Illustrative Club F2 geometric mark') : null,
			historical: []
		}];
	}));
}

/** A schema-2 fixture index: data images exercise the real selectors without network image requests. */
export function createExampleMedia(): MediaManifest {
	const allPlayers = players(true);
	const atmosphere: Record<string, AtmospherePhoto> = {
		'illustrative-f2-atmosphere': {
			...asset(2, 'Illustrative Club F2 atmosphere geometry'),
			id: 'illustrative-f2-atmosphere',
			caption: 'Illustrative fixture atmosphere, not a real venue',
			franchiseId: 'F2',
			year: 2025
		}
	};
	return {
		schemaVersion: 2,
		version: FIXTURE_VERSION,
		dataVersion: 'synthetic',
		modifications: 'Illustrative geometric fixture imagery only; not verified athlete photography or club artwork.',
		teams: teams(true),
		players: allPlayers,
		atmosphere,
		diagnostics: {
			playersSearched: playerIds.length,
			playersWithPhotos: Object.keys(photoIds).length,
			photos: Object.keys(photoIds).length,
			logos: 1,
			historicalLogos: 0,
			atmospherePhotos: 1,
			excluded: 0
		}
	};
}

function createMissingMedia(): MediaManifest {
	return {
		schemaVersion: 2,
		version: FIXTURE_VERSION,
		dataVersion: 'synthetic',
		modifications: 'Illustrative fixture index with no matching photos, marks, or atmosphere images.',
		teams: teams(false),
		players: players(false),
		atmosphere: {},
		diagnostics: {
			playersSearched: playerIds.length,
			playersWithPhotos: 0,
			photos: 0,
			logos: 0,
			historicalLogos: 0,
			atmospherePhotos: 0,
			excluded: 0
		}
	};
}

function createBrokenImageMedia(): MediaManifest {
	const media = createExampleMedia();
	const broken = <T extends MediaAsset>(value: T): T => ({ ...value, url: BROKEN_IMAGE_URL });
	return {
		...media,
		teams: Object.fromEntries(Object.entries(media.teams).map(([id, team]) => [id, {
			...team,
			logo: team.logo ? broken(team.logo) : null,
			historical: team.historical.map(broken)
		}])),
		players: Object.fromEntries(Object.entries(media.players).map(([id, player]) => [id, {
			...player,
			photos: player.photos.map(broken)
		}])),
		atmosphere: Object.fromEntries(Object.entries(media.atmosphere).map(([id, image]) => [id, broken(image)]))
	};
}

let activeController: MediaLoaderController | null = null;

/**
 * Installs the only Storybook media override. Calls from an older story become inert once a
 * newer controller takes ownership, so a prior loading control cannot resolve the next story.
 */
export function configureMediaLoader(initialMode: MediaFixtureMode): MediaLoaderController {
	activeController?.dispose();
	let mode = initialMode;
	let pending: Deferred<MediaManifest> | undefined;
	let disposed = false;
	let controller!: MediaLoaderController;

	const ownsLoader = (): boolean => !disposed && activeController === controller;
	const ready = (): MediaManifest => mode === 'missing' ? createMissingMedia()
		: mode === 'brokenImage' ? createBrokenImageMedia() : createExampleMedia();
	const load = (): Promise<MediaManifest> => {
		if (!ownsLoader()) return Promise.reject(new Error('Story media loader is no longer active'));
		if (mode === 'unavailable') return Promise.reject(new Error('Example image sources unavailable'));
		if (mode === 'loading') {
			pending ??= deferred<MediaManifest>();
			return pending.promise;
		}
		return Promise.resolve(ready());
	};
	const resolve = (): void => {
		if (!ownsLoader() || mode !== 'loading') return;
		mode = 'ready';
		pending?.resolve(createExampleMedia());
	};
	const recover = (): void => {
		if (ownsLoader() && mode === 'unavailable') mode = 'ready';
	};
	const dispose = (): void => {
		if (!ownsLoader()) return;
		disposed = true;
		activeController = null;
		pending?.reject(new Error('Story media loader was reset'));
		mocked(loadMedia).mockReset();
	};
	controller = { load, resolve, recover, dispose };

	activeController = controller;
	mocked(loadMedia).mockImplementation(load);
	return controller;
}
