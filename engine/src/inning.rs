//! One half inning: steals, plate appearances, contact, and defensive credit (`src/lib/sim/inning.ts`).
use crate::advancement::Bases;
use crate::contact::{resolve_contact, ContactOptions, ContactResult, Decisions, Play, PreparedDefense, DECISION_DOUBLE_PLAY, DECISION_ERROR, DECISION_FIRST_ATTEMPT, DECISION_FIRST_OUT, DECISION_SECOND_ATTEMPT, DECISION_SECOND_OUT, DECISION_THIRD_ATTEMPT, DECISION_THIRD_OUT};
use crate::contact_profile::{sample_contact, sample_non_contact, ContactDraw, PreparedMatchups, ShapeTables, CONTACT_UNIFORMS};
use crate::defense_rules::{double_play_participants, steal_success_probability};
use crate::fielding::{build_fielding_plan, compute_candidates, fielding_outcomes, select_outcome, FieldingCandidates, FieldingPlan, PhysicalOutcomes, OUTCOME_AUTOMATIC_DOUBLE, OUTCOME_CAUGHT, OUTCOME_FOUL, OUTCOME_GROUND_OUT};
use crate::flight::{trace_flight, ContactSample, FlightTrace, PreparedPark, TRACE_DEAD_BALL};
use crate::random::{GameStreams, Mulberry32};
use crate::team::TeamInput;
use crate::types::{DefenseComponent, MomentContact, MomentFielding, MomentOutcome, MomentPlay, MomentRunner, TeamBox, POSITIONS};
use crate::value::RunValueModel;
use crate::workload::Workload;

/// Foul and dead balls resample contact for the same batter and pitcher at most this often.
pub const MAX_CONTACT_RETRIES: usize = 100;

struct ContactObservation<'a> {
    draw: &'a ContactDraw,
    fair: bool,
    kind: u8,
    fielder: Option<(&'a str, &'a str, &'static str)>,
}

/// One play as seen by the win-expectancy observer.
pub struct InningEvent<'a> {
    pub outs_before: u32,
    pub outs_after: u32,
    pub bases_before: u32,
    pub bases_after: u32,
    pub offense_runs_before: i32,
    pub defense_runs_before: i32,
    pub offense_runs_after: i32,
    pub defense_runs_after: i32,
    pub batter_name: &'a str,
    pub batter_season_id: &'a str,
    pub pitcher_name: &'a str,
    pub pitcher_season_id: &'a str,
    pub outcome: MomentOutcome,
    pub runs_scored: i32,
    contact: Option<ContactObservation<'a>>,
    runners: [Option<(&'a str, &'a str, u32, u32)>; 3],
}

impl InningEvent<'_> {
    /// Allocate names only when this event becomes a highlight or lowlight.
    pub fn moment_play(&self) -> MomentPlay {
        MomentPlay {
            outs_after: self.outs_after,
            contact: self.contact.as_ref().map(|contact| {
                let ContactObservation { draw, fair, kind, fielder } = *contact;
                MomentContact {
                    exit_velocity_mph: draw.speed_mph, launch_angle_deg: draw.launch_deg,
                    spray_angle_deg: draw.spray_deg, fair,
                    fielding: match kind { OUTCOME_CAUGHT => MomentFielding::Air, OUTCOME_GROUND_OUT => MomentFielding::Ground, _ => MomentFielding::Hit },
                    automatic_double: kind == OUTCOME_AUTOMATIC_DOUBLE,
                    fielder_name: fielder.map(|(name, _, _)| name.to_string()),
                    fielder_season_id: fielder.map(|(_, id, _)| id.to_string()),
                    fielder_position: fielder.map(|(_, _, position)| position.to_string()),
                }
            }),
            runners: self.runners.iter().flatten().map(|(name, id, from, to)| MomentRunner { name: name.to_string(), season_id: id.to_string(), from: *from, to: *to }).collect(),
        }
    }
}

