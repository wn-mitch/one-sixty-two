//! `draft-spread`: drafts Classic rosters natively with calibration policies and plays each over many
//! seasons, all in parallel. Prints one `{label, valueRuns, jackpots, chalk, edge, wins}` line per roster.
mod policy;
mod rules;
pub mod sample;

use crate::spread::{play, simulation_path};
use engine::types::{ParkRef, Profile, RosterPick, SeasonRequest};
use engine::Engine;
use policy::Policy;
use rayon::prelude::*;
use rules::{Card, Pool, Rules, SLOTS};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::io::Write;
use std::path::Path;

const USAGE: &str = "Usage: engine draft-spread --policy random,best,vorp,packs,chalk --from N --to N [--seasons N] [--seed N] [--jackpots guaranteed,chance] [--add-below Q]";
const RULES_VERSION: &str = "classic-v8";

fn read_json(path: &Path) -> Result<Value, String> {
    let text = std::fs::read_to_string(path).map_err(|error| format!("{}: {error}", path.display()))?;
    serde_json::from_str(&text).map_err(|error| format!("{}: {error}", path.display()))
}

/// The manifest's draftable seasons with their prepared card values, plus every profile and the
/// home stadium every calibration draft uses (the first by id).
fn load(root: &Path) -> Result<(Pool, Vec<Profile>, ParkRef), String> {
    let data_dir = simulation_path(root)?.parent().unwrap().to_path_buf();
    let manifest = read_json(&data_dir.join("manifest.json"))?;
    let table = read_json(&data_dir.join("draft-cards.json"))?;
    let column = |name: &str| table[name].as_array().cloned().ok_or(format!("draft-cards.json has no {name}"));
    let values: HashMap<String, (f64, usize)> = column("seasonId")?.iter().zip(column("valueRuns")?).zip(column("pricedSlot")?)
        .filter_map(|((id, value), slot)| Some((id.as_str()?.to_string(), (value.as_f64()?, SLOTS.iter().position(|name| Some(*name) == slot.as_str())?))))
        .collect();
    let jackpot: HashSet<&str> = manifest["jackpot"].as_array().ok_or("manifest has no jackpot pool")?.iter().filter_map(Value::as_str).collect();
    let mut rows: Vec<&Value> = manifest["candidates"].as_array().ok_or("manifest has no candidates")?.iter().filter(|row| {
        let year: i32 = row["seasonId"].as_str().and_then(|id| id.split(':').nth(1)).and_then(|year| year.parse().ok()).unwrap_or(0);
        (1950..=2025).contains(&year) && values.contains_key(row["seasonId"].as_str().unwrap_or(""))
    }).collect();
    rows.sort_by(|a, b| a["seasonId"].as_str().cmp(&b["seasonId"].as_str()));
    let intern = |key: &str| { let mut ids: Vec<&str> = rows.iter().filter_map(|row| row[key].as_str()).collect(); ids.sort_unstable(); ids.dedup(); ids };
    let (franchises, players) = (intern("franchiseId"), intern("playerId"));
    let index = |ids: &[&str], id: &str| ids.binary_search(&id).unwrap() as u32;
    let rankings_pointer = read_json(&root.join("static/rankings/current.json"))?;
    let rankings = read_json(&root.join("static").join(rankings_pointer["manifestUrl"].as_str().ok_or("rankings pointer has no manifestUrl")?.trim_start_matches('/')))?;
    if rankings["dataVersion"] != manifest["dataVersion"] { return Err("WAR rankings belong to another data version (run `npm run data:prepare`)".into()); }
    let cards = rows.iter().map(|row| {
        let season_id = row["seasonId"].as_str().unwrap().to_string();
        let ranking = &rankings["seasons"][season_id.as_str()];
        let war = [ranking["battingWAR162"].as_f64(), ranking["pitchingWAR162"].as_f64()];
        let (value, priced) = values[&season_id];
        let slots = row["eligibleSlots"].as_array().unwrap().iter().filter_map(|slot| SLOTS.iter().position(|name| Some(*name) == slot.as_str())).fold(0u16, |mask, slot| mask | 1 << slot);
        Card {
            player: index(&players, row["playerId"].as_str().unwrap()), franchise: index(&franchises, row["franchiseId"].as_str().unwrap()),
            decade: row["decade"].as_i64().unwrap() as i32, slots, value, priced, war, season_id,
        }
    }).collect::<Vec<Card>>();
    let mut jackpot: Vec<usize> = cards.iter().enumerate().filter_map(|(index, card)| jackpot.contains(card.season_id.as_str()).then_some(index)).collect();
    jackpot.sort_unstable_by(|&left, &right| cards[right].value.total_cmp(&cards[left].value).then_with(|| cards[left].season_id.cmp(&cards[right].season_id)));
    let mut profiles: HashMap<String, Profile> = HashMap::new();
    for url in manifest["chunks"].as_object().ok_or("manifest has no chunks")?.values() {
        let path = root.join("static").join(url.as_str().ok_or("invalid chunk url")?.trim_start_matches('/'));
        let chunk: Vec<Profile> = serde_json::from_value(read_json(&path)?).map_err(|error| format!("{}: {error}", path.display()))?;
        for profile in chunk { profiles.insert(profile.season_id.clone(), profile); }
    }
    let profiles = cards.iter().map(|card| profiles.remove(&card.season_id).ok_or(format!("{} has no profile", card.season_id))).collect::<Result<_, _>>()?;
    let mut stadiums: Vec<&Value> = manifest["stadiums"].as_array().ok_or("manifest has no stadiums")?.iter().collect();
    stadiums.sort_by(|a, b| a["ref"]["id"].as_str().cmp(&b["ref"]["id"].as_str()));
    let stadium = &stadiums.first().ok_or("manifest has no stadiums")?["ref"];
    let park = ParkRef { id: stadium["id"].as_str().unwrap().into(), version: stadium["version"].as_str().unwrap().into() };
    Ok((Pool { cards, jackpot }, profiles, park))
}

