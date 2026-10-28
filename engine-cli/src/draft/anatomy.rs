//! Season anatomy: plays drafted Classic rosters natively and reports where their games are lost:
//! each side of the ball against its own cards, which arms allowed the runs in losses and wins, the
//! innings those runs came in, loss margins, the run-differential record, and blown saves.
use super::{load, policy, read_json, request, Policy};
use crate::spread::{season_seed, simulation_path};
use engine::season::draft_team;
use engine::SeasonOptions;
use engine::types::{GameResult, PitcherRole, SeasonResult};
use engine::math::pow;
use engine::Engine;
use rayon::prelude::*;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};
use std::path::Path;

const USAGE: &str = "Usage: engine season-anatomy --policy vorp,best --from N --to N [--seasons N] [--seed N]";
/// Earned to total runs, as the lineup screen's card comparison uses.
const UNEARNED: f64 = 1.09;

/// A card's real season: pitching (BFP, H, BB+HBP, SO, ER, IPouts) and batting (PA, H, BB+HBP, SO, HR, TB, AB),
/// its year, and its era-scaled event rates (BB, HBP, SO, 1B, 2B, 3B, HR, out) in the common environment.
#[derive(Clone, Copy, Default)]
struct CardLine { pitching: Option<[f64; 6]>, batting: Option<[f64; 7]>, year: i32, batting_rates: Option<[f64; 8]>, pitching_rates: Option<[f64; 8]> }

/// Walks plus hit batters, strikeouts, hits and homers per event from era-scaled rates.
fn scaled(rates: &[f64; 8]) -> [f64; 4] { [rates[0] + rates[1], rates[2], rates[3] + rates[4] + rates[5] + rates[6], rates[6]] }

fn cards(root: &Path) -> Result<HashMap<String, CardLine>, String> {
    let data_dir = simulation_path(root)?.parent().unwrap().to_path_buf();
    let manifest = read_json(&data_dir.join("manifest.json"))?;
    let mut lines = HashMap::new();
    for url in manifest["chunks"].as_object().ok_or("manifest has no chunks")?.values() {
        let path = root.join("static").join(url.as_str().ok_or("invalid chunk url")?.trim_start_matches('/'));
        for profile in read_json(&path)?.as_array().ok_or("chunk is not a list")? {
            let number = |table: &Value, key: &str| table[key].as_f64().unwrap_or(0.0);
            let pitching = profile.get("pitching").filter(|value| value.is_object()).map(|p| {
                [number(p, "BFP"), number(p, "H"), number(p, "BB") + number(p, "HBP"), number(p, "SO"), number(p, "ER"), number(p, "IPouts")]
            });
            let batting = profile.get("batting").filter(|value| value.is_object()).map(|b| {
                let singles = number(b, "H") - number(b, "doubles") - number(b, "triples") - number(b, "HR");
                let total_bases = singles + 2.0 * number(b, "doubles") + 3.0 * number(b, "triples") + 4.0 * number(b, "HR");
                [number(b, "PA"), number(b, "H"), number(b, "BB") + number(b, "HBP"), number(b, "SO"), number(b, "HR"), total_bases, number(b, "AB")]
            });
            let rates = |key: &str| profile[key].as_array().filter(|list| list.len() == 8).map(|list| std::array::from_fn(|index| list[index].as_f64().unwrap_or(0.0)));
            let year = profile["year"].as_i64().unwrap_or(0) as i32;
            if let Some(id) = profile["seasonId"].as_str() {
                lines.insert(id.to_string(), CardLine { pitching, batting, year, batting_rates: rates("battingRates"), pitching_rates: rates("pitchingRates") });
            }
        }
    }
    Ok(lines)
}