/// Immutable inputs shared by every half inning of a game.
pub struct Shared<'a> {
    pub values: &'a RunValueModel,
    pub park: &'a PreparedPark,
    pub tables: &'a ShapeTables,
    pub max_pa: usize,
}

/// One side's per-game batting state and reusable scratch buffers.
pub struct InningContext<'a> {
    pub matchups: &'a PreparedMatchups,
    pub prepared: PreparedDefense,
    /// Offense speed skills by lineup index.
    speeds: Vec<f64>,
    next: usize,
    bases: Bases,
    trace: FlightTrace,
    candidates: FieldingCandidates,
    plan: FieldingPlan,
    outcomes: PhysicalOutcomes,
    draw: ContactDraw,
    uniforms: [f64; CONTACT_UNIFORMS],
    decisions: Decisions,
    reach_uniform: f64,
    reach: [u8; 8],
    throwing: [f64; 8],
    contact: ContactResult,
    dp_participants: [usize; 3],
    options: ContactOptions,
}

impl<'a> InningContext<'a> {
    pub fn new(offense: &TeamInput, defense: &TeamInput, matchups: &'a PreparedMatchups, prepared: PreparedDefense) -> Result<Self, String> {
        if matchups.batter_count != offense.hitters.len() || matchups.pitcher_count != defense.pitchers.len() { return Err("Invalid game matchup table".into()); }
        Ok(Self {
            matchups, prepared, speeds: offense.hitters.iter().map(|profile| profile.speed).collect(), next: 0, bases: Bases::default(),
            trace: FlightTrace::default(), candidates: FieldingCandidates::default(), plan: FieldingPlan::default(), outcomes: PhysicalOutcomes::default(),
            draw: ContactDraw { carry: 1.0, ..Default::default() }, uniforms: [0.0; CONTACT_UNIFORMS], decisions: Decisions::default(), reach_uniform: 0.0,
            reach: [0; 8], throwing: [0.0; 8], contact: ContactResult::default(), dp_participants: [0; 3], options: ContactOptions::default(),
        })
    }
}

/// The two boxes a half inning writes: the batting club's and the fielding club's.
pub struct Sides<'b> { pub batting: &'b mut TeamBox, pub pitching: &'b mut TeamBox }

fn bases_mask(runners: &[i16; 3]) -> u32 { (runners[0] != -1) as u32 | ((runners[1] != -1) as u32) << 1 | ((runners[2] != -1) as u32) << 2 }

fn add_fielding_workload(context: &InningContext, sides: &mut Sides, outs: u32) {
    if outs == 0 { return; }
    for position in 0..8 { sides.pitching.batting[context.prepared.hitter_by_position[position]].fielding_outs += outs as i32; }
}

fn add_defense(context: &InningContext, sides: &mut Sides, position: usize, component: DefenseComponent, value: f64) {
    if value == 0.0 { return; }
    let line = &mut sides.pitching.batting[context.prepared.hitter_by_position[position]];
    line.defensive_runs += value;
    *line.defensive_components.get_mut(component) += value;
    sides.pitching.defensive_runs += value;
    *sides.pitching.defensive_components.get_mut(component) += value;
}

fn record_pitching_value(sides: &mut Sides, pitcher: usize, offense: f64, defense: f64) -> Result<(), String> {
    let pitching = -offense - defense;
    if !pitching.is_finite() || (offense + pitching + defense).abs() > 1e-10 { return Err("Simulation value conservation failed".into()); }
    sides.pitching.pitching[pitcher].pitching_runs_above_neutral += pitching;
    sides.pitching.pitching_runs_above_neutral += pitching;
    Ok(())
}

/// Per-play inputs that stay fixed across counterfactual fielding passes.
#[derive(Clone, Copy)]
struct PassInput { outs: u32, hitter: usize, pitcher: usize, double_play: f64, runs_before: i32, target: f64 }

