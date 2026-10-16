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
    /// Save bookkeeping by pitcher index, from the first batter each one faced.
    entries: Vec<Option<Entry>>,
}

/// The game state a pitcher took over: his club's lead and the runners on base when he faced his
/// first batter, and whether the lead was later tied or lost while he pitched.
#[derive(Clone, Copy, Debug)]
struct Entry { lead: i32, runners: u32, lost: bool }

impl Entry {
    /// The tying run is on base, at bat or on deck.
    fn tying_run_near(self) -> bool { self.lead <= self.runners as i32 + 2 }
    /// MLB's save situations at entry: a lead of three or fewer, or the tying run within reach.
    fn save_situation(self) -> bool { self.lead > 0 && (self.lead <= 3 || self.tying_run_near()) }
}

impl Workload {
    pub fn new(team: &TeamInput) -> Result<Self, String> {
        if team.available.len() != team.pitchers.len() || team.rested.len() != team.pitchers.len() || team.roles.len() != team.pitchers.len() {
            return Err("Pitcher availability and roles must cover the staff".into());
        }
        Ok(Self { current: team.starter_index, starter_done: false, used: vec![false; team.pitchers.len()], budget: starter_budget(team.pitchers[team.starter_index])?, inning: 1, entered: None, entries: vec![None; team.pitchers.len()] })
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

    /// Prefer Long for early exits or a margin of 4+, otherwise Middle. Exhaust named arms
    /// before the remainder, keeping a primary closer last in the emergency order.
    fn relieve(&mut self, team: &TeamInput, lead: i32) {
        let long = self.inning < LATE_INNING || lead <= -4 || lead >= 4;
        if long && self.call(team, ReliefRole::Long, false) { return; }
        if self.call(team, ReliefRole::Middle, false) { return; }
        let eligible = |index: usize| self.ready(team, index) && team.roles[index].is_some();
        let pick = team.named_relief()
            .find(|&index| eligible(index) && team.roles[index].unwrap().primary != ReliefRole::Closer)
            .or_else(|| team.named_relief().find(|&index| eligible(index)));
        if let Some(index) = pick {
            self.used[index] = true;
            self.current = index;
            self.entered = team.roles[index].map(|roles| roles.primary);
            return;
        }
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

    /// The current pitcher faces a batter with this lead and this many runners on: his first
    /// batter fixes his entry state.
    pub fn note_batter(&mut self, lead: i32, runners: u32) {
        let entry = self.entries[self.current].get_or_insert(Entry { lead, runners, lost: false });
        if entry.lead > 0 && lead <= 0 { entry.lost = true; }
    }

    /// The score after a play: a lead the current pitcher took over and no longer holds is lost.
    pub fn note_score(&mut self, lead: i32) {
        if let Some(entry) = self.entries[self.current].as_mut() {
            if entry.lead > 0 && lead <= 0 { entry.lost = true; }
        }
    }

    /// Credits saves, blown saves and save opportunities once the game is over. A reliever who
    /// entered in a save situation and let the lead go is charged a blown save. The pitcher who
    /// finished a win earns the save when he took over a lead he never gave up, recorded an out, and
    /// either entered with the tying run within reach, entered with a lead of three or fewer and
    /// pitched an inning, or pitched three innings; holding a lead he inherited means he is not the
    /// winning pitcher. Starters earn neither.
    pub fn credit_saves(&self, team: &TeamInput, lines: &mut [PitcherLine], won: bool) {
        for (index, entry) in self.entries.iter().enumerate() {
            let Some(entry) = *entry else { continue };
            if index == team.starter_index { continue; }
            let line = &mut lines[index];
            let blown = entry.save_situation() && entry.lost;
            let outs = line.outs;
            let save = won && index == self.current && entry.lead > 0 && !entry.lost && outs >= 1
                && (entry.tying_run_near() || (entry.lead <= 3 && outs >= 3) || outs >= 9);
            line.blown_saves += blown as i32;
            line.saves += save as i32;
            line.save_opportunities += (blown || save) as i32;
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
        // A narrow deficit goes to Middle, which can stay for a second efficient inning.
        assert_eq!(relief_innings(&team, &[(6, -1), (7, -1), (8, -1), (9, -1)], 3, 3), [4, 4, 3, 3]);
        // After laborious innings, remaining named arms precede the generic pool.
        assert_eq!(relief_innings(&team, &[(6, -1), (7, -1), (8, -1)], 3, 5), [4, 3, 2]);
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
        assert_eq!(relief_innings(&team, &[(6, -1), (7, -1), (8, -1)], 3, 5), [4, 2, 3]);
        // The tired RP2 still takes its primary Setup inning.
        assert_eq!(relief_innings(&team, &[(7, 1)], 3, 3), [3]);
        team.available[2] = false;
        assert_eq!(relief_innings(&team, &[(8, 1)], 3, 3), [3]);
        // With both setup men out, the 8th falls to the closer's secondary Setup role.
        team.available[3] = false;
        assert_eq!(relief_innings(&team, &[(8, 1)], 3, 3), [1]);
    }

    #[test]
    fn long_only_arm_covers_large_leads_and_deficits_for_three_innings() {
        let staff = staff();
        let mut team = team(&staff);
        team.roles[2] = Some(Roles { primary: Long, secondary: None });
        for lead in [-4, 4] {
            assert_eq!(relief_innings(&team, &[(6, lead), (7, lead), (8, lead), (9, lead)], 3, 5), [2, 2, 2, 4]);
        }
    }

    #[test]
    fn fallback_uses_available_named_arms_once_and_closer_last() {
        let staff = staff();
        let mut team = team(&staff);
        team.roles[2] = Some(Roles { primary: Long, secondary: None });
        team.available[3] = false;
        // Middle first; unused Long then covers three innings, even in a close game.
        // The unavailable setup arm is skipped and no pitcher re-enters.
        assert_eq!(relief_innings(&team, &[(6, -1), (7, -1), (8, -1), (9, -1), (10, -1), (11, -1)], 3, 5), [4, 2, 2, 2, 1, 5]);
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

    /// Plays one outing: `index` takes over at `lead` with `runners` on, records `outs`, and the
    /// lead moves through `leads` after his plays.
    fn outing(workload: &mut Workload, lines: &mut [PitcherLine], index: usize, (lead, runners): (i32, u32), outs: i32, leads: &[i32]) {
        workload.current = index;
        workload.note_batter(lead, runners);
        for &lead in leads { workload.note_score(lead); workload.note_batter(lead, 0); }
        lines[index].outs += outs;
    }

    /// Pitcher index, entry (lead, runners), outs recorded, leads after his plays.
    type Outing<'a> = (usize, (i32, u32), i32, &'a [i32]);

    fn credited(lines: &[PitcherLine]) -> Vec<(i32, i32, i32)> {
        lines.iter().map(|line| (line.saves, line.blown_saves, line.save_opportunities)).collect()
    }

    #[test]
    fn saves_follow_the_mlb_rule() {
        let staff = staff();
        let team = team(&staff);
        let run = |outings: &[Outing], won: bool| {
            let mut workload = Workload::new(&team).unwrap();
            let mut lines = create_box(&team).pitching;
            for &(index, entry, outs, leads) in outings { outing(&mut workload, &mut lines, index, entry, outs, leads); }
            workload.credit_saves(&team, &mut lines, won);
            credited(&lines)
        };
        let none = (0, 0, 0);
        // A three-run lead held for an inning is a save; the starter who left with it is not credited.
        assert_eq!(run(&[(0, (0, 0), 24, &[3]), (1, (3, 0), 3, &[])], true), [none, (1, 0, 1), none, none, none, none]);
        // A four-run lead with the bases empty is no save situation, so a clean inning earns nothing.
        assert_eq!(run(&[(0, (0, 0), 24, &[4]), (1, (4, 0), 3, &[])], true), [none; 6]);
        // Four up with two on puts the tying run on deck: one out to end the game is a save.
        assert_eq!(run(&[(0, (0, 0), 26, &[4]), (1, (4, 2), 1, &[])], true), [none, (1, 0, 1), none, none, none, none]);
        // A one-run lead held for only two outs is not a save unless the tying run was near: here it was at bat.
        assert_eq!(run(&[(0, (0, 0), 25, &[1]), (1, (1, 0), 2, &[])], true), [none, (1, 0, 1), none, none, none, none]);
        // The setup man ties the game: a blown save. The closer who wins it back finishes with a lead he never lost: a save.
        assert_eq!(run(&[(0, (0, 0), 21, &[2]), (2, (2, 1), 3, &[0, 1]), (1, (1, 0), 3, &[])], true), [none, (1, 0, 1), (0, 1, 1), none, none, none]);
        // A lead lost in a game the club still loses is a blown save and no save.
        assert_eq!(run(&[(0, (0, 0), 24, &[1]), (1, (1, 0), 3, &[-1])], false), [none, (0, 1, 1), none, none, none, none]);
        // Three innings to close a big lead is a save; a reliever who does not finish is not credited.
        assert_eq!(run(&[(0, (0, 0), 18, &[8]), (3, (8, 0), 9, &[])], true), [none, none, none, (1, 0, 1), none, none]);
        assert_eq!(run(&[(0, (0, 0), 18, &[2]), (3, (2, 0), 6, &[]), (1, (2, 0), 3, &[])], true), [none, (1, 0, 1), none, none, none, none]);
    }
}