/// Sums over every played season. Pitching groups: 0 starters, 1 named relievers, 2 remainder.
#[derive(Clone, Default)]
struct Tally {
    seasons: f64, wins: f64, runs_for: f64, runs_against: f64, pythagorean: f64,
    loss_margins: [f64; 6], one_run_wins: f64,
    /// Runs allowed by group, in losses then wins.
    allowed: [[f64; 3]; 2],
    /// Outs recorded by group, in losses then wins.
    outs: [[f64; 3]; 2],
    /// Runs allowed by inning (1-9, then extras), in losses then wins.
    by_inning: [[f64; 10]; 2],
    /// Sim (BF, H, BB+HBP, SO, R, outs) and card-expected (H, BB+HBP, SO, R) by group 0-1.
    pitchers: [[f64; 10]; 2],
    /// Sim (PA, H, BB+HBP, SO, HR, TB, AB) and card-expected at the same PA.
    hitters: [f64; 14],
    blown: f64, opportunities: f64,
    /// By card decade, hitters: sim (PA, BB+HBP, SO, H, HR), raw card (same four per PA x sim PA), era-scaled (same four).
    hitter_eras: BTreeMap<i32, [f64; 13]>,
    /// By card decade, pitchers: sim (BF, BB+HBP, SO, H), raw card (three), era-scaled (three).
    pitcher_eras: BTreeMap<i32, [f64; 10]>,
    /// Opponent pitchers facing us: (BF, sim BB+HBP, SO, H, scaled BB+HBP, SO, H at that BF).
    opponent_pitchers: [f64; 7],
    /// Opponent hitters facing us: (PA, sim BB+HBP, SO, H, scaled BB+HBP, SO, H at that PA).
    opponent_hitters: [f64; 7],
    /// Losses the remainder pitched in; losses where its runs reached the margin (without them, at least a tie);
    /// losses where its runs exceeded the margin; and those games that went to extra innings.
    remainder_losses: [f64; 4],
}

/// Era-scaled rates of every opponent profile, by season id, for (batting, pitching).
type OpponentRates = HashMap<String, (Option<[f64; 8]>, Option<[f64; 8]>)>;

fn group(role: PitcherRole) -> usize { match role { PitcherRole::Starter => 0, PitcherRole::Closer | PitcherRole::Reliever => 1, PitcherRole::Support => 2 } }

fn add_game(tally: &mut Tally, game: &GameResult, opponents: &OpponentRates) {
    let (mine, theirs) = if game.is_home { (&game.home, &game.away) } else { (&game.away, &game.home) };
    let side = usize::from(game.win);
    if !game.win { tally.loss_margins[((game.opponent_runs - game.challenge_runs) as usize).min(6) - 1] += 1.0; }
    if game.win && game.challenge_runs - game.opponent_runs == 1 { tally.one_run_wins += 1.0; }
    for line in &mine.pitching {
        tally.allowed[side][group(line.role)] += f64::from(line.r);
        tally.outs[side][group(line.role)] += f64::from(line.outs);
    }
    if !game.win {
        let runs: i32 = mine.pitching.iter().filter(|line| line.role == PitcherRole::Support).map(|line| line.r).sum();
        let pitched = mine.pitching.iter().any(|line| line.role == PitcherRole::Support && line.appearances > 0);
        let margin = game.opponent_runs - game.challenge_runs;
        let extras = theirs.innings.len() > 9;
        let counts = [pitched, runs >= margin, runs > margin, pitched && extras];
        tally.remainder_losses.iter_mut().zip(counts).for_each(|(sum, hit)| *sum += f64::from(u8::from(hit)));
    }
    for line in &theirs.pitching {
        let Some(rates) = opponents.get(&line.season_id).and_then(|rates| rates.1) else { continue };
        let [walks, so, hits, _] = scaled(&rates);
        let bf = f64::from(line.bf);
        let values = [bf, f64::from(line.bb + line.hbp), f64::from(line.so), f64::from(line.h), bf * walks, bf * so, bf * hits];
        tally.opponent_pitchers.iter_mut().zip(values).for_each(|(sum, value)| *sum += value);
    }
    for line in &theirs.batting {
        let Some(rates) = opponents.get(&line.season_id).and_then(|rates| rates.0) else { continue };
        let [walks, so, hits, _] = scaled(&rates);
        let pa = f64::from(line.pa);
        let values = [pa, f64::from(line.bb + line.hbp), f64::from(line.so), f64::from(line.h), pa * walks, pa * so, pa * hits];
        tally.opponent_hitters.iter_mut().zip(values).for_each(|(sum, value)| *sum += value);
    }
    for (inning, runs) in theirs.innings.iter().enumerate() {
        if let Some(runs) = runs { tally.by_inning[side][inning.min(9)] += f64::from(*runs); }
    }
}

