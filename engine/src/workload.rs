//! Starter workload and in-game bullpen deployment by relief role.
use crate::math;
use crate::relief::ReliefRole;
use crate::team::TeamInput;
use crate::types::{PitcherLine, Profile};

pub fn clamp(value: f64, low: f64, high: f64) -> f64 { math::max(low, math::min(high, value)) }

pub fn starter_budget(profile: &Profile) -> Result<u32, String> {
    let counts = profile.pitching.as_ref().filter(|counts| counts.gs > 0.0).ok_or("Starter requires positive starts")?;
    Ok(math::js_round(clamp(counts.ip_outs / counts.gs, 12.0, 24.0)) as u32)
}

/// Setup and middle relief, and the stopper, work from this inning on.
const LATE_INNING: u32 = 6;
/// A middle reliever who has faced at most this many batters may stay for a second inning.
const EXTEND_BATTERS: i32 = 4;
/// A long reliever stays until this many outs.
const LONG_OUTS: i32 = 9;

/// One game's pitching decisions for one club.
#[derive(Clone, Debug)]
pub struct Workload {
    pub current: usize,
    starter_done: bool,
    used: Vec<bool>,
    budget: u32,
    inning: u32,
    /// The role the current reliever was called in for; None for the starter and the remainder arm.
    entered: Option<ReliefRole>,
}

impl Workload {
    pub fn new(team: &TeamInput) -> Result<Self, String> {
        if team.available.len() != team.pitchers.len() || team.rested.len() != team.pitchers.len() || team.roles.len() != team.pitchers.len() {
            return Err("Pitcher availability and roles must cover the staff".into());
        }
        Ok(Self { current: team.starter_index, starter_done: false, used: vec![false; team.pitchers.len()], budget: starter_budget(team.pitchers[team.starter_index])?, inning: 1, entered: None })
    }

    /// A named pitcher may enter once per game, and only when rested enough for today.
    fn ready(&self, team: &TeamInput, index: usize) -> bool { team.available[index] && !self.used[index] }

    /// Calls the first ready primary holder of `role` in bullpen order, then the first ready
    /// secondary holder who sat out the previous game. `seventh` skips the first primary holder,
    /// kept for the 8th, takes the others from the back of the bullpen, and passes over the closer.
    fn call(&mut self, team: &TeamInput, role: ReliefRole, seventh: bool) -> bool {
        let mut order: Vec<usize> = team.named_relief().filter(|&index| team.roles[index].is_some_and(|roles| roles.primary == role)).collect();
        if seventh { order = order.into_iter().skip(1).rev().collect(); }
        let primary = order.iter().copied().find(|&index| self.ready(team, index));
        // The 7th never borrows the closer, whose save chance may still come.
        let backup = |index: usize| team.roles[index].is_some_and(|roles| roles.secondary == Some(role) && !(seventh && roles.primary == ReliefRole::Closer));
        let pick = primary.or_else(|| team.named_relief().find(|&index| backup(index) && team.rested[index] && self.ready(team, index)));
        let Some(index) = pick else { return false };
        self.used[index] = true;
        self.current = index;
        self.entered = Some(role);
        true
    }

    /// Long relief for an early exit or a deficit of 4 or more, else middle relief, else the remainder.
    fn relieve(&mut self, team: &TeamInput, lead: i32) {
        let long = self.inning < LATE_INNING || lead <= -4;
        if long && self.call(team, ReliefRole::Long, false) { return; }
        if self.call(team, ReliefRole::Middle, false) { return; }
        self.current = team.bullpen_index;
        self.entered = None;
    }

    /// Whether the current reliever stays for another inning: a long reliever until nine outs, any
    /// other named reliever but the closer after an efficient first inning.
    fn extends(&self, lines: &[PitcherLine]) -> bool {
        let line = &lines[self.current];
        match self.entered {
            None | Some(ReliefRole::Closer) => false,
            Some(ReliefRole::Long) => line.outs < LONG_OUTS,
            Some(_) => line.outs <= 3 && line.bf <= EXTEND_BATTERS,
        }
    }

    /// Chooses the pitcher for a half inning. The closer takes the 9th or later with a 0-3 run
    /// lead, even over a starter still going. Once the starter is done, setup men take the 8th and
    /// 7th with that lead; otherwise the current reliever may stay, else fresh relief.
    pub fn begin_half(&mut self, team: &TeamInput, lines: &[PitcherLine], inning: u32, lead: i32) {
        self.inning = inning;
        if lines[team.starter_index].r >= 6 || lines[team.starter_index].outs as u32 >= self.budget { self.starter_done = true; }
        let leverage = (0..=3).contains(&lead);
        if inning >= 9 && leverage && self.call(team, ReliefRole::Closer, false) { self.starter_done = true; return; }
        if !self.starter_done { self.current = team.starter_index; return; }
        if leverage && (inning == 7 || inning == 8) && self.call(team, ReliefRole::Setup, inning == 7) { return; }
        if self.entered.is_some() && self.extends(lines) { return; }
        self.relieve(team, lead);
    }

