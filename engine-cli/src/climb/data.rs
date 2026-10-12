//! The prepared dataset and every candidate's linear run value at each slot it may fill.
use engine::contact_profile::{contact_targets, fit_contact, platoon_matchup, SIDE_UNKNOWN};
use engine::physical_expectation::contact_classes;
use engine::rates::Rates;
use engine::types::Profile;
use engine::workload::starter_budget;
use engine::Engine;
use serde_json::Value;
use std::path::{Path, PathBuf};

pub const SLOTS: [&str; 16] = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "SP1", "SP2", "SP3", "CL", "RP1", "RP2", "RP3"];
pub const HITTERS: usize = 9;
pub const STARTERS: std::ops::Range<usize> = 9..12;
/// The app's current replay contract; the engine echoes these into results.
pub const MODEL_VERSION: &str = "contact-v2";
pub const RULES_VERSION: &str = "classic-v4";

// Draft pricing constant (`SALARY_METHOD` in `src/lib/draft/salary.ts`).
const STARTS: f64 = 54.0;
/// Mean season outs of CL, RP1, RP2 and RP3 over seven rosters (64 seasons each) with uncapped relief
/// workloads. Every arm in a slot gets the same outs, so these only weigh slots against each other
/// when seeding the search; seasons decide.
const RELIEF_OUTS: [f64; 4] = [126.0, 153.0, 222.0, 330.0];

pub struct Candidate {
    pub profile: Profile,
    /// Linear season runs relative to league average at each slot; `None` where ineligible.
    pub value: [Option<f64>; 16],
}

pub struct Dataset {
    pub data_version: String,
    pub engine: Engine,
    pub candidates: Vec<Candidate>,
    /// Eligible candidates per slot, best linear value first.
    pub ranked: Vec<Vec<usize>>,
}

fn read_json(path: &Path) -> Result<Value, String> {
    let text = std::fs::read_to_string(path).map_err(|error| format!("{}: {error}", path.display()))?;
    serde_json::from_str(&text).map_err(|error| format!("{}: {error}", path.display()))
}

/// Runs per plate appearance and outs per plate appearance against a league-average opponent,
/// fitted at unknown side and average speed exactly as draft pricing does.
fn run_values(engine: &Engine, weights: &engine::physical_expectation::EventRunWeights, batting: &Rates, pitching: &Rates) -> Result<(f64, f64), String> {
    let environment = &engine.data.environment;
    let rates = platoon_matchup(batting, "", pitching, "", &environment.league_rates)?;
    let fit = fit_contact(&environment.contact_model.basis, engine.prior(), &contact_targets(&rates)?, SIDE_UNKNOWN, 0.5)?;
    let classes = contact_classes(&environment.contact_model, &fit)?;
    let contact = rates[3] + rates[4] + rates[5] + rates[6] + rates[7];
    let mut per_pa = (rates[0] + rates[1]) * weights.walk + rates[2] * weights.strikeout;
    let mut outs_per_pa = rates[2];
    for (cls, share) in classes.iter().enumerate() {
        per_pa += contact * share * weights.classes[cls];
        outs_per_pa += contact * share * weights.class_outs[cls];
    }
    Ok((per_pa, outs_per_pa))
}

impl Dataset {
    /// Loads `<root>/static/data/current.json`, its simulation data, and every profile chunk.
    pub fn load(root: &Path) -> Result<Self, String> {
        let static_dir = root.join("static");
        let pointer = read_json(&static_dir.join("data/current.json")).map_err(|error| format!("{error} (run `npm run data:prepare`)"))?;
        let data_version = pointer["dataVersion"].as_str().ok_or("current.json has no dataVersion")?.to_string();
        let dir: PathBuf = static_dir.join("data").join(&data_version);
        let simulation = std::fs::read_to_string(dir.join("simulation.json")).map_err(|error| format!("simulation.json: {error}"))?;
        let engine = Engine::from_json(&simulation)?;
        let manifest = read_json(&dir.join("manifest.json"))?;
        let chunks = manifest["chunks"].as_object().ok_or("manifest has no chunks")?;
        let weights = engine.reference.event_run_weights()?;
        let hitter_plate_appearances = 162.0 * engine.reference.state_visits.iter().fold(0.0, |sum, value| sum + value);
        let league = engine.data.environment.league_rates;
        let mut candidates = Vec::new();
        let mut keys: Vec<&String> = chunks.keys().collect();
        keys.sort();
        for key in keys {
            let path = static_dir.join(chunks[key].as_str().ok_or("invalid chunk url")?.trim_start_matches('/'));
            let Value::Array(rows) = read_json(&path)? else { return Err(format!("{key}: chunk is not an array")) };
            for row in rows {
                let saved: Vec<Option<f64>> = SLOTS[..8].iter().map(|slot| row["defense"]["positions"][*slot]["expectedRunsSaved162"].as_f64()).collect();
                let profile: Profile = serde_json::from_value(row).map_err(|error| format!("{key}: {error}"))?;
                let mut value = [None; 16];
                let eligible = |slot: &str| profile.eligible_slots.iter().any(|name| name == slot);
                if SLOTS[..HITTERS].iter().any(|slot| eligible(slot)) {
                    if let Some(batting) = &profile.batting_rates {
                        let batting_runs = run_values(&engine, &weights, batting, &league)?.0 * hitter_plate_appearances;
                        for (index, slot) in SLOTS[..HITTERS].iter().enumerate() {
                            if !eligible(slot) { continue; }
                            if index < 8 && !profile.defense.positions.contains_key(*slot) { continue; }
                            value[index] = Some(batting_runs + if index < 8 { saved[index].unwrap_or(0.0) } else { 0.0 });
                        }
                    }
                }
                if let Some(pitching) = &profile.pitching_rates {
                    let pitcher_slots: Vec<usize> = (HITTERS..SLOTS.len()).filter(|index| eligible(SLOTS[*index])).collect();
                    if !pitcher_slots.is_empty() {
                        let (per_pa, outs_per_pa) = run_values(&engine, &weights, &league, pitching)?;
                        let saved_per_out = -per_pa / outs_per_pa;
                        for index in pitcher_slots {
                            let outs = match SLOTS[index] {
                                "CL" | "RP1" | "RP2" | "RP3" => RELIEF_OUTS[index - 12],
                                _ => match starter_budget(&profile) { Ok(budget) => STARTS * f64::from(budget), Err(_) => continue },
                            };
                            value[index] = Some(saved_per_out * outs);
                        }
                    }
                }
                if value.iter().any(Option::is_some) { candidates.push(Candidate { profile, value }); }
            }
        }
        let ranked = (0..SLOTS.len()).map(|slot| {
            let mut list: Vec<usize> = (0..candidates.len()).filter(|index| candidates[*index].value[slot].is_some()).collect();
            list.sort_by(|a, b| candidates[*b].value[slot].unwrap().total_cmp(&candidates[*a].value[slot].unwrap()).then(a.cmp(b)));
            list
        }).collect();
        Ok(Self { data_version, engine, candidates, ranked })
    }

    pub fn franchise(&self, candidate: usize) -> &str { &self.candidates[candidate].profile.franchise_id }
    pub fn player(&self, candidate: usize) -> &str { &self.candidates[candidate].profile.player_id }
    pub fn season_id(&self, candidate: usize) -> &str { &self.candidates[candidate].profile.season_id }
}
