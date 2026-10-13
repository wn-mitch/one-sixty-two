//! Classic draft rules, ported from `src/lib/game/draft.ts` and `draft-analysis.ts` for native
//! calibration: seeded franchise and jackpot rolls, extra packs, and joint player/franchise legality.
//! Rolls follow the same seeded streams as the app; calibration needs the rules, not byte parity.
use engine::random::{random_stream, shuffle, Mulberry32};
use std::collections::{HashMap, HashSet};

pub const SLOTS: [&str; 16] = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "SP1", "SP2", "SP3", "CL", "RP1", "RP2", "RP3"];
pub const ALL_OPEN: u16 = u16::MAX;

/// Jackpot and extra-pack allowances; the defaults mirror `src/lib/game/rules.ts`.
#[derive(Clone, Copy, Debug)]
pub struct Rules { pub extra_packs: u32, pub guaranteed: usize, pub chance: f64, pub size: usize }
impl Default for Rules { fn default() -> Self { Self { extra_packs: 2, guaranteed: 2, chance: 0.2, size: 5 } } }

/// One draftable season. Index order is season-id order, so sorting indexes sorts by identity.
pub struct Card {
    pub season_id: String,
    pub player: u32,
    pub franchise: u32,
    pub decade: i32,
    /// Bit `i` set when the season may fill `SLOTS[i]`.
    pub slots: u16,
    pub value: f64,
    pub priced: usize,
    pub elite: bool,
}

pub struct Pool { pub cards: Vec<Card> }

#[derive(Clone, Debug, PartialEq)]
pub enum Roll { Team { franchise: u32, decade: i32 }, Jackpot(Vec<usize>) }

impl Roll {
    pub fn contains(&self, pool: &Pool, card: usize) -> bool {
        match self {
            Roll::Team { franchise, decade } => pool.cards[card].franchise == *franchise && pool.cards[card].decade == *decade,
            Roll::Jackpot(cards) => cards.contains(&card),
        }
    }
}

/// The legal pool after the current picks: unused seasons for open slots, and cached viability.
struct Analysis { unused: Vec<usize>, plentiful: bool, viability: HashMap<(u32, u32, usize), bool> }

pub struct Draft {
    /// (slot, card, from a jackpot) in pick order.
    pub picks: Vec<(usize, usize, bool)>,
    pub open: u16,
    pub packs: Vec<Roll>,
    pub current: Option<Roll>,
    extras_used: u32,
    used_players: HashSet<u32>,
    used_franchises: u64,
    guaranteed: Vec<usize>,
    random: Mulberry32,
    analysis: Option<Analysis>,
}

fn open_slots(open: u16) -> Vec<usize> { (0..SLOTS.len()).filter(|slot| open & (1 << slot) != 0).collect() }

/// Each open slot has `n` franchises with `n` distinct players apiece: a sufficient completion proof.
fn plentiful(pool: &Pool, cards: &[usize], slots: &[usize]) -> bool {
    let n = slots.len();
    slots.iter().all(|&slot| {
        let mut by_franchise: HashMap<u32, HashSet<u32>> = HashMap::new();
        for &card in cards {
            let item = &pool.cards[card];
            if item.slots & (1 << slot) == 0 { continue; }
            let players = by_franchise.entry(item.franchise).or_default();
            if players.len() < n { players.insert(item.player); }
        }
        by_franchise.values().filter(|players| players.len() >= n).count() >= n
    })
}

