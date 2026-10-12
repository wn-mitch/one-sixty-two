import { describe, expect, it } from 'vitest';
import { smartBattingOrder, smartReliefRoles, smartRotation } from './smart-lineup.ts';
import type { BullpenSlot, Profile, Rates, ReliefAssignment } from './types.ts';

/** Per-PA rates from walks, singles, doubles and home runs; the rest are outs. */
function rates(bb: number, single: number, double: number, hr: number, so = .2): Rates {
	return [bb, 0, so, single, double, 0, hr, 1 - bb - so - single - double - hr];
}

const hitter = (id: string, battingRates?: Rates) => ({ seasonId: id, battingRates }) as Profile;
const pitcher = (id: string, pitchingRates?: Rates) => ({ seasonId: id, pitchingRates }) as Profile;

describe('smartBattingOrder', () => {
	it('puts the best three bats at 1, 2 and 4, leading off on-base and batting power fourth', () => {
		const profiles = new Map([
			// The patient best bat leads off over a stronger slugger; the slugger bats cleanup.
			hitter('patient', rates(.16, .18, .05, .02)),
			hitter('slugger', rates(.08, .12, .06, .08)),
			hitter('contact', rates(.06, .22, .05, .03)),
			hitter('fourth', rates(.08, .15, .05, .03)),
			hitter('fifth', rates(.08, .15, .04, .03)),
			hitter('sixth', rates(.07, .14, .04, .02)),
			hitter('seventh', rates(.06, .14, .04, .02)),
			hitter('eighth', rates(.06, .13, .03, .02)),
			hitter('ninth', rates(.05, .12, .03, .01))
		].map(profile => [profile.seasonId, profile]));
		const order = [...profiles.keys()].reverse();
		expect(smartBattingOrder(order, profiles)).toEqual(['patient', 'contact', 'fifth', 'slugger', 'fourth', 'sixth', 'seventh', 'eighth', 'ninth']);
	});

	it('keeps hitters without rates last, in their current order', () => {
		const profiles = new Map([hitter('a'), hitter('b', rates(.1, .15, .05, .03)), hitter('c')].map(profile => [profile.seasonId, profile]));
		expect(smartBattingOrder(['a', 'b', 'c'], profiles)).toEqual(['b', 'a', 'c']);
	});
});

describe('smartRotation', () => {
	it('puts the starter allowing the fewest runs first', () => {
		const profiles = new Map([
			pitcher('wild', rates(.12, .15, .04, .03, .2)),
			pitcher('ace', rates(.05, .15, .04, .02, .3)),
			pitcher('middle', rates(.07, .15, .04, .03, .22))
		].map(profile => [profile.seasonId, profile]));
		expect(smartRotation(['wild', 'middle', 'ace'], profiles)).toEqual(['ace', 'middle', 'wild']);
	});
});

describe('smartReliefRoles', () => {
	it('hands the role template to the best arms first, whatever their slot', () => {
		const assignments: ReliefAssignment[] = (['CL', 'RP1', 'RP2', 'RP3'] as const).map(slot => ({ slot, primary: 'middle', secondary: null }));
		const profiles = new Map<BullpenSlot, Profile>([
			['CL', pitcher('cl', rates(.1, .15, .04, .03, .2))],
			['RP1', pitcher('rp1', rates(.07, .15, .04, .03, .22))],
			['RP2', pitcher('rp2', rates(.05, .14, .04, .02, .32))],
			['RP3', pitcher('rp3', rates(.06, .15, .04, .02, .25))]
		]);
		expect(smartReliefRoles(assignments, profiles).map(({ slot, primary, secondary }) => [slot, primary, secondary])).toEqual([
			['CL', 'middle', 'long'],
			['RP1', 'setup', 'middle'],
			['RP2', 'closer', 'setup'],
			['RP3', 'setup', 'stopper']
		]);
	});
});
