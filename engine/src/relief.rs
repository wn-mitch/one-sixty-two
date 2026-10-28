//! Bullpen roles and season rest for named relievers.
use crate::team::TeamInput;
use crate::types::PitcherLine;
use serde::{Deserialize, Serialize};

/// A named reliever's job. The manager calls primary holders first, then rested secondary holders.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReliefRole {
    /// The 9th or later with a lead of 0-3 runs.
    Closer,
    /// The 8th (the first setup man in bullpen order), then the 7th, with a lead of 0-3 once the starter is done.
    Setup,
    /// Other relief innings; may stay a second inning after an efficient first.
    Middle,
    /// A starter gone before the 6th, or either club ahead by 4+; stays up to three innings.
    Long,
    /// Enters mid-inning from the 6th with a runner in scoring position and a lead of 0-3.
    Stopper,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Roles { pub primary: ReliefRole, pub secondary: Option<ReliefRole> }

/// One bullpen slot's roles in a season request.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoleAssignment { pub slot: String, pub primary: ReliefRole, pub secondary: Option<ReliefRole> }

impl RoleAssignment {
    pub fn roles(&self) -> Result<Roles, String> {
        if self.secondary == Some(self.primary) { return Err(format!("{}: secondary role repeats the primary role", self.slot)); }
        Ok(Roles { primary: self.primary, secondary: self.secondary })
    }
}

/// Default roles by bullpen position: the closer, then RP1 onward (`defaultReliefRoles` in TS).
pub fn default_roles(named: usize) -> Vec<Roles> {
    use ReliefRole::*;
    const DEFAULTS: [(ReliefRole, ReliefRole); 6] = [(Closer, Setup), (Setup, Stopper), (Setup, Middle), (Middle, Long), (Long, Middle), (Stopper, Middle)];
    DEFAULTS.iter().take(named).map(|&(primary, secondary)| Roles { primary, secondary: Some(secondary) }).collect()
}

/// Default assignments for CL and RP1 onward, as a season request carries them.
pub fn default_assignments(named: usize) -> Vec<RoleAssignment> {
    default_roles(named).into_iter().enumerate().map(|(index, roles)| RoleAssignment {
        slot: if index == 0 { "CL".into() } else { format!("RP{index}") }, primary: roles.primary, secondary: roles.secondary,
    }).collect()
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct Rest { last: i64, previous: i64, rest_through: i64, quick: bool, tireless: bool }

/// One pitcher's rest, carried across simulation calls by season id (league segments): a named
/// pitcher's recent outings, or the relief outs a starter owes his next start.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestState {
    pub season_id: String, pub last: i64, pub previous: i64, pub rest_through: i64,
    #[serde(default, skip_serializing_if = "is_zero")]
    pub owed_outs: i32,
}

fn is_zero(outs: &i32) -> bool { *outs == 0 }

impl Default for Rest { fn default() -> Self { Self { last: -1, previous: -1, rest_through: -1, quick: false, tireless: false } } }

impl Rest {
    /// A quick recoverer may pitch a third straight day; a tireless arm skips rest altogether.
    fn ready(&self, game: i64) -> bool { self.tireless || (game > self.rest_through && (self.quick || !(self.last == game - 1 && self.previous == game - 2))) }
    /// An outing past the free innings (one, or two for a quick recoverer) costs a game of rest plus one for
    /// each inning past them, so a two-inning outing rests two games and a three-inning one three.
    fn record(&mut self, game: i64, outs: i32, appeared: bool) {
        let free = if self.quick { 2 } else { 1 };
        let extra = (outs + 2) / 3 - free;
        if extra > 0 { self.rest_through = game + i64::from(extra + 1); }
        if appeared { self.previous = self.last; self.last = game; }
    }
}

/// Season availability for a club's named relievers: never a third consecutive day, and after an outing
/// longer than an inning, a game of rest for it plus one per inning beyond the first. There is no season ceiling.
/// A drafted rotation also has a spare: the next game's starter relieves once the named arms are spent,
/// and each relief out he throws comes off his next start.
#[derive(Clone, Debug)]
pub struct ReliefUsage { pitchers: Vec<(usize, Rest)>, spares: Option<Vec<i32>> }

impl ReliefUsage {
    pub fn new(team: &TeamInput) -> Self { Self::resume(team, &[]) }

    /// Usage that continues from carried rest; a pitcher without a carried state starts fresh.
    pub fn resume(team: &TeamInput, carried: &[RestState]) -> Self { Self::with_recovery(team, carried, &[]) }

    /// `resume`, with the named pitchers in `quick` (by season id) recovering quickly.
    pub fn with_recovery(team: &TeamInput, carried: &[RestState], quick: &[String]) -> Self {
        Self { pitchers: team.named_relief().map(|index| {
            let id = &team.pitchers[index].season_id;
            let mut rest = carried.iter().find(|state| &state.season_id == id)
                .map_or_else(Rest::default, |state| Rest { last: state.last, previous: state.previous, rest_through: state.rest_through, ..Rest::default() });
            rest.quick = quick.contains(id);
            (index, rest)
        }).collect(), spares: None }
    }

