//! Fielder reach, the fielding plan, and physical outcome probabilities (`src/lib/sim/fielding.ts`).
use crate::flight::{FlightTrace, TRACE_AUTOMATIC_DOUBLE, TRACE_DEAD_BALL, TRACE_HOME_RUN};
use crate::math::{self, planar_distance};

/// Fixed starting coordinates (meters) in POSITIONS order: C, 1B, 2B, 3B, SS, LF, CF, RF.
pub const DEFENDER_START: [[f64; 2]; 8] = [[0.0, -1.5], [23.0, 26.0], [13.0, 38.0], [-23.0, 26.0], [-13.0, 38.0], [-55.0, 75.0], [0.0, 95.0], [55.0, 75.0]];
const SPEED_MPS: [f64; 8] = [5.35, 5.35, 5.35, 5.35, 5.35, 8.08, 8.08, 8.08];
const REACTION_S: [f64; 8] = [0.06, 0.06, 0.06, 0.06, 0.06, 1.09, 1.09, 1.09];
const REACH_SCALE_S: f64 = 0.44;
const CATCH_HEIGHT_M: f64 = 3.0;
const INFIELD_ATTEMPT_RADIUS_M: f64 = 40.05;
const SURE_REACH: f64 = 0.95;
const TRANSFER_S: [f64; 8] = [0.87, 0.87, 0.87, 0.87, 0.87, 1.51, 1.51, 1.51];
const THROW_MPS: f64 = 30.26;
const ADVANCE_SCALE_S: f64 = 0.74;
pub const RUNNER_START_S: f64 = 0.25;
pub const BASEPATH_M: f64 = 27.432;
const INFIELDERS: usize = 5;

fn bases() -> [[f64; 2]; 3] {
    let half = BASEPATH_M / std::f64::consts::SQRT_2;
    [[half, half], [0.0, 2.0 * half], [-half, half]]
}

fn defender_speed(position: usize, hit_prevention: f64) -> f64 { SPEED_MPS[position] * (1.0 + 0.15 * hit_prevention) }
fn defender_reaction(position: usize, hit_prevention: f64) -> f64 { math::max(0.0, REACTION_S[position] - 0.08 * hit_prevention) }
/// Outfielders use outfield throwing; infield and catcher throws on batted balls use the base speed.
fn throw_speed(position: usize, outfield_throwing: f64) -> f64 { THROW_MPS * (1.0 + 0.10 * (if position >= 5 { outfield_throwing } else { 0.0 })) }
/// Effective basepath speed (m/s); average runners (0.5) keep the 7 m/s used in the fielding fit.
fn runner_speed(speed: f64) -> f64 { 6.5 + speed }
fn runner_arrival(speed: f64, bases: f64) -> f64 { RUNNER_START_S + bases * BASEPATH_M / runner_speed(speed) }
fn reach(ball_time: f64, arrival: f64) -> f64 { 1.0 / (1.0 + math::exp(-(ball_time - arrival) / REACH_SCALE_S)) }
fn advance(runner: f64, thrown: f64) -> f64 { 1.0 / (1.0 + math::exp(-(thrown - runner) / ADVANCE_SCALE_S)) }

/// Per position and skill setting (slot p = neutral, slot 8 + p = actual): best airborne point,
/// best ground point, and retrieval of a ball that gets past the infield.
#[derive(Clone, Default)]
pub struct FieldingCandidates {
    air_index: [isize; 16],
    air_probability: [f64; 16],
    ground_index: [isize; 16],
    ground_probability: [f64; 16],
    ground_pickup: [f64; 16],
    retrieval_time: [f64; 16],
    retrieval_x: [f64; 16],
    retrieval_y: [f64; 16],
}

