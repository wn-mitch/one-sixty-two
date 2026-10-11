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

#[derive(Clone, Debug)]
pub struct Workload { pub current: usize, starter_done: bool, closer_used: bool, budget: u32 }

impl Workload {
    pub fn new(team: &TeamInput) -> Result<Self, String> {
        Ok(Self { current: team.starter_index, starter_done: false, closer_used: false, budget: starter_budget(team.pitchers[team.starter_index])? })
    }

    pub fn begin_half(&mut self, team: &TeamInput, lines: &[PitcherLine], inning: u32, lead: i32) {
        if lines[team.starter_index].r >= 6 || lines[team.starter_index].outs as u32 >= self.budget { self.starter_done = true; }
        self.current = if self.starter_done { team.bullpen_index } else { team.starter_index };
        if inning >= 9 && (0..=3).contains(&lead) && !self.closer_used && team.closer_available && team.closer_outs_remaining >= 3.0 {
            self.current = team.closer_index;
            self.starter_done = true;
            self.closer_used = true;
        }
    }

    pub fn before_plate_appearance(&mut self, team: &TeamInput, lines: &[PitcherLine]) {
        if self.current == team.starter_index && lines[self.current].outs as u32 >= self.budget {
            self.starter_done = true;
            self.current = team.bullpen_index;
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
