//! Native engine commands: seasons, series, benches, and the roster hill climb.
mod climb;

use engine::types::SeasonRequest;
use engine::Engine;
use std::process::ExitCode;

fn read(path: &str) -> Result<String, String> { std::fs::read_to_string(path).map_err(|error| format!("{path}: {error}")) }

fn season(arguments: &[String]) -> Result<(), String> {
    let [data, request] = arguments else { return Err("Usage: engine season <simulation.json> <request.json>".into()) };
    let engine = Engine::from_json(&read(data)?)?;
    let request: SeasonRequest = serde_json::from_str(&read(request)?).map_err(|error| format!("Invalid season request: {error}"))?;
    let result = engine.simulate_season(&request, &mut |_| {})?;
    println!("{}", serde_json::to_string(&result).map_err(|error| error.to_string())?);
    Ok(())
}

/// One request per input line, one result per output line, against one prepared engine.
fn season_batch(arguments: &[String]) -> Result<(), String> {
    use std::io::{BufRead, Write};
    let [data] = arguments else { return Err("Usage: engine season-batch <simulation.json> < requests.ndjson".into()) };
    let engine = Engine::from_json(&read(data)?)?;
    let stdout = std::io::stdout();
    let mut output = std::io::BufWriter::new(stdout.lock());
    for line in std::io::stdin().lock().lines() {
        let line = line.map_err(|error| error.to_string())?;
        if line.trim().is_empty() { continue; }
        let request: SeasonRequest = serde_json::from_str(&line).map_err(|error| format!("Invalid season request: {error}"))?;
        let result = engine.simulate_season(&request, &mut |_| {})?;
        writeln!(output, "{}", serde_json::to_string(&result).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// Median milliseconds for engine preparation, season matchups, and full and fast seasons.
fn bench(arguments: &[String]) -> Result<(), String> {
    let [data, request] = arguments else { return Err("Usage: engine bench <simulation.json> <request.json>".into()) };
    let json = read(data)?;
    let request: SeasonRequest = serde_json::from_str(&read(request)?).map_err(|error| format!("Invalid season request: {error}"))?;
    fn median(mut samples: Vec<f64>) -> f64 { samples.sort_by(f64::total_cmp); samples[samples.len() / 2] }
    let time = |runs: usize, work: &mut dyn FnMut()| median((0..runs).map(|_| { let start = std::time::Instant::now(); work(); start.elapsed().as_secs_f64() * 1e3 }).collect());
    let prepare = time(3, &mut || { Engine::from_json(&json).expect("engine"); });
    let engine = Engine::from_json(&json)?;
    let challenge = engine::season::draft_team(&request, "challenge", "Your team")?;
    let matchups_ms = time(5, &mut || { engine.season_matchups(&challenge).expect("matchups"); });
    let matchups = engine.season_matchups(&challenge)?;
    let full = time(5, &mut || { engine.simulate_prepared(&request, &challenge, &matchups, engine::SeasonOptions::FULL, &mut |_| {}).expect("season"); });
    let fast_runs = std::env::var("BENCH_FAST_RUNS").ok().and_then(|value| value.parse().ok()).unwrap_or(9);
    let fast = time(fast_runs, &mut || { engine.simulate_prepared(&request, &challenge, &matchups, engine::SeasonOptions::FAST, &mut |_| {}).expect("season"); });
    let result = engine.simulate_prepared(&request, &challenge, &matchups, engine::SeasonOptions::FAST, &mut |_| {})?;
    println!("{{\"prepareMs\":{prepare:.1},\"matchupsMs\":{matchups_ms:.1},\"seasonMs\":{full:.1},\"fastSeasonMs\":{fast:.1},\"record\":\"{}-{}\"}}", result.wins, result.losses);
    Ok(())
}

fn series(arguments: &[String]) -> Result<(), String> {
    let [data, request] = arguments else { return Err("Usage: engine series <simulation.json> <request.json>".into()) };
    let engine = Engine::from_json(&read(data)?)?;
    let request: engine::series::SeriesRequest = serde_json::from_str(&read(request)?).map_err(|error| format!("Invalid series request: {error}"))?;
    let result = engine.simulate_series(&request, &mut |_| {})?;
    println!("{}", serde_json::to_string(&result).map_err(|error| error.to_string())?);
    Ok(())
}

fn main() -> ExitCode {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    let outcome = match arguments.first().map(String::as_str) {
        Some("season") => season(&arguments[1..]),
        Some("season-batch") => season_batch(&arguments[1..]),
        Some("bench") => bench(&arguments[1..]),
        Some("series") => series(&arguments[1..]),
        Some("hill-climb") => climb::hill_climb(&arguments[1..]),
        Some("hill-climb-replay") => climb::replay(&arguments[1..]),
        _ => Err("Usage: engine season <simulation.json> <request.json>".into()),
    };
    match outcome {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => { eprintln!("{message}"); ExitCode::FAILURE }
    }
}
