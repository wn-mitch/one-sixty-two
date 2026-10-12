//! `hill-climb`: searches for the Classic roster with the most expected wins and estimates whether
//! 162-0 is reachable. Rolls are ignored; any legal roster of sixteen franchises and a stadium counts.
pub mod data;
pub mod evaluate;
pub mod report;
pub mod roster;
pub mod search;

use data::Dataset;
use evaluate::Evaluator;
use roster::Roster;
use search::{write_json, Checkpoint, Search, SearchConfig};
use std::path::{Path, PathBuf};
use std::time::Duration;

const USAGE: &str = "Usage: engine hill-climb [--budget-minutes N] [--seed N] [--panel N] [--screen N] [--batch N] [--promote N] [--pool N] [--stall N] [--kick N] [--final N] [--out DIR] [--resume]";

fn flag<T: std::str::FromStr>(value: Option<&String>, name: &str) -> Result<T, String> {
    value.ok_or_else(|| format!("{name} requires a value"))?.parse().map_err(|_| format!("Invalid {name}"))
}

pub fn hill_climb(arguments: &[String]) -> Result<(), String> {
    let mut config = SearchConfig { seed: 162, panel: 64, screen: 8, batch: 12, promote: 3, pool: 48, stall: 240, kick: 3 };
    let (mut budget_minutes, mut final_seasons, mut resume) = (30.0f64, 2000usize, false);
    let mut out = PathBuf::from(".cache/hill-climb");
    let mut index = 0;
    while index < arguments.len() {
        let name = arguments[index].as_str();
        let value = arguments.get(index + 1);
        index += 2;
        match name {
            "--budget-minutes" => budget_minutes = flag(value, name)?,
            "--seed" => config.seed = flag(value, name)?,
            "--panel" => config.panel = flag(value, name)?,
            "--screen" => config.screen = flag(value, name)?,
            "--batch" => config.batch = flag(value, name)?,
            "--promote" => config.promote = flag(value, name)?,
            "--pool" => config.pool = flag(value, name)?,
            "--stall" => config.stall = flag(value, name)?,
            "--kick" => config.kick = flag(value, name)?,
            "--final" => final_seasons = flag(value, name)?,
            "--out" => out = PathBuf::from(flag::<String>(value, name)?),
            "--resume" => { resume = true; index -= 1; }
            _ => return Err(format!("Unknown argument {name}\n{USAGE}")),
        }
    }
    if config.screen == 0 || config.screen > config.panel || config.batch == 0 || config.promote == 0 || config.pool == 0 || final_seasons < 2 || budget_minutes.is_nan() || budget_minutes < 0.0 {
        return Err(format!("Invalid search options\n{USAGE}"));
    }
    let checkpoint_path = out.join("checkpoint.json");
    let checkpoint = if resume {
        let text = std::fs::read_to_string(&checkpoint_path).map_err(|error| format!("{}: {error}", checkpoint_path.display()))?;
        Some(serde_json::from_str::<Checkpoint>(&text).map_err(|error| format!("Invalid checkpoint: {error}"))?)
    } else { None };
    eprintln!("[hill-climb] loading data");
    let data = Dataset::load(Path::new("."))?;
    eprintln!("[hill-climb] {} candidates; {} stadiums; starting search", data.candidates.len(), data.engine.data.stadiums.len());
    let mut search = Search::start(&data, config, checkpoint)?;
    search.run(Duration::from_secs_f64(budget_minutes * 60.0), &checkpoint_path)?;
    eprintln!("[hill-climb] evaluating the best roster on {final_seasons} holdout seasons");
    let report = report::build(&data, &search.evaluator, search.best(), &search.state, &search.panel, final_seasons)?;
    let report_path = out.join("report.json");
    write_json(&report_path, &report)?;
    println!("{}", report::summary(&report));
    println!("Report: {}", report_path.display());
    Ok(())
}

