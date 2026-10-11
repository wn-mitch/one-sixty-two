//! Neutral equal-strength win expectancy (`src/lib/sim/win-expectancy.ts`).
use crate::physical_expectation::TransitionRows;
use crate::types::Half;
use std::collections::HashMap;

const STATE_COUNT: usize = 24;
const MASS_TOLERANCE: f64 = 1e-13;
const MAX_TRANSITIONS: usize = 4096;

#[derive(Clone)]
struct SignedDistribution { probabilities: Vec<f64>, upper_tail: Vec<f64>, offset: isize }

/// Insertion-ordered sparse accumulator, so sums follow the TS `Map` iteration order.
#[derive(Default)]
struct OrderedSums { keys: Vec<usize>, values: Vec<f64>, index: HashMap<usize, usize> }

impl OrderedSums {
    fn add(&mut self, key: usize, value: f64) {
        match self.index.get(&key) {
            Some(&slot) => self.values[slot] += value,
            None => { self.index.insert(key, self.keys.len()); self.keys.push(key); self.values.push(value); }
        }
    }
}

/// Absorbing half-inning run distribution from the neutral league transitions.
pub fn neutral_run_distribution(rows: &TransitionRows, outs: usize, bases: usize) -> Result<Vec<f64>, String> {
    if outs > 3 || bases > 7 { return Err("Invalid neutral inning state".into()); }
    if outs == 3 { return Ok(vec![1.0]); }
    let mut active = OrderedSums::default();
    active.add(outs * 8 + bases, 1.0);
    let mut completed: Vec<Option<f64>> = Vec::new();
    let mut active_mass = 1.0;
    let mut step = 0;
    while step < MAX_TRANSITIONS && active_mass > MASS_TOLERANCE {
        let mut next = OrderedSums::default();
        for (key, state_probability) in active.keys.iter().zip(&active.values) {
            let runs = key / STATE_COUNT;
            let state = key % STATE_COUNT;
            for index in rows.offsets[state]..rows.offsets[state + 1] {
                let probability = state_probability * rows.probability[index];
                if probability == 0.0 { continue; }
                let next_runs = runs + rows.runs[index] as usize;
                let next_state = rows.next[index];
                if next_state < 0 {
                    if completed.len() <= next_runs { completed.resize(next_runs + 1, None); }
                    completed[next_runs] = Some(completed[next_runs].unwrap_or(0.0) + probability);
                } else {
                    next.add(next_runs * STATE_COUNT + next_state as usize, probability);
                }
            }
        }
        active = next;
        active_mass = active.values.iter().fold(0.0, |sum, value| sum + value);
        if !active_mass.is_finite() { return Err("Neutral win model produced invalid probability mass".into()); }
        step += 1;
    }
    if active_mass > MASS_TOLERANCE { return Err("Neutral win model did not converge".into()); }
    // `reduce` skips holes in a sparse array; dense undefined entries count as zero.
    let absorbed = completed.iter().flatten().fold(0.0, |sum, value| sum + value);
    if !absorbed.is_finite() || (absorbed + active_mass - 1.0).abs() > 1e-10 || absorbed <= 0.0 { return Err("Neutral win model lost probability mass".into()); }
    let distribution: Vec<f64> = completed.iter().map(|value| value.unwrap_or(0.0) / absorbed).collect();
    let total = distribution.iter().fold(0.0, |sum, value| sum + value);
    if (total - 1.0).abs() > 1e-12 { return Err("Invalid neutral run distribution".into()); }
    Ok(distribution)
}

fn convolve(left: &[f64], right: &[f64]) -> Vec<f64> {
    let mut result = vec![0.0; left.len() + right.len() - 1];
    for a in 0..left.len() { for b in 0..right.len() { result[a + b] += left[a] * right[b]; } }
    result
}

fn signed(probabilities: Vec<f64>, offset: isize) -> Result<SignedDistribution, String> {
    let total = probabilities.iter().fold(0.0, |sum, value| sum + value);
    if !total.is_finite() || (total - 1.0).abs() > 1e-10 || probabilities.iter().any(|value| *value < 0.0 || !value.is_finite()) {
        return Err("Neutral win model produced an invalid distribution".into());
    }
    let mut upper_tail = vec![0.0; probabilities.len() + 1];
    for index in (0..probabilities.len()).rev() { upper_tail[index] = upper_tail[index + 1] + probabilities[index]; }
    Ok(SignedDistribution { probabilities, upper_tail, offset })
}

