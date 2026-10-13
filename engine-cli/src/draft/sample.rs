//! `sticker-sample`: drafts Classic rosters natively and plays each over seeded seasons, printing one
//! line per season with the picks and the challenge side's season and per-game lines, which
//! `scripts/sticker-rarity.ts` scores with the real sticker rules.
use super::{load, policy, request, Policy, Rules, SLOTS};
use crate::spread::{season_seed, simulation_path};
use engine::season::{draft_team, OpponentMatchups};
use engine::team::TeamInput;
use engine::types::{BatterLine, PitcherLine, SeasonRequest, TeamBox};
use engine::{Engine, SeasonOptions};
use rayon::prelude::*;
use serde_json::{json, Value};
use std::io::Write;
use std::path::Path;

const USAGE: &str = "Usage: engine sticker-sample --policy random,best,vorp,packs --from N --to N [--seasons N] [--seed N]";
/// Every game kept for its box scores; win expectancy is not needed.
const GAMES: SeasonOptions = SeasonOptions { win_expectancy: false, keep_games: true };

/// The per-game hitting fields the feat rules read.
fn game_batter(line: &BatterLine) -> Value {
    json!({ "seasonId": line.season_id, "H": line.h, "doubles": line.doubles, "triples": line.triples, "HR": line.hr })
}
/// The per-game pitching fields the feat rules read.
fn game_pitcher(line: &PitcherLine) -> Value {
    json!({ "seasonId": line.season_id, "outs": line.outs, "BF": line.bf, "H": line.h, "R": line.r, "BB": line.bb, "HBP": line.hbp, "SO": line.so })
}
fn game_box(club: &TeamBox) -> Value {
    json!({ "batting": club.batting.iter().map(game_batter).collect::<Vec<_>>(), "pitching": club.pitching.iter().map(game_pitcher).collect::<Vec<_>>() })
}

fn season_line(engine: &Engine, request: &SeasonRequest, prepared: &(TeamInput, Vec<OpponentMatchups>)) -> Result<Value, String> {
    let (challenge, matchups) = prepared;
    let result = engine.simulate_prepared(request, challenge, matchups, GAMES, &mut |_| {})?;
    let games: Vec<Value> = result.games.iter().map(|game| json!({ "isHome": true, "home": game_box(if game.is_home { &game.home } else { &game.away }) })).collect();
    Ok(json!({
        "picks": request.roster.iter().map(|pick| json!({ "seasonId": pick.profile.season_id, "slot": pick.slot })).collect::<Vec<_>>(),
        "result": { "wins": result.wins, "losses": result.losses, "batting": result.batting, "pitching": result.pitching, "games": games }
    }))
}

