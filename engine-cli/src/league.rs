//! League crowd spread: plays whole eight-club league seasons with every home crowd set to the same
//! lean, natively and in parallel, so the crowd curve can be fitted to a target home record.
use crate::spread::{season_seed, simulation_path};
use engine::league::{Crowd, LeagueSegmentRequest, SEGMENTS};
use engine::Engine;
use rayon::prelude::*;
use std::io::Read;
use std::path::Path;

const USAGE: &str = "Usage: engine league-crowd [--seasons N] [--seed N] [--edges a,b,...] [--volatility V] < league-request.json";

/// Home wins, games and runs over one season with every crowd at `crowd`.
fn season(engine: &Engine, base: &LeagueSegmentRequest, seed: u32, crowd: Crowd) -> Result<[u64; 4], String> {
    let mut request = base.clone();
    request.seed = seed;
    request.crowds = vec![crowd; request.clubs.len()];
    request.carry = Vec::new();
    let mut tally = [0u64; 4];
    for segment in 0..SEGMENTS {
        request.segment = segment;
        let result = engine.simulate_league_segment(&request, &mut |_| {})?;
        for game in &result.games {
            tally[0] += (game.home_runs > game.away_runs) as u64;
            tally[1] += 1;
            tally[2] += game.home_runs as u64;
            tally[3] += game.away_runs as u64;
        }
        request.carry = result.carry;
    }
    Ok(tally)
}

/// `engine league-crowd`: one `{edge, volatility, games, homeWinPct, standardError, homeRuns, awayRuns}` line per edge.
pub fn league_crowd(arguments: &[String]) -> Result<(), String> {
    let mut seasons = 40u32;
    let mut base_seed = 162u32;
    let mut edges = vec![0.0];
    let mut volatility = 0.0;
    let mut rest = arguments.iter();
    while let Some(flag) = rest.next() {
        let value = rest.next().ok_or(format!("{flag} requires a value"))?;
        match flag.as_str() {
            "--seasons" => seasons = value.parse().ok().filter(|&n| n > 0).ok_or(USAGE)?,
            "--seed" => base_seed = value.parse().map_err(|_| USAGE)?,
            "--edges" => edges = value.split(',').map(|item| item.parse::<f64>().map_err(|_| USAGE.to_string())).collect::<Result<_, _>>()?,
            "--volatility" => volatility = value.parse().map_err(|_| USAGE)?,
            _ => return Err(USAGE.into()),
        }
    }
    let engine = Engine::from_json(&std::fs::read_to_string(simulation_path(Path::new("."))?).map_err(|error| error.to_string())?)?;
    let mut text = String::new();
    std::io::stdin().read_to_string(&mut text).map_err(|error| error.to_string())?;
    let base: LeagueSegmentRequest = serde_json::from_str(&text).map_err(|error| format!("Invalid league request: {error}"))?;
    for edge in edges {
        let crowd = Crowd { edge, volatility };
        let tallies = (0..seasons).into_par_iter().map(|index| season(&engine, &base, season_seed(base_seed, index), crowd)).collect::<Result<Vec<_>, _>>()?;
        let [wins, games, home_runs, away_runs] = tallies.iter().fold([0u64; 4], |sum, tally| std::array::from_fn(|i| sum[i] + tally[i]));
        let share = wins as f64 / games as f64;
        println!("{}", serde_json::json!({
            "edge": edge, "volatility": volatility, "games": games, "homeWinPct": share,
            "standardError": (share * (1.0 - share) / games as f64).sqrt(),
            "homeRuns": home_runs as f64 / games as f64, "awayRuns": away_runs as f64 / games as f64,
        }));
    }
    Ok(())
}
