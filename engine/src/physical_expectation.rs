//! Neutral league transitions, run expectancy, event run weights, and defensive run coefficients
//! (`src/lib/sim/physical-expectation.ts`).
use crate::advancement::forced_base_transition;
use crate::contact::{enumerate_decisions, neutral_defense, resolve_contact, ContactOptions, ContactResult, Decisions, Play, PreparedDefense};
use crate::contact_basis::for_each_lattice_trace;
use crate::contact_profile::{launch_class, ContactFit, ShapeTables, EV_COUNT, LAUNCH_COUNT, LAUNCH_MIN, LAUNCH_WIDTH, REGION_COUNT, SIDE_UNKNOWN};
use crate::defense_rules::steal_success_probability;
use crate::fielding::{build_fielding_plan, class_kind, compute_candidates, fielding_outcomes, fill_actual_candidate, physical_class, FieldingCandidates, FieldingPlan, PhysicalOutcomes, OUTCOME_FOUL, PHYSICAL_CLASS_COUNT};
use crate::flight::PreparedPark;
use crate::types::{ContactModel, DefensiveEnvironment, DefensiveSkills};
use std::collections::BTreeMap;

pub const STATE_COUNT: usize = 24;
/// Runs-needed targets 1, 2, 3, 4, and unlimited.
pub const TARGETS: [f64; 5] = [1.0, 2.0, 3.0, 4.0, f64::INFINITY];
pub const INFINITY_TARGET: usize = 4;
const SKILL_NODES: [f64; 5] = [-1.0, -0.5, 0.0, 0.5, 1.0];
const HALF_INNINGS_PER_SEASON: f64 = 1458.0;
const NEUTRAL_SPEEDS: [f64; 4] = [0.5; 4];

/// Sparse transition rows: probability, runs, next state (-1 when the half inning or game ends).
#[derive(Clone, Debug, Default)]
pub struct TransitionRows {
    pub offsets: Vec<usize>,
    pub probability: Vec<f64>,
    pub runs: Vec<u32>,
    pub next: Vec<i32>,
}

#[derive(Clone)]
struct Variant { classes: Vec<f64>, prepared: PreparedDefense, options: ContactOptions }

/// Neutral-park physical outcome classes for a contact fit made at unknown side and average speed.
pub fn contact_classes(model: &ContactModel, fit: &ContactFit) -> Result<Vec<f64>, String> {
    let mut classes = vec![0.0; PHYSICAL_CLASS_COUNT];
    for region in 0..REGION_COUNT {
        let offset = (fit.shift_index * REGION_COUNT + region) * PHYSICAL_CLASS_COUNT;
        for cls in 0..PHYSICAL_CLASS_COUNT { classes[cls] += fit.region_weights[region] * model.basis.classes[offset + cls]; }
    }
    let total = classes.iter().fold(0.0, |sum, value| sum + value);
    if !((total - 1.0).abs() < 1e-6) { return Err("Contact classes do not sum to one".into()); }
    for value in classes.iter_mut() { *value /= total; }
    Ok(classes)
}

/// Scratch state for replaying the legal adapter from a synthetic base state.
struct Replayer { result: ContactResult, decisions: Decisions, participants: [usize; 3] }

impl Replayer {
    fn new() -> Self { Self { result: ContactResult::default(), decisions: Decisions::default(), participants: [0; 3] } }
}

fn state_bases(mask: u32) -> ([i16; 3], [i16; 3]) {
    let mut runners = [-1i16; 3];
    let mut pitchers = [-1i16; 3];
    for index in 0..3 {
        if mask & (1 << index) != 0 { runners[index] = index as i16 + 1; pitchers[index] = 0; }
    }
    (runners, pitchers)
}

fn mask_of(runners: &[i16; 3]) -> u32 { (runners[0] >= 0) as u32 | ((runners[1] >= 0) as u32) << 1 | ((runners[2] >= 0) as u32) << 2 }