/// Exact search for distinct players and franchises filling every slot.
fn can_finish(pool: &Pool, cards: &[usize], slots: &[usize]) -> bool {
    if slots.is_empty() || plentiful(pool, cards, slots) { return true; }
    let mut pairs: HashMap<usize, Vec<(u32, u32)>> = slots.iter().map(|&slot| (slot, Vec::new())).collect();
    for &card in cards {
        let item = &pool.cards[card];
        for &slot in slots {
            if item.slots & (1 << slot) != 0 { pairs.get_mut(&slot).unwrap().push((item.franchise, item.player)); }
        }
    }
    for list in pairs.values_mut() { list.sort_unstable(); list.dedup(); }
    fn search(remaining: &[usize], pairs: &HashMap<usize, Vec<(u32, u32)>>, players: &mut Vec<u32>, franchises: &mut u64, failed: &mut HashSet<(Vec<usize>, Vec<u32>, u64)>) -> bool {
        if remaining.is_empty() { return true; }
        let mut sorted = players.clone();
        sorted.sort_unstable();
        let key = (remaining.to_vec(), sorted, *franchises);
        if failed.contains(&key) { return false; }
        let free = |slot: usize, players: &Vec<u32>, franchises: u64| -> Vec<(u32, u32)> {
            pairs[&slot].iter().copied().filter(|(franchise, player)| franchises & (1 << franchise) == 0 && !players.contains(player)).collect()
        };
        let mut chosen = remaining[0];
        let mut options = free(chosen, players, *franchises);
        for &slot in &remaining[1..] {
            let available = free(slot, players, *franchises);
            if available.len() < options.len() { chosen = slot; options = available; }
        }
        let next: Vec<usize> = remaining.iter().copied().filter(|&slot| slot != chosen).collect();
        for (franchise, player) in options {
            players.push(player);
            *franchises |= 1 << franchise;
            let possible = next.iter().all(|&slot| pairs[&slot].iter().any(|(f, p)| *franchises & (1 << f) == 0 && !players.contains(p)));
            if possible && search(&next, pairs, players, franchises, failed) { return true; }
            players.pop();
            *franchises &= !(1 << franchise);
        }
        failed.insert(key);
        false
    }
    search(slots, &pairs, &mut Vec::new(), &mut 0, &mut HashSet::new())
}

impl Draft {
    pub fn new(seed: u32, rules: &Rules) -> Self {
        let mut order: Vec<usize> = (0..SLOTS.len()).collect();
        shuffle(&mut order, &mut random_stream(seed, "jackpot"));
        Self {
            picks: Vec::new(), open: ALL_OPEN, packs: Vec::new(), current: None, extras_used: 0,
            used_players: HashSet::new(), used_franchises: 0,
            guaranteed: order[..rules.guaranteed.min(SLOTS.len())].to_vec(),
            random: random_stream(seed, "draft"), analysis: None,
        }
    }

    pub fn extras_left(&self, rules: &Rules) -> u32 { rules.extra_packs - self.extras_used }

    fn analysis(&mut self, pool: &Pool) -> &mut Analysis {
        if self.analysis.is_none() {
            let open = self.open;
            let unused: Vec<usize> = (0..pool.cards.len()).filter(|&card| {
                let item = &pool.cards[card];
                item.slots & open != 0 && !self.used_players.contains(&item.player) && self.used_franchises & (1 << item.franchise) == 0
            }).collect();
            let plentiful = plentiful(pool, &unused, &open_slots(open));
            self.analysis = Some(Analysis { unused, plentiful, viability: HashMap::new() });
        }
        self.analysis.as_mut().unwrap()
    }

    /// Open slots, in roster order, the card can fill while leaving the rest of the roster completable.
    pub fn legal_slots(&mut self, pool: &Pool, card: usize) -> Vec<usize> {
        let open = self.open;
        let analysis = self.analysis(pool);
        let item = &pool.cards[card];
        open_slots(open).into_iter().filter(|&slot| {
            if item.slots & (1 << slot) == 0 { return false; }
            if analysis.plentiful { return true; }
            *analysis.viability.entry((item.player, item.franchise, slot)).or_insert_with(|| {
                let rest: Vec<usize> = analysis.unused.iter().copied().filter(|&other| pool.cards[other].player != item.player && pool.cards[other].franchise != item.franchise).collect();
                can_finish(pool, &rest, &open_slots(open & !(1 << slot)))
            })
        }).collect()
    }

