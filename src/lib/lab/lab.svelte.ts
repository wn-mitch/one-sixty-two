import {
	dialOf, dialsOf, eraPreset, filmNames, finishInUse, finishNames, optionsOf, paletteNames,
	plateNames, spread, START, valueOf, withValue, type ChoiceKey, type Setup, type Target
} from './controls.ts';
import {
	decodeLink, encodeLink, labUrl, linkObject, saveLabLink,
	type LinkState, type SaveLabLinkOptions, type SavedLabLink, type Stagger
} from './link.ts';

export { MAX_STAGGER, ZOOMS } from './link.ts';

/** One card the stage shows: the setup it draws and, when staggered, the value that sets it apart. */
export interface Variant {
	setup: Setup;
	value?: string | number;
	label?: string;
}

/** The lab's state: one setup, the control being staggered across cards, and the stage's zoom. */
export class Lab {
	setup = $state<Setup>(structuredClone(START));
	/** The control spread across the stage, how many cards it spreads over, and which page of a choice's options shows. */
	stagger = $state<Stagger | null>(null);
	zoom = $state(1);

	value(target: Target): string | number {
		return valueOf(target, this.setup);
	}

	set(target: Target, value: string | number): void {
		this.setup = withValue(this.setup, target, value);
	}

	/** Returns one module's dials to shipped. */
	resetModule(kind: 'film' | 'finish' | 'plate'): void {
		const name = kind === 'film' ? this.setup.film : kind === 'finish' ? finishInUse(this.setup) : this.setup.plate;
		const tuned = { ...this.setup.tuned };
		delete tuned[`${kind}:${name}`];
		this.setup = { ...this.setup, tuned };
	}

	useEra(): void {
		this.setup = eraPreset(this.setup, this.setup.era);
	}

	toggleStagger(target: Target): void {
		this.stagger = this.stagger?.target === target ? null : { target, count: this.stagger?.count ?? 5, page: 0 };
	}

	/** The cards on stage: the setup alone, or one card per staggered value. */
	get variants(): Variant[] {
		const stagger = this.stagger;
		if (!stagger) return [{ setup: this.setup }];
		const dial = dialOf(stagger.target, this.setup);
		if (dial) return spread(dial, stagger.count).map(value => ({ setup: withValue(this.setup, stagger.target, value), value, label: String(value) }));
		const options = optionsOf(stagger.target as ChoiceKey);
		const current = options.findIndex(option => option.value === this.value(stagger.target));
		const count = Math.min(stagger.count, options.length);
		return Array.from({ length: count }, (_, index) => {
			const option = options[(((current + stagger.page * count + index) % options.length) + options.length) % options.length]!;
			return { setup: withValue(this.setup, stagger.target, option.value), value: option.value, label: option.label };
		});
	}

	/** Picks a random film, finish, colourway, under film and plate and throws half their dials somewhere in range. */
	randomize(): void {
		const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]!;
		let setup: Setup = {
			...this.setup,
			film: pick(filmNames),
			finish: Math.random() < 0.5 ? '' : pick(finishNames),
			palette: Math.random() < 0.4 ? '' : pick(paletteNames),
			under: Math.random() < 0.6 ? '' : pick(['none', ...filmNames]),
			plate: pick(plateNames),
			tuned: {}
		};
		for (const kind of ['film', 'finish', 'plate'] as const) {
			const name = kind === 'film' ? setup.film : kind === 'finish' ? finishInUse(setup) : setup.plate;
			for (const [dial, range] of Object.entries(dialsOf(kind, name))) {
				// Half the dials stay as shipped, so the result still reads as the module it came from.
				if (dial === 'scale' || Math.random() < 0.5) continue;
				setup = withValue(setup, `${kind}:${dial}`, pick(spread(range, 9)));
			}
		}
		this.setup = setup;
	}

	reset(): void {
		this.setup = structuredClone(START);
		this.stagger = null;
	}

	/** Everything a link carries. */
	get state(): LinkState {
		return { setup: $state.snapshot(this.setup), stagger: $state.snapshot(this.stagger), zoom: this.zoom };
	}

	/** The state as a link fragment. */
	save(): string {
		return encodeLink(this.state);
	}

	/** Builds the full hash link used when short-link storage is unavailable. */
	url(origin: string, pathname = '/lab'): string {
		return labUrl(this.state, origin, pathname);
	}

	/** Stores the current semantic state, retaining the full-link fallback on failures. */
	saveLink(options: SaveLabLinkOptions): Promise<SavedLabLink> {
		return saveLabLink(this.state, options);
	}

	/** The state as the plain object a saved short link stores. */
	saved(): Record<string, unknown> {
		return linkObject(this.state);
	}

	/** Loads a link fragment, from this lab or the standalone toy; false when it is not one. */
	restore(hash: string): boolean {
		const state = decodeLink(hash);
		if (state) this.load(state);
		return state !== null;
	}

	load(state: LinkState): void {
		this.setup = state.setup;
		this.stagger = state.stagger;
		this.zoom = state.zoom;
	}
}