fn add_season(tally: &mut Tally, result: &SeasonResult, cards: &HashMap<String, CardLine>, opponents: &OpponentRates) {
    tally.seasons += 1.0;
    tally.wins += f64::from(result.wins);
    let (scored, allowed) = (f64::from(result.runs_for), f64::from(result.runs_against));
    tally.runs_for += scored;
    tally.runs_against += allowed;
    let (scored_power, allowed_power) = (pow(scored, 1.83), pow(allowed, 1.83));
    tally.pythagorean += 162.0 * scored_power / (scored_power + allowed_power);
    for game in &result.games { add_game(tally, game, opponents); }
    for line in &result.pitching {
        if line.role == PitcherRole::Closer || line.role == PitcherRole::Reliever {
            tally.blown += f64::from(line.blown_saves);
            tally.opportunities += f64::from(line.save_opportunities);
        }
        let index = group(line.role);
        let Some(card) = (index < 2).then(|| cards.get(&line.season_id).and_then(|card| card.pitching)).flatten() else { continue };
        let [bfp, h, walks, so, er, ip_outs] = card;
        if bfp <= 0.0 || ip_outs <= 0.0 { continue; }
        let bf = f64::from(line.bf);
        let sums = &mut tally.pitchers[index];
        for (slot, value) in [bf, f64::from(line.h), f64::from(line.bb + line.hbp), f64::from(line.so), f64::from(line.r), f64::from(line.outs)].into_iter().enumerate() { sums[slot] += value; }
        sums[6] += bf * h / bfp;
        sums[7] += bf * walks / bfp;
        sums[8] += bf * so / bfp;
        sums[9] += er * 27.0 / ip_outs * UNEARNED * f64::from(line.outs) / 27.0;
        if let Some(rates) = cards.get(&line.season_id).and_then(|card| card.pitching_rates) {
            let [walks_rate, so_rate, hits_rate, _] = scaled(&rates);
            let era = tally.pitcher_eras.entry(cards[&line.season_id].year / 10 * 10).or_insert([0.0; 10]);
            let values = [bf, f64::from(line.bb + line.hbp), f64::from(line.so), f64::from(line.h), bf * walks / bfp, bf * so / bfp, bf * h / bfp, bf * walks_rate, bf * so_rate, bf * hits_rate];
            era.iter_mut().zip(values).for_each(|(sum, value)| *sum += value);
        }
    }
    for line in &result.batting {
        let Some([pa, h, walks, so, hr, tb, ab]) = cards.get(&line.season_id).and_then(|card| card.batting) else { continue };
        if pa <= 0.0 { continue; }
        let simulated_pa = f64::from(line.pa);
        let singles = line.h - line.doubles - line.triples - line.hr;
        let total_bases = singles + 2 * line.doubles + 3 * line.triples + 4 * line.hr;
        let sim = [simulated_pa, f64::from(line.h), f64::from(line.bb + line.hbp), f64::from(line.so), f64::from(line.hr), f64::from(total_bases), f64::from(line.ab)];
        let card = [pa, h, walks, so, hr, tb, ab].map(|value| value * simulated_pa / pa);
        for slot in 0..7 { tally.hitters[slot] += sim[slot]; tally.hitters[7 + slot] += card[slot]; }
        if let Some(line_card) = cards.get(&line.season_id).filter(|card| card.batting_rates.is_some()) {
            let [walks_rate, so_rate, hits_rate, hr_rate] = scaled(&line_card.batting_rates.unwrap());
            let era = tally.hitter_eras.entry(line_card.year / 10 * 10).or_insert([0.0; 13]);
            let values = [simulated_pa, sim[2], sim[3], sim[1], sim[4], card[2], card[3], card[1], card[4], simulated_pa * walks_rate, simulated_pa * so_rate, simulated_pa * hits_rate, simulated_pa * hr_rate];
            era.iter_mut().zip(values).for_each(|(sum, value)| *sum += value);
        }
    }
}

