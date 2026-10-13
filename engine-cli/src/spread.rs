//! Season spread: replays fixed rosters over many season seeds, natively and in parallel, so
//! calibration can separate roster quality from season luck.
use engine::season::draft_team;
use engine::types::SeasonRequest;
use engine::{Engine, SeasonOptions};
use rayon::prelude::*;
use serde::Deserialize;
use std::io::{BufRead, Write};
use std::path::Path;

/// One input line: a caller's label and the season request whose seed is replaced per season.
#[derive(Deserialize)]
struct Line { label: String, request: SeasonRequest }

/// Season seed `index` of `base`; every roster plays the same seeds, so their spreads compare like for like.
fn season_seed(base: u32, index: u32) -> u32 {
    base.wrapping_mul(0x85eb_ca6b) ^ index.wrapping_add(1).wrapping_mul(0x9e37_79b9)
}

pub fn simulation_path(root: &Path) -> Result<std::path::PathBuf, String> {
    let pointer = std::fs::read_to_string(root.join("static/data/current.json")).map_err(|error| format!("current.json: {error} (run `npm run data:prepare`)"))?;
    let pointer: serde_json::Value = serde_json::from_str(&pointer).map_err(|error| error.to_string())?;
    let version = pointer["dataVersion"].as_str().ok_or("current.json has no dataVersion")?;
    Ok(root.join("static/data").join(version).join("simulation.json"))
}

/// `engine season-spread [--seasons N] [--seed N] < rosters.ndjson`: one `{label, wins}` line per roster.
pub fn season_spread(arguments: &[String]) -> Result<(), String> {
    let mut seasons = 100u32;
    let mut base = 162u32;
    let mut rest = arguments.iter();
    while let Some(flag) = rest.next() {
        let value = rest.next().ok_or(format!("{flag} requires a value"))?;
        let number = value.parse::<u32>().map_err(|_| format!("{flag} must be a non-negative integer"))?;
        match flag.as_str() {
            "--seasons" if number > 0 => seasons = number,
            "--seed" => base = number,
            _ => return Err("Usage: engine season-spread [--seasons N] [--seed N] < rosters.ndjson".into()),
        }
    }
    let engine = Engine::from_json(&std::fs::read_to_string(simulation_path(Path::new("."))?).map_err(|error| error.to_string())?)?;
    let lines: Vec<Line> = std::io::stdin().lock().lines()
        .filter(|line| line.as_ref().map_or(true, |text| !text.trim().is_empty()))
        .map(|line| serde_json::from_str(&line.map_err(|error| error.to_string())?).map_err(|error| format!("Invalid roster line: {error}")))
        .collect::<Result<_, _>>()?;
    let requests: Vec<SeasonRequest> = lines.iter().map(|line| line.request.clone()).collect();
    let wins = play(&engine, &requests, seasons, base)?;
    let mut output = std::io::BufWriter::new(std::io::stdout().lock());
    for (line, wins) in lines.iter().zip(wins) {
        writeln!(output, "{}", serde_json::json!({ "label": line.label, "wins": wins })).map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// Wins in each of `seasons` seeded seasons for every request. Each roster's matchups are prepared
/// once; every (roster, season) pair then runs across all cores.
pub fn play(engine: &Engine, requests: &[SeasonRequest], seasons: u32, base: u32) -> Result<Vec<Vec<u32>>, String> {
    let prepared: Vec<_> = requests.par_iter().map(|request| {
        let challenge = draft_team(request, &engine.data.bullpen, "challenge", "Your team")?;
        let matchups = engine.season_matchups(&challenge)?;
        Ok((challenge, matchups))
    }).collect::<Result<_, String>>()?;
    let wins: Vec<u32> = (0..requests.len() * seasons as usize).into_par_iter().map(|job| {
        let (roster, index) = (job / seasons as usize, job as u32 % seasons);
        let request = SeasonRequest { seed: season_seed(base, index), ..requests[roster].clone() };
        let (challenge, matchups) = &prepared[roster];
        Ok(engine.simulate_prepared(&request, challenge, matchups, SeasonOptions::FAST, &mut |_| {})?.wins)
    }).collect::<Result<_, String>>()?;
    Ok(wins.chunks(seasons as usize).map(<[u32]>::to_vec).collect())
}
