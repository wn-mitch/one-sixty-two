//! Pitcher workload and closer availability (`src/lib/sim/workload.ts`).
use crate::math;
use crate::team::TeamInput;
use crate::types::{PitcherLine, Profile};

pub fn clamp(value: f64, low: f64, high: f64) -> f64 { math::max(low, math::min(high, value)) }

pub fn starter_budget(profile: &Profile) -> Result<u32, String> {
    let counts = profile.pitching.as_ref().filter(|counts| counts.gs > 0.0).ok_or("Starter requires positive starts")?;
    Ok(math::js_round(clamp(counts.ip_outs / counts.gs, 12.0, 24.0)) as u32)
}

pub fn closer_budget(profile: &Profile) -> Result<f64, String> {
    let counts = profile.pitching.as_ref().filter(|_| profile.team_games > 0.0).ok_or("Closer requires pitching workload")?;
    Ok((counts.ip_outs * 162.0 / profile.team_games).floor())
}

/// One game's pitching decisions for one club.
#[derive(Clone, Debug)]
pub struct Workload { pub current: usize, starter_done: bool, used: Vec<bool>, budget: u32 }

impl Workload {
    pub fn new(team: &TeamInput) -> Result<Self, String> {
        if team.available.len() != team.pitchers.len() { return Err("Pitcher availability must cover the staff".into()); }
        Ok(Self { current: team.starter_index, starter_done: false, used: vec![false; team.pitchers.len()], budget: starter_budget(team.pitchers[team.starter_index])? })
    }

    /// A named pitcher may enter once per game, and only when rested and under its season cap.
    fn ready(&self, team: &TeamInput, index: usize) -> bool { team.available[index] && !self.used[index] }

    fn take(&mut self, index: usize) -> usize { self.used[index] = true; index }

    /// The first rested middle reliever (RP3 onward), else the remainder arm.
    fn middle(&mut self, team: &TeamInput) -> usize {
        match team.relievers.iter().skip(2).copied().find(|&index| self.ready(team, index)) {
            Some(index) => self.take(index),
            None => team.bullpen_index,
        }
    }

    /// Chooses the pitcher for a half inning. The closer takes the 9th or later with a 0-3 run
    /// lead, even over a starter still going. Once the starter is done, RP1 takes the 8th and RP2
    /// the 7th with that lead; other innings go to middle relief, one inning per reliever.
    pub fn begin_half(&mut self, team: &TeamInput, lines: &[PitcherLine], inning: u32, lead: i32) {
        if lines[team.starter_index].r >= 6 || lines[team.starter_index].outs as u32 >= self.budget { self.starter_done = true; }
        let leverage = (0..=3).contains(&lead);
        if inning >= 9 && leverage && self.ready(team, team.closer_index) {
            self.current = self.take(team.closer_index);
            self.starter_done = true;
            return;
        }
        if !self.starter_done { self.current = team.starter_index; return; }
        let setup = match inning { 8 => team.relievers.first(), 7 => team.relievers.get(1), _ => None }.copied();
        self.current = match setup {
            Some(index) if leverage && self.ready(team, index) => self.take(index),
            _ => self.middle(team),
        };
    }