fn signed_difference(home: &[f64], away: &[f64]) -> Result<SignedDistribution, String> {
    let offset = away.len() - 1;
    let mut probabilities = vec![0.0; home.len() + away.len() - 1];
    for home_runs in 0..home.len() {
        for away_runs in 0..away.len() { probabilities[home_runs + offset - away_runs] += home[home_runs] * away[away_runs]; }
    }
    signed(probabilities, offset as isize)
}

fn convolve_signed(left: &SignedDistribution, right: &SignedDistribution) -> Result<SignedDistribution, String> {
    signed(convolve(&left.probabilities, &right.probabilities), left.offset + right.offset)
}

fn expected_win(distribution: &SignedDistribution, score_difference: isize) -> f64 {
    let tie_index = distribution.offset - score_difference;
    if tie_index < 0 { return 1.0; }
    let tie = tie_index as usize;
    if tie >= distribution.probabilities.len() { return 0.0; }
    distribution.upper_tail[tie + 1] + 0.5 * distribution.probabilities[tie]
}

/// A deterministic, equal-strength neutral league-rate win model. Every table the TS model
/// fills lazily is computed once up front; each entry is a pure function of the transitions.
pub struct WinExpectancyModel {
    /// Run distributions by `outs * 8 + bases` for outs 0..=3.
    run_distributions: Vec<Vec<f64>>,
    /// Remainders by inning key 1..=9 (index 0 unused).
    top_remainders: Vec<SignedDistribution>,
    bottom_remainders: Vec<SignedDistribution>,
}

impl WinExpectancyModel {
    pub fn new(rows: &TransitionRows) -> Result<Self, String> {
        let run_distributions = (0..32).map(|key| neutral_run_distribution(rows, key / 8, key % 8)).collect::<Result<Vec<_>, _>>()?;
        let full = &run_distributions[0];
        let one = signed_difference(full, full)?;
        let mut future = vec![signed(vec![1.0], 0)?];
        for innings in 1..=8 { future.push(convolve_signed(&future[innings - 1], &one)?); }
        let first = signed(full.clone(), 0)?;
        let mut top_remainders = vec![first.clone()];
        let mut bottom_remainders = vec![first.clone()];
        for key in 1..=9 {
            top_remainders.push(convolve_signed(&first, &future[9 - key])?);
            bottom_remainders.push(future[9 - key].clone());
        }
        Ok(Self { run_distributions, top_remainders, bottom_remainders })
    }

    pub fn home_win_probability(&self, inning: usize, half: Half, outs: usize, bases: usize, home_runs: i32, away_runs: i32) -> Result<f64, String> {
        if inning < 1 || outs > 3 || bases > 7 || home_runs < 0 || away_runs < 0 { return Err("Invalid win expectancy state".into()); }
        let score_difference = (home_runs - away_runs) as isize;
        if half == Half::Bottom && inning >= 9 && score_difference > 0 { return Ok(1.0); }
        let current = &self.run_distributions[outs * 8 + bases];
        let key = inning.min(9);
        let mut probability = 0.0;
        if half == Half::Top {
            let remainder = &self.top_remainders[key];
            for (away_additional, current_probability) in current.iter().enumerate() {
                if inning >= 9 && score_difference - away_additional as isize > 0 { probability += current_probability; }
                else { probability += current_probability * expected_win(remainder, score_difference - away_additional as isize); }
            }
        } else {
            let remainder = &self.bottom_remainders[key];
            for (home_additional, current_probability) in current.iter().enumerate() {
                probability += current_probability * expected_win(remainder, score_difference + home_additional as isize);
            }
        }
        if !probability.is_finite() || probability < -1e-12 || probability > 1.0 + 1e-12 { return Err("Neutral win model produced an invalid win probability".into()); }
        Ok(crate::math::max(0.0, crate::math::min(1.0, probability)))
    }
}