/// Fielding plan for the current reach/arm switches, the shared reach uniform, then the legal adapter.
fn resolve_pass(context: &mut InningContext, shared: &Shared, input: PassInput) -> Result<f64, String> {
    build_fielding_plan(&context.trace, &context.candidates, &context.reach, &context.throwing, &mut context.plan);
    fielding_outcomes(&context.plan, context.speeds[input.hitter], &mut context.outcomes);
    let selected = select_outcome(&context.outcomes, context.reach_uniform)?;
    let kind = context.outcomes.kind[selected];
    if kind == OUTCOME_FOUL { return Err("Foul contact reached legal resolution".into()); }
    let play = Play {
        runners: &context.bases.runners, pitchers: &context.bases.pitchers, outs: input.outs, kind,
        fielder: context.outcomes.fielder[selected], bases_taken: context.outcomes.bases[selected],
        hitter: input.hitter as i16, pitcher: input.pitcher as i16, speeds: &context.speeds, batter_double_play: input.double_play,
        offense_runs: f64::from(input.runs_before), target: input.target,
    };
    resolve_contact(&mut context.contact, &play, &context.prepared, &context.options, &mut context.decisions, &mut context.dp_participants)?;
    let result = &context.contact;
    Ok(result.runs as f64 + shared.values.remaining(result.outs_after, bases_mask(&result.runners), result.ended))
}

fn reset_switches(context: &mut InningContext) {
    context.reach.fill(0);
    context.throwing.fill(0.0);
    context.options.error_positions.fill(0);
    context.options.double_play_positions.fill(0);
    context.options.outfield_throwing = false;
}

/// Replays fielding on the same trace and uniforms, enabling skills incrementally in the order
/// hit prevention, errors, double-play participants, outfield throws. The final pass is the
/// actual defense and stays in `context.contact`.
fn resolve_defensive_contact(context: &mut InningContext, shared: &Shared, sides: &mut Sides, input: PassInput) -> Result<f64, String> {
    reset_switches(context);
    let mut previous = resolve_pass(context, shared, input)?;
    let mut defensive_runs = 0.0;
    let mut credit = |context: &mut InningContext, sides: &mut Sides, previous: &mut f64, position: usize, component: DefenseComponent, next: f64| {
        add_defense(context, sides, position, component, *previous - next);
        defensive_runs += *previous - next;
        *previous = next;
    };
    for position in 0..8 {
        context.reach[position] = 1;
        if context.prepared.hit_prevention[position] != 0.0 {
            let next = resolve_pass(context, shared, input)?;
            credit(context, sides, &mut previous, position, DefenseComponent::HitPrevention, next);
        }
    }
    for position in 0..8 {
        context.options.error_positions[position] = 1;
        if context.prepared.error_avoidance[position] != 0.0 {
            let next = resolve_pass(context, shared, input)?;
            credit(context, sides, &mut previous, position, DefenseComponent::ErrorAvoidance, next);
        }
    }
    let fielder = context.contact.fielder;
    let grounded = context.outcomes.kind[select_outcome(&context.outcomes, context.reach_uniform)?] == OUTCOME_GROUND_OUT;
    let mut participants = [0usize; 3];
    let participant_count = if grounded { double_play_participants(fielder, &mut participants) } else { 0 };
    context.dp_participants = participants;
    for &participant in participants.iter().take(participant_count) {
        context.options.double_play_positions[participant] = 1;
        let next = resolve_pass(context, shared, input)?;
        credit(context, sides, &mut previous, participant, DefenseComponent::DoublePlay, next);
    }
    context.throwing = context.prepared.outfield_throwing;
    context.options.outfield_throwing = true;
    let next = resolve_pass(context, shared, input)?;
    if next != previous {
        let position = if context.contact.thrower >= 0 { context.contact.thrower as usize } else { context.plan.retriever as usize };
        credit(context, sides, &mut previous, position, DefenseComponent::OutfieldThrowing, next);
    }
    Ok(defensive_runs)
}

