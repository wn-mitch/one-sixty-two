//! Franchise crowd triggers: a fan base that reacts to how its club plays. Each club with a trigger
//! carries a season-long hype meter. Its trigger's events fill the meter in home and road games
//! alike; the meter leans the strike zone toward the club only at home, from the next half inning,
//! is capped, and decays after every game the club plays. The Dodgers' crowd instead swells with a
//! lead and leaves when trailing late. Strengths are provisional.
use crate::league::MAX_EDGE;
use crate::types::Half;
use serde::Deserialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CrowdTrigger {
    /// Cubs: every Cubs homer fills the meter.
    HomeRunHappyHour,
    /// Cleveland: every scoreless half inning in the field fills the meter.
    GuardTheLead,
    /// White Sox: runs scored in a half without a homer fill the meter.
    WinningUgly,
    /// Dodgers: every win fills the meter, and the home lean swells while leading and fades when trailing late.
    FrontRunners,
    /// Padres: the designated closer entering to protect a lead fills the meter.
    ClosingTime,
}

pub const HYPE_MAX: f64 = 0.15;
/// The share of a club's hype left after each game it plays.
pub const HYPE_KEEP: f64 = 0.9;
pub const HOMER_HYPE: f64 = 0.013;
pub const SCORELESS_HYPE: f64 = 0.0019;
pub const UGLY_RUN_HYPE: f64 = 0.009;
pub const CLOSER_HYPE: f64 = 0.08;
pub const WIN_HYPE: f64 = 0.03;
/// The Dodgers' home lean while leading, and while trailing from two innings before the end of regulation.
pub const FRONT_RUNNER_LEAD: f64 = 2.5;
pub const FRONT_RUNNER_TRAIL: f64 = 0.3;

/// One club's trigger and season hype meter.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct ClubCrowd { pub trigger: Option<CrowdTrigger>, pub hype: f64 }

impl ClubCrowd {
    fn add(&mut self, trigger: CrowdTrigger, amount: f64) {
        if self.trigger == Some(trigger) { self.hype = (self.hype + amount).clamp(0.0, HYPE_MAX); }
    }

    /// The meter after a finished game the club `won` or lost.
    pub fn after_game(mut self, won: bool) -> Self {
        if won { self.add(CrowdTrigger::FrontRunners, WIN_HYPE); }
        Self { hype: self.hype * HYPE_KEEP, ..self }
    }
}

/// Both clubs' crowds during one game.
#[derive(Clone, Copy, Debug, Default)]
pub struct GameCrowd { pub home: ClubCrowd, pub away: ClubCrowd, closer_cheered: [bool; 2] }

impl GameCrowd {
    pub fn new(home: ClubCrowd, away: ClubCrowd) -> Self { Self { home, away, closer_cheered: [false; 2] } }

    /// The strike zone's lean toward the home side for a half inning: the game's `base` lean, scaled
    /// by the Dodgers' front-running, plus the home club's hype. `home_lead` is the home score minus the visitors'.
    pub fn edge(&self, base: f64, inning: u32, regulation: u32, home_lead: i32) -> f64 {
        let scale = if self.home.trigger != Some(CrowdTrigger::FrontRunners) { 1.0 }
            else if home_lead > 0 { FRONT_RUNNER_LEAD }
            else if home_lead < 0 && inning + 2 >= regulation { FRONT_RUNNER_TRAIL } else { 1.0 };
        (base * scale + self.home.hype).clamp(-MAX_EDGE, MAX_EDGE)
    }

    /// Reacts to a finished half: `runs` and `homers` by the batting side.
    pub fn after_half(&mut self, half: Half, runs: i32, homers: i32) {
        let (offense, defense) = if half == Half::Top { (&mut self.away, &mut self.home) } else { (&mut self.home, &mut self.away) };
        offense.add(CrowdTrigger::HomeRunHappyHour, HOMER_HYPE * f64::from(homers));
        if homers == 0 { offense.add(CrowdTrigger::WinningUgly, UGLY_RUN_HYPE * f64::from(runs)); }
        if runs == 0 { defense.add(CrowdTrigger::GuardTheLead, SCORELESS_HYPE); }
    }

