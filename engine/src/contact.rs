//! Legal resolution of a physical fielding outcome (`src/lib/sim/contact.ts`).
use crate::defense_rules::{advancement_attempt_probability, advancement_out_probability, double_play_participants, double_play_probability, fielding_error_probability};
use crate::fielding::{OUTCOME_AUTOMATIC_DOUBLE, OUTCOME_CAUGHT, OUTCOME_GROUND_OUT, OUTCOME_HIT, OUTCOME_HOME_RUN, OUTCOME_INFIELD_HIT};
use crate::types::{DefensiveSkills, POSITIONS};
use std::collections::HashMap;

/// Legal decision slots; error and double play come from the fielding stream, the rest from advancement.
pub const DECISION_ERROR: usize = 0;
pub const DECISION_DOUBLE_PLAY: usize = 1;
pub const DECISION_THIRD_ATTEMPT: usize = 2;
pub const DECISION_THIRD_OUT: usize = 3;
pub const DECISION_SECOND_ATTEMPT: usize = 4;
pub const DECISION_SECOND_OUT: usize = 5;
pub const DECISION_FIRST_ATTEMPT: usize = 6;
pub const DECISION_FIRST_OUT: usize = 7;
pub const DECISION_COUNT: usize = 8;
const MAX_DECISIONS: usize = 8;

/// Live play compares a packet uniform with each probability. Enumeration replays the same
/// adapter with scripted choices and records each decision's probability.
#[derive(Clone, Default)]
pub struct Decisions {
    pub enumerate: bool,
    pub packet: [f64; DECISION_COUNT],
    script: [u8; MAX_DECISIONS],
    script_length: usize,
    taken: usize,
    probabilities: [f64; MAX_DECISIONS],
    choices: [u8; MAX_DECISIONS],
}

fn decide(decisions: &mut Decisions, slot: usize, probability: f64) -> bool {
    if !decisions.enumerate { return decisions.packet[slot] < probability; }
    let index = decisions.taken;
    decisions.taken += 1;
    assert!(index < MAX_DECISIONS, "Too many legal decisions in one play");
    let choice = index < decisions.script_length && decisions.script[index] == 1;
    decisions.probabilities[index] = probability;
    decisions.choices[index] = choice as u8;
    choice
}

/// Visits every decision path of `run` with its probability; zero-probability branches are skipped.
pub fn enumerate_decisions<R: FnMut(&mut Decisions), V: FnMut(f64)>(decisions: &mut Decisions, run: &mut R, visit: &mut V) {
    fn explore<R: FnMut(&mut Decisions), V: FnMut(f64)>(decisions: &mut Decisions, run: &mut R, visit: &mut V, prefix: [u8; MAX_DECISIONS], length: usize) {
        decisions.enumerate = true;
        decisions.script[..length].copy_from_slice(&prefix[..length]);
        decisions.script_length = length;
        decisions.taken = 0;
        run(decisions);
        let taken = decisions.taken;
        let probabilities = decisions.probabilities;
        let choices = decisions.choices;
        let mut probability = 1.0;
        for index in 0..taken { probability *= if choices[index] != 0 { probabilities[index] } else { 1.0 - probabilities[index] }; }
        if probability > 0.0 { visit(probability); }
        for index in length..taken {
            if probabilities[index] <= 0.0 { continue; }
            let mut prefix_probability = 1.0;
            for earlier in 0..index { prefix_probability *= if choices[earlier] != 0 { probabilities[earlier] } else { 1.0 - probabilities[earlier] }; }
            if prefix_probability <= 0.0 { continue; }
            let mut next = [0u8; MAX_DECISIONS];
            next[..index].copy_from_slice(&choices[..index]);
            next[index] = 1;
            explore(decisions, run, visit, next, index + 1);
        }
    }
    explore(decisions, run, visit, [0; MAX_DECISIONS], 0);
    decisions.enumerate = false;
}

#[derive(Clone, Debug, Default)]
pub struct PreparedDefense {
    pub hitter_by_position: [usize; 8],
    pub hit_prevention: [f64; 8],
    pub double_play: [f64; 8],
    pub outfield_throwing: [f64; 8],
    pub error_avoidance: [f64; 8],
    pub catcher_throwing: [f64; 8],
    pub error_baseline: [f64; 8],
}