    /// Unused seasons with a legal slot, optionally only those the roll deals.
    pub fn available(&mut self, pool: &Pool, roll: Option<&Roll>) -> Vec<usize> {
        let unused = self.analysis(pool).unused.clone();
        unused.into_iter().filter(|&card| roll.is_none_or(|roll| roll.contains(pool, card)) && !self.legal_slots(pool, card).is_empty()).collect()
    }

    fn next_roll(&mut self, pool: &Pool, rules: &Rules, forced: bool) -> Roll {
        let legal = self.available(pool, None);
        let lucky = self.random.next() < rules.chance;
        if forced || lucky {
            let dealt: HashSet<usize> = self.packs.iter().flat_map(|roll| match roll { Roll::Jackpot(cards) => cards.clone(), _ => Vec::new() }).collect();
            let mut elite: Vec<usize> = legal.iter().copied().filter(|card| pool.cards[*card].elite && !dealt.contains(card)).collect();
            shuffle(&mut elite, &mut self.random);
            let mut players = HashSet::new();
            let mut cards: Vec<usize> = elite.into_iter().filter(|card| players.insert(pool.cards[*card].player)).take(rules.size).collect();
            if !cards.is_empty() { cards.sort_unstable(); return Roll::Jackpot(cards); }
        }
        let teams: Vec<(u32, i32)> = self.packs.iter().filter_map(|roll| match roll { Roll::Team { franchise, decade } => Some((*franchise, *decade)), _ => None }).collect();
        let new_franchises: Vec<usize> = legal.iter().copied().filter(|card| !teams.iter().any(|(f, _)| *f == pool.cards[*card].franchise)).collect();
        let new_decades: Vec<usize> = legal.iter().copied().filter(|card| !teams.contains(&(pool.cards[*card].franchise, pool.cards[*card].decade))).collect();
        let candidates = if !new_franchises.is_empty() { new_franchises } else if !new_decades.is_empty() { new_decades } else { legal };
        let mut franchises: Vec<u32> = candidates.iter().map(|card| pool.cards[*card].franchise).collect();
        franchises.sort_unstable();
        franchises.dedup();
        let franchise = franchises[(self.random.next() * franchises.len() as f64) as usize];
        let mut decades: Vec<i32> = candidates.iter().filter(|card| pool.cards[**card].franchise == franchise).map(|card| pool.cards[*card].decade).collect();
        decades.sort_unstable();
        decades.dedup();
        Roll::Team { franchise, decade: decades[(self.random.next() * decades.len() as f64) as usize] }
    }

    pub fn roll(&mut self, pool: &Pool, rules: &Rules) {
        let forced = self.guaranteed.contains(&self.picks.len());
        let roll = self.next_roll(pool, rules, forced);
        self.packs = vec![roll.clone()];
        self.current = Some(roll);
    }

    pub fn add_pack(&mut self, pool: &Pool, rules: &Rules) {
        assert!(self.extras_left(rules) > 0, "no extra packs left");
        let roll = self.next_roll(pool, rules, false);
        self.packs.push(roll);
        self.current = None;
        self.extras_used += 1;
    }

    pub fn choose_pack(&mut self, pack: usize) {
        let chosen = self.packs[pack].clone();
        self.packs = vec![chosen.clone()];
        self.current = Some(chosen);
    }

    pub fn commit(&mut self, pool: &Pool, card: usize, slot: usize) {
        let roll = self.current.take().expect("roll before picking");
        assert!(roll.contains(pool, card) && self.legal_slots(pool, card).contains(&slot), "illegal pick");
        let item = &pool.cards[card];
        self.picks.push((slot, card, matches!(roll, Roll::Jackpot(_))));
        self.used_players.insert(item.player);
        self.used_franchises |= 1 << item.franchise;
        self.open &= !(1 << slot);
        self.packs.clear();
        self.analysis = None;
    }
}