/// Foul-territory catches and dead-ball contact use the actual defense with no counterfactual credit.
fn resolve_foul_catch(context: &mut InningContext, shared: &Shared, input: PassInput) -> Result<(), String> {
    reset_switches(context);
    context.reach.fill(1);
    context.options.error_positions.fill(1);
    context.options.double_play_positions.fill(1);
    context.throwing = context.prepared.outfield_throwing;
    context.options.outfield_throwing = true;
    resolve_pass(context, shared, input)?;
    Ok(())
}

fn uniform(stream: &mut Mulberry32) -> Result<f64, String> {
    let value = stream.next();
    if !(value >= 0.0 && value < 1.0) { return Err("Invalid random sample".into()); }
    Ok(value)
}

/// Samples contact until a fair ball or a caught foul. Returns false only when the attempts are exhausted.
fn sample_fair_contact(context: &mut InningContext, shared: &Shared, pair: usize, hitter: usize, streams: &mut GameStreams) -> Result<bool, String> {
    for _ in 0..MAX_CONTACT_RETRIES {
        for index in 0..CONTACT_UNIFORMS { context.uniforms[index] = uniform(&mut streams.contact)?; }
        sample_contact(context.matchups, shared.tables, pair, &context.uniforms, &mut context.draw);
        context.reach_uniform = uniform(&mut streams.fielding)?;
        context.decisions.packet[DECISION_ERROR] = streams.fielding.next();
        context.decisions.packet[DECISION_DOUBLE_PLAY] = streams.fielding.next();
        for slot in [DECISION_THIRD_ATTEMPT, DECISION_THIRD_OUT, DECISION_SECOND_ATTEMPT, DECISION_SECOND_OUT, DECISION_FIRST_ATTEMPT, DECISION_FIRST_OUT] {
            context.decisions.packet[slot] = streams.advancement.next();
        }
        let sample = ContactSample { speed_mph: context.draw.speed_mph, launch_deg: context.draw.launch_deg, spray_deg: context.draw.spray_deg, carry: context.draw.carry };
        trace_flight(&sample, shared.park, &mut context.trace)?;
        compute_candidates(&context.trace, &context.prepared.hit_prevention, &mut context.candidates);
        context.reach.fill(1);
        context.throwing = context.prepared.outfield_throwing;
        build_fielding_plan(&context.trace, &context.candidates, &context.reach, &context.throwing, &mut context.plan);
        fielding_outcomes(&context.plan, context.speeds[hitter], &mut context.outcomes);
        if context.outcomes.kind[select_outcome(&context.outcomes, context.reach_uniform)?] != OUTCOME_FOUL { return Ok(true); }
    }
    Ok(false)
}

fn commit_contact(context: &mut InningContext, sides: &mut Sides) {
    let result = &context.contact;
    context.bases.runners = result.runners;
    context.bases.pitchers = result.pitchers;
    for index in 0..result.score_count {
        sides.batting.runs += 1;
        sides.batting.batting[result.scored_runners[index] as usize].r += 1;
        sides.pitching.pitching[result.scored_pitchers[index] as usize].r += 1;
    }
    context.bases.ended = result.ended;
    context.bases.winning_advance = result.winning_advance;
}

/// A walk or hit by pitch: forced runners move up one base; a forced run can end a walkoff.
fn force(context: &mut InningContext, sides: &mut Sides, hitter: usize, pitcher: usize) {
    let bases = &mut context.bases;
    if bases.runners[0] != -1 {
        if bases.runners[1] != -1 {
            if bases.runners[2] != -1 {
                let (runner, responsible) = (bases.runners[2] as usize, bases.pitchers[2] as usize);
                bases.runners[2] = -1;
                bases.pitchers[2] = -1;
                sides.batting.runs += 1;
                sides.batting.batting[runner].r += 1;
                sides.pitching.pitching[responsible].r += 1;
                if f64::from(sides.batting.runs) >= bases.target {
                    bases.ended = true;
                    bases.winning_advance = 1;
                    return;
                }
            }
            bases.runners[2] = bases.runners[1];
            bases.pitchers[2] = bases.pitchers[1];
            bases.runners[1] = -1;
            bases.pitchers[1] = -1;
        }
        bases.runners[1] = bases.runners[0];
        bases.pitchers[1] = bases.pitchers[0];
        bases.runners[0] = -1;
        bases.pitchers[0] = -1;
    }
    bases.runners[0] = hitter as i16;
    bases.pitchers[0] = pitcher as i16;
}

