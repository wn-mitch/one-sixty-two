//! Calibration drafters, ported from `scripts/verification-data.ts`: `random` and `best` fill the
//! first open slot the roll can (at random, or by the best-looking line), `vorp` takes the highest
//! runs above replacement on the table, `packs` also adds packs while that pick sits below a
//! quantile of its slot, and `chalk` fills the first open slot with the list's top card by WAR/162.
//! Every draft also reports its scouting grade inputs (see `design/daily/README.md`).
use super::rules::{Draft, Pool, Roll, Rules, SLOTS};
use engine::random::{random_stream, Mulberry32};
use engine::types::Profile;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Policy { Random, Best, Vorp, Packs, Chalk }

impl Policy {
    pub fn parse(name: &str) -> Result<Self, String> {
        match name {
            "random" => Ok(Self::Random), "best" => Ok(Self::Best), "vorp" => Ok(Self::Vorp), "packs" => Ok(Self::Packs), "chalk" => Ok(Self::Chalk),
            _ => Err(format!("Unknown policy {name}; use random, best, vorp, packs or chalk")),
        }
    }
    pub fn name(self) -> &'static str {
        match self { Self::Random => "random", Self::Best => "best", Self::Vorp => "vorp", Self::Packs => "packs", Self::Chalk => "chalk" }
    }
}

/// Expected OBP + SLG for hitters; times on base allowed per PA for pitchers (lower is better).
fn line_value(profile: &Profile, hitter: bool) -> f64 {
    if hitter {
        let r = profile.batting_rates.expect("hitter without batting rates");
        let at_bat = 1.0 - r[0] - r[1];
        r[0] + r[1] + r[3] + r[4] + r[5] + r[6] + (r[3] + 2.0 * r[4] + 3.0 * r[5] + 4.0 * r[6]) / at_bat
    } else {
        let r = profile.pitching_rates.expect("pitcher without pitching rates");
        r[0] + r[1] + r[3] + r[4] + r[5] + r[6]
    }
}

/// The highest-valued legal placement in one pack, preferring the card's priced slot.
fn valued_pick(draft: &mut Draft, pool: &Pool, pack: usize) -> (usize, usize, f64) {
    let roll = draft.packs[pack].clone();
    let mut best: Option<(usize, usize, f64)> = None;
    for card in draft.available(pool, Some(&roll)) {
        let slots = draft.legal_slots(pool, card);
        let value = pool.cards[card].value;
        if best.is_some_and(|(_, _, top)| value <= top) { continue; }
        let priced = pool.cards[card].priced;
        best = Some((card, if slots.contains(&priced) { priced } else { slots[0] }, value));
    }
    best.expect("a legal pack has a selectable card")
}

/// The card the candidate list shows first for `slot` among every pack on the table: the highest
/// WAR/162 for the slot's role, unranked cards last, ties to the lower season id.
pub fn obvious(draft: &mut Draft, pool: &Pool, packs: &[Roll], slot: usize) -> usize {
    let role = usize::from(slot >= 9);
    let mut top: Option<usize> = None;
    for pack in packs {
        for card in draft.available(pool, Some(pack)) {
            if !draft.legal_slots(pool, card).contains(&slot) { continue; }
            let better = top.is_none_or(|top| match (pool.cards[card].war[role], pool.cards[top].war[role]) {
                (Some(war), Some(best)) => war > best || war == best && card < top,
                (Some(_), None) => true,
                (None, Some(_)) => false,
                (None, None) => card < top,
            });
            if better { top = Some(card); }
        }
    }
    top.expect("a filled slot had a legal card on the table")
}

/// Scouting grade inputs for one draft: picks that took the obvious card, and the summed
/// `valueRuns` gained (or lost) against it.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Scouting { pub chalk: u32, pub edge: f64 }

/// (slot, card, from a jackpot) for each pick, in pick order.
pub type Picks = Vec<(usize, usize, bool)>;

/// Per priced slot, every card value ascending, for the `packs` threshold.
pub fn slot_values(pool: &Pool) -> Vec<Vec<f64>> {
    let mut values = vec![Vec::new(); SLOTS.len()];
    for card in &pool.cards { values[card.priced].push(card.value); }
    for list in &mut values { list.sort_by(f64::total_cmp); }
    values
}

/// Drafts one complete roster; returns (slot, card, from a jackpot) in pick order and its scouting inputs.
pub fn draft(pool: &Pool, profiles: &[&Profile], rules: &Rules, policy: Policy, seed: u32, add_below: f64, slot_values: &[Vec<f64>]) -> (Picks, Scouting) {
    let mut draft = Draft::new(seed, rules);
    let mut random: Mulberry32 = random_stream(seed, "verification-policy");
    let mut scouting = Scouting::default();
    let mut scout = |draft: &mut Draft, packs: &[Roll], card: usize, slot: usize| {
        let top = obvious(draft, pool, packs, slot);
        scouting.chalk += u32::from(card == top);
        scouting.edge += pool.cards[card].value - pool.cards[top].value;
    };
    while draft.picks.len() < SLOTS.len() {
        draft.roll(pool, rules);
        if matches!(policy, Policy::Vorp | Policy::Packs) {
            let best = |draft: &mut Draft| (0..draft.packs.len()).map(|pack| (pack, valued_pick(draft, pool, pack)))
                .reduce(|left, right| if right.1 .2 > left.1 .2 { right } else { left }).unwrap();
            let mut top = best(&mut draft);
            while policy == Policy::Packs && draft.extras_left(rules) > 0 && {
                let sorted = &slot_values[top.1 .1];
                !sorted.is_empty() && top.1 .2 < sorted[((add_below * sorted.len() as f64) as usize).min(sorted.len() - 1)]
            } {
                draft.add_pack(pool, rules);
                top = best(&mut draft);
            }
            let offered = draft.packs.clone();
            scout(&mut draft, &offered, top.1 .0, top.1 .1);
            if draft.packs.len() > 1 { draft.choose_pack(top.0); }
            draft.commit(pool, top.1 .0, top.1 .1);
            continue;
        }
        let available = draft.available(pool, draft.current.clone().as_ref());
        let open = draft.open;
        let (slot, mut choices) = (0..SLOTS.len()).filter(|slot| open & (1 << slot) != 0).find_map(|slot| {
            let fits: Vec<usize> = available.iter().copied().filter(|&card| draft.legal_slots(pool, card).contains(&slot)).collect();
            (!fits.is_empty()).then_some((slot, fits))
        }).expect("a legal roll has a card for an open slot");
        let offered = draft.packs.clone();
        let card = if policy == Policy::Random {
            choices[(random.next() * choices.len() as f64) as usize]
        } else if policy == Policy::Chalk {
            obvious(&mut draft, pool, &offered, slot)
        } else {
            let hitter = slot < 9;
            choices.sort_by(|&a, &b| {
                let (left, right) = (line_value(profiles[a], hitter), line_value(profiles[b], hitter));
                (if hitter { right.total_cmp(&left) } else { left.total_cmp(&right) }).then(a.cmp(&b))
            });
            choices[0]
        };
        scout(&mut draft, &offered, card, slot);
        draft.commit(pool, card, slot);
    }
    (draft.picks, scouting)
}