    /// A starter who reaches the out budget mid-inning hands the rest of the inning to middle relief.
    pub fn before_plate_appearance(&mut self, team: &TeamInput, lines: &[PitcherLine]) {
        if self.current == team.starter_index && lines[self.current].outs as u32 >= self.budget {
            self.starter_done = true;
            self.current = self.middle(team);
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct CloserUsage { pub outs: f64, last: i64, previous: i64 }

impl Default for CloserUsage { fn default() -> Self { Self { outs: 0.0, last: -1, previous: -1 } } }

impl CloserUsage {
    pub fn ready(&self, game: i64, cap: f64) -> bool { cap - self.outs >= 3.0 && !(self.last == game - 1 && self.previous == game - 2) }
    pub fn record(&mut self, game: i64, outs: i32, appeared: bool) {
        self.outs += f64::from(outs);
        if appeared { self.previous = self.last; self.last = game; }
    }
}

/// Season availability for a club's closer and named relievers: no third consecutive day, and a
/// season cap of each pitcher's own relief outs scaled to 162 games.
#[derive(Clone, Debug)]
pub struct ReliefUsage { pitchers: Vec<(usize, f64, CloserUsage)> }

impl ReliefUsage {
    pub fn new(team: &TeamInput) -> Result<Self, String> {
        let indices = std::iter::once(team.closer_index).chain(team.relievers.iter().copied());
        Ok(Self { pitchers: indices.map(|index| Ok((index, closer_budget(team.pitchers[index])?, CloserUsage::default()))).collect::<Result<_, String>>()? })
    }

    /// Marks who may enter `game`; the starters and the remainder arm are always available.
    pub fn prepare(&self, team: &mut TeamInput, game: i64) {
        team.available.iter_mut().for_each(|available| *available = true);
        for (index, cap, usage) in &self.pitchers { team.available[*index] = usage.ready(game, *cap); }
    }

    /// Records each named pitcher's outs and appearance from the club's game box.
    pub fn record(&mut self, game: i64, pitching: &[PitcherLine]) {
        for (index, _, usage) in self.pitchers.iter_mut() { usage.record(game, pitching[*index].outs, pitching[*index].appearances > 0); }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::team::create_box;

    fn pitcher(id: &str, gs: f64, ip_outs: f64) -> Profile {
        serde_json::from_value(serde_json::json!({
            "seasonId": id, "playerId": id, "displayName": id, "franchiseId": "TST", "year": 2000, "teamGames": 162.0,
            "bats": "R", "throws": "R", "eligibleSlots": [], "pitching": { "GS": gs, "IPouts": ip_outs },
            "defense": { "positions": {} }, "speed": 0.5, "stealAttempt": 0.0, "stealSuccess": 0.0, "doublePlay": 0.0
        })).unwrap()
    }

    /// Starter 0 (18-out budget), closer 1, RP1-RP3 at 2-4, remainder 5.
    fn staff() -> Vec<Profile> {
        let mut staff = vec![pitcher("starter", 30.0, 540.0), pitcher("closer", 0.0, 195.0)];
        staff.extend(["rp1", "rp2", "rp3"].map(|id| pitcher(id, 0.0, 120.0)));
        staff.push(pitcher("remainder", 0.0, 486.0));
        staff
    }

    fn team(staff: &[Profile]) -> TeamInput<'_> {
        TeamInput {
            id: "t".into(), name: "t".into(), hitters: Vec::new(), defense: [0; 8], pitchers: staff.iter().collect(),
            starter_index: 0, closer_index: 1, relievers: vec![2, 3, 4], bullpen_index: 5, available: vec![true; staff.len()],
        }
    }

    /// Plays `innings` from the 6th with the given lead, the starter already at the out budget.
    fn relief_innings(team: &TeamInput, innings: &[(u32, i32)]) -> Vec<usize> {
        let mut workload = Workload::new(team).unwrap();
        let mut lines = create_box(team).pitching;
        lines[0].outs = 18;
        innings.iter().map(|&(inning, lead)| { workload.begin_half(team, &lines, inning, lead); workload.current }).collect()
    }

    #[test]
    fn close_games_go_rp2_rp1_closer_and_other_innings_to_middle_relief() {
        let staff = staff();
        let team = team(&staff);
        assert_eq!(relief_innings(&team, &[(7, 2), (8, 2), (9, 2)]), [3, 2, 1]);
        // Outside a 0-3 lead the setup men sit: RP3 takes one inning, then the remainder.
        assert_eq!(relief_innings(&team, &[(7, 5), (8, -1), (9, 4)]), [4, 5, 5]);
        // Each named pitcher enters once a game: extra innings use RP3, then the remainder.
        assert_eq!(relief_innings(&team, &[(8, 1), (9, 0), (10, 0), (11, 3)]), [2, 1, 4, 5]);
    }

    #[test]
    fn a_resting_reliever_is_skipped_for_middle_relief() {
        let staff = staff();
        let mut team = team(&staff);
        team.available[2] = false;
        team.available[1] = false;
        assert_eq!(relief_innings(&team, &[(8, 1), (9, 1), (10, 1)]), [4, 5, 5]);
    }

    #[test]
    fn the_closer_takes_a_save_from_a_starter_still_going() {
        let staff = staff();
        let team = team(&staff);
        let mut workload = Workload::new(&team).unwrap();
        let lines = create_box(&team).pitching;
        workload.begin_half(&team, &lines, 8, 1);
        assert_eq!(workload.current, 0);
        workload.begin_half(&team, &lines, 9, 1);
        assert_eq!(workload.current, 1);
    }

    #[test]
    fn named_relievers_rest_after_two_straight_days_and_stop_at_their_cap() {
        let staff = staff();
        let mut team = team(&staff);
        let mut usage = ReliefUsage::new(&team).unwrap();
        let mut lines = create_box(&team).pitching;
        lines[2].outs = 3;
        lines[2].appearances = 1;
        for game in 1..=2 { usage.prepare(&mut team, game); assert!(team.available[2]); usage.record(game, &lines); }
        usage.prepare(&mut team, 3);
        assert!(!team.available[2] && team.available[3] && team.available[5]);
        usage.prepare(&mut team, 4);
        assert!(team.available[2]);
        // RP1's cap is the pitcher's own 120 relief outs over 162 games; 118 used leaves less than an inning.
        lines[2].outs = 112;
        usage.record(10, &lines);
        usage.prepare(&mut team, 20);
        assert!(!team.available[2]);
    }
}