    /// The fielding side's designated closer takes the mound with a lead; it counts once a game.
    pub fn closer_enters(&mut self, half: Half) {
        let side = usize::from(half == Half::Bottom);
        if self.closer_cheered[side] { return; }
        self.closer_cheered[side] = true;
        let fielding = if half == Half::Top { &mut self.home } else { &mut self.away };
        fielding.add(CrowdTrigger::ClosingTime, CLOSER_HYPE);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const fn club(trigger: CrowdTrigger) -> ClubCrowd { ClubCrowd { trigger: Some(trigger), hype: 0.0 } }
    fn close(a: f64, b: f64) -> bool { (a - b).abs() < 1e-12 }

    #[test]
    fn triggers_fill_their_own_clubs_meter_from_their_own_events_within_the_cap() {
        // The Cubs on the road: their homers in the top half count, the home side's do not.
        let mut game = GameCrowd::new(ClubCrowd::default(), club(CrowdTrigger::HomeRunHappyHour));
        game.after_half(Half::Top, 3, 2);
        game.after_half(Half::Bottom, 2, 2);
        assert!(close(game.away.hype, 2.0 * HOMER_HYPE) && game.home.hype == 0.0);
        for _ in 0..100 { game.after_half(Half::Top, 1, 1); }
        assert_eq!(game.away.hype, HYPE_MAX);
        // Away hype never leans the strike zone.
        assert_eq!(game.edge(0.04, 5, 9, 0), 0.04);
        let mut cleveland = GameCrowd::new(club(CrowdTrigger::GuardTheLead), ClubCrowd::default());
        cleveland.after_half(Half::Top, 0, 0);
        cleveland.after_half(Half::Top, 1, 0);
        cleveland.after_half(Half::Bottom, 0, 0);
        assert!(close(cleveland.home.hype, SCORELESS_HYPE));
        assert!(close(cleveland.edge(0.0, 4, 9, 0), SCORELESS_HYPE));
        let mut sox = GameCrowd::new(club(CrowdTrigger::WinningUgly), ClubCrowd::default());
        sox.after_half(Half::Bottom, 3, 1);
        sox.after_half(Half::Bottom, 2, 0);
        assert!(close(sox.home.hype, 2.0 * UGLY_RUN_HYPE));
        let mut padres = GameCrowd::new(ClubCrowd::default(), club(CrowdTrigger::ClosingTime));
        padres.closer_enters(Half::Bottom);
        padres.closer_enters(Half::Bottom);
        padres.closer_enters(Half::Top);
        assert!(close(padres.away.hype, CLOSER_HYPE) && padres.home.hype == 0.0);
    }

    #[test]
    fn the_meter_carries_between_games_and_decays() {
        let hyped = ClubCrowd { trigger: Some(CrowdTrigger::GuardTheLead), hype: 0.1 };
        assert!(close(hyped.after_game(true).hype, 0.1 * HYPE_KEEP));
        let dodgers = ClubCrowd { trigger: Some(CrowdTrigger::FrontRunners), hype: 0.0 };
        assert!(close(dodgers.after_game(true).hype, WIN_HYPE * HYPE_KEEP) && dodgers.after_game(false).hype == 0.0);
        let game = GameCrowd::new(hyped, ClubCrowd::default());
        assert!(close(game.edge(0.04, 1, 9, 0), 0.14));
    }

    #[test]
    fn the_dodgers_home_lean_swells_with_a_lead_and_leaves_when_trailing_late() {
        let dodgers = GameCrowd::new(club(CrowdTrigger::FrontRunners), ClubCrowd::default());
        assert!(close(dodgers.edge(0.04, 2, 9, 1), 0.04 * FRONT_RUNNER_LEAD));
        assert_eq!(dodgers.edge(0.04, 6, 9, -1), 0.04);
        assert!(close(dodgers.edge(0.04, 7, 9, -1), 0.04 * FRONT_RUNNER_TRAIL));
        // A seven-inning game thins from the 5th.
        assert!(close(dodgers.edge(0.04, 5, 7, -2), 0.04 * FRONT_RUNNER_TRAIL));
        assert_eq!(GameCrowd::default().edge(0.05, 9, 9, -3), 0.05);
    }
}