fn record_steal(context: &mut InningContext, shared: &Shared, sides: &mut Sides, offense: &TeamInput, mut outs: u32, runner_index: usize, pitcher_index: usize, success_uniform: f64) -> Result<u32, String> {
    let bases_before = bases_mask(&context.bases.runners);
    let catcher_skill = context.prepared.catcher_throwing[0];
    let runner_success = offense.hitters[runner_index].steal_success;
    let neutral_success = success_uniform < steal_success_probability(runner_success, 0.0);
    let actual_success = success_uniform < steal_success_probability(runner_success, catcher_skill);
    let neutral_outs = outs + if neutral_success { 0 } else { 1 };
    let neutral_bases = if neutral_success { (bases_before & !1) | 2 } else { bases_before & !1 };
    if actual_success {
        context.bases.runners[1] = runner_index as i16;
        context.bases.pitchers[1] = context.bases.pitchers[0];
        sides.batting.batting[runner_index].sb += 1;
    } else {
        sides.batting.batting[runner_index].cs += 1;
        sides.pitching.pitching[pitcher_index].outs += 1;
        outs += 1;
    }
    context.bases.runners[0] = -1;
    context.bases.pitchers[0] = -1;
    let actual_bases = bases_mask(&context.bases.runners);
    let neutral_value = shared.values.remaining(neutral_outs, neutral_bases, false);
    let actual_value = shared.values.remaining(outs, actual_bases, false);
    let defensive_runs = neutral_value - actual_value;
    add_defense(context, sides, 0, DefenseComponent::CatcherThrowing, defensive_runs);
    let offensive_runs = shared.values.centered_steal(outs - if actual_success { 0 } else { 1 }, bases_before, outs, actual_bases);
    sides.batting.batting[runner_index].steal_runs += offensive_runs;
    sides.batting.steal_runs += offensive_runs;
    record_pitching_value(sides, pitcher_index, offensive_runs, defensive_runs)?;
    if !actual_success { add_fielding_workload(context, sides, 1); }
    Ok(outs)
}