/// `reach` is non-decreasing in `ball_time - arrival`, so only margin improvements evaluate it.
fn fill_candidate(trace: &FlightTrace, position: usize, hit_prevention: f64, c: &mut FieldingCandidates, slot: usize) {
    let speed = defender_speed(position, hit_prevention);
    let reaction = defender_reaction(position, hit_prevention);
    let [sx, sy] = DEFENDER_START[position];
    let airborne_end = if trace.landing < 0 { trace.count } else { trace.landing as usize };
    let (mut air_index, mut air_probability, mut air_margin) = (-1isize, 0.0, f64::NEG_INFINITY);
    for index in 1..airborne_end {
        let time = trace.t[index];
        if time < reaction || trace.z[index] > CATCH_HEIGHT_M { continue; }
        let arrival = reaction + planar_distance(trace.x[index] - sx, trace.y[index] - sy) / speed;
        if time - arrival <= air_margin { continue; }
        let probability = reach(time, arrival);
        if probability > air_probability { air_probability = probability; air_index = index as isize; air_margin = time - arrival; }
    }
    c.air_index[slot] = air_index;
    c.air_probability[slot] = air_probability;
    let (mut ground_index, mut ground_probability, mut ground_pickup, mut ground_margin) = (-1isize, 0.0, 0.0, f64::NEG_INFINITY);
    let (mut retrieval_time, mut retrieval_x, mut retrieval_y) = (f64::INFINITY, 0.0, 0.0);
    if trace.landing >= 0 {
        for index in trace.landing as usize..trace.count {
            let time = trace.t[index];
            let arrival = reaction + planar_distance(trace.x[index] - sx, trace.y[index] - sy) / speed;
            if position < INFIELDERS && time >= reaction && time - arrival > ground_margin && ground_probability < SURE_REACH && planar_distance(trace.x[index], trace.y[index]) <= INFIELD_ATTEMPT_RADIUS_M {
                let probability = reach(time, arrival);
                if probability > ground_probability { ground_probability = probability; ground_index = index as isize; ground_pickup = math::max(time, arrival); ground_margin = time - arrival; }
            }
            if retrieval_time == f64::INFINITY && arrival <= time { retrieval_time = time; retrieval_x = trace.x[index]; retrieval_y = trace.y[index]; }
            // Later points can change nothing once retrieval is set and no ground attempt can improve.
            if retrieval_time != f64::INFINITY && (position >= INFIELDERS || ground_probability >= SURE_REACH) { break; }
        }
        if retrieval_time == f64::INFINITY {
            let last = trace.count - 1;
            retrieval_x = trace.x[last];
            retrieval_y = trace.y[last];
            retrieval_time = math::max(trace.t[last], reaction + planar_distance(retrieval_x - sx, retrieval_y - sy) / speed);
        }
    }
    c.ground_index[slot] = ground_index;
    c.ground_probability[slot] = ground_probability;
    c.ground_pickup[slot] = ground_pickup;
    c.retrieval_time[slot] = retrieval_time;
    c.retrieval_x[slot] = retrieval_x;
    c.retrieval_y[slot] = retrieval_y;
}

fn copy_slot(c: &mut FieldingCandidates, from: usize, to: usize) {
    c.air_index[to] = c.air_index[from];
    c.air_probability[to] = c.air_probability[from];
    c.ground_index[to] = c.ground_index[from];
    c.ground_probability[to] = c.ground_probability[from];
    c.ground_pickup[to] = c.ground_pickup[from];
    c.retrieval_time[to] = c.retrieval_time[from];
    c.retrieval_x[to] = c.retrieval_x[from];
    c.retrieval_y[to] = c.retrieval_y[from];
}

/// Slot `position` holds the neutral defender and slot `8 + position` the actual defender.
pub fn compute_candidates(trace: &FlightTrace, hit_prevention: &[f64; 8], candidates: &mut FieldingCandidates) {
    for position in 0..8 {
        fill_candidate(trace, position, 0.0, candidates, position);
        if hit_prevention[position] == 0.0 { copy_slot(candidates, position, 8 + position); } else { fill_candidate(trace, position, hit_prevention[position], candidates, 8 + position); }
    }
}

/// Refills only `position`'s actual slot for a different reach skill.
pub fn fill_actual_candidate(trace: &FlightTrace, position: usize, hit_prevention: f64, candidates: &mut FieldingCandidates) {
    if hit_prevention == 0.0 { copy_slot(candidates, position, 8 + position); } else { fill_candidate(trace, position, hit_prevention, candidates, 8 + position); }
}

pub const OUTCOME_CAUGHT: u8 = 0;
pub const OUTCOME_GROUND_OUT: u8 = 1;
pub const OUTCOME_INFIELD_HIT: u8 = 2;
pub const OUTCOME_HIT: u8 = 3;
pub const OUTCOME_HOME_RUN: u8 = 4;
pub const OUTCOME_AUTOMATIC_DOUBLE: u8 = 5;
pub const OUTCOME_FOUL: u8 = 6;

