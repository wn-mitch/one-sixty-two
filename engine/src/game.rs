//! One game in the home club's venue (`src/lib/sim/game.ts`).
use crate::contact::{prepared_defense, PreparedDefense};
use crate::contact_profile::{PreparedMatchups, ShapeTables};
use crate::flight::PreparedPark;
use crate::inning::{play_half, InningContext, InningEvent, Shared, Sides};
use crate::random::GameStreams;
use crate::rules::GameRules;
use crate::team::{create_box, TeamInput};
use crate::types::{GameResult, Half, ParkRef, SeasonMoment, POSITIONS};
use crate::value::RunValueModel;
use crate::win_expectancy::WinExpectancyModel;
use crate::workload::Workload;
use std::collections::HashMap;

const MAX_PA: usize = 1000;
const MAX_INNINGS: u32 = 100;

/// The fielders' skills at their assigned positions.
pub fn team_defense(team: &TeamInput, league_error_rates: &HashMap<String, f64>) -> Result<PreparedDefense, String> {
    let mut skills = [Default::default(); 8];
    for (position, name) in POSITIONS.iter().enumerate() {
        let hitter = team.hitters[team.defense[position]];
        skills[position] = *hitter.defense.positions.get(*name).ok_or_else(|| format!("Missing prepared defense for {name}"))?;
    }
    Ok(prepared_defense(league_error_rates, team.defense, skills))
}

pub struct GameInput<'a, 'p> {
    pub number: u32,
    pub opponent_id: &'a str,
    pub opponent_name: &'a str,
    pub challenge_is_home: bool,
    pub home: &'a TeamInput<'p>,
    pub away: &'a TeamInput<'p>,
    pub home_defense: PreparedDefense,
    pub away_defense: PreparedDefense,
    /// The home team's venue; both clubs play in it.
    pub park: &'a PreparedPark,
    /// Home hitters against away pitchers, and the reverse.
    pub home_matchups: &'a PreparedMatchups,
    pub away_matchups: &'a PreparedMatchups,
    /// The home crowd's lean on the strike zone: home batters get `+home_edge`, visitors `-home_edge`.
    pub home_edge: f64,
    pub rules: GameRules,
}

/// Engine tables shared by every game.
pub struct GameModels<'a> {
    pub values: &'a RunValueModel,
    pub tables: &'a ShapeTables,
    /// None skips win expectancy, highlights, and traces; scores and boxes are unchanged.
    pub win_expectancy: Option<&'a WinExpectancyModel>,
}

