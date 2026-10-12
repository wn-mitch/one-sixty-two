//! A Classic roster as search state: sixteen slot picks, a home stadium, and both orders.
use super::data::{Dataset, HITTERS, MODEL_VERSION, RULES_VERSION, SLOTS, STARTERS};
use engine::random::Mulberry32;
use engine::types::{ParkRef, RosterPick, SeasonRequest};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Roster {
    /// Candidate index per slot, in `SLOTS` order.
    pub picks: [usize; 16],
    pub stadium: usize,
    /// Hitter slot index at each batting-order spot.
    pub batting: [usize; HITTERS],
    /// Starter slot index (9..12) at each rotation spot.
    pub rotation: [usize; 3],
}

/// The roster by stable ids, for reports and checkpoints.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RosterIds {
    pub picks: Vec<SlotPick>,
    pub home_stadium: String,
    pub batting_order: Vec<String>,
    pub starter_order: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotPick { pub slot: String, pub season_id: String, pub display_name: String, pub franchise_id: String }

impl Roster {
    /// Sixteen distinct franchises and players, each eligible at its slot, with valid orders.
    pub fn legal(&self, data: &Dataset) -> bool {
        for (slot, &candidate) in self.picks.iter().enumerate() {
            if data.candidates[candidate].value[slot].is_none() { return false; }
            for &other in &self.picks[..slot] {
                if data.franchise(other) == data.franchise(candidate) || data.player(other) == data.player(candidate) { return false; }
            }
        }
        let mut batting = self.batting;
        batting.sort_unstable();
        let mut rotation = self.rotation;
        rotation.sort_unstable();
        batting == [0, 1, 2, 3, 4, 5, 6, 7, 8] && rotation == [9, 10, 11] && self.stadium < data.engine.data.stadiums.len()
    }

    pub fn request(&self, data: &Dataset, seed: u32) -> SeasonRequest {
        let stadium = &data.engine.data.stadiums[self.stadium];
        SeasonRequest {
            model_version: MODEL_VERSION.into(), rules_version: RULES_VERSION.into(), seed,
            home_stadium: ParkRef { id: stadium.id.clone(), version: stadium.version.clone() },
            roster: self.picks.iter().enumerate().map(|(slot, &candidate)| RosterPick { profile: data.candidates[candidate].profile.clone(), slot: SLOTS[slot].into() }).collect(),
            batting_order: self.batting.iter().map(|&slot| data.season_id(self.picks[slot]).to_string()).collect(),
            starter_order: self.rotation.iter().map(|&slot| data.season_id(self.picks[slot]).to_string()).collect(),
            // The search keeps the default roles by bullpen slot.
            relief_roles: engine::relief::default_assignments(1 + SLOTS.len() - 13),
        }
    }

    pub fn ids(&self, data: &Dataset) -> RosterIds {
        RosterIds {
            picks: self.picks.iter().enumerate().map(|(slot, &candidate)| {
                let profile = &data.candidates[candidate].profile;
                SlotPick { slot: SLOTS[slot].into(), season_id: profile.season_id.clone(), display_name: profile.display_name.clone(), franchise_id: profile.franchise_id.clone() }
            }).collect(),
            home_stadium: data.engine.data.stadiums[self.stadium].id.clone(),
            batting_order: self.batting.iter().map(|&slot| SLOTS[slot].to_string()).collect(),
            starter_order: self.rotation.iter().map(|&slot| SLOTS[slot].to_string()).collect(),
        }
    }

    pub fn from_ids(ids: &RosterIds, data: &Dataset) -> Result<Self, String> {
        let slot_of = |name: &str| SLOTS.iter().position(|slot| *slot == name).ok_or_else(|| format!("Unknown slot {name}"));
        let mut picks = [usize::MAX; 16];
        for pick in &ids.picks {
            let slot = slot_of(&pick.slot)?;
            picks[slot] = data.candidates.iter().position(|candidate| candidate.profile.season_id == pick.season_id).ok_or_else(|| format!("{} is not in this dataset", pick.season_id))?;
        }
        if picks.contains(&usize::MAX) { return Err("Roster is missing a slot".into()); }
        let order = |names: &[String]| names.iter().map(|name| slot_of(name)).collect::<Result<Vec<_>, _>>();
        let batting: [usize; HITTERS] = order(&ids.batting_order)?.try_into().map_err(|_| "Invalid batting order")?;
        let rotation: [usize; 3] = order(&ids.starter_order)?.try_into().map_err(|_| "Invalid starter order")?;
        let stadium = data.engine.data.stadiums.iter().position(|stadium| stadium.id == ids.home_stadium).ok_or("Unknown home stadium")?;
        let roster = Self { picks, stadium, batting, rotation };
        if !roster.legal(data) { return Err("Roster is not legal in this dataset".into()); }
        Ok(roster)
    }

    /// Linear value of the sixteen picks at their slots.
    pub fn linear_value(&self, data: &Dataset) -> f64 {
        self.picks.iter().enumerate().fold(0.0, |sum, (slot, &candidate)| sum + data.candidates[candidate].value[slot].unwrap_or(f64::NEG_INFINITY))
    }
}