/// Visits each legal result of one contact class from `state`, scaled by `weight`.
#[allow(clippy::too_many_arguments)]
fn visit_contact_class(environment: &DefensiveEnvironment, variant: &Variant, replay: &mut Replayer, state: usize, target: f64, cls: usize, weight: f64, visit: &mut dyn FnMut(f64, u32, u32, u32, bool)) {
    let outs = (state / 8) as u32;
    let mask = (state & 7) as u32;
    let (kind, fielder, bases) = class_kind(cls);
    let (runners, pitchers) = state_bases(mask);
    let Replayer { result, decisions, participants } = replay;
    let play = Play {
        runners: &runners, pitchers: &pitchers, outs, kind, fielder, bases_taken: bases, hitter: 0, pitcher: 0,
        speeds: &NEUTRAL_SPEEDS, batter_double_play: environment.league_double_play, offense_runs: 0.0, target,
    };
    let result_cell = std::cell::RefCell::new(result);
    enumerate_decisions(decisions, &mut |decisions: &mut Decisions| {
        resolve_contact(&mut result_cell.borrow_mut(), &play, &variant.prepared, &variant.options, decisions, participants).expect("class outcomes are legal");
    }, &mut |probability| {
        let result = result_cell.borrow();
        visit(weight * probability, result.runs, result.outs_after, mask_of(&result.runners), result.ended);
    });
}

/// Visits each legal result of one plate appearance from `state` for the variant.
fn visit_plate_appearance(environment: &DefensiveEnvironment, variant: &Variant, replay: &mut Replayer, state: usize, target: f64, visit: &mut dyn FnMut(f64, u32, u32, u32, bool)) {
    let outs = (state / 8) as u32;
    let mask = (state & 7) as u32;
    let rates = &environment.league_rates;
    let contact = rates[3] + rates[4] + rates[5] + rates[6] + rates[7];
    let walk = rates[0] + rates[1];
    if walk > 0.0 {
        let transition = forced_base_transition(mask);
        let runs = transition >> 3;
        visit(walk, runs, outs, transition & 7, runs as f64 >= target);
    }
    if rates[2] > 0.0 { visit(rates[2], 0, outs + 1, mask, false); }
    for cls in 0..PHYSICAL_CLASS_COUNT {
        let weight = contact * variant.classes[cls];
        if weight != 0.0 { visit_contact_class(environment, variant, replay, state, target, cls, weight, visit); }
    }
}

fn build_transitions(environment: &DefensiveEnvironment, variant: &Variant, target: f64) -> Result<TransitionRows, String> {
    let mut rows = TransitionRows { offsets: vec![0; STATE_COUNT + 1], ..Default::default() };
    let mut replay = Replayer::new();
    for state in 0..STATE_COUNT {
        // Keyed by runs * 32 + (next + 1); each key sums in visit order, then rows sort by key.
        let mut merged: BTreeMap<u32, f64> = BTreeMap::new();
        let mut insertion: Vec<u32> = Vec::new();
        visit_plate_appearance(environment, variant, &mut replay, state, target, &mut |p, scored, outs, bases, ended| {
            let after: i32 = if ended || outs >= 3 { -1 } else { (outs * 8 + bases) as i32 };
            let key = scored * 32 + (after + 1) as u32;
            let entry = merged.entry(key).or_insert_with(|| { insertion.push(key); 0.0 });
            *entry += p;
        });
        rows.offsets[state] = rows.probability.len();
        for (key, p) in &merged {
            rows.probability.push(*p);
            rows.runs.push(key / 32);
            rows.next.push((key % 32) as i32 - 1);
        }
        let total = insertion.iter().fold(0.0, |sum, key| sum + merged[key]);
        if !((total - 1.0).abs() < 1e-9) { return Err(format!("Physical transitions lost probability mass in state {state}")); }
    }
    rows.offsets[STATE_COUNT] = rows.probability.len();
    Ok(rows)
}

fn solve_linear(matrix: &[f64], rhs: &[f64], size: usize) -> Result<Vec<f64>, String> {
    let mut a = matrix.to_vec();
    let mut b = rhs.to_vec();
    for column in 0..size {
        let mut pivot = column;
        for row in column + 1..size { if a[row * size + column].abs() > a[pivot * size + column].abs() { pivot = row; } }
        if !(a[pivot * size + column].abs() > 1e-14) { return Err("Run expectancy system is singular".into()); }
        for k in 0..size { a.swap(column * size + k, pivot * size + k); }
        b.swap(column, pivot);
        for row in column + 1..size {
            let factor = a[row * size + column] / a[column * size + column];
            for k in column..size { a[row * size + k] -= factor * a[column * size + k]; }
            b[row] -= factor * b[column];
        }
    }
    for row in (0..size).rev() {
        let mut value = b[row];
        for k in row + 1..size { value -= a[row * size + k] * b[k]; }
        b[row] = value / a[row * size + row];
    }
    Ok(b)
}

