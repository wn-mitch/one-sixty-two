import { compareId } from '../game/types.ts';
import { randomStream, shuffle } from '../game/random.ts';

/**
 * Each franchise's credible rivals, the shortlist a player's guaranteed rival is drawn from.
 * Franchises without a convincing rivalry have none rather than an invented one. Provisional
 * curation; the catalog owns the final list.
 */
export const RIVALS: Readonly<Record<string, readonly string[]>> = Object.freeze({
 ANA: ['LAD'], ARI: ['LAD'], ATL: ['PHI', 'NYM'], BAL: ['WSN', 'NYY'], BOS: ['NYY'],
 CHC: ['STL', 'CHW', 'MIL'], CHW: ['CHC'], CIN: ['PIT', 'CLE'], CLE: ['DET', 'CIN'], COL: [],
 DET: ['CLE'], FLA: ['TBD'], HOU: ['TEX'], KCR: ['STL'], LAD: ['SFG', 'NYY'],
 MIL: ['CHC'], MIN: ['CHW'], NYM: ['NYY'], NYY: ['BOS', 'NYM'], OAK: ['SFG'],
 PHI: ['NYM', 'ATL'], PIT: ['CIN', 'PHI'], SDP: ['LAD'], SEA: [], SFG: ['LAD'],
 STL: ['CHC'], TBD: ['FLA'], TEX: ['HOU'], TOR: [], WSN: ['BAL']
});

export interface TableSeating {
 /** Franchise id at each seat. */
 seats: string[];
 humanSeat: number;
 rival: string | null;
}

/**
 * Seats the player's franchise, its guaranteed rival and six random other franchises. A Mets
 * player always gets the Yankees. Seat order is seeded, so the player's seat varies by run.
 */
export function seatTable(seed: number, franchiseId: string, franchiseIds: readonly string[], seats: number): TableSeating {
 const known = [...new Set(franchiseIds)].sort(compareId);
 if (!known.includes(franchiseId)) throw new Error(`Unknown franchise ${franchiseId}`);
 if (known.length < seats) throw new Error(`A table needs ${seats} franchises; the data has ${known.length}`);
 const random = randomStream(seed, 'draft:table');
 const shortlist = (RIVALS[franchiseId] ?? []).filter(id => known.includes(id));
 const rival = franchiseId === 'NYM' && known.includes('NYY') ? 'NYY' : shortlist.length ? shortlist[Math.floor(random() * shortlist.length)] : null;
 const chosen = [franchiseId, ...(rival ? [rival] : [])];
 const others = shuffle(known.filter(id => !chosen.includes(id)), random).slice(0, seats - chosen.length);
 const order = shuffle([...chosen, ...others], random);
 return { seats: order, humanSeat: order.indexOf(franchiseId), rival };
}