fn request(picks: &[(usize, usize, bool)], pool: &Pool, profiles: &[Profile], park: &ParkRef) -> SeasonRequest {
    let at = |slot: usize| pool.cards[picks.iter().find(|pick| pick.0 == slot).unwrap().1].season_id.clone();
    SeasonRequest {
        model_version: "contact-v3".into(), rules_version: RULES_VERSION.into(), seed: 0, home_stadium: park.clone(),
        roster: picks.iter().map(|&(slot, card, _)| RosterPick { profile: profiles[card].clone(), slot: SLOTS[slot].into() }).collect(),
        batting_order: (0..9).map(at).collect(),
        starter_order: (9..12).map(at).collect(),
        relief_roles: engine::relief::default_assignments(4),
    }
}

pub fn draft_spread(arguments: &[String]) -> Result<(), String> {
    let (mut policies, mut from, mut to, mut seasons, mut base, mut add_below) = (Vec::new(), None, None, 100u32, 162u32, 0.85f64);
    let mut rules = Rules::default();
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
            "--add-below" => add_below = value.parse().map_err(|_| "--add-below must be a number")?,
            "--jackpots" => {
                let (guaranteed, chance) = value.split_once(',').ok_or("--jackpots takes guaranteed,chance")?;
                rules.guaranteed = guaranteed.parse().map_err(|_| "Invalid guaranteed jackpots")?;
                rules.chance = chance.parse().map_err(|_| "Invalid jackpot chance")?;
            }
            _ => return Err(USAGE.into()),
        }
    }
    let (Some(from), Some(to)) = (from, to) else { return Err(USAGE.into()) };
    if policies.is_empty() || to < from || !(0.0..=1.0).contains(&rules.chance) { return Err(USAGE.into()); }
    let engine = Engine::from_json(&std::fs::read_to_string(simulation_path(Path::new("."))?).map_err(|error| error.to_string())?)?;
    let (pool, profiles, park) = load(Path::new("."))?;
    let slot_values = policy::slot_values(&pool);
    let refs: Vec<&Profile> = profiles.iter().collect();
    // Seed-major, so a partial run covers every policy evenly.
    let jobs: Vec<(Policy, u32)> = (from..=to).flat_map(|seed| policies.iter().map(move |&policy| (policy, seed))).collect();
    eprintln!("[draft-spread] drafting {} rosters from {} cards", jobs.len(), pool.cards.len());
    let drafted: Vec<(policy::Picks, policy::Scouting)> = jobs.par_iter().map(|&(policy, seed)| policy::draft(&pool, &refs, &rules, policy, seed, add_below, &slot_values)).collect();
    let requests: Vec<SeasonRequest> = drafted.iter().map(|(picks, _)| request(picks, &pool, &profiles, &park)).collect();
    eprintln!("[draft-spread] playing {seasons} seasons each for {} rosters", requests.len());
    // Rosters play in batches; each batch's lines are written and flushed as soon as it finishes,
    // so an interrupted run keeps every finished roster and the log shows progress.
    let batch = (rayon::current_num_threads() * 4).max(1);
    let started = std::time::Instant::now();
    let mut output = std::io::BufWriter::new(std::io::stdout().lock());
    for start in (0..requests.len()).step_by(batch) {
        let end = (start + batch).min(requests.len());
        let wins = play(&engine, &requests[start..end], seasons, base)?;
        for (index, wins) in (start..end).zip(wins) {
            let ((policy, seed), (picks, scouting)) = (jobs[index], &drafted[index]);
            let value_runs: f64 = picks.iter().map(|&(_, card, _)| pool.cards[card].value).sum();
            let jackpots = picks.iter().filter(|pick| pick.2).count();
            writeln!(output, "{}", serde_json::json!({ "label": format!("{}:{seed}", policy.name()), "valueRuns": value_runs, "jackpots": jackpots, "chalk": scouting.chalk, "edge": scouting.edge, "wins": wins })).map_err(|error| error.to_string())?;
        }
        output.flush().map_err(|error| error.to_string())?;
        let (done, total) = (end, requests.len());
        let elapsed = started.elapsed().as_secs_f64();
        let remaining = elapsed / done as f64 * (total - done) as f64;
        let filled = done * 30 / total;
        eprintln!("[draft-spread] [{}{}] {done}/{total} rosters, {:.0}s elapsed, ~{:.0}s left", "#".repeat(filled), "-".repeat(30 - filled), elapsed, remaining);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_drafts_fill_legal_rosters_and_deal_the_guaranteed_jackpots() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let (pool, profiles, _) = load(root).expect("prepared data (run `npm run data:prepare`)");
        let (rules, refs, values) = (Rules::default(), profiles.iter().collect::<Vec<_>>(), policy::slot_values(&pool));
        let mut jackpots = 0;
        for policy in [Policy::Random, Policy::Best, Policy::Vorp, Policy::Packs, Policy::Chalk] {
            for seed in 1..=4 {
                let (picks, scouting) = policy::draft(&pool, &refs, &rules, policy, seed, 0.85, &values);
                assert!(scouting.chalk as usize <= SLOTS.len() && scouting.edge.is_finite());
                if policy == Policy::Chalk { assert_eq!(scouting, policy::Scouting { chalk: 16, edge: 0.0 }, "chalk takes the obvious card every pick"); }
                assert_eq!(picks.len(), SLOTS.len());
                let mut slots: Vec<usize> = picks.iter().map(|pick| pick.0).collect();
                slots.sort_unstable();
                assert_eq!(slots, (0..SLOTS.len()).collect::<Vec<_>>(), "{policy:?} {seed}: every slot once");
                let cards: Vec<&Card> = picks.iter().map(|pick| &pool.cards[pick.1]).collect();
                assert_eq!(cards.iter().map(|card| card.player).collect::<HashSet<_>>().len(), SLOTS.len(), "{policy:?} {seed}: distinct players");
                assert_eq!(cards.iter().map(|card| card.franchise).collect::<HashSet<_>>().len(), SLOTS.len(), "{policy:?} {seed}: distinct franchises");
                for &(slot, card, jackpot) in &picks {
                    assert!(pool.cards[card].slots & (1 << slot) != 0, "{policy:?} {seed}: ineligible at {}", SLOTS[slot]);
                    jackpots += usize::from(jackpot);
                }
            }
        }
        assert!(jackpots >= 20 * rules.guaranteed * 9 / 10, "only {jackpots} jackpots in 20 drafts");
    }
}