/// Expected runs to the end of the half inning, and expected visits from the empty, no-out state.
fn solve_markov(rows: &TransitionRows) -> Result<(Vec<f64>, Vec<f64>), String> {
    let mut system = vec![0.0; STATE_COUNT * STATE_COUNT];
    let mut transposed = vec![0.0; STATE_COUNT * STATE_COUNT];
    let mut reward = vec![0.0; STATE_COUNT];
    for state in 0..STATE_COUNT {
        system[state * STATE_COUNT + state] += 1.0;
        transposed[state * STATE_COUNT + state] += 1.0;
        for index in rows.offsets[state]..rows.offsets[state + 1] {
            reward[state] += rows.probability[index] * rows.runs[index] as f64;
            let next = rows.next[index];
            if next < 0 { continue; }
            let next = next as usize;
            system[state * STATE_COUNT + next] -= rows.probability[index];
            transposed[next * STATE_COUNT + state] -= rows.probability[index];
        }
    }
    let mut start = vec![0.0; STATE_COUNT];
    start[0] = 1.0;
    let expectancy = solve_linear(&system, &reward, STATE_COUNT)?;
    let visits = solve_linear(&transposed, &start, STATE_COUNT)?;
    if expectancy.iter().any(|value| !value.is_finite() || *value < 0.0) || visits.iter().any(|value| !value.is_finite() || *value < -1e-12) {
        return Err("Run expectancy solve is invalid".into());
    }
    Ok((expectancy, visits))
}

fn neutral_variant(environment: &DefensiveEnvironment, classes: &[f64]) -> Variant {
    Variant { classes: classes.to_vec(), prepared: neutral_defense(&environment.league_error_rates), options: ContactOptions::default() }
}

/// The neutral league reference shared by defense valuation, run value, and win expectancy.
pub struct PhysicalReference {
    pub environment: DefensiveEnvironment,
    pub tables: ShapeTables,
    pub league_fit: ContactFit,
    /// League neutral contact, as physical outcome classes.
    pub classes: Vec<f64>,
    /// Transitions per target index.
    pub transitions: Vec<TransitionRows>,
    pub run_expectancy: Vec<f64>,
    pub state_visits: Vec<f64>,
    /// Expected runs plus continuation per state and target, before subtracting the state value.
    pub pa_values: Vec<f64>,
    neutral_cycle_costs: Vec<f64>,
    coefficients: std::sync::OnceLock<Result<Vec<f64>, String>>,
}

fn plate_appearance_value(environment: &DefensiveEnvironment, variant: &Variant, replay: &mut Replayer, expectancy: &[f64], state: usize, target: f64) -> f64 {
    let mut value = 0.0;
    visit_plate_appearance(environment, variant, replay, state, target, &mut |p, runs, outs, bases, ended| {
        value += p * (runs as f64 + if ended || outs >= 3 { 0.0 } else { expectancy[(outs * 8 + bases) as usize] });
    });
    value
}

/// Steal attempts precede the plate appearance with first occupied and second open.
fn cycle_cost(environment: &DefensiveEnvironment, expectancy: &[f64], variant: &Variant, replay: &mut Replayer, state: usize, catcher_throwing: f64) -> f64 {
    let outs = state / 8;
    let bases = state & 7;
    let mut pa = |s: usize| plate_appearance_value(environment, variant, replay, expectancy, s, f64::INFINITY);
    if bases & 1 == 0 || bases & 2 != 0 { return pa(state); }
    let attempt = environment.league_steal_attempt;
    let success = steal_success_probability(environment.league_steal_success, catcher_throwing);
    let caught_outs = outs + 1;
    let caught = if caught_outs >= 3 { 0.0 } else { pa(caught_outs * 8 + (bases & !1)) };
    let stay = pa(state);
    let stolen = pa(outs * 8 + ((bases & !1) | 2));
    (1.0 - attempt) * stay + attempt * (success * stolen + (1.0 - success) * caught)
}

