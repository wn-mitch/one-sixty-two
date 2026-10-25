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
struct Rest { last: i64, previous: i64, rest_through: i64, quick: bool }

/// One named pitcher's rest, carried across simulation calls by season id (league segments).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestState { pub season_id: String, pub last: i64, pub previous: i64, pub rest_through: i64 }

impl Default for Rest { fn default() -> Self { Self { last: -1, previous: -1, rest_through: -1, quick: false } } }

impl Rest {
    /// A quick recoverer may pitch a third straight day.
    fn ready(&self, game: i64) -> bool { game > self.rest_through && (self.quick || !(self.last == game - 1 && self.previous == game - 2)) }
    /// Every inning beyond the first costs one more game of rest; a quick recoverer's first two innings are free.
    fn record(&mut self, game: i64, outs: i32, appeared: bool) {
        let free = if self.quick { 2 } else { 1 };
        let innings = (outs + 2) / 3;
        if innings > free { self.rest_through = game + i64::from(innings - free); }
        if appeared { self.previous = self.last; self.last = game; }
    }
}

/// Season availability for a club's named relievers: never a third consecutive day, and one game
/// of rest per inning pitched beyond the first. There is no season ceiling.
#[derive(Clone, Debug)]
pub struct ReliefUsage { pitchers: Vec<(usize, Rest)> }

impl ReliefUsage {
    pub fn new(team: &TeamInput) -> Self { Self::resume(team, &[]) }

    /// Usage that continues from carried rest; a pitcher without a carried state starts fresh.
    pub fn resume(team: &TeamInput, carried: &[RestState]) -> Self { Self::with_recovery(team, carried, &[]) }

    /// `resume`, with the named pitchers in `quick` (by season id) recovering quickly.
    pub fn with_recovery(team: &TeamInput, carried: &[RestState], quick: &[String]) -> Self {
        Self { pitchers: team.named_relief().map(|index| {
            let id = &team.pitchers[index].season_id;
            let mut rest = carried.iter().find(|state| &state.season_id == id)
                .map_or_else(Rest::default, |state| Rest { last: state.last, previous: state.previous, rest_through: state.rest_through, quick: false });
            rest.quick = quick.contains(id);
            (index, rest)
        }).collect() }
    }

    /// Each named pitcher's rest, to carry into the next call.
    pub fn carry(&self, team: &TeamInput) -> Vec<RestState> {
        self.pitchers.iter().map(|(index, rest)| RestState { season_id: team.pitchers[*index].season_id.clone(), last: rest.last, previous: rest.previous, rest_through: rest.rest_through }).collect()
    }

    /// Marks who may enter `game` and who sat out the previous game; starters and the remainder arm
    /// are always available.
    pub fn prepare(&self, team: &mut TeamInput, game: i64) {
        team.available.iter_mut().for_each(|available| *available = true);
        team.rested.iter_mut().for_each(|rested| *rested = true);
        for (index, rest) in &self.pitchers {
            team.available[*index] = rest.ready(game);
            team.rested[*index] = rest.last != game - 1;
        }
    }

    /// Records each named pitcher's outs and appearance from the club's game box.
    pub fn record(&mut self, game: i64, pitching: &[PitcherLine]) {
        for (index, rest) in self.pitchers.iter_mut() { rest.record(game, pitching[*index].outs, pitching[*index].appearances > 0); }
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
        assert!(!long.ready(3) && long.ready(4));
    }

    #[test]
    fn rest_scales_with_innings_and_blocks_a_third_straight_day() {
        let mut rest = Rest::default();
        rest.record(1, 3, true);
        rest.record(2, 3, true);
        assert!(!rest.ready(3) && rest.ready(4));
        let mut long = Rest::default();
        long.record(10, 7, true);
        assert!(!long.ready(11) && !long.ready(12) && long.ready(13));
        let mut two = Rest::default();
        two.record(10, 4, true);
        assert!(!two.ready(11) && two.ready(12));
    }

    #[test]
    fn a_secondary_role_cannot_repeat_the_primary() {
        let assignment = RoleAssignment { slot: "RP1".into(), primary: ReliefRole::Setup, secondary: Some(ReliefRole::Setup) };
        assert!(assignment.roles().is_err());
    }
}