/// Full innings in the home team's venue, with no synthetic ties, ghost runners, or fallback winners.
/// Win expectancy assumes the standard rules, so games under other rules must skip it.
/// `trace` receives the pre-game win chance, the chance after every play, and the final 1 or 0, from the challenge side.
pub fn simulate_game(input: GameInput, models: &GameModels, streams: &mut GameStreams, mut trace: Option<&mut Vec<crate::types::WinPoint>>) -> Result<GameResult, String> {
    input.rules.validate()?;
    if models.win_expectancy.is_some() && input.rules != GameRules::default() { return Err("Win expectancy needs the standard rules".into()); }
    let regulation = input.rules.innings;
    let mut home = create_box(input.home);
    let mut away = create_box(input.away);
    let mut home_workload = Workload::new(input.home)?.regulation(regulation);
    let mut away_workload = Workload::new(input.away)?.regulation(regulation);
    let shared = Shared { values: models.values, park: input.park, tables: models.tables, max_pa: MAX_PA, rules: input.rules };
    // Top: away bats against the home defense; bottom: home bats against the away defense.
    let mut top = InningContext::new(input.away, input.home, input.away_matchups, input.home_defense)?;
    let mut bottom = InningContext::new(input.home, input.away, input.home_matchups, input.away_defense)?;
    top.edge = -input.home_edge;
    bottom.edge = input.home_edge;
    let mut highlight: Option<SeasonMoment> = None;
    let mut lowlight: Option<SeasonMoment> = None;
    let mut active_inning = 1u32;
    let mut active_half = Half::Top;
    let mut previous_win = 0.0;
    if let Some(model) = models.win_expectancy {
        let home_win = model.home_win_probability(1, Half::Top, 0, 0, 0, 0)?;
        previous_win = if input.challenge_is_home { home_win } else { 1.0 - home_win };
        if let Some(trace) = trace.as_deref_mut() { trace.push(crate::types::WinPoint { half: 0, win: previous_win }); }
    }
    let mut failure: Option<String> = None;
    let mut finished = false;
    for inning in 1..=MAX_INNINGS {
        for half in [Half::Top, Half::Bottom] {
            active_inning = inning;
            active_half = half;
            let (offense, defense, offense_box, defense_box, workload, context) = if half == Half::Top {
                (input.away, input.home, &mut away, &mut home, &mut home_workload, &mut top)
            } else {
                (input.home, input.away, &mut home, &mut away, &mut away_workload, &mut bottom)
            };
            workload.begin_half(defense, &defense_box.pitching, inning, defense_box.runs - offense_box.runs);
            let before = offense_box.runs;
            let target = if half == Half::Bottom && inning >= regulation { f64::from(defense_box.runs) + 1.0 } else { f64::INFINITY };
            let mut observe = |event: &InningEvent| {
                let Some(model) = models.win_expectancy else { return; };
                let (home_before, away_before, home_after, away_after) = if half == Half::Top {
                    (event.defense_runs_before, event.offense_runs_before, event.defense_runs_after, event.offense_runs_after)
                } else {
                    (event.offense_runs_before, event.defense_runs_before, event.offense_runs_after, event.defense_runs_after)
                };
                let home_win_after = match model.home_win_probability(inning as usize, half, event.outs_after as usize, event.bases_after as usize, home_after, away_after) {
                    Ok(value) => value,
                    Err(message) => { failure.get_or_insert(message); return; }
                };
                let win_before = previous_win;
                let win_after = if input.challenge_is_home { home_win_after } else { 1.0 - home_win_after };
                previous_win = win_after;
                let swing = win_after - win_before;
                if let Some(trace) = trace.as_deref_mut() { trace.push(crate::types::WinPoint { half: (inning - 1) * 2 + (half == Half::Bottom) as u32, win: win_after }); }
                let replaces_highlight = swing > 0.0 && highlight.as_ref().is_none_or(|moment| swing > moment.swing);
                let replaces_lowlight = swing < 0.0 && lowlight.as_ref().is_none_or(|moment| swing < moment.swing);
                if !replaces_highlight && !replaces_lowlight { return; }
                let (challenge_before, opponent_before, challenge_after, opponent_after) = if input.challenge_is_home {
                    (home_before, away_before, home_after, away_after)
                } else {
                    (away_before, home_before, away_after, home_after)
                };
                let moment = SeasonMoment {
                    play: event.moment_play(),
                    game_number: input.number, opponent_name: input.opponent_name.to_string(), is_home: input.challenge_is_home,
                    inning, half, outs_before: event.outs_before, bases_before: event.bases_before,
                    challenge_runs_before: challenge_before, opponent_runs_before: opponent_before,
                    challenge_runs_after: challenge_after, opponent_runs_after: opponent_after,
                    batter_name: event.batter_name.to_string(), batter_season_id: event.batter_season_id.to_string(),
                    pitcher_name: event.pitcher_name.to_string(), pitcher_season_id: event.pitcher_season_id.to_string(),
                    challenge_batting: input.challenge_is_home == (half == Half::Bottom),
                    outcome: event.outcome, runs_scored: event.runs_scored, win_before, win_after, swing,
                };
                // A swing is either positive or negative, so it replaces at most one of the two.
                if replaces_highlight { highlight = Some(moment); } else { lowlight = Some(moment); }
            };
            let mut observer: Option<&mut dyn FnMut(&InningEvent)> = if models.win_expectancy.is_some() { Some(&mut observe) } else { None };
            let mut sides = Sides { batting: &mut *offense_box, pitching: &mut *defense_box };
            play_half(context, &shared, offense, defense, &mut sides, workload, target, streams, &mut observer)?;
            if let Some(message) = failure.take() { return Err(message); }
            offense_box.innings.push(Some(offense_box.runs - before));
            if half == Half::Top && inning >= regulation && home.runs > away.runs {
                home.innings.push(None);
                finished = true;
                break;
            }
            if half == Half::Bottom && inning >= regulation && home.runs != away.runs { finished = true; }
        }
        if finished { break; }
    }
    if !finished { return Err(format!("Simulation exceeded {MAX_INNINGS} innings without a winner")); }
    let home_won = home.runs > away.runs;
    home_workload.credit_saves(input.home, &mut home.pitching, home_won);
    away_workload.credit_saves(input.away, &mut away.pitching, !home_won);
    let challenge_runs = if input.challenge_is_home { home.runs } else { away.runs };
    let opponent_runs = if input.challenge_is_home { away.runs } else { home.runs };
    if models.win_expectancy.is_some() {
        if let Some(trace) = trace {
            trace.push(crate::types::WinPoint { half: (active_inning - 1) * 2 + (active_half == Half::Bottom) as u32, win: if challenge_runs > opponent_runs { 1.0 } else { 0.0 } });
        }
    }
    let stadium = &input.park.stadium;
    Ok(GameResult {
        number: input.number, opponent_id: input.opponent_id.to_string(), opponent_name: input.opponent_name.to_string(), is_home: input.challenge_is_home,
        stadium: ParkRef { id: stadium.id.clone(), version: stadium.version.clone() }, stadium_name: stadium.name.clone(),
        home, away, challenge_runs, opponent_runs, win: challenge_runs > opponent_runs, highlight, lowlight,
    })
}