/// Maximum-weight assignment of 16 slots to distinct franchises (Hungarian method on costs).
fn assign(weights: &[Vec<f64>]) -> Vec<usize> {
    let rows = weights.len();
    let cols = weights[0].len();
    let cost = |row: usize, col: usize| -weights[row][col];
    let (mut u, mut v) = (vec![0.0; rows + 1], vec![0.0; cols + 1]);
    let (mut matched, mut way) = (vec![0usize; cols + 1], vec![0usize; cols + 1]);
    for row in 1..=rows {
        matched[0] = row;
        let mut col0 = 0;
        let mut min = vec![f64::INFINITY; cols + 1];
        let mut used = vec![false; cols + 1];
        loop {
            used[col0] = true;
            let row0 = matched[col0];
            let mut delta = f64::INFINITY;
            let mut col1 = 0;
            for col in 1..=cols {
                if used[col] { continue; }
                let current = cost(row0 - 1, col - 1) - u[row0] - v[col];
                if current < min[col] { min[col] = current; way[col] = col0; }
                if min[col] < delta { delta = min[col]; col1 = col; }
            }
            for col in 0..=cols {
                if used[col] { u[matched[col]] += delta; v[col] -= delta; } else { min[col] -= delta; }
            }
            col0 = col1;
            if matched[col0] == 0 { break; }
        }
        loop {
            let col1 = way[col0];
            matched[col0] = matched[col1];
            col0 = col1;
            if col0 == 0 { break; }
        }
    }
    let mut result = vec![0; rows];
    for col in 1..=cols { if matched[col] != 0 { result[matched[col] - 1] = col - 1; } }
    result
}

/// The best linear roster: a slot-by-franchise assignment, then repair of any repeated player.
pub fn linear_start(data: &Dataset, stadium: usize) -> Result<Roster, String> {
    let mut franchises: Vec<&str> = data.candidates.iter().map(|candidate| candidate.profile.franchise_id.as_str()).collect();
    franchises.sort_unstable();
    franchises.dedup();
    let best = |slot: usize, franchise: &str, taken: &[&str]| data.ranked[slot].iter().copied()
        .find(|&candidate| data.franchise(candidate) == franchise && !taken.contains(&data.player(candidate)));
    const MISSING: f64 = -1e9;
    let weights: Vec<Vec<f64>> = (0..SLOTS.len()).map(|slot| franchises.iter().map(|franchise| {
        best(slot, franchise, &[]).map_or(MISSING, |candidate| data.candidates[candidate].value[slot].unwrap())
    }).collect()).collect();
    let columns = assign(&weights);
    let mut picks = [0usize; 16];
    let mut players: Vec<&str> = Vec::new();
    // Highest-value slots claim a shared player first; the rest take their franchise's next best.
    let mut order: Vec<usize> = (0..SLOTS.len()).collect();
    order.sort_by(|a, b| weights[*b][columns[*b]].total_cmp(&weights[*a][columns[*a]]));
    for slot in order {
        let candidate = best(slot, franchises[columns[slot]], &players).ok_or_else(|| format!("No legal {} for {}", SLOTS[slot], franchises[columns[slot]]))?;
        players.push(data.player(candidate));
        picks[slot] = candidate;
    }
    let mut batting: [usize; HITTERS] = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    let obp = |slot: usize| data.candidates[picks[slot]].profile.batting_rates.map_or(0.0, |rates| rates[0] + rates[1] + rates[3] + rates[4] + rates[5] + rates[6]);
    batting.sort_by(|a, b| obp(*b).total_cmp(&obp(*a)));
    let mut rotation = [STARTERS.start, STARTERS.start + 1, STARTERS.start + 2];
    rotation.sort_by(|a, b| data.candidates[picks[*b]].value[*b].unwrap().total_cmp(&data.candidates[picks[*a]].value[*a].unwrap()));
    let roster = Roster { picks, stadium, batting, rotation };
    if !roster.legal(data) { return Err("Linear start is not legal".into()); }
    Ok(roster)
}

/// One random neighbor, or `None` when the drawn move has no legal form.
pub fn neighbor(roster: &Roster, data: &Dataset, pool: usize, random: &mut Mulberry32) -> Option<Roster> {
    let mut next = roster.clone();
    let draw = |random: &mut Mulberry32, n: usize| ((random.next() * n as f64) as usize).min(n - 1);
    match draw(random, 100) {
        // Replace one pick from its slot's top pool; a franchise or player clash evicts the holder,
        // whose slot then takes its best free candidate.
        0..=59 => {
            let slot = draw(random, SLOTS.len());
            let ranked = &data.ranked[slot];
            let candidate = ranked[draw(random, pool.min(ranked.len()))];
            if candidate == roster.picks[slot] { return None; }
            next.picks[slot] = candidate;
            let clash = (0..SLOTS.len()).find(|&other| other != slot && (data.franchise(next.picks[other]) == data.franchise(candidate) || data.player(next.picks[other]) == data.player(candidate)));
            if let Some(other) = clash {
                let free = data.ranked[other].iter().copied().find(|&option| {
                    (0..SLOTS.len()).all(|held| held == other || (data.franchise(next.picks[held]) != data.franchise(option) && data.player(next.picks[held]) != data.player(option)))
                })?;
                next.picks[other] = free;
            }
        }
        60..=69 => next.stadium = draw(random, data.engine.data.stadiums.len()),
        70..=79 => {
            // Two fielders trade positions; both must be eligible at the other's slot.
            let (a, b) = (draw(random, HITTERS), draw(random, HITTERS));
            if a == b { return None; }
            next.picks.swap(a, b);
            for spot in next.batting.iter_mut() { if *spot == a { *spot = b } else if *spot == b { *spot = a } }
        }
        80..=91 => { let (a, b) = (draw(random, HITTERS), draw(random, HITTERS)); if a == b { return None; } next.batting.swap(a, b); }
        _ => { let (a, b) = (draw(random, 3), draw(random, 3)); if a == b { return None; } next.rotation.swap(a, b); }
    }
    (next != *roster && next.legal(data)).then_some(next)
}