    /// Before each plate appearance: a starter at the out budget hands over to relief, and from the
    /// 6th a stopper takes over with a runner in scoring position and a 0-3 run lead.
    pub fn before_plate_appearance(&mut self, team: &TeamInput, lines: &[PitcherLine], lead: i32, scoring_position: bool) {
        if self.current == team.starter_index && lines[self.current].outs as u32 >= self.budget {
            self.starter_done = true;
            self.relieve(team, lead);
        }
        let jam = self.inning >= LATE_INNING && scoring_position && (0..=3).contains(&lead);
        if jam && !matches!(self.entered, Some(ReliefRole::Closer | ReliefRole::Stopper)) && self.call(team, ReliefRole::Stopper, false) {
            self.starter_done = true;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::relief::{default_roles, ReliefRole::*, Roles};
    use crate::team::create_box;
    use crate::types::PitcherLine;

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

    /// Default roles: CL Closer/Setup, RP1 Setup/Stopper, RP2 Setup/Middle, RP3 Middle/Long.
    fn team(staff: &[Profile]) -> TeamInput<'_> {
        let mut roles = vec![None; staff.len()];
        for (offset, assigned) in default_roles(4).into_iter().enumerate() { roles[1 + offset] = Some(assigned); }
        TeamInput {
            id: "t".into(), name: "t".into(), hitters: Vec::new(), defense: [0; 8], pitchers: staff.iter().collect(),
            starter_index: 0, closer_index: 1, relievers: vec![2, 3, 4], bullpen_index: 5,
            available: vec![true; staff.len()], rested: vec![true; staff.len()], roles,
        }
    }

    /// Starts each listed half inning with the given lead, the starter already at the out budget;
    /// the pitcher of each half records `outs` after facing `bf` batters.
    fn relief_innings(team: &TeamInput, innings: &[(u32, i32)], outs: i32, bf: i32) -> Vec<usize> {
        let mut workload = Workload::new(team).unwrap();
        let mut lines: Vec<PitcherLine> = create_box(team).pitching;
        lines[0].outs = 18;
        innings.iter().map(|&(inning, lead)| {
            workload.begin_half(team, &lines, inning, lead);
            lines[workload.current].outs += outs;
            lines[workload.current].bf += bf;
            workload.current
        }).collect()
    }

    #[test]
    fn close_games_go_setup_to_closer_and_other_innings_to_middle_relief() {
        let staff = staff();
        let mut team = team(&staff);
        assert_eq!(relief_innings(&team, &[(7, 2), (8, 2), (9, 2)], 3, 3), [3, 2, 1]);
        // Outside a 0-3 lead: RP3 (Middle) goes two efficient innings, then RP2 (secondary Middle), then the remainder.
        assert_eq!(relief_innings(&team, &[(6, 5), (7, 5), (8, 5), (9, 5)], 3, 3), [4, 4, 3, 3]);
        // A laborious first inning ends the outing; the closer never stays for a second inning.
        assert_eq!(relief_innings(&team, &[(6, 5), (7, 5), (8, 5)], 3, 5), [4, 3, 5]);
        assert_eq!(relief_innings(&team, &[(9, 0), (10, 0)], 3, 3), [1, 4]);
        // With RP2 out the 7th goes to middle relief: RP1 is kept for the 8th and the closer for the 9th.
        team.available[3] = false;
        assert_eq!(relief_innings(&team, &[(7, 2), (8, 2), (9, 2)], 3, 3), [4, 2, 1]);
    }

    #[test]
    fn secondary_roles_call_only_arms_who_sat_out_the_previous_game() {
        let staff = staff();
        let mut team = team(&staff);
        team.rested[3] = false;
        assert_eq!(relief_innings(&team, &[(6, 5), (7, 5), (8, 5)], 3, 5), [4, 5, 5]);
        // The tired RP2 still takes its primary Setup inning.
        assert_eq!(relief_innings(&team, &[(7, 1)], 3, 3), [3]);
        team.available[2] = false;
        assert_eq!(relief_innings(&team, &[(8, 1)], 3, 3), [3]);
        // With both setup men out, the 8th falls to the closer's secondary Setup role.
        team.available[3] = false;
        assert_eq!(relief_innings(&team, &[(8, 1)], 3, 3), [1]);
    }

    #[test]
    fn long_relief_covers_an_early_exit_for_up_to_three_innings() {
        let staff = staff();
        let mut team = team(&staff);
        team.roles[4] = Some(Roles { primary: Long, secondary: None });
        let mut workload = Workload::new(&team).unwrap();
        let mut lines = create_box(&team).pitching;
        lines[0].r = 6;
        let mut pitched = Vec::new();
        for inning in 4..=8 {
            workload.begin_half(&team, &lines, inning, 6);
            lines[workload.current].outs += 3;
            pitched.push(workload.current);
        }
        // RP3 stays to nine outs; the 7th is middle relief, which falls to RP2's secondary role.
        assert_eq!(pitched, [4, 4, 4, 3, 3]);
    }

    #[test]
    fn the_stopper_takes_over_a_late_close_jam_even_from_the_starter() {
        let staff = staff();
        let team = team(&staff);
        let check = |inning: u32, lead: i32, scoring: bool| {
            let mut workload = Workload::new(&team).unwrap();
            let lines = create_box(&team).pitching;
            workload.begin_half(&team, &lines, inning, lead);
            workload.before_plate_appearance(&team, &lines, lead, scoring);
            workload.current
        };
        assert_eq!(check(6, 1, true), 2);
        assert_eq!([check(5, 1, true), check(6, 4, true), check(6, -1, true), check(6, 1, false)], [0; 4]);
        // The closer is never pulled for the stopper.
        assert_eq!(check(9, 1, true), 1);
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
}
