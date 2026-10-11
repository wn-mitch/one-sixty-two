//! Defensive probability rules (`src/lib/sim/defense-rules.ts`).
use crate::math;

pub fn clip(value: f64, low: f64, high: f64) -> f64 { math::max(low, math::min(high, value)) }
pub fn fielding_error_probability(target: f64, error_avoidance: f64) -> f64 { clip(target - 0.02 * error_avoidance, 0.0, 0.12) }
pub fn double_play_probability(tendency: f64, team_skill: f64) -> f64 { clip(clip(tendency / 0.55, 0.0, 0.85) + 0.06 * team_skill, 0.0, 0.85) }
pub fn advancement_attempt_probability(baseline: f64, arm: f64) -> f64 { clip(baseline - 0.05 * arm, 0.05, 0.95) }
pub fn advancement_out_probability(arm: f64) -> f64 { clip(0.04 + 0.03 * arm, 0.01, 0.07) }
pub fn steal_success_probability(baseline: f64, catcher_throwing: f64) -> f64 { clip(baseline - 0.05 * catcher_throwing, 0.35, 0.95) }

/// Positions that take part in a double play started by `fielder`, sorted ascending.
pub fn double_play_participants(fielder: isize, output: &mut [usize; 3]) -> usize {
    if !(1..=4).contains(&fielder) { return 0; }
    let fielder = fielder as usize;
    let pivot = if fielder == 1 || fielder == 2 { 4 } else { 2 };
    let mut count = 0;
    output[count] = fielder; count += 1;
    if pivot != fielder { output[count] = pivot; count += 1; }
    if fielder != 1 { output[count] = 1; count += 1; }
    output[..count].sort_unstable();
    count
}