/// Zero-skill defenders with the league position error baselines.
pub fn neutral_defense(league_error_rates: &HashMap<String, f64>) -> PreparedDefense {
    let mut prepared = PreparedDefense::default();
    for (position, name) in POSITIONS.iter().enumerate() { prepared.error_baseline[position] = league_error_rates[*name]; }
    prepared
}

/// The fielders' skills at their assigned positions; `skills[p]` belongs to hitter `hitter_by_position[p]`.
pub fn prepared_defense(league_error_rates: &HashMap<String, f64>, hitter_by_position: [usize; 8], skills: [DefensiveSkills; 8]) -> PreparedDefense {
    let mut prepared = neutral_defense(league_error_rates);
    for position in 0..8 {
        prepared.hitter_by_position[position] = hitter_by_position[position];
        prepared.hit_prevention[position] = skills[position].hit_prevention;
        prepared.double_play[position] = skills[position].double_play;
        prepared.outfield_throwing[position] = skills[position].outfield_throwing;
        prepared.error_avoidance[position] = skills[position].error_avoidance;
        prepared.catcher_throwing[position] = skills[position].catcher_throwing;
    }
    prepared
}

#[derive(Clone, Debug, Default)]
pub struct ContactResult {
    pub runners: [i16; 3],
    pub pitchers: [i16; 3],
    pub scored_runners: [i16; 4],
    pub scored_pitchers: [i16; 4],
    pub caught_runners: [i16; 3],
    pub outs_after: u32,
    pub runs: u32,
    pub caught_count: usize,
    pub score_count: usize,
    pub credited_bases: u32,
    pub fielder: isize,
    pub thrower: isize,
    pub error: bool,
    pub double_play: bool,
    pub sacrifice_fly: bool,
    pub ended: bool,
    pub winning_advance: u32,
}

/// Per-position error and double-play enablement plus the outfield-arm switch.
#[derive(Clone, Debug, Default)]
pub struct ContactOptions {
    pub error_positions: [u8; 8],
    pub double_play_positions: [u8; 8],
    pub outfield_throwing: bool,
}

fn reset_result(result: &mut ContactResult, runners: &[i16; 3], pitchers: &[i16; 3], outs: u32, credited: u32) {
    result.runners = *runners;
    result.pitchers = *pitchers;
    result.scored_runners = [-1; 4];
    result.scored_pitchers = [-1; 4];
    result.caught_runners = [-1; 3];
    result.outs_after = outs;
    result.runs = 0;
    result.score_count = 0;
    result.caught_count = 0;
    result.credited_bases = credited;
    result.fielder = -1;
    result.thrower = -1;
    result.error = false;
    result.double_play = false;
    result.sacrifice_fly = false;
    result.ended = false;
    result.winning_advance = 0;
}

fn remove_runner(result: &mut ContactResult, base: usize) {
    result.runners[base] = -1;
    result.pitchers[base] = -1;
}

fn move_runner(result: &mut ContactResult, from: usize, to: usize) {
    result.runners[to] = result.runners[from];
    result.pitchers[to] = result.pitchers[from];
    remove_runner(result, from);
}

/// Scores a runner; a non-home-run walkoff truncates credited bases to the winning advance.
fn score_runner(result: &mut ContactResult, base: usize, advance: u32, offense_runs: f64, target: f64, stop: bool) -> bool {
    result.scored_runners[result.score_count] = result.runners[base];
    result.scored_pitchers[result.score_count] = result.pitchers[base];
    result.score_count += 1;
    result.runs += 1;
    remove_runner(result, base);
    if stop && offense_runs + result.runs as f64 >= target {
        result.ended = true;
        result.winning_advance = advance;
        result.credited_bases = result.credited_bases.min(advance);
    }
    result.ended
}

#[allow(clippy::too_many_arguments)]
fn attempt_advance(result: &mut ContactResult, decisions: &mut Decisions, from: usize, held_base: usize, safe_base: Option<usize>, baseline: f64, arm: f64, attempt_slot: usize, out_slot: usize, offense_runs: f64, target: f64) {
    let runner = result.runners[from];
    if runner < 0 || result.outs_after >= 3 || result.ended { return; }
    if !decide(decisions, attempt_slot, advancement_attempt_probability(baseline, arm)) {
        if held_base != from { move_runner(result, from, held_base); }
        return;
    }
    if decide(decisions, out_slot, advancement_out_probability(arm)) {
        remove_runner(result, from);
        result.outs_after += 1;
        result.caught_runners[result.caught_count] = runner;
        result.caught_count += 1;
        return;
    }
    match safe_base {
        None => { score_runner(result, from, 3 - from as u32, offense_runs, target, true); }
        Some(safe) => move_runner(result, from, safe),
    }
}

