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
    /// A starter gone before the 6th, or a deficit of 4 or more; stays up to three innings.
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

#[derive(Clone, Copy, Debug)]
struct Rest { last: i64, previous: i64, rest_through: i64 }

impl Default for Rest { fn default() -> Self { Self { last: -1, previous: -1, rest_through: -1 } } }

impl Rest {
    fn ready(&self, game: i64) -> bool { game > self.rest_through && !(self.last == game - 1 && self.previous == game - 2) }
    /// Every inning beyond the first costs one more game of rest.
    fn record(&mut self, game: i64, outs: i32, appeared: bool) {
        if outs > 3 { self.rest_through = game + i64::from((outs + 2) / 3 - 1); }
        if appeared { self.previous = self.last; self.last = game; }
    }
}

/// Season availability for a club's named relievers: never a third consecutive day, and one game
/// of rest per inning pitched beyond the first. There is no season ceiling.
#[derive(Clone, Debug)]
pub struct ReliefUsage { pitchers: Vec<(usize, Rest)> }

impl ReliefUsage {
    pub fn new(team: &TeamInput) -> Self {
        Self { pitchers: team.named_relief().map(|index| (index, Rest::default())).collect() }
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