impl PhysicalReference {
    pub fn new(environment: &DefensiveEnvironment, tables: ShapeTables, league_fit: ContactFit) -> Result<Self, String> {
        let classes = contact_classes(&environment.contact_model, &league_fit)?;
        let neutral = neutral_variant(environment, &classes);
        let transitions = TARGETS.iter().map(|target| build_transitions(environment, &neutral, *target)).collect::<Result<Vec<_>, _>>()?;
        let (expectancy, visits) = solve_markov(&transitions[INFINITY_TARGET])?;
        let mut pa_values = vec![0.0; STATE_COUNT * TARGETS.len()];
        for state in 0..STATE_COUNT {
            for (target, rows) in transitions.iter().enumerate() {
                let mut value = 0.0;
                for index in rows.offsets[state]..rows.offsets[state + 1] {
                    let next = rows.next[index];
                    value += rows.probability[index] * (rows.runs[index] as f64 + if next < 0 { 0.0 } else { expectancy[next as usize] });
                }
                pa_values[state * TARGETS.len() + target] = value;
            }
        }
        let mut replay = Replayer::new();
        let neutral_cycle_costs = (0..STATE_COUNT).map(|state| cycle_cost(environment, &expectancy, &neutral, &mut replay, state, 0.0)).collect();
        Ok(Self {
            environment: environment.clone(), tables, league_fit, classes, transitions, run_expectancy: expectancy, state_visits: visits, pa_values,
            neutral_cycle_costs, coefficients: std::sync::OnceLock::new(),
        })
    }

    /// Expected runs plus continuation for one neutral plate appearance, honoring walkoff stopping.
    pub fn expected_neutral_plate_appearance_value(&self, state: usize, runs_needed: f64) -> f64 {
        self.pa_values[state * TARGETS.len() + target_index(runs_needed)]
    }

    /// Linear run weights for one plate-appearance event (see `eventRunWeights` in TS).
    pub fn event_run_weights(&self) -> Result<EventRunWeights, String> {
        let environment = &self.environment;
        let expectancy = &self.run_expectancy;
        let variant = neutral_variant(environment, &self.classes);
        let mut replay = Replayer::new();
        let total_visits = self.state_visits.iter().fold(0.0, |sum, value| sum + value);
        let mut weights = EventRunWeights { walk: 0.0, strikeout: 0.0, classes: vec![0.0; PHYSICAL_CLASS_COUNT], class_outs: vec![0.0; PHYSICAL_CLASS_COUNT] };
        for state in 0..STATE_COUNT {
            let share = self.state_visits[state] / total_visits;
            if share == 0.0 { continue; }
            let outs = (state / 8) as u32;
            let mask = (state & 7) as u32;
            let before = expectancy[state];
            let after = |after_outs: u32, bases: u32| if after_outs >= 3 { 0.0 } else { expectancy[(after_outs * 8 + bases) as usize] };
            let transition = forced_base_transition(mask);
            weights.walk += share * ((transition >> 3) as f64 + after(outs, transition & 7) - before);
            weights.strikeout += share * (after(outs + 1, mask) - before);
            for cls in 0..PHYSICAL_CLASS_COUNT {
                let (class_weights, class_outs) = (&mut weights.classes, &mut weights.class_outs);
                visit_contact_class(environment, &variant, &mut replay, state, f64::INFINITY, cls, share, &mut |p, runs, after_outs, bases, ended| {
                    class_weights[cls] += p * (runs as f64 + if ended { 0.0 } else { after(after_outs, bases) } - before);
                    class_outs[cls] += p * (f64::from(after_outs.min(3)) - f64::from(outs));
                });
            }
        }
        let finite = weights.walk.is_finite() && weights.strikeout.is_finite() && weights.classes.iter().chain(&weights.class_outs).all(|value| value.is_finite());
        if !finite { return Err("Event run weights are not finite".into()); }
        Ok(weights)
    }