/// The runner-speed-independent part of fielding: one catch attempt by the best airborne
/// candidate, sequential infield ground attempts in ball-time order, then retrieval.
#[derive(Clone, Default)]
pub struct FieldingPlan {
    terminal: u8,
    fair: bool,
    air_fielder: isize,
    air_probability: f64,
    ground_count: usize,
    ground_fielder: [i8; INFIELDERS],
    ground_probability: [f64; INFIELDERS],
    ground_throw: [f64; INFIELDERS],
    ground_times: [f64; INFIELDERS],
    pub retriever: isize,
    /// Throw arrival at first, second, and third after retrieval.
    retrieval_throw: [f64; 3],
}

/// `reach_enabled[p]` selects position p's actual range; `outfield_throwing` holds the arm skills in force.
pub fn build_fielding_plan(trace: &FlightTrace, c: &FieldingCandidates, reach_enabled: &[u8; 8], outfield_throwing: &[f64; 8], plan: &mut FieldingPlan) {
    plan.terminal = trace.end;
    plan.fair = trace.fair;
    plan.air_fielder = -1;
    plan.air_probability = 0.0;
    for position in 0..8 {
        let slot = if reach_enabled[position] != 0 { 8 + position } else { position };
        if c.air_index[slot] >= 0 && c.air_probability[slot] > plan.air_probability {
            plan.air_probability = c.air_probability[slot];
            plan.air_fielder = position as isize;
        }
    }
    plan.ground_count = 0;
    plan.retriever = -1;
    if trace.landing < 0 { return; }
    let base_coordinates = bases();
    for position in 0..INFIELDERS {
        let slot = if reach_enabled[position] != 0 { 8 + position } else { position };
        let index = c.ground_index[slot];
        if index < 0 || c.ground_probability[slot] <= 0.0 { continue; }
        let index = index as usize;
        let time = trace.t[index];
        let mut insert = plan.ground_count;
        plan.ground_count += 1;
        while insert > 0 && plan.ground_times[insert - 1] > time {
            plan.ground_times[insert] = plan.ground_times[insert - 1];
            plan.ground_fielder[insert] = plan.ground_fielder[insert - 1];
            plan.ground_probability[insert] = plan.ground_probability[insert - 1];
            plan.ground_throw[insert] = plan.ground_throw[insert - 1];
            insert -= 1;
        }
        plan.ground_times[insert] = time;
        plan.ground_fielder[insert] = position as i8;
        plan.ground_probability[insert] = c.ground_probability[slot];
        plan.ground_throw[insert] = c.ground_pickup[slot] + TRANSFER_S[position]
            + planar_distance(trace.x[index] - base_coordinates[0][0], trace.y[index] - base_coordinates[0][1]) / throw_speed(position, outfield_throwing[position]);
    }
    let mut best_time = f64::INFINITY;
    for position in 0..8 {
        let slot = if reach_enabled[position] != 0 { 8 + position } else { position };
        if c.retrieval_time[slot] < best_time { best_time = c.retrieval_time[slot]; plan.retriever = position as isize; }
    }
    let retriever = plan.retriever as usize;
    let slot = if reach_enabled[retriever] != 0 { 8 + retriever } else { retriever };
    let speed = throw_speed(retriever, outfield_throwing[retriever]);
    for base in 0..3 {
        plan.retrieval_throw[base] = best_time + TRANSFER_S[retriever]
            + planar_distance(c.retrieval_x[slot] - base_coordinates[base][0], c.retrieval_y[slot] - base_coordinates[base][1]) / speed;
    }
}

/// Mutually exclusive physical outcomes in sampling order.
#[derive(Clone, Default)]
pub struct PhysicalOutcomes {
    pub count: usize,
    pub kind: [u8; 12],
    pub fielder: [i8; 12],
    pub bases: [i8; 12],
    pub probability: [f64; 12],
}

fn add(outcomes: &mut PhysicalOutcomes, kind: u8, fielder: i8, bases: i8, probability: f64) {
    if probability <= 0.0 { return; }
    let index = outcomes.count;
    outcomes.count += 1;
    outcomes.kind[index] = kind;
    outcomes.fielder[index] = fielder;
    outcomes.bases[index] = bases;
    outcomes.probability[index] = probability;
}