fn force_one_base(result: &mut ContactResult, hitter: i16, pitcher: i16, offense_runs: f64, target: f64) {
    if result.runners[0] >= 0 {
        if result.runners[1] >= 0 {
            if result.runners[2] >= 0 && score_runner(result, 2, 1, offense_runs, target, true) { return; }
            move_runner(result, 1, 2);
        }
        move_runner(result, 0, 1);
    }
    result.runners[0] = hitter;
    result.pitchers[0] = pitcher;
}

/// Lead runners move first; trailing runners on singles and doubles may try for an extra base.
#[allow(clippy::too_many_arguments)]
fn resolve_hit(result: &mut ContactResult, decisions: &mut Decisions, bases_taken: i8, hitter: i16, pitcher: i16, speeds: &[f64], arm: f64, offense_runs: f64, target: f64) {
    if bases_taken == 3 {
        for base in (0..3).rev() { if result.runners[base] >= 0 && score_runner(result, base, 3 - base as u32, offense_runs, target, true) { return; } }
        result.runners[2] = hitter;
        result.pitchers[2] = pitcher;
        return;
    }
    if bases_taken == 2 {
        for base in (1..3).rev() { if result.runners[base] >= 0 && score_runner(result, base, 3 - base as u32, offense_runs, target, true) { return; } }
        if result.runners[0] >= 0 {
            let speed = speeds[result.runners[0] as usize];
            attempt_advance(result, decisions, 0, 2, None, 0.35 + 0.40 * speed, arm, DECISION_FIRST_ATTEMPT, DECISION_FIRST_OUT, offense_runs, target);
            if result.outs_after >= 3 || result.ended { return; }
        }
        result.runners[1] = hitter;
        result.pitchers[1] = pitcher;
        return;
    }
    if result.runners[2] >= 0 && score_runner(result, 2, 1, offense_runs, target, true) { return; }
    if result.runners[1] >= 0 {
        let speed = speeds[result.runners[1] as usize];
        attempt_advance(result, decisions, 1, 2, None, 0.45 + 0.40 * speed, arm, DECISION_SECOND_ATTEMPT, DECISION_SECOND_OUT, offense_runs, target);
        if result.outs_after >= 3 || result.ended { return; }
    }
    if result.runners[0] >= 0 {
        if result.runners[2] >= 0 { move_runner(result, 0, 1); } else {
            let speed = speeds[result.runners[0] as usize];
            attempt_advance(result, decisions, 0, 1, Some(2), 0.15 + 0.35 * speed, arm, DECISION_FIRST_ATTEMPT, DECISION_FIRST_OUT, offense_runs, target);
            if result.outs_after >= 3 || result.ended { return; }
        }
    }
    result.runners[0] = hitter;
    result.pitchers[0] = pitcher;
}

fn team_double_play_skill(prepared: &PreparedDefense, fielder: isize, enabled: &[u8; 8], participants: &mut [usize; 3]) -> f64 {
    let count = double_play_participants(fielder, participants);
    let mut skill = 0.0;
    for &position in participants.iter().take(count) {
        if enabled[position] == 0 { continue; }
        let mut weight = 0.0;
        let pivot = if fielder == 1 || fielder == 2 { 4 } else { 2 };
        if position as isize == fielder { weight += 0.4; }
        if position == pivot { weight += 0.4; }
        if position == 1 { weight += 0.2; }
        skill += weight * prepared.double_play[position];
    }
    skill
}

/// Fielded balls: an error puts the batter on first; otherwise the play is an out.
#[allow(clippy::too_many_arguments)]
fn fielding_error(result: &mut ContactResult, decisions: &mut Decisions, prepared: &PreparedDefense, options: &ContactOptions, fielder: usize, hitter: i16, pitcher: i16, offense_runs: f64, target: f64) -> bool {
    let skill = if options.error_positions[fielder] != 0 { prepared.error_avoidance[fielder] } else { 0.0 };
    if !decide(decisions, DECISION_ERROR, fielding_error_probability(prepared.error_baseline[fielder], skill)) { return false; }
    result.error = true;
    force_one_base(result, hitter, pitcher, offense_runs, target);
    true
}