    /// Season runs saved relative to a neutral defender: the sum of per-component coefficient curves.
    pub fn expected_defensive_runs(&self, position: usize, skills: &DefensiveSkills, neutral_park: &PreparedPark) -> Result<f64, String> {
        let values = [skills.hit_prevention, skills.double_play, skills.outfield_throwing, skills.error_avoidance, skills.catcher_throwing];
        if position >= 8 || values.iter().any(|value| !value.is_finite() || *value < -1.0 || *value > 1.0) { return Err("Invalid defensive skill input".into()); }
        let coefficients = self.coefficients.get_or_init(|| self.compute_coefficients(neutral_park)).as_ref().map_err(Clone::clone)?;
        let mut saved = 0.0;
        for (component, skill) in values.iter().enumerate() {
            if !applies(position, component) || *skill == 0.0 { continue; }
            saved += interpolate(coefficients, (position * COMPONENTS + component) * SKILL_NODES.len(), *skill);
        }
        if !saved.is_finite() { return Err("Defensive reference produced a non-finite value".into()); }
        Ok(saved)
    }

    /// League-weighted lattice classes when one position's reach or arm takes each skill node.
    fn lattice_variant_classes(&self, neutral_park: &PreparedPark) -> Result<(Vec<f64>, Vec<f64>), String> {
        let tables = &self.tables;
        let fit = &self.league_fit;
        let shift = fit.shift_index;
        let mut cell_weights = vec![0.0; EV_COUNT * LAUNCH_COUNT];
        for region in 0..REGION_COUNT {
            let cdf = &tables.cell_cdf[region];
            for (position, cell) in tables.cells[region].iter().enumerate() {
                cell_weights[*cell] = fit.region_weights[region] * (cdf[position] - if position == 0 { 0.0 } else { cdf[position - 1] });
            }
        }
        let nodes = SKILL_NODES.len();
        let mut reach = vec![0.0; 8 * nodes * PHYSICAL_CLASS_COUNT];
        let mut arm = vec![0.0; 8 * nodes * PHYSICAL_CLASS_COUNT];
        let mut candidates = FieldingCandidates::default();
        let mut plan = FieldingPlan::default();
        let mut outcomes = PhysicalOutcomes::default();
        let zeros = [0.0; 8];
        let mut mask = [0u8; 8];
        let mut throwing = [0.0; 8];
        let accumulate = |plan: &FieldingPlan, outcomes: &mut PhysicalOutcomes, output: &mut [f64], offset: usize, weight: f64| {
            fielding_outcomes(plan, 0.5, outcomes);
            let mut fair = 0.0;
            for index in 0..outcomes.count { if outcomes.kind[index] != OUTCOME_FOUL { fair += outcomes.probability[index]; } }
            for index in 0..outcomes.count {
                if outcomes.kind[index] == OUTCOME_FOUL { continue; }
                output[offset + physical_class(outcomes.kind[index], outcomes.fielder[index], outcomes.bases[index])] += weight * outcomes.probability[index] / fair;
            }
        };
        for_each_lattice_trace(neutral_park, &mut |e, l, s, trace, carry_weight| {
            let Some(cell_ev) = e.checked_sub(shift) else { return; };
            if cell_ev >= EV_COUNT { return; }
            let cell_weight = cell_weights[cell_ev * LAUNCH_COUNT + l];
            if cell_weight == 0.0 { return; }
            let spray_cdf = &tables.spray_cdf[SIDE_UNKNOWN * 4 + launch_class(LAUNCH_MIN + (l as f64 + 0.5) * LAUNCH_WIDTH)];
            let weight = carry_weight * cell_weight * (spray_cdf[s] - if s == 0 { 0.0 } else { spray_cdf[s - 1] });
            if weight == 0.0 { return; }
            compute_candidates(trace, &zeros, &mut candidates);
            for position in 0..8 {
                for node in 0..nodes {
                    fill_actual_candidate(trace, position, SKILL_NODES[node], &mut candidates);
                    mask.fill(0);
                    mask[position] = 1;
                    throwing.fill(0.0);
                    build_fielding_plan(trace, &candidates, &mask, &throwing, &mut plan);
                    accumulate(&plan, &mut outcomes, &mut reach, (position * nodes + node) * PHYSICAL_CLASS_COUNT, weight);
                    if position >= 5 {
                        mask.fill(0);
                        throwing[position] = SKILL_NODES[node];
                        build_fielding_plan(trace, &candidates, &mask, &throwing, &mut plan);
                        accumulate(&plan, &mut outcomes, &mut arm, (position * nodes + node) * PHYSICAL_CLASS_COUNT, weight);
                    }
                }
            }
        })?;
        Ok((reach, arm))
    }