    /// Gives the club's rotation, pitchers 0 to `rotation - 1` in order, a spare, resuming the relief
    /// outs each starter owes from `carried`.
    pub fn with_spares(mut self, team: &TeamInput, rotation: usize, carried: &[RestState]) -> Self {
        self.spares = Some((0..rotation).map(|index| {
            carried.iter().find(|state| state.season_id == team.pitchers[index].season_id).map_or(0, |state| state.owed_outs)
        }).collect());
        self
    }

    /// The named pitchers in `tireless` (by season id) skip rest: always available, never tired for a backup role.
    /// Their outings still count toward rest carried past this call.
    pub fn with_tireless(mut self, team: &TeamInput, tireless: &[String]) -> Self {
        for (index, rest) in self.pitchers.iter_mut() { rest.tireless = tireless.contains(&team.pitchers[*index].season_id); }
        self
    }

    /// Each named pitcher's rest and each starter's owed relief outs, to carry into the next call.
    pub fn carry(&self, team: &TeamInput) -> Vec<RestState> {
        let named = self.pitchers.iter().map(|(index, rest)| RestState { season_id: team.pitchers[*index].season_id.clone(), last: rest.last, previous: rest.previous, rest_through: rest.rest_through, owed_outs: 0 });
        let owed = self.spares.iter().flatten().enumerate().filter(|(_, owed)| **owed > 0)
            .map(|(index, owed)| RestState { season_id: team.pitchers[index].season_id.clone(), last: -1, previous: -1, rest_through: -1, owed_outs: *owed });
        named.chain(owed).collect()
    }

    /// Marks who may enter `game` and who sat out the previous game; starters and the remainder arm
    /// are always available. With a spare, names the next game's starter as the spare and sets today's
    /// starter's budget short by the relief outs he owes; call after choosing `starter_index`.
    pub fn prepare(&mut self, team: &mut TeamInput, game: i64) {
        team.available.iter_mut().for_each(|available| *available = true);
        team.rested.iter_mut().for_each(|rested| *rested = true);
        for (index, rest) in &self.pitchers {
            team.available[*index] = rest.ready(game);
            team.rested[*index] = rest.tireless || rest.last != game - 1;
        }
        team.spare_index = None;
        team.starter_extra_outs = 0;
        if let Some(owed) = self.spares.as_mut() {
            team.starter_extra_outs = -std::mem::take(&mut owed[team.starter_index]);
            team.spare_index = Some((team.starter_index + 1) % owed.len());
        }
    }

    /// Records each named pitcher's outs and appearance, and the spare's relief outs, from the club's game box.
    pub fn record(&mut self, game: i64, team: &TeamInput, pitching: &[PitcherLine]) {
        for (index, rest) in self.pitchers.iter_mut() { rest.record(game, pitching[*index].outs, pitching[*index].appearances > 0); }
        if let (Some(owed), Some(spare)) = (self.spares.as_mut(), team.spare_index) { owed[spare] += pitching[spare].outs; }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_quick_recoverer_rests_one_game_less_and_may_pitch_a_third_straight_day() {
        let mut quick = Rest { quick: true, ..Rest::default() };
        quick.record(1, 3, true);
        quick.record(2, 3, true);
        assert!(quick.ready(3));
        let mut long = Rest { quick: true, ..Rest::default() };
        long.record(1, 6, true);
        assert!(long.ready(2));
        long.record(2, 9, true);
        assert!(!long.ready(3) && !long.ready(4) && long.ready(5));
    }

    #[test]
    fn a_tireless_arm_pitches_every_day_and_counts_as_rested() {
        let mut tireless = Rest { tireless: true, ..Rest::default() };
        for game in 1..=4 { assert!(tireless.ready(game)); tireless.record(game, 6, true); }
        assert_eq!(tireless.rest_through, 6);
    }

    #[test]
    fn rest_scales_with_innings_and_blocks_a_third_straight_day() {
        let mut rest = Rest::default();
        rest.record(1, 3, true);
        rest.record(2, 3, true);
        assert!(!rest.ready(3) && rest.ready(4));
        let mut long = Rest::default();
        // A long outing rests a game more than its extra innings, which keeps long men near a hundred innings.
        long.record(10, 7, true);
        assert!(!long.ready(11) && !long.ready(12) && !long.ready(13) && long.ready(14));
        let mut two = Rest::default();
        two.record(10, 4, true);
        assert!(!two.ready(11) && !two.ready(12) && two.ready(13));
        let mut one = Rest::default();
        one.record(10, 3, true);
        assert!(one.ready(11));
    }

    #[test]
    fn a_secondary_role_cannot_repeat_the_primary() {
        let assignment = RoleAssignment { slot: "RP1".into(), primary: ReliefRole::Setup, secondary: Some(ReliefRole::Setup) };
        assert!(assignment.roles().is_err());
    }
}