/// Expands a plan into outcome probabilities for a batter with the given speed skill.
pub fn fielding_outcomes(plan: &FieldingPlan, batter_speed: f64, outcomes: &mut PhysicalOutcomes) {
    outcomes.count = 0;
    let mut remaining = 1.0;
    if plan.air_fielder >= 0 {
        add(outcomes, OUTCOME_CAUGHT, plan.air_fielder as i8, 0, plan.air_probability);
        remaining -= plan.air_probability;
    }
    if plan.terminal == TRACE_HOME_RUN { return add(outcomes, OUTCOME_HOME_RUN, -1, 4, remaining); }
    if plan.terminal == TRACE_AUTOMATIC_DOUBLE { return add(outcomes, OUTCOME_AUTOMATIC_DOUBLE, -1, 2, remaining); }
    if plan.terminal == TRACE_DEAD_BALL || !plan.fair { return add(outcomes, OUTCOME_FOUL, -1, 0, remaining); }
    let to_first = runner_arrival(batter_speed, 1.0);
    for index in 0..plan.ground_count {
        let probability = remaining * plan.ground_probability[index];
        let out = plan.ground_throw[index] < to_first;
        add(outcomes, if out { OUTCOME_GROUND_OUT } else { OUTCOME_INFIELD_HIT }, plan.ground_fielder[index], if out { 0 } else { 1 }, probability);
        remaining -= probability;
    }
    // P(reach base b) is logistic in the throw margin; reaching third requires reaching second.
    let second = advance(runner_arrival(batter_speed, 2.0), plan.retrieval_throw[1]);
    let third = math::min(second, advance(runner_arrival(batter_speed, 3.0), plan.retrieval_throw[2]));
    let retriever = plan.retriever as i8;
    add(outcomes, OUTCOME_HIT, retriever, 1, remaining * (1.0 - second));
    add(outcomes, OUTCOME_HIT, retriever, 2, remaining * (second - third));
    add(outcomes, OUTCOME_HIT, retriever, 3, remaining * third);
}

/// The shared fielding uniform walks the outcomes in order.
pub fn select_outcome(outcomes: &PhysicalOutcomes, uniform: f64) -> Result<usize, String> {
    if !(uniform >= 0.0 && uniform < 1.0) || outcomes.count == 0 { return Err("Invalid fielding selection".into()); }
    let mut cumulative = 0.0;
    for index in 0..outcomes.count {
        cumulative += outcomes.probability[index];
        if uniform < cumulative { return Ok(index); }
    }
    Ok(outcomes.count - 1)
}

/// Dense index for aggregated physical outcomes: caught (8 fielders), ground out (5),
/// infield hit (5), hit by retriever and bases (8 x 3), home run, automatic double.
pub const PHYSICAL_CLASS_COUNT: usize = 44;
pub fn physical_class(kind: u8, fielder: i8, bases: i8) -> usize {
    match kind {
        OUTCOME_CAUGHT => fielder as usize,
        OUTCOME_GROUND_OUT => 8 + fielder as usize,
        OUTCOME_INFIELD_HIT => 13 + fielder as usize,
        OUTCOME_HIT => 18 + fielder as usize * 3 + bases as usize - 1,
        OUTCOME_HOME_RUN => 42,
        OUTCOME_AUTOMATIC_DOUBLE => 43,
        _ => panic!("Foul outcomes have no physical class"),
    }
}

pub fn class_kind(index: usize) -> (u8, i8, i8) {
    match index {
        0..=7 => (OUTCOME_CAUGHT, index as i8, 0),
        8..=12 => (OUTCOME_GROUND_OUT, (index - 8) as i8, 0),
        13..=17 => (OUTCOME_INFIELD_HIT, (index - 13) as i8, 1),
        18..=41 => (OUTCOME_HIT, ((index - 18) / 3) as i8, ((index - 18) % 3 + 1) as i8),
        42 => (OUTCOME_HOME_RUN, -1, 4),
        43 => (OUTCOME_AUTOMATIC_DOUBLE, -1, 2),
        _ => panic!("Invalid physical class"),
    }
}