fn merge(mut sum: Tally, other: Tally) -> Tally {
    let add = |a: &mut [f64], b: &[f64]| a.iter_mut().zip(b).for_each(|(a, b)| *a += b);
    sum.seasons += other.seasons; sum.wins += other.wins; sum.runs_for += other.runs_for; sum.runs_against += other.runs_against;
    sum.pythagorean += other.pythagorean; sum.one_run_wins += other.one_run_wins; sum.blown += other.blown; sum.opportunities += other.opportunities;
    add(&mut sum.loss_margins, &other.loss_margins);
    for side in 0..2 { add(&mut sum.allowed[side], &other.allowed[side]); add(&mut sum.outs[side], &other.outs[side]); add(&mut sum.by_inning[side], &other.by_inning[side]); add(&mut sum.pitchers[side], &other.pitchers[side]); }
    add(&mut sum.hitters, &other.hitters);
    add(&mut sum.opponent_pitchers, &other.opponent_pitchers);
    add(&mut sum.opponent_hitters, &other.opponent_hitters);
    add(&mut sum.remainder_losses, &other.remainder_losses);
    for (decade, values) in other.hitter_eras { add(sum.hitter_eras.entry(decade).or_insert([0.0; 13]), &values); }
    for (decade, values) in other.pitcher_eras { add(sum.pitcher_eras.entry(decade).or_insert([0.0; 10]), &values); }
    sum
}

fn report(label: &str, tally: &Tally, league: &[f64; 8]) -> Value {
    let per = |value: f64| value / tally.seasons;
    let ratio = |sim: f64, card: f64| if card > 0.0 { sim / card } else { 0.0 };
    let pitchers = |sums: &[f64; 10]| json!({
        "innings": per(sums[5]) / 3.0,
        "ra9": sums[4] * 27.0 / sums[5].max(1.0), "cardRa9": sums[9] * 27.0 / sums[5].max(1.0),
        "hitsVsCard": ratio(sums[1], sums[6]), "walksVsCard": ratio(sums[2], sums[7]), "strikeoutsVsCard": ratio(sums[3], sums[8]),
    });
    let h = &tally.hitters;
    let ops = |pa: f64, hits: f64, walks: f64, tb: f64, ab: f64| (hits + walks) / pa + tb / ab;
    let losses = 162.0 * tally.seasons - tally.wins;
    let split = |side: usize| {
        let games = if side == 0 { losses } else { tally.wins };
        json!({
            "runsPerGame": tally.allowed[side].iter().sum::<f64>() / games,
            "byGroup": { "starters": tally.allowed[side][0] / games, "named": tally.allowed[side][1] / games, "remainder": tally.allowed[side][2] / games },
            "inningsByGroup": { "starters": tally.outs[side][0] / 3.0 / games, "named": tally.outs[side][1] / 3.0 / games, "remainder": tally.outs[side][2] / 3.0 / games },
            "byInning": tally.by_inning[side].map(|runs| runs / games),
        })
    };
    json!({
        "label": label, "seasons": tally.seasons,
        "wins": per(tally.wins), "pythagoreanWins": per(tally.pythagorean),
        "runsFor": per(tally.runs_for), "runsAgainst": per(tally.runs_against),
        "lossMargins": tally.loss_margins.map(|count| count / losses), "oneRunWins": per(tally.one_run_wins),
        "losses": split(0), "wins_": split(1),
        "starters": pitchers(&tally.pitchers[0]), "relievers": pitchers(&tally.pitchers[1]),
        "hitters": {
            "ops": ops(h[0], h[1], h[2], h[5], h[6]), "cardOps": ops(h[7], h[8], h[9], h[12], h[13]),
            "hitsVsCard": ratio(h[1], h[8]), "walksVsCard": ratio(h[2], h[9]), "strikeoutsVsCard": ratio(h[3], h[10]), "homersVsCard": ratio(h[4], h[11]),
        },
        "hitterEras": tally.hitter_eras.iter().map(|(decade, v)| json!({
            "decade": decade, "pa": per(v[0]),
            "sim": { "walk": v[1] / v[0], "strikeout": v[2] / v[0], "hit": v[3] / v[0], "homer": v[4] / v[0] },
            "card": { "walk": v[5] / v[0], "strikeout": v[6] / v[0], "hit": v[7] / v[0], "homer": v[8] / v[0] },
            "scaled": { "walk": v[9] / v[0], "strikeout": v[10] / v[0], "hit": v[11] / v[0], "homer": v[12] / v[0] },
        })).collect::<Vec<_>>(),
        "pitcherEras": tally.pitcher_eras.iter().map(|(decade, v)| json!({
            "decade": decade, "bf": per(v[0]),
            "sim": { "walk": v[1] / v[0], "strikeout": v[2] / v[0], "hit": v[3] / v[0] },
            "card": { "walk": v[4] / v[0], "strikeout": v[5] / v[0], "hit": v[6] / v[0] },
            "scaled": { "walk": v[7] / v[0], "strikeout": v[8] / v[0], "hit": v[9] / v[0] },
        })).collect::<Vec<_>>(),
        "league": { "walk": league[0] + league[1], "strikeout": league[2], "hit": league[3] + league[4] + league[5] + league[6] },
        "opponentPitchers": {
            "sim": { "walk": tally.opponent_pitchers[1] / tally.opponent_pitchers[0], "strikeout": tally.opponent_pitchers[2] / tally.opponent_pitchers[0], "hit": tally.opponent_pitchers[3] / tally.opponent_pitchers[0] },
            "scaled": { "walk": tally.opponent_pitchers[4] / tally.opponent_pitchers[0], "strikeout": tally.opponent_pitchers[5] / tally.opponent_pitchers[0], "hit": tally.opponent_pitchers[6] / tally.opponent_pitchers[0] },
        },
        "opponentHitters": {
            "sim": { "walk": tally.opponent_hitters[1] / tally.opponent_hitters[0], "strikeout": tally.opponent_hitters[2] / tally.opponent_hitters[0], "hit": tally.opponent_hitters[3] / tally.opponent_hitters[0] },
            "scaled": { "walk": tally.opponent_hitters[4] / tally.opponent_hitters[0], "strikeout": tally.opponent_hitters[5] / tally.opponent_hitters[0], "hit": tally.opponent_hitters[6] / tally.opponent_hitters[0] },
        },
        "remainderLosses": {
            "pitchedIn": per(tally.remainder_losses[0]), "runsCoverMargin": per(tally.remainder_losses[1]),
            "runsExceedMargin": per(tally.remainder_losses[2]), "pitchedInExtras": per(tally.remainder_losses[3]),
        },
        "blownSaveRate": if tally.opportunities > 0.0 { tally.blown / tally.opportunities } else { 0.0 },
    })
}

