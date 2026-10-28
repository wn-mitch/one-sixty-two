//! Classic draft rules, ported from `src/lib/game/draft.ts` and `draft-analysis.ts` for native
//! calibration: seeded franchise and jackpot rolls, extra packs, and joint player/franchise legality.
//! Rolls follow the same seeded streams as the app; calibration needs the rules, not byte parity.
use engine::random::{random_stream, shuffle, Mulberry32};
use std::collections::{HashMap, HashSet};

pub const SLOTS: [&str; 16] = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "SP1", "SP2", "SP3", "CL", "RP1", "RP2", "RP3"];
pub const ALL_OPEN: u16 = u16::MAX;

/// Jackpot and extra-pack allowances; the defaults mirror `src/lib/game/rules.ts`.
#[derive(Clone, Copy, Debug)]
pub struct Rules { pub extra_packs: u32, pub guaranteed: usize, pub chance: f64, pub size: usize, pub shortlist: usize }
impl Default for Rules { fn default() -> Self { Self { extra_packs: 2, guaranteed: 2, chance: 0.2, size: 6, shortlist: 8 } } }

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
    /// Composite batting and pitching WAR/162, the candidate list's default order; `None` when unranked.
    pub war: [Option<f64>; 2],
}

/// Draftable seasons, with jackpot candidates pre-ranked by card value.
pub struct Pool { pub cards: Vec<Card>, pub jackpot: Vec<usize> }

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
    /// Franchise packs set aside for an added pack; later rolls skip them while anything else remains.
    passed: Vec<(u32, i32)>,
    extras_used: u32,
    used_players: HashSet<u32>,
    /// Players any jackpot in this draft has dealt; later jackpots skip them.
    shown: HashSet<u32>,
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
            picks: Vec::new(), open: ALL_OPEN, packs: Vec::new(), current: None, passed: Vec::new(), extras_used: 0,
            used_players: HashSet::new(), shown: HashSet::new(), used_franchises: 0,
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

    /// Deals one best season per player for every open slot, round-robin across seeded slot order.
    fn next_jackpot(&mut self, pool: &Pool, rules: &Rules) -> Option<Roll> {
        let slots = open_slots(self.open);
        let mut options: Vec<Vec<usize>> = (0..slots.len()).map(|_| Vec::new()).collect();
        let mut players: Vec<HashSet<u32>> = (0..slots.len()).map(|_| HashSet::new()).collect();

        // `Pool::jackpot` is pre-ranked by value, so the first card retained for a player is their
        // best legal season at that slot.
        for &card in &pool.jackpot {
            let item = &pool.cards[card];
            if self.used_players.contains(&item.player) || self.used_franchises & (1 << item.franchise) != 0 { continue; }
            for slot in self.legal_slots(pool, card) {
                if let Some(index) = slots.iter().position(|&open| open == slot) {
                    if players[index].insert(item.player) { options[index].push(card); }
                }
            }
        }

        let mut options: Vec<Vec<usize>> = options.into_iter().filter(|options| !options.is_empty()).collect();
        if options.is_empty() { return None; }
        shuffle(&mut options, &mut self.random);

        let mut cards = Vec::with_capacity(rules.size);
        while cards.len() < rules.size {
            let mut dealt = false;
            for slot_index in 0..options.len() {
                if cards.len() == rules.size { break; }
                let slot = &options[slot_index];
                let unseen = slot.iter().filter(|&&card| !self.shown.contains(&pool.cards[card].player)).take(rules.shortlist).count();
                let card = if unseen > 0 {
                    slot.iter().filter(|&&card| !self.shown.contains(&pool.cards[card].player)).nth((self.random.next() * unseen as f64) as usize).copied()
                } else {
                    let shortlist = &slot[..slot.len().min(rules.shortlist)];
                    (!shortlist.is_empty()).then(|| shortlist[(self.random.next() * shortlist.len() as f64) as usize])
                };
                let Some(card) = card else { continue };
                let player = pool.cards[card].player;
                cards.push(card);
                for slot in &mut options { slot.retain(|&other| pool.cards[other].player != player); }
                dealt = true;
            }
            if !dealt { break; }
        }
        if cards.is_empty() { return None; }
        cards.sort_unstable();
        self.shown.extend(cards.iter().map(|&card| pool.cards[card].player));
        Some(Roll::Jackpot(cards))
    }

    fn next_roll(&mut self, pool: &Pool, rules: &Rules, forced: bool) -> Roll {
        let all = self.available(pool, None);
        let lucky = self.random.next() < rules.chance;
        if forced || lucky {
            if let Some(jackpot) = self.next_jackpot(pool, rules) { return jackpot; }
        }
        let fresh: Vec<usize> = all.iter().copied().filter(|card| !self.passed.contains(&(pool.cards[*card].franchise, pool.cards[*card].decade))).collect();
        let legal = if fresh.is_empty() { all } else { fresh };
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
        for (index, roll) in self.packs.iter().enumerate() {
            if let (true, Roll::Team { franchise, decade }) = (index != pack, roll) { self.passed.push((*franchise, *decade)); }
        }
        self.packs = vec![chosen.clone()];
        self.current = Some(chosen);
    }

    pub fn commit(&mut self, pool: &Pool, card: usize, slot: usize) {
        let roll = self.current.take().expect("roll before picking");
        let item = &pool.cards[card];
        assert!(!self.used_players.contains(&item.player) && self.used_franchises & (1 << item.franchise) == 0 && roll.contains(pool, card) && self.legal_slots(pool, card).contains(&slot), "illegal pick");
        self.picks.push((slot, card, matches!(roll, Roll::Jackpot(_))));
        self.used_players.insert(item.player);
        self.used_franchises |= 1 << item.franchise;
        self.open &= !(1 << slot);
        self.packs.clear();
        self.analysis = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rules() -> Rules { Rules { extra_packs: 0, guaranteed: 16, chance: 1.0, size: 6, shortlist: 8 } }

    fn card(player: u32, franchise: u32, slots: u16, value: f64) -> Card {
        Card {
            season_id: format!("{player:02}:{franchise:02}"),
            player,
            franchise,
            decade: 2000,
            slots,
            value,
            priced: 0,
            war: [None, None],
        }
    }

    fn pool(cards: Vec<Card>) -> Pool {
        let mut jackpot: Vec<usize> = (0..cards.len()).collect();
        jackpot.sort_unstable_by(|&left, &right| cards[right].value.total_cmp(&cards[left].value).then_with(|| cards[left].season_id.cmp(&cards[right].season_id)));
        Pool { cards, jackpot }
    }

    fn jackpot(draft: &mut Draft, pool: &Pool, rules: &Rules) -> Vec<usize> {
        draft.roll(pool, rules);
        match draft.current.as_ref() {
            Some(Roll::Jackpot(cards)) => cards.clone(),
            roll => panic!("expected jackpot, got {roll:?}"),
        }
    }

    #[test]
    fn jackpot_deals_six_from_one_open_slot() {
        let pool = pool((0..8).map(|id| card(id, id, 1 << 1, 100.0 - id as f64)).collect());
        let mut draft = Draft::new(7, &rules());
        draft.open = 1 << 1;

        let cards = jackpot(&mut draft, &pool, &rules());

        assert_eq!(cards.len(), 6);
        assert!(cards.iter().all(|&card| pool.cards[card].slots == 1 << 1));
        assert_eq!(cards.iter().map(|&card| pool.cards[card].player).collect::<HashSet<_>>().len(), 6);
    }

    #[test]
    fn jackpot_balances_two_open_slots() {
        let cards = (0..8).map(|id| card(id, id, 1 << 1, 100.0 - id as f64))
            .chain((8..16).map(|id| card(id, id, 1 << 2, 100.0 - id as f64)))
            .collect();
        let pool = pool(cards);
        let mut draft = Draft::new(11, &rules());
        draft.open = (1 << 1) | (1 << 2);

        let cards = jackpot(&mut draft, &pool, &rules());

        assert_eq!(cards.len(), 6);
        assert_eq!(cards.iter().filter(|&&card| pool.cards[card].slots == 1 << 1).count(), 3);
        assert_eq!(cards.iter().filter(|&&card| pool.cards[card].slots == 1 << 2).count(), 3);
    }

    #[test]
    fn jackpot_reuses_shown_players_when_a_slot_has_no_unseen_supply() {
        let pool = pool((0..6).map(|id| card(id, id, (1 << 1) | (1 << 2), 100.0 - id as f64)).collect());
        let mut draft = Draft::new(19, &rules());
        draft.open = (1 << 1) | (1 << 2);

        let first = jackpot(&mut draft, &pool, &rules());
        let shown = draft.shown.clone();
        let picked = &pool.cards[first[0]];
        let (player, franchise) = (picked.player, picked.franchise);
        draft.commit(&pool, first[0], 1);
        let second = jackpot(&mut draft, &pool, &rules());

        assert_eq!(second.len(), 5);
        assert!(second.iter().all(|&card| shown.contains(&pool.cards[card].player)));
        assert!(second.iter().all(|&card| pool.cards[card].player != player && pool.cards[card].franchise != franchise));
    }

    #[test]
    fn jackpot_never_repeats_players_within_a_pack() {
        let mut cards = vec![card(0, 0, 1 << 1, 100.0), card(0, 1, 1 << 1, 99.0)];
        cards.extend((1..8).map(|id| card(id, id + 1, 1 << 1, 100.0 - id as f64)));
        let pool = pool(cards);
        let mut draft = Draft::new(23, &rules());
        draft.open = 1 << 1;

        let cards = jackpot(&mut draft, &pool, &rules());

        assert!(!cards.contains(&1), "only the best season for a player enters the shortlist");
        assert_eq!(cards.iter().map(|&card| pool.cards[card].player).collect::<HashSet<_>>().len(), cards.len());
    }
}