pub fn sticker_sample(arguments: &[String]) -> Result<(), String> {
    let (mut policies, mut from, mut to, mut seasons, mut base) = (Vec::new(), None, None, 10u32, 162u32);
    let mut rest = arguments.iter();
    while let Some(flag) = rest.next() {
        let value = rest.next().ok_or(format!("{flag} requires a value\n{USAGE}"))?;
        let number = || value.parse::<u32>().map_err(|_| format!("{flag} must be a non-negative integer"));
        match flag.as_str() {
            "--policy" => policies = value.split(',').map(Policy::parse).collect::<Result<_, _>>()?,
            "--from" => from = Some(number()?),
            "--to" => to = Some(number()?),
            "--seasons" => seasons = number()?.max(1),
            "--seed" => base = number()?,
            _ => return Err(USAGE.into()),
        }
    }
    let (Some(from), Some(to)) = (from, to) else { return Err(USAGE.into()) };
    if policies.is_empty() || to < from { return Err(USAGE.into()); }
    let engine = Engine::from_json(&std::fs::read_to_string(simulation_path(Path::new("."))?).map_err(|error| error.to_string())?)?;
    let (pool, profiles, park) = load(Path::new("."))?;
    let (rules, slot_values) = (Rules::default(), policy::slot_values(&pool));
    let refs: Vec<_> = profiles.iter().collect();
    let jobs: Vec<(Policy, u32)> = (from..=to).flat_map(|seed| policies.iter().map(move |&policy| (policy, seed))).collect();
    eprintln!("[sticker-sample] drafting {} rosters, {seasons} seasons each", jobs.len());
    let requests: Vec<SeasonRequest> = jobs.par_iter()
        .map(|&(policy, seed)| request(&policy::draft(&pool, &refs, &rules, policy, seed, 0.85, &slot_values), &pool, &profiles, &park))
        .collect();
    debug_assert!(requests.iter().all(|request| request.roster.len() == SLOTS.len()));
    // Rosters play in batches, written in order, so output is deterministic and progress is visible.
    let batch = (rayon::current_num_threads() * 2).max(1);
    let mut output = std::io::BufWriter::new(std::io::stdout().lock());
    for start in (0..requests.len()).step_by(batch) {
        let end = (start + batch).min(requests.len());
        let lines: Vec<String> = requests[start..end].par_iter().map(|request| {
            let challenge = draft_team(request, &engine.data.bullpen, "challenge", "Your team")?;
            let matchups = engine.season_matchups(&challenge)?;
            let prepared = (challenge, matchups);
            (0..seasons).into_par_iter().map(|index| {
                let request = SeasonRequest { seed: season_seed(base, index), ..request.clone() };
                season_line(&engine, &request, &prepared).map(|line| line.to_string())
            }).collect::<Result<Vec<_>, String>>().map(|lines| lines.join("\n"))
        }).collect::<Result<_, String>>()?;
        for line in lines { writeln!(output, "{line}").map_err(|error| error.to_string())?; }
        output.flush().map_err(|error| error.to_string())?;
        eprintln!("[sticker-sample] {end}/{} rosters", requests.len());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn feat_counters_agree_with_the_box_scores_and_replay_identically() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let engine = Engine::from_json(&std::fs::read_to_string(simulation_path(root).unwrap()).unwrap()).unwrap();
        let (pool, profiles, park) = load(root).expect("prepared data (run `npm run data:prepare`)");
        let refs: Vec<_> = profiles.iter().collect();
        let picks = policy::draft(&pool, &refs, &Rules::default(), Policy::Best, 3, 0.85, &policy::slot_values(&pool));
        let request = SeasonRequest { seed: 7, ..request(&picks, &pool, &profiles, &park) };
        let challenge = draft_team(&request, &engine.data.bullpen, "challenge", "Your team").unwrap();
        let matchups = engine.season_matchups(&challenge).unwrap();
        let result = engine.simulate_prepared(&request, &challenge, &matchups, GAMES, &mut |_| {}).unwrap();
        let (mut walk_offs, mut slams, mut saves, mut blown) = (0, 0, 0, 0);
        for game in &result.games {
            for (club, home) in [(&game.home, true), (&game.away, false)] {
                let won = club.runs > if home { game.away.runs } else { game.home.runs };
                let game_walk_offs: i32 = club.batting.iter().map(|line| line.walk_off_home_runs).sum();
                // Only the home side can walk off, only once, only in a win decided in the 9th or later.
                assert!(game_walk_offs == 0 || (home && won && game_walk_offs == 1 && club.innings.len() >= 9), "game {}", game.number);
                for line in &club.batting { assert!(line.grand_slams <= line.hr && line.walk_off_home_runs <= line.hr); }
                let game_saves: i32 = club.pitching.iter().map(|line| line.saves).sum();
                assert!(game_saves <= won as i32, "game {}: at most one save, and only in a win", game.number);
                for line in &club.pitching { assert_eq!(line.save_opportunities, line.saves + line.blown_saves); }
                if !std::ptr::eq(club, if game.is_home { &game.home } else { &game.away }) { continue; }
                walk_offs += game_walk_offs;
                slams += club.batting.iter().map(|line| line.grand_slams).sum::<i32>();
                saves += game_saves;
                blown += club.pitching.iter().map(|line| line.blown_saves).sum::<i32>();
            }
        }
        // Season lines are the sum of the challenge side's game lines.
        assert_eq!(result.batting.iter().map(|line| line.walk_off_home_runs).sum::<i32>(), walk_offs);
        assert_eq!(result.batting.iter().map(|line| line.grand_slams).sum::<i32>(), slams);
        assert_eq!(result.pitching.iter().map(|line| (line.saves, line.blown_saves)).fold((0, 0), |sum, line| (sum.0 + line.0, sum.1 + line.1)), (saves, blown));
        assert!(saves > 0 && slams > 0, "a full season produces saves and grand slams");
        let again = engine.simulate_prepared(&request, &challenge, &matchups, GAMES, &mut |_| {}).unwrap();
        assert_eq!(season_line(&engine, &request, &(challenge.clone(), matchups)).unwrap()["result"]["batting"], serde_json::to_value(&again.batting).unwrap());
    }
}