/// Replays one full season of a report's roster and prints its record and every loss.
pub fn replay(arguments: &[String]) -> Result<(), String> {
    let (mut path, mut seed) = (PathBuf::from(".cache/hill-climb/report.json"), None);
    let mut index = 0;
    while index < arguments.len() {
        let value = arguments.get(index + 1);
        match arguments[index].as_str() {
            "--report" => path = PathBuf::from(flag::<String>(value, "--report")?),
            "--seed" => seed = Some(flag::<u32>(value, "--seed")?),
            other => return Err(format!("Unknown argument {other}\nUsage: engine hill-climb-replay [--report FILE] --seed N")),
        }
        index += 2;
    }
    let seed = seed.ok_or("hill-climb-replay requires --seed")?;
    let report: report::Report = serde_json::from_str(&std::fs::read_to_string(&path).map_err(|error| format!("{}: {error}", path.display()))?)
        .map_err(|error| format!("Invalid report: {error}"))?;
    let data = Dataset::load(Path::new("."))?;
    if report.data_version != data.data_version { return Err("Report was made with a different dataset".into()); }
    let roster = Roster::from_ids(&report.roster, &data)?;
    let result = data.engine.simulate_season(&roster.request(&data, seed), &mut |_| {})?;
    // The search's fast path must agree with the full season it summarizes.
    let fast = Evaluator::new(&data)?.scores(&roster, &[seed])?;
    if fast[0].wins != result.wins || fast[0].runs_for != result.runs_for || fast[0].runs_against != result.runs_against {
        return Err("Fast and full seasons disagree".into());
    }
    let losses: Vec<serde_json::Value> = result.games.iter().filter(|game| !game.win).map(|game| serde_json::json!({
        "game": game.number, "opponent": game.opponent_id, "home": game.is_home, "score": format!("{}-{}", game.challenge_runs, game.opponent_runs),
    })).collect();
    println!("{}", serde_json::to_string_pretty(&serde_json::json!({
        "seed": seed, "record": format!("{}-{}", result.wins, result.losses), "runsFor": result.runs_for, "runsAgainst": result.runs_against,
        "firstLoss": result.first_loss, "longestWinningStreak": result.longest_winning_streak, "losses": losses,
    })).map_err(|error| error.to_string())?);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use engine::random::Mulberry32;
    use engine::season::draft_team;
    use engine::SeasonOptions;

    fn dataset() -> Dataset {
        Dataset::load(Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap()).expect("prepared data (run `npm run data:prepare`)")
    }

    #[test]
    fn search_moves_stay_legal_and_fast_seasons_match_full_seasons() {
        let data = dataset();
        let start = roster::linear_start(&data, 0).unwrap();
        assert!(start.legal(&data));
        let mut random = Mulberry32::new(7);
        let mut roster = start.clone();
        let mut moves = 0;
        for _ in 0..2000 {
            if let Some(next) = roster::neighbor(&roster, &data, 48, &mut random) {
                assert!(next.legal(&data), "neighbor broke legality");
                roster = next;
                moves += 1;
            }
        }
        assert!(moves > 500, "too few legal moves: {moves}");

        let evaluator = Evaluator::new(&data).unwrap();
        for candidate in [&start, &roster] {
            let request = candidate.request(&data, 11);
            let challenge = draft_team(&request, &data.engine.data.bullpen, "challenge", "Your team").unwrap();
            let expected = data.engine.season_matchups(&challenge).unwrap();
            let cached = evaluator.matchups(candidate).unwrap();
            for (a, b) in expected.iter().zip(&cached) {
                for (x, y) in [(&a.challenge_batting, &b.challenge_batting), (&a.opponent_batting, &b.opponent_batting)] {
                    assert_eq!((&x.non_contact_cdf, &x.region_cdf, &x.shift, &x.side), (&y.non_contact_cdf, &y.region_cdf, &y.shift, &y.side));
                }
            }
            let seeds = [11, 162];
            let fast = evaluator.scores(candidate, &seeds).unwrap();
            for (score, seed) in fast.iter().zip(seeds) {
                let full = data.engine.simulate_season(&candidate.request(&data, seed), &mut |_| {}).unwrap();
                assert_eq!((score.wins, score.runs_for, score.runs_against), (full.wins, full.runs_for, full.runs_against));
                let mut fast_games = Vec::new();
                data.engine.simulate_prepared(&candidate.request(&data, seed), &challenge, &cached, SeasonOptions::FAST, &mut |game| fast_games.push((game.challenge_runs, game.opponent_runs))).unwrap();
                assert_eq!(fast_games, full.games.iter().map(|game| (game.challenge_runs, game.opponent_runs)).collect::<Vec<_>>());
            }
        }
    }
}
