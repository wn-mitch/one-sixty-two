//! Centered run values for plate appearances and steals (`src/lib/sim/value.ts`).
use crate::defense_rules::steal_success_probability;
use crate::physical_expectation::{target_index, PhysicalReference, INFINITY_TARGET, STATE_COUNT};

const TARGET_COUNT: usize = 5;

pub struct RunValueModel {
    pub expectancy: Vec<f64>,
    mu_pa: Vec<f64>,
    mu_steal: Vec<f64>,
}

impl RunValueModel {
    pub fn new(reference: &PhysicalReference) -> Self {
        let environment = &reference.environment;
        let mut mu_pa = vec![0.0; STATE_COUNT * TARGET_COUNT];
        let mut mu_steal = vec![0.0; STATE_COUNT];
        for state in 0..STATE_COUNT {
            let before = reference.run_expectancy[state];
            for target in 0..TARGET_COUNT {
                let runs_needed = if target == INFINITY_TARGET { f64::INFINITY } else { target as f64 + 1.0 };
                mu_pa[state * TARGET_COUNT + target] = reference.expected_neutral_plate_appearance_value(state, runs_needed) - before;
            }
            let outs = state / 8;
            let bases = state & 7;
            if bases & 1 != 0 && bases & 2 == 0 {
                let success_bases = (bases & !1) | 2;
                let caught_outs = outs + 1;
                let success = steal_success_probability(environment.league_steal_success, 0.0);
                let after = success * reference.run_expectancy[outs * 8 + success_bases]
                    + (1.0 - success) * (if caught_outs >= 3 { 0.0 } else { reference.run_expectancy[caught_outs * 8 + (bases & !1)] });
                mu_steal[state] = after - before;
            }
        }
        Self { expectancy: reference.run_expectancy.clone(), mu_pa, mu_steal }
    }

    pub fn remaining(&self, outs: u32, bases: u32, ended: bool) -> f64 {
        if ended || outs >= 3 { 0.0 } else { self.expectancy[(outs * 8 + bases) as usize] }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn centered_plate_appearance(&self, outs_before: u32, bases_before: u32, runs: u32, outs_after: u32, bases_after: u32, ended: bool, runs_needed: f64) -> f64 {
        let state = (outs_before * 8 + bases_before) as usize;
        let before = self.expectancy[state];
        let after = self.remaining(outs_after, bases_after, ended);
        runs as f64 + after - before - self.mu_pa[state * TARGET_COUNT + target_index(runs_needed)]
    }

    pub fn centered_steal(&self, outs_before: u32, bases_before: u32, outs_after: u32, bases_after: u32) -> f64 {
        let state = (outs_before * 8 + bases_before) as usize;
        let before = self.expectancy[state];
        let after = self.remaining(outs_after, bases_after, false);
        after - before - self.mu_steal[state]
    }
}