/// Plays one half inning; `target` is the run total that ends a walkoff (infinity otherwise).
#[allow(clippy::too_many_arguments)]
pub fn play_half(context: &mut InningContext, shared: &Shared, offense: &TeamInput, defense: &TeamInput, sides: &mut Sides, workload: &mut Workload, target: f64, streams: &mut GameStreams, observer: &mut Option<&mut dyn FnMut(&InningEvent)>) -> Result<(), String> {
    context.bases.runners = [-1; 3];
    context.bases.pitchers = [-1; 3];
    context.bases.target = target;
    context.bases.ended = false;
    context.bases.winning_advance = 0;
    let mut outs = 0u32;
    let mut appearances = 0usize;
    macro_rules! observe {
        ($outs_before:expr, $bases_before:expr, $runs_before:expr, $batter:expr, $pitcher:expr, $outcome:expr, $before:expr, $runner_runs:expr, $has_contact:expr) => {
            if let Some(observer) = observer.as_mut() {
                let before = $before;
                let runner_runs = $runner_runs;
                let runners = std::array::from_fn(|base| {
                    let runner = before[base];
                    if runner < 0 { return None; }
                    let index = runner as usize;
                    let to = if sides.batting.batting[index].r > runner_runs[base] { 4 }
                        else { context.bases.runners.iter().position(|&id| id == runner).map_or(0, |base| base as u32 + 1) };
                    let from = base as u32 + 1;
                    (to != from).then_some((offense.hitters[index].display_name.as_str(), offense.hitters[index].season_id.as_str(), from, to))
                });
                let contact = if $has_contact {
                    let selected = select_outcome(&context.outcomes, context.reach_uniform)?;
                    let position = context.contact.fielder;
                    let fielder = (position >= 0).then(|| {
                        let position = position as usize;
                        let player = defense.hitters[context.prepared.hitter_by_position[position]];
                        (player.display_name.as_str(), player.season_id.as_str(), POSITIONS[position])
                    });
                    Some(ContactObservation { draw: &context.draw, fair: context.trace.fair, kind: context.outcomes.kind[selected], fielder })
                } else { None };
                observer(&InningEvent {
                    outs_before: $outs_before, outs_after: outs, bases_before: $bases_before, bases_after: bases_mask(&context.bases.runners),
                    offense_runs_before: $runs_before, defense_runs_before: sides.pitching.runs,
                    offense_runs_after: sides.batting.runs, defense_runs_after: sides.pitching.runs,
                    batter_name: &$batter.display_name, batter_season_id: &$batter.season_id,
                    pitcher_name: &$pitcher.display_name, pitcher_season_id: &$pitcher.season_id,
                    outcome: $outcome, runs_scored: sides.batting.runs - $runs_before, contact, runners,
                });
            }
        };
    }
    while outs < 3 && !context.bases.ended {
        workload.before_plate_appearance(defense, &sides.pitching.pitching, sides.pitching.runs - sides.batting.runs, context.bases.runners[1] != -1 || context.bases.runners[2] != -1);
        let steal_pitcher_index = workload.current;
        sides.pitching.pitching[steal_pitcher_index].appearances = 1;
        if context.bases.runners[0] != -1 && context.bases.runners[1] == -1 {
            let runner_index = context.bases.runners[0] as usize;
            let runner = offense.hitters[runner_index];
            if streams.advancement.next() < runner.steal_attempt {
                let outs_before = outs;
                let bases_before = bases_mask(&context.bases.runners);
                let runs_before = sides.batting.runs;
                let runners_before = context.bases.runners;
                let runner_runs = runners_before.map(|id| if id >= 0 { sides.batting.batting[id as usize].r } else { 0 });
                let success_uniform = streams.advancement.next();
                let steal_outs = record_steal(context, shared, sides, offense, outs, runner_index, steal_pitcher_index, success_uniform)?;
                let outcome = if steal_outs == outs_before { MomentOutcome::StolenBase } else { MomentOutcome::CaughtStealing };
                outs = steal_outs;
                let pitcher = defense.pitchers[steal_pitcher_index];
                observe!(outs_before, bases_before, runs_before, runner, pitcher, outcome, runners_before, runner_runs, false);
                if outs == 3 { break; }
                workload.before_plate_appearance(defense, &sides.pitching.pitching, sides.pitching.runs - sides.batting.runs, context.bases.runners[1] != -1 || context.bases.runners[2] != -1);
            }
        }
        appearances += 1;
        if appearances > shared.max_pa { return Err(format!("Simulation exceeded {} plate appearances in a half inning", shared.max_pa)); }
        let active_index = workload.current;
        let active_profile = defense.pitchers[active_index];
        sides.pitching.pitching[active_index].appearances = 1;
        sides.pitching.pitching[active_index].bf += 1;
        let hitter_index = context.next;
        let profile = offense.hitters[hitter_index];
        context.next = (context.next + 1) % 9;
        let outs_before = outs;
        let bases_before = bases_mask(&context.bases.runners);
        let runners_before = context.bases.runners;
        let runner_runs = runners_before.map(|id| if id >= 0 { sides.batting.batting[id as usize].r } else { 0 });
        let pair = hitter_index * defense.pitchers.len() + active_index;
        let pa_uniform = uniform(&mut streams.pa)?;
        let event = sample_non_contact(context.matchups, pair, pa_uniform);
        sides.batting.batting[hitter_index].pa += 1;
        let runs_before = sides.batting.runs;
        let runs_needed = if target == f64::INFINITY { f64::INFINITY } else { target - f64::from(runs_before) };
        let outcome;
        let mut defensive_runs = 0.0;
        if event == 0 || event == 1 {
            if event == 0 {
                sides.batting.batting[hitter_index].bb += 1;
                sides.pitching.pitching[active_index].bb += 1;
                outcome = MomentOutcome::Walk;
            } else {
                sides.batting.batting[hitter_index].hbp += 1;
                sides.pitching.pitching[active_index].hbp += 1;
                outcome = MomentOutcome::HitByPitch;
            }
            force(context, sides, hitter_index, active_index);
            sides.batting.batting[hitter_index].rbi += sides.batting.runs - runs_before;
        } else if event == 2 {
            let hitter = &mut sides.batting.batting[hitter_index];
            hitter.ab += 1;
            hitter.so += 1;
            sides.pitching.pitching[active_index].so += 1;
            sides.pitching.pitching[active_index].outs += 1;
            outs += 1;
            add_fielding_workload(context, sides, 1);
            outcome = MomentOutcome::Strikeout;
        } else {
            if !sample_fair_contact(context, shared, pair, hitter_index, streams)? { return Err(format!("Contact exceeded {MAX_CONTACT_RETRIES} foul or dead-ball retries")); }
            let input = PassInput { outs, hitter: hitter_index, pitcher: active_index, double_play: profile.double_play, runs_before, target };
            if !context.trace.fair || context.trace.end == TRACE_DEAD_BALL { resolve_foul_catch(context, shared, input)?; }
            else { defensive_runs = resolve_defensive_contact(context, shared, sides, input)?; }
            commit_contact(context, sides);
            let result = &context.contact;
            let outs_added = result.outs_after - outs;
            outs = result.outs_after;
            sides.pitching.pitching[active_index].outs += outs_added as i32;
            let (sacrifice_fly, credited, error, double_play, caught_count, caught_runners) = (result.sacrifice_fly, result.credited_bases, result.error, result.double_play, result.caught_count, result.caught_runners);
            add_fielding_workload(context, sides, outs_added);
            let hitter = &mut sides.batting.batting[hitter_index];
            hitter.ab += if sacrifice_fly { 0 } else { 1 };
            if credited > 0 {
                hitter.h += 1;
                sides.pitching.pitching[active_index].h += 1;
                match credited { 2 => hitter.doubles += 1, 3 => hitter.triples += 1, 4 => hitter.hr += 1, _ => {} }
                outcome = match credited { 1 => MomentOutcome::Single, 2 => MomentOutcome::Double, 3 => MomentOutcome::Triple, _ => MomentOutcome::HomeRun };
                hitter.rbi += sides.batting.runs - runs_before;
            } else if error {
                outcome = MomentOutcome::ReachedOnError;
            } else if double_play {
                outcome = MomentOutcome::GroundedIntoDoublePlay;
            } else if sacrifice_fly {
                hitter.sf += 1;
                hitter.rbi += 1;
                outcome = MomentOutcome::SacrificeFly;
            } else {
                outcome = MomentOutcome::Out;
            }
            for runner in caught_runners.iter().take(caught_count) { sides.batting.batting[*runner as usize].caught_advancing += 1; }
        }
        let runs_scored = sides.batting.runs - runs_before;
        let after_bases = bases_mask(&context.bases.runners);
        let offensive_runs = shared.values.centered_plate_appearance(outs_before, bases_before, runs_scored as u32, outs, after_bases, context.bases.ended, runs_needed);
        sides.batting.batting[hitter_index].batting_runs += offensive_runs;
        sides.batting.batting_runs += offensive_runs;
        record_pitching_value(sides, active_index, offensive_runs, defensive_runs)?;
        observe!(outs_before, bases_before, runs_before, profile, active_profile, outcome, runners_before, runner_runs, event > 2);
    }
    Ok(())
}
