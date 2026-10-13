//! Calibration drafters, ported from `scripts/verification-data.ts`: `random` and `best` fill the
//! first open slot the roll can (at random, or by the best-looking line), `vorp` takes the highest
//! runs above replacement on the table, and `packs` also adds packs while that pick sits below a
//! quantile of its slot.
use super::rules::{Draft, Pool, Rules, SLOTS};
use engine::random::{random_stream, Mulberry32};
use engine::types::Profile;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Policy { Random, Best, Vorp, Packs }

impl Policy {
    pub fn parse(name: &str) -> Result<Self, String> {
        match name {
            "random" => Ok(Self::Random), "best" => Ok(Self::Best), "vorp" => Ok(Self::Vorp), "packs" => Ok(Self::Packs),
            _ => Err(format!("Unknown policy {name}; use random, best, vorp or packs")),
        }
    }
    pub fn name(self) -> &'static str {
        match self { Self::Random => "random", Self::Best => "best", Self::Vorp => "vorp", Self::Packs => "packs" }
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

/// Per priced slot, every card value ascending, for the `packs` threshold.
pub fn slot_values(pool: &Pool) -> Vec<Vec<f64>> {
    let mut values = vec![Vec::new(); SLOTS.len()];
    for card in &pool.cards { values[card.priced].push(card.value); }
    for list in &mut values { list.sort_by(f64::total_cmp); }
    values
}

/// Drafts one complete roster; returns (slot, card, from a jackpot) in pick order.
pub fn draft(pool: &Pool, profiles: &[&Profile], rules: &Rules, policy: Policy, seed: u32, add_below: f64, slot_values: &[Vec<f64>]) -> Vec<(usize, usize, bool)> {
    let mut draft = Draft::new(seed, rules);
    let mut random: Mulberry32 = random_stream(seed, "verification-policy");
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
        let card = if policy == Policy::Random {
            choices[(random.next() * choices.len() as f64) as usize]
        } else {
            let hitter = slot < 9;
            choices.sort_by(|&a, &b| {
                let (left, right) = (line_value(profiles[a], hitter), line_value(profiles[b], hitter));
                (if hitter { right.total_cmp(&left) } else { left.total_cmp(&right) }).then(a.cmp(&b))
            });
            choices[0]
        };
        draft.commit(pool, card, slot);
    }
    draft.picks
}
