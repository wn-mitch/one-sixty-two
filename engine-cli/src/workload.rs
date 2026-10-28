//! League bullpen workload: plays whole eight-club league seasons natively and in parallel and reports,
//! per club, how its outs split between starters, named relievers and the pooled remainder arm.
use crate::spread::{season_seed, simulation_path};
use engine::league::{LeagueSegmentRequest, SEGMENTS};
use engine::rules::GameRules;
use engine::types::PitcherRole;
use engine::Engine;
use rayon::prelude::*;
use std::collections::BTreeMap;
use std::io::Read;
use std::path::Path;

const USAGE: &str = "Usage: engine league-workload [--seasons N] [--seed N] [--decree] < league-request.json";

/// One pitcher's season sums: outs, appearances, starts, runs allowed.
#[derive(Clone, Copy, Default)]
struct Line { outs: u64, appearances: u64, starts: u64, runs: u64 }

/// Per club: wins, games, and each pitcher's line keyed by season id (the remainder arm by its own id).
type Tally = Vec<(u64, u64, BTreeMap<String, (PitcherRole, Line)>)>;

fn season(engine: &Engine, base: &LeagueSegmentRequest, seed: u32) -> Result<Tally, String> {
    let mut request = base.clone();
    request.seed = seed;
    request.carry = Vec::new();
    request.hype = Vec::new();
    let mut tally: Tally = vec![(0, 0, BTreeMap::new()); request.clubs.len()];
    for segment in 0..SEGMENTS {
        request.segment = segment;
        let result = engine.simulate_league_segment(&request, &mut |_| {})?;
        for game in &result.games {
            let home_won = game.home_runs > game.away_runs;
            tally[game.home].0 += home_won as u64;
            tally[game.away].0 += !home_won as u64;
            tally[game.home].1 += 1;
            tally[game.away].1 += 1;
        }
        for (club, totals) in result.totals.iter().enumerate() {
            for line in &totals.pitching {
                let entry = tally[club].2.entry(line.season_id.clone()).or_insert((line.role, Line::default()));
                entry.1.outs += line.outs as u64;
                entry.1.appearances += line.appearances as u64;
                entry.1.starts += line.starts as u64;
                entry.1.runs += line.r as u64;
            }
        }
        request.carry = result.carry;
        request.hype = result.hype;
    }
    Ok(tally)
}

fn ra9(line: &Line) -> f64 { if line.outs == 0 { 0.0 } else { line.runs as f64 * 27.0 / line.outs as f64 } }

/// `engine league-workload`: one JSON line per club with its win share, its rotation's runs per nine, the
/// average season's outs by starters, named relievers and the remainder, the remainder's share of relief
/// outs, and each named pitcher's slot, roles and per-season line. Games use standard rules unless
/// `--decree` keeps the request's own.
pub fn league_workload(arguments: &[String]) -> Result<(), String> {
    let mut seasons = 40u32;
    let mut base_seed = 162u32;
    let mut decree = false;
    let mut rest = arguments.iter();
    while let Some(flag) = rest.next() {
        match flag.as_str() {
            "--decree" => decree = true,
            "--seasons" => seasons = rest.next().and_then(|value| value.parse().ok()).filter(|&n| n > 0).ok_or(USAGE)?,
            "--seed" => base_seed = rest.next().and_then(|value| value.parse().ok()).ok_or(USAGE)?,
            _ => return Err(USAGE.into()),
        }
    }
    let engine = Engine::from_json(&std::fs::read_to_string(simulation_path(Path::new("."))?).map_err(|error| error.to_string())?)?;
    let mut text = String::new();
    std::io::stdin().read_to_string(&mut text).map_err(|error| error.to_string())?;
    let mut base: LeagueSegmentRequest = serde_json::from_str(&text).map_err(|error| format!("Invalid league request: {error}"))?;
    if !decree { base.rules = GameRules::default(); }
    let tallies = (0..seasons).into_par_iter().map(|index| season(&engine, &base, season_seed(base_seed, index))).collect::<Result<Vec<_>, _>>()?;
    let per = seasons as f64;
    for (index, club) in base.clubs.iter().enumerate() {
        let mut wins = 0;
        let mut games = 0;
        let mut lines: BTreeMap<String, (PitcherRole, Line)> = BTreeMap::new();
        for tally in &tallies {
            let (club_wins, club_games, club_lines) = &tally[index];
            wins += club_wins;
            games += club_games;
            for (id, (role, line)) in club_lines {
                let entry = lines.entry(id.clone()).or_insert((*role, Line::default()));
                entry.1.outs += line.outs;
                entry.1.appearances += line.appearances;
                entry.1.starts += line.starts;
                entry.1.runs += line.runs;
            }
        }
        let sum = |role: PitcherRole| lines.values().filter(|(item, _)| *item == role).fold(Line::default(), |sum, (_, line)| Line {
            outs: sum.outs + line.outs, appearances: sum.appearances + line.appearances, starts: sum.starts + line.starts, runs: sum.runs + line.runs
        });
        let starters = sum(PitcherRole::Starter);
        let named = [sum(PitcherRole::Closer), sum(PitcherRole::Reliever)].into_iter().fold(Line::default(), |sum, line| Line {
            outs: sum.outs + line.outs, appearances: sum.appearances + line.appearances, starts: 0, runs: sum.runs + line.runs
        });
        let remainder = sum(PitcherRole::Support);
        let slot_of = |id: &str| club.roster.iter().find(|pick| pick.profile.season_id == id).map(|pick| pick.slot.clone());
        let pitchers: Vec<serde_json::Value> = lines.iter().map(|(id, (role, line))| {
            let slot = slot_of(id);
            let roles = slot.as_deref().and_then(|slot| club.relief_roles.iter().find(|item| item.slot == slot)).map(|item| serde_json::json!({ "primary": item.primary, "secondary": item.secondary }));
            let name = club.roster.iter().find(|pick| pick.profile.season_id == *id).map(|pick| pick.profile.display_name.clone()).unwrap_or_else(|| "remainder".into());
            serde_json::json!({
                "name": name, "slot": slot, "role": format!("{role:?}"), "roles": roles,
                "outs": line.outs as f64 / per, "appearances": line.appearances as f64 / per, "starts": line.starts as f64 / per,
                "outsPerAppearance": if line.appearances > 0 { Some(line.outs as f64 / line.appearances as f64) } else { None },
                "ra9": ra9(line),
            })
        }).collect();
        let relief = named.outs + remainder.outs;
        println!("{}", serde_json::json!({
            "club": club.id, "winPct": wins as f64 / games as f64, "starterRa9": ra9(&starters), "bullpenRa9": ra9(&named), "remainderRa9": ra9(&remainder),
            "outs": { "starters": starters.outs as f64 / per, "named": named.outs as f64 / per, "remainder": remainder.outs as f64 / per },
            "remainderShareOfRelief": if relief > 0 { remainder.outs as f64 / relief as f64 } else { 0.0 },
            "pitchers": pitchers,
        }));
    }
    Ok(())
}
