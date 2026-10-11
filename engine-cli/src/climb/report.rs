//! Holdout evaluation of the searched roster and the estimated chance of a 162-0 season.
// Report statistics never feed a simulation, so platform log and pow are fine here.
#![allow(clippy::disallowed_methods)]
use super::data::Dataset;
use super::evaluate::{Evaluator, GameOutcome};
use super::roster::{Roster, RosterIds};
use super::search::{mean_wins, seeds, Checkpoint};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub data_version: String,
    pub roster: RosterIds,
    /// Linear (draft-pricing) value of the picks, in season runs above league average.
    pub linear_runs: f64,
    pub search: SearchSummary,
    pub holdout: Holdout,
    pub perfect_season: PerfectSeason,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchSummary { pub seed: u32, pub iterations: u64, pub proposals: u64, pub elapsed_seconds: f64, pub panel_seasons: usize, pub panel_mean_wins: f64 }

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Holdout {
    pub seasons: usize,
    pub mean_wins: f64,
    pub standard_error: f64,
    pub min_wins: u32,
    pub max_wins: u32,
    pub max_seed: u32,
    pub perfect_seasons: usize,
    pub mean_runs_for: f64,
    pub mean_runs_against: f64,
    /// [wins, seasons] for every win total observed.
    pub histogram: Vec<[u32; 2]>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerfectSeason {
    pub method: String,
    pub per_game_win_rate: f64,
    /// log10 of the probability that one season goes 162-0.
    pub log10_probability: f64,
    pub one_in: String,
    /// The same estimate from the average per-game win rate alone.
    pub log10_probability_flat: f64,
}

/// Cells by opponent, venue, and rotation spot.
fn cell(game: &GameOutcome) -> usize { (game.opponent * 2 + usize::from(game.is_home)) * 3 + game.rotation }

pub fn build(data: &Dataset, evaluator: &Evaluator, roster: &Roster, state: &Checkpoint, panel: &[u32], seasons: usize) -> Result<Report, String> {
    let holdout_seeds = seeds(state.config.seed, "hill-climb:holdout", seasons, panel);
    let cells = data.engine.data.opponents.len() * 2 * 3;
    let schedules: Vec<Mutex<Vec<(usize, bool)>>> = (0..seasons).map(|_| Mutex::new(Vec::with_capacity(162))).collect();
    let scores = evaluator.run(roster, &holdout_seeds, |index, game| schedules[index].lock().unwrap().push((cell(&game), game.win)))?;
    let mut wins = vec![0u64; cells];
    let mut games = vec![0u64; cells];
    let schedules: Vec<Vec<(usize, bool)>> = schedules.into_iter().map(|schedule| schedule.into_inner().unwrap()).collect();
    for schedule in &schedules {
        for &(cell, win) in schedule { games[cell] += 1; wins[cell] += u64::from(win); }
    }
    // Each game is treated as independent with the win rate of its cell, shrunk half a game toward
    // a loss and a win so an unbeaten cell still carries some risk; seasons average over schedules.
    let probability = |cell: usize| (wins[cell] as f64 + 0.5) / (games[cell] as f64 + 1.0);
    let logs: Vec<f64> = schedules.iter().map(|schedule| schedule.iter().map(|&(cell, _)| probability(cell).log10()).sum()).collect();
    let top = logs.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let log10_probability = top + (logs.iter().map(|value| 10f64.powf(value - top)).sum::<f64>() / logs.len() as f64).log10();
    let total_games: u64 = games.iter().sum();
    let per_game = wins.iter().sum::<u64>() as f64 / total_games as f64;

    let n = scores.len() as f64;
    let mean = mean_wins(&scores);
    let variance = scores.iter().map(|score| (f64::from(score.wins) - mean).powi(2)).sum::<f64>() / (n - 1.0);
    let (max_index, max) = scores.iter().enumerate().max_by_key(|(index, score)| (score.wins, std::cmp::Reverse(*index))).unwrap();
    let mut histogram: Vec<[u32; 2]> = Vec::new();
    for wins in scores.iter().map(|score| score.wins).min().unwrap()..=max.wins {
        let count = scores.iter().filter(|score| score.wins == wins).count() as u32;
        if count > 0 { histogram.push([wins, count]); }
    }
    Ok(Report {
        data_version: data.data_version.clone(),
        roster: roster.ids(data),
        linear_runs: roster.linear_value(data),
        search: SearchSummary {
            seed: state.config.seed, iterations: state.iteration, proposals: state.proposals, elapsed_seconds: state.elapsed_seconds,
            panel_seasons: panel.len(), panel_mean_wins: mean_wins(&state.best.scores),
        },
        holdout: Holdout {
            seasons, mean_wins: mean, standard_error: (variance / n).sqrt(),
            min_wins: histogram[0][0], max_wins: max.wins, max_seed: holdout_seeds[max_index],
            perfect_seasons: scores.iter().filter(|score| score.wins == 162).count(),
            mean_runs_for: scores.iter().map(|score| f64::from(score.runs_for)).sum::<f64>() / n,
            mean_runs_against: scores.iter().map(|score| f64::from(score.runs_against)).sum::<f64>() / n,
            histogram,
        },
        perfect_season: PerfectSeason {
            method: "Product of per-game win rates by opponent, venue, and rotation spot from the holdout games (each shrunk by half a game), averaged over the holdout schedules; assumes games are independent.".into(),
            per_game_win_rate: per_game,
            log10_probability,
            one_in: format!("1 in 10^{:.1}", -log10_probability),
            log10_probability_flat: 162.0 * per_game.log10(),
        },
    })
}

/// Plain-text summary for the terminal.
pub fn summary(report: &Report) -> String {
    let holdout = &report.holdout;
    let mut lines = vec![
        format!("Best roster ({} panel seasons, {:.2} mean wins; {:.0} linear runs) at {}:", report.search.panel_seasons, report.search.panel_mean_wins, report.linear_runs, report.roster.home_stadium),
    ];
    for pick in &report.roster.picks { lines.push(format!("  {:<4} {:<28} {} ({})", pick.slot, pick.display_name, pick.season_id, pick.franchise_id)); }
    lines.push(format!("  batting order: {}", report.roster.batting_order.join(" ")));
    lines.push(format!("  rotation: {}", report.roster.starter_order.join(" ")));
    lines.push(format!("Holdout: {:.2} ± {:.2} wins over {} seasons (range {}-{}, best seed {}), {} went 162-0",
        holdout.mean_wins, holdout.standard_error, holdout.seasons, holdout.min_wins, holdout.max_wins, holdout.max_seed, holdout.perfect_seasons));
    lines.push(format!("Per-game win rate {:.4}; P(162-0) ≈ 10^{:.2} ({}); flat-rate estimate 10^{:.2}",
        report.perfect_season.per_game_win_rate, report.perfect_season.log10_probability, report.perfect_season.one_in, report.perfect_season.log10_probability_flat));
    lines.join("\n")
}
