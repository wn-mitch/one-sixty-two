//! Franchise crowd triggers: a home crowd that reacts to what happens in the game. Hype adds to
//! the crowd's strike-zone lean toward the home side from the next half inning, is capped, and
//! resets every game. The Dodgers' crowd instead arrives late and leaves early. Strengths are
//! provisional.
use crate::league::MAX_EDGE;
use crate::types::Half;
use serde::Deserialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CrowdTrigger {
    /// Cubs: every home homer starts a happy hour.
    HomeRunHappyHour,
    /// Cleveland: scoreless innings in the field build hype; a run against them drains it.
    GuardTheLead,
    /// White Sox: runs scored in a half without a homer build hype.
    WinningUgly,
    /// Dodgers: the crowd peaks in the middle innings and thins late, faster when trailing.
    BeatTheTraffic,
    /// Padres: the designated closer entering to protect a lead lifts the crowd.
    ClosingTime,
}

pub const HYPE_MAX: f64 = 0.04;
pub const HOMER_HYPE: f64 = 0.015;
pub const SCORELESS_HYPE: f64 = 0.01;
pub const UGLY_RUN_HYPE: f64 = 0.008;
pub const CLOSER_HYPE: f64 = 0.03;

/// One game's home crowd.
#[derive(Clone, Copy, Debug, Default)]
pub struct GameCrowd { trigger: Option<CrowdTrigger>, hype: f64, closer_cheered: bool }

impl GameCrowd {
    pub fn new(trigger: Option<CrowdTrigger>) -> Self { Self { trigger, ..Self::default() } }

    /// The home crowd's lean for a half inning: the segment's `base` lean, scaled by the Dodgers'
    /// traffic curve, plus hype. `home_lead` is the home score minus the visitors'.
    pub fn edge(&self, base: f64, inning: u32, regulation: u32, home_lead: i32) -> f64 {
        let scale = if self.trigger != Some(CrowdTrigger::BeatTheTraffic) { 1.0 }
            else if inning <= 2 { 0.6 }
            else if inning + 2 < regulation { 1.2 }
            else if home_lead < 0 { 0.4 } else { 0.8 };
        (base * scale + self.hype).clamp(-MAX_EDGE, MAX_EDGE)
    }

    /// Reacts to a finished half: `runs` scored in it and `homers` hit by the batting side.
    pub fn after_half(&mut self, half: Half, runs: i32, homers: i32) {
        match (self.trigger, half) {
            (Some(CrowdTrigger::HomeRunHappyHour), Half::Bottom) => self.hype += HOMER_HYPE * f64::from(homers),
            (Some(CrowdTrigger::GuardTheLead), Half::Top) => self.hype = if runs == 0 { self.hype + SCORELESS_HYPE } else { 0.0 },
            (Some(CrowdTrigger::WinningUgly), Half::Bottom) if homers == 0 => self.hype += UGLY_RUN_HYPE * f64::from(runs),
            _ => {}
        }
        self.hype = self.hype.clamp(0.0, HYPE_MAX);
    }

    /// The home club's designated closer takes the mound with a lead.
    pub fn closer_enters(&mut self) {
        if self.trigger != Some(CrowdTrigger::ClosingTime) || self.closer_cheered { return; }
        self.closer_cheered = true;
        self.hype = (self.hype + CLOSER_HYPE).min(HYPE_MAX);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn triggers_build_hype_from_their_own_events_within_the_cap() {
        let mut cubs = GameCrowd::new(Some(CrowdTrigger::HomeRunHappyHour));
        cubs.after_half(Half::Top, 3, 2);
        assert_eq!(cubs.edge(0.04, 1, 9, 0), 0.04);
        cubs.after_half(Half::Bottom, 2, 2);
        assert!((cubs.edge(0.04, 2, 9, 0) - 0.07).abs() < 1e-12);
        cubs.after_half(Half::Bottom, 1, 1);
        assert!((cubs.edge(0.04, 3, 9, 0) - 0.08).abs() < 1e-12);
        let mut cleveland = GameCrowd::new(Some(CrowdTrigger::GuardTheLead));
        for _ in 0..3 { cleveland.after_half(Half::Top, 0, 0); }
        assert!((cleveland.edge(0.0, 4, 9, 0) - 0.03).abs() < 1e-12);
        cleveland.after_half(Half::Top, 1, 1);
        assert_eq!(cleveland.edge(0.0, 5, 9, 0), 0.0);
        let mut sox = GameCrowd::new(Some(CrowdTrigger::WinningUgly));
        sox.after_half(Half::Bottom, 3, 1);
        assert_eq!(sox.edge(0.0, 2, 9, 0), 0.0);
        sox.after_half(Half::Bottom, 2, 0);
        assert!((sox.edge(0.0, 3, 9, 0) - 0.016).abs() < 1e-12);
        let mut padres = GameCrowd::new(Some(CrowdTrigger::ClosingTime));
        padres.closer_enters();
        padres.closer_enters();
        assert!((padres.edge(0.0, 9, 9, 1) - CLOSER_HYPE).abs() < 1e-12);
        assert_eq!(GameCrowd::new(None).edge(0.05, 9, 9, -3), 0.05);
    }

    #[test]
    fn the_dodgers_crowd_peaks_mid_game_and_leaves_early_when_trailing() {
        let dodgers = GameCrowd::new(Some(CrowdTrigger::BeatTheTraffic));
        let edges: Vec<f64> = [(1, 0), (5, 0), (7, 1), (8, -1)].iter().map(|&(inning, lead)| dodgers.edge(0.05, inning, 9, lead)).collect();
        assert!(edges[1] > edges[2] && edges[2] > edges[0] && edges[0] > edges[3]);
        // A seven-inning game thins from the 5th.
        assert!(dodgers.edge(0.05, 5, 7, 0) < dodgers.edge(0.05, 4, 7, 0));
    }
}