/// One play's inputs for `resolve_contact`.
pub struct Play<'a> {
    pub runners: &'a [i16; 3],
    pub pitchers: &'a [i16; 3],
    pub outs: u32,
    pub kind: u8,
    pub fielder: i8,
    pub bases_taken: i8,
    pub hitter: i16,
    pub pitcher: i16,
    /// Offense speed skills by lineup index.
    pub speeds: &'a [f64],
    pub batter_double_play: f64,
    pub offense_runs: f64,
    pub target: f64,
}

/// Converts one physical fielding outcome into the legal base/out/score transition. Geometry
/// chooses the fielder, retriever, and batter bases; this adapter applies errors, double plays,
/// tag-ups, runner advancement, and walkoff stopping.
pub fn resolve_contact(result: &mut ContactResult, play: &Play, prepared: &PreparedDefense, options: &ContactOptions, decisions: &mut Decisions, participants: &mut [usize; 3]) -> Result<(), String> {
    let Play { runners, pitchers, outs, kind, fielder, bases_taken, hitter, pitcher, speeds, batter_double_play, offense_runs, target } = *play;
    let credited = if kind == OUTCOME_HOME_RUN { 4 } else if kind == OUTCOME_HIT || kind == OUTCOME_INFIELD_HIT || kind == OUTCOME_AUTOMATIC_DOUBLE { bases_taken as u32 } else { 0 };
    reset_result(result, runners, pitchers, outs, credited);
    result.fielder = fielder as isize;
    if kind == OUTCOME_HOME_RUN {
        for base in (0..3).rev() { if result.runners[base] >= 0 { score_runner(result, base, 3 - base as u32, offense_runs, target, false); } }
        result.scored_runners[result.score_count] = hitter;
        result.scored_pitchers[result.score_count] = pitcher;
        result.score_count += 1;
        result.runs += 1;
        if offense_runs + result.runs as f64 >= target { result.ended = true; result.winning_advance = 4; }
        return Ok(());
    }
    if kind == OUTCOME_AUTOMATIC_DOUBLE {
        for base in (1..3).rev() { if result.runners[base] >= 0 && score_runner(result, base, 2, offense_runs, target, true) { return Ok(()); } }
        if result.runners[0] >= 0 { move_runner(result, 0, 2); }
        result.runners[1] = hitter;
        result.pitchers[1] = pitcher;
        return Ok(());
    }
    if kind == OUTCOME_HIT {
        result.thrower = fielder as isize;
        let arm = if options.outfield_throwing && fielder >= 5 { prepared.outfield_throwing[fielder as usize] } else { 0.0 };
        resolve_hit(result, decisions, bases_taken, hitter, pitcher, speeds, arm, offense_runs, target);
        return Ok(());
    }
    if kind == OUTCOME_INFIELD_HIT {
        force_one_base(result, hitter, pitcher, offense_runs, target);
        return Ok(());
    }
    if kind != OUTCOME_CAUGHT && kind != OUTCOME_GROUND_OUT { return Err("Invalid physical contact outcome".into()); }
    let fielder_index = fielder as usize;
    if fielding_error(result, decisions, prepared, options, fielder_index, hitter, pitcher, offense_runs, target) { return Ok(()); }
    if kind == OUTCOME_GROUND_OUT && (1..=4).contains(&fielder) && result.runners[0] >= 0 && outs < 2 {
        let team_skill = team_double_play_skill(prepared, fielder as isize, &options.double_play_positions, participants);
        if decide(decisions, DECISION_DOUBLE_PLAY, double_play_probability(batter_double_play, team_skill)) {
            result.double_play = true;
            remove_runner(result, 0);
            result.outs_after += 2;
            return Ok(());
        }
    }
    result.outs_after += 1;
    if kind == OUTCOME_CAUGHT && fielder >= 5 && result.runners[2] >= 0 && outs < 2 {
        result.thrower = fielder as isize;
        let arm = if options.outfield_throwing { prepared.outfield_throwing[fielder_index] } else { 0.0 };
        if decide(decisions, DECISION_THIRD_ATTEMPT, advancement_attempt_probability(0.625, arm)) {
            let runner = result.runners[2];
            if decide(decisions, DECISION_THIRD_OUT, advancement_out_probability(arm)) {
                remove_runner(result, 2);
                result.outs_after += 1;
                result.caught_runners[result.caught_count] = runner;
                result.caught_count += 1;
            } else {
                result.sacrifice_fly = true;
                score_runner(result, 2, 1, offense_runs, target, true);
            }
        }
    }
    Ok(())
}