    fn compute_coefficients(&self, neutral_park: &PreparedPark) -> Result<Vec<f64>, String> {
        let environment = &self.environment;
        let (reach, arm) = self.lattice_variant_classes(neutral_park)?;
        let nodes = SKILL_NODES.len();
        let mut values = vec![0.0; 8 * COMPONENTS * nodes];
        let mut replay = Replayer::new();
        for position in 0..8 {
            for component in 0..COMPONENTS {
                if !applies(position, component) { continue; }
                for node in 0..nodes {
                    let skill = SKILL_NODES[node];
                    if skill == 0.0 { continue; }
                    let mut variant = neutral_variant(environment, &self.classes);
                    let mut catcher = 0.0;
                    let range = (position * nodes + node) * PHYSICAL_CLASS_COUNT..(position * nodes + node + 1) * PHYSICAL_CLASS_COUNT;
                    match component {
                        HIT_PREVENTION => variant.classes = reach[range].to_vec(),
                        OUTFIELD_THROWING => {
                            variant.classes = arm[range].to_vec();
                            variant.prepared.outfield_throwing[position] = skill;
                            variant.options.outfield_throwing = true;
                        }
                        ERROR_AVOIDANCE => {
                            variant.prepared.error_avoidance[position] = skill;
                            variant.options.error_positions[position] = 1;
                        }
                        DOUBLE_PLAY => {
                            variant.prepared.double_play[position] = skill;
                            variant.options.double_play_positions[position] = 1;
                        }
                        _ => catcher = skill,
                    }
                    let mut saved = 0.0;
                    for state in 0..STATE_COUNT {
                        let visits = self.state_visits[state];
                        if visits == 0.0 { continue; }
                        saved += HALF_INNINGS_PER_SEASON * visits * (self.neutral_cycle_costs[state] - cycle_cost(environment, &self.run_expectancy, &variant, &mut replay, state, catcher));
                    }
                    if !saved.is_finite() { return Err("Defensive reference produced a non-finite value".into()); }
                    values[(position * COMPONENTS + component) * nodes + node] = saved;
                }
            }
        }
        Ok(values)
    }
}

/// Linear run weights for one plate-appearance event: expected runs plus the change in run
/// expectancy, averaged over league state visits with neutral defense in a neutral park.
#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventRunWeights {
    /// BB and HBP force the same transition.
    pub walk: f64,
    pub strikeout: f64,
    pub classes: Vec<f64>,
    /// Expected outs recorded by each contact class, including double plays.
    pub class_outs: Vec<f64>,
}

pub fn target_index(runs_needed: f64) -> usize {
    if !runs_needed.is_finite() || runs_needed > 4.0 { return INFINITY_TARGET; }
    (runs_needed.ceil() - 1.0).max(0.0) as usize
}

/// Components in DefensiveSkills key order.
const COMPONENTS: usize = 5;
const HIT_PREVENTION: usize = 0;
const DOUBLE_PLAY: usize = 1;
const OUTFIELD_THROWING: usize = 2;
const ERROR_AVOIDANCE: usize = 3;

fn applies(position: usize, component: usize) -> bool {
    match component {
        HIT_PREVENTION | ERROR_AVOIDANCE => true,
        DOUBLE_PLAY => (1..=4).contains(&position),
        OUTFIELD_THROWING => position >= 5,
        _ => position == 0,
    }
}

fn interpolate(values: &[f64], offset: usize, skill: f64) -> f64 {
    let mut result = 0.0;
    for node in 0..SKILL_NODES.len() {
        let mut weight = 1.0;
        for other in 0..SKILL_NODES.len() {
            if other != node { weight *= (skill - SKILL_NODES[other]) / (SKILL_NODES[node] - SKILL_NODES[other]); }
        }
        result += weight * values[offset + node];
    }
    result
}