/// `engine season-anatomy`: one JSON line per policy over every drafted roster and season.
pub fn season_anatomy(arguments: &[String]) -> Result<(), String> {
    let (mut policies, mut from, mut to, mut seasons, mut base) = (Vec::new(), None, None, 10u32, 162u32);
    let mut rest = arguments.iter();
    while let Some(flag) = rest.next() {
        let value = rest.next().ok_or(USAGE)?;
        let number = || value.parse::<u32>().map_err(|_| USAGE.to_string());
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
    let root = Path::new(".");
    let engine = Engine::from_json(&std::fs::read_to_string(simulation_path(root)?).map_err(|error| error.to_string())?)?;
    let (pool, profiles, park) = load(root)?;
    let cards = cards(root)?;
    let slot_values = policy::slot_values(&pool);
    let refs: Vec<&engine::types::Profile> = profiles.iter().collect();
    let rules = super::rules::Rules::default();
    let mut opponents: OpponentRates = HashMap::new();
    for team in &engine.data.opponents {
        for profile in team.hitters.iter().chain(&team.starters).chain(&team.relievers).chain([&team.closer, &team.bullpen]) {
            opponents.insert(profile.season_id.clone(), (profile.batting_rates, profile.pitching_rates));
        }
    }
    let league = engine.data.environment.league_rates;
    for policy in policies {
        let tally = (from..=to).into_par_iter().map(|seed| {
            let (picks, _) = policy::draft(&pool, &refs, &rules, policy, seed, 0.85, &slot_values);
            let request = request(&picks, &pool, &profiles, &park);
            let challenge = draft_team(&request, &engine.data.bullpen, "challenge", "Your team")?;
            let matchups = engine.season_matchups(&challenge)?;
            let mut tally = Tally::default();
            for index in 0..seasons {
                let seeded = engine::types::SeasonRequest { seed: season_seed(base, index), ..request.clone() };
                let result = engine.simulate_prepared(&seeded, &challenge, &matchups, SeasonOptions { win_expectancy: false, keep_games: true }, &mut |_| {})?;
                add_season(&mut tally, &result, &cards, &opponents);
            }
            Ok(tally)
        }).collect::<Result<Vec<Tally>, String>>()?.into_iter().fold(Tally::default(), merge);
        println!("{}", report(policy.name(), &tally, &league));
    }
    Ok(())
}
