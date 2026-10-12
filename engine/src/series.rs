//! Best-of-five head-to-head series (`src/lib/sim/series.ts`).
use crate::game::{simulate_game, team_defense, GameInput, GameModels};
use crate::random::{stream_seed, GameStreams};
use crate::season::{draft_team, Engine, SeasonOptions};
use crate::team::{accumulate_box, create_totals_box, TeamInput};
use crate::types::{GameResult, ParkRef, PitcherRole, SeasonMoment, SeasonRequest, TeamBox, WinPoint};
use crate::relief::ReliefUsage;
use serde::{Deserialize, Serialize};

pub const SERIES_RULES_VERSION: &str = "h2h-bo5-v1";
pub const SERIES_SEED_POLICY: &str = "replay-pair-v1";
pub const MVP_VERSION: &str = "realized-runs-v1";
pub const SUPERLATIVES_VERSION: &str = "realized-runs-awards-v1";
/// Home team by seed for games 1-5 (MLB 2-2-1), and the calendar day of each game.
const SERIES_HOME_SEEDS: [u32; 5] = [1, 1, 2, 2, 1];
const SERIES_DAYS: [u32; 5] = [1, 2, 4, 5, 7];
const SUPERLATIVE_MIN_RUNS: f64 = 0.05;
const WINS_NEEDED: u32 = 3;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum TeamId {
    #[serde(rename = "team-a")]
    A,
    #[serde(rename = "team-b")]
    B,
}

impl TeamId {
    fn index(self) -> usize { self as usize }
    fn other(self) -> Self { if self == TeamId::A { TeamId::B } else { TeamId::A } }
    fn name(self) -> &'static str { if self == TeamId::A { "team-a" } else { "team-b" } }
}

/// One validated source team; `key` is `JSON.stringify(replayInput(draft))`.
#[derive(Clone, Debug, Deserialize)]
pub struct SeriesTeamInput { pub id: TeamId, pub name: String, pub key: String, pub season: SeasonRequest }

#[derive(Clone, Debug, Deserialize)]
pub struct SeriesRequest { pub teams: [SeriesTeamInput; 2] }

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(tag = "stage", rename_all = "kebab-case")]
pub enum SeriesProgress {
    #[serde(rename_all = "camelCase")]
    RegularSeason { team_id: TeamId, completed: u32 },
    Series { completed: u32 },
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SeriesAward {
    pub team_id: TeamId,
    pub season_id: String,
    pub display_name: String,
    pub runs: f64,
    pub batting: f64,
    pub running: f64,
    pub defense: f64,
    pub pitching: f64,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SuperlativeKind { TopBat, Ace, Glove, Wheels, Lvp }

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct SeriesSuperlative { pub kind: SuperlativeKind, pub award: SeriesAward }

/// A game swing with explicit ownership; swings are from Team A's perspective.
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SeriesMoment {
    #[serde(flatten)]
    pub moment: SeasonMoment,
    pub perspective_team_id: TeamId,
    pub batting_team_id: TeamId,
    pub pitching_team_id: TeamId,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct SeriesScore {
    #[serde(rename = "team-a")]
    pub a: u32,
    #[serde(rename = "team-b")]
    pub b: u32,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SeriesGame {
    pub number: u32,
    pub day: u32,
    pub home_team_id: TeamId,
    pub away_team_id: TeamId,
    pub winner_id: TeamId,
    pub stadium: ParkRef,
    pub stadium_name: String,
    pub score: SeriesScore,
    pub result: GameResult,
    pub mvp: Option<SeriesAward>,
    pub highlight: Option<SeriesMoment>,
    pub lowlight: Option<SeriesMoment>,
    pub win_trace: Vec<WinPoint>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct SeriesRecord { pub wins: u32, pub losses: u32 }

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SeriesTeamResult {
    pub id: TeamId,
    pub name: String,
    pub key: String,
    pub record: SeriesRecord,
    pub seed: u32,
    pub home_stadium: ParkRef,
    pub home_stadium_name: String,
    pub totals: TeamBox,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SeriesResult {
    pub series_rules_version: &'static str,
    pub seed_policy: &'static str,
    pub mvp_version: &'static str,
    pub superlatives_version: &'static str,
    pub data_version: String,
    pub seed: u32,
    pub teams: [SeriesTeamResult; 2],
    pub games: Vec<SeriesGame>,
    pub champion_id: TeamId,
    pub score: SeriesScore,
    pub mvp: Option<SeriesAward>,
    pub superlatives: Vec<SeriesSuperlative>,
    pub highlight: Option<SeriesMoment>,
    pub lowlight: Option<SeriesMoment>,
}

/// Order-independent series seed from the two canonical replay keys.
pub fn series_seed(key_a: &str, key_b: &str) -> u32 {
    let (low, high) = if key_a <= key_b { (key_a, key_b) } else { (key_b, key_a) };
    stream_seed(0, &format!("h2h-v1:{low}\0{high}"))
}

/// Seed 1 has more regular-season wins; ties go to the smaller canonical key, then Team A.
fn seed_order(records: &[(TeamId, &str, u32); 2]) -> (TeamId, TeamId) {
    let [a, b] = records;
    if a.2 != b.2 { return if a.2 > b.2 { (a.0, b.0) } else { (b.0, a.0) }; }
    if a.1 != b.1 { return if a.1 < b.1 { (a.0, b.0) } else { (b.0, a.0) }; }
    if a.0 == TeamId::A { (a.0, b.0) } else { (b.0, a.0) }
}

struct Candidate { award: SeriesAward, key: String, batted: bool, fielded: bool, pitched: bool }

/// Every individual with recorded participation, excluding the composite support bullpen.
fn award_candidates(boxes: &[(TeamId, &str, &TeamBox)]) -> Vec<Candidate> {
    let mut merged: Vec<Candidate> = Vec::new();
    fn entry<'c>(merged: &'c mut Vec<Candidate>, team_id: TeamId, key: &str, season_id: &str, display_name: &str) -> &'c mut Candidate {
        let position = merged.iter().position(|candidate| candidate.award.team_id == team_id && candidate.award.season_id == season_id);
        let index = position.unwrap_or_else(|| {
            merged.push(Candidate {
                award: SeriesAward { team_id, season_id: season_id.to_string(), display_name: display_name.to_string(), runs: 0.0, batting: 0.0, running: 0.0, defense: 0.0, pitching: 0.0 },
                key: key.to_string(), batted: false, fielded: false, pitched: false,
            });
            merged.len() - 1
        });
        &mut merged[index]
    }
    for (team_id, key, team_box) in boxes {
        for line in &team_box.batting {
            if line.pa <= 0 && line.fielding_outs <= 0 { continue; }
            let value = entry(&mut merged, *team_id, key, &line.season_id, &line.display_name);
            value.batted |= line.pa > 0;
            value.fielded |= line.fielding_outs > 0;
            value.award.batting += line.batting_runs;
            value.award.running += line.steal_runs;
            value.award.defense += line.defensive_runs;
        }
        for line in &team_box.pitching {
            if line.role == PitcherRole::Support || (line.bf <= 0 && line.outs <= 0) { continue; }
            let value = entry(&mut merged, *team_id, key, &line.season_id, &line.display_name);
            value.pitched = true;
            value.award.pitching += line.pitching_runs_above_neutral;
        }
    }
    for value in merged.iter_mut() { value.award.runs = value.award.batting + value.award.running + value.award.defense + value.award.pitching; }
    merged
}

/// The best candidate by `value` (highest, or lowest when `lowest`); ties use the canonical replay key, season id, then team id.
fn rank_award(candidates: &[&Candidate], value: fn(&SeriesAward) -> f64, lowest: bool) -> Option<SeriesAward> {
    let direction = if lowest { -1.0 } else { 1.0 };
    let mut ranked: Vec<&&Candidate> = candidates.iter().collect();
    ranked.sort_by(|a, b| {
        let difference = direction * (value(&b.award) - value(&a.award));
        difference.partial_cmp(&0.0).unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.key.cmp(&b.key))
            .then_with(|| a.award.season_id.cmp(&b.award.season_id))
            .then_with(|| a.award.team_id.name().cmp(b.award.team_id.name()))
    });
    ranked.first().map(|candidate| candidate.award.clone())
}

/// Highest unrounded run value; ties use the canonical replay key, season id, then team id.
pub fn select_mvp(boxes: &[(TeamId, &str, &TeamBox)]) -> Option<SeriesAward> {
    let candidates = award_candidates(boxes);
    rank_award(&candidates.iter().collect::<Vec<_>>(), |award| award.runs, false)
}

/// Top bat, Ace, Glove, Wheels, and LVP over the given boxes.
pub fn select_superlatives(boxes: &[(TeamId, &str, &TeamBox)]) -> Vec<SeriesSuperlative> {
    let candidates = award_candidates(boxes);
    let filter = |keep: fn(&Candidate) -> bool| candidates.iter().filter(|candidate| keep(candidate)).collect::<Vec<_>>();
    let top_bat = rank_award(&filter(|candidate| candidate.batted), |award| award.batting, false);
    let ace = rank_award(&filter(|candidate| candidate.pitched), |award| award.pitching, false);
    let glove = rank_award(&filter(|candidate| candidate.fielded), |award| award.defense, false).filter(|award| award.defense >= SUPERLATIVE_MIN_RUNS);
    let wheels = rank_award(&filter(|candidate| candidate.batted), |award| award.running, false).filter(|award| award.running >= SUPERLATIVE_MIN_RUNS);
    let lvp = rank_award(&candidates.iter().collect::<Vec<_>>(), |award| award.runs, true);
    [(SuperlativeKind::TopBat, top_bat), (SuperlativeKind::Ace, ace), (SuperlativeKind::Glove, glove), (SuperlativeKind::Wheels, wheels), (SuperlativeKind::Lvp, lvp)]
        .into_iter().filter_map(|(kind, award)| award.map(|award| SeriesSuperlative { kind, award })).collect()
}

fn series_moment(moment: &Option<SeasonMoment>) -> Option<SeriesMoment> {
    moment.as_ref().map(|moment| SeriesMoment {
        moment: moment.clone(), perspective_team_id: TeamId::A,
        batting_team_id: if moment.challenge_batting { TeamId::A } else { TeamId::B },
        pitching_team_id: if moment.challenge_batting { TeamId::B } else { TeamId::A },
    })
}

impl Engine {
    /// Recomputes both regular seasons for seeding, then plays a best-of-five with the higher seed
    /// at home in games 1, 2 and 5. Team A is the stable win-expectancy perspective.
    pub fn simulate_series(&self, request: &SeriesRequest, on_progress: &mut dyn FnMut(SeriesProgress)) -> Result<SeriesResult, String> {
        let [first, second] = &request.teams;
        if first.id != TeamId::A || second.id != TeamId::B { return Err("Series teams must be Team A then Team B".into()); }
        let mut records = Vec::with_capacity(2);
        for team in &request.teams {
            let season = self.simulate_season(&team.season, &mut |game| on_progress(SeriesProgress::RegularSeason { team_id: team.id, completed: game.number }))?;
            records.push((team.id, team.key.as_str(), season.wins, season.losses));
        }
        let (seed_one, seed_two) = seed_order(&[(records[0].0, records[0].1, records[0].2), (records[1].0, records[1].1, records[1].2)]);
        let mut clubs: Vec<TeamInput> = request.teams.iter().map(|team| draft_team(&team.season, &self.data.bullpen, team.id.name(), &team.name)).collect::<Result<_, _>>()?;
        let parks = request.teams.iter().map(|team| self.park(&team.season.home_stadium)).collect::<Result<Vec<_>, _>>()?;
        let defenses = clubs.iter().map(|club| team_defense(club, &self.data.environment.league_error_rates)).collect::<Result<Vec<_>, _>>()?;
        let batting = [self.matchups(&clubs[0].hitters, &clubs[1].pitchers)?, self.matchups(&clubs[1].hitters, &clubs[0].pitchers)?];
        let mut usage = [ReliefUsage::new(&clubs[0]), ReliefUsage::new(&clubs[1])];
        let mut totals = [create_totals_box(&clubs[0]), create_totals_box(&clubs[1])];
        let keys = [first.key.as_str(), second.key.as_str()];
        let seed = series_seed(&first.key, &second.key);
        let models = GameModels { values: &self.values, tables: &self.tables, win_expectancy: SeasonOptions::FULL.win_expectancy.then_some(&self.win_expectancy) };
        let mut score = [0u32; 2];
        let mut games = Vec::new();
        let (mut highlight, mut lowlight): (Option<SeriesMoment>, Option<SeriesMoment>) = (None, None);
        let mut index = 0;
        while index < SERIES_HOME_SEEDS.len() && score[0] < WINS_NEEDED && score[1] < WINS_NEEDED {
            let number = index as u32 + 1;
            let day = SERIES_DAYS[index];
            let home_id = if SERIES_HOME_SEEDS[index] == 1 { seed_one } else { seed_two };
            let away_id = home_id.other();
            for id in [TeamId::A, TeamId::B] {
                let club = &mut clubs[id.index()];
                club.starter_index = index % 3;
                usage[id.index()].prepare(club, i64::from(day));
            }
            let mut win_trace = Vec::new();
            let game = simulate_game(GameInput {
                number, opponent_id: "team-b", opponent_name: &request.teams[1].name, challenge_is_home: home_id == TeamId::A,
                home: &clubs[home_id.index()], away: &clubs[away_id.index()],
                home_defense: defenses[home_id.index()].clone(), away_defense: defenses[away_id.index()].clone(),
                park: parks[home_id.index()], home_matchups: &batting[home_id.index()], away_matchups: &batting[away_id.index()],
            }, &models, &mut GameStreams::new(seed, number), Some(&mut win_trace))?;
            let boxes = |id: TeamId| if id == home_id { &game.home } else { &game.away };
            for id in [TeamId::A, TeamId::B] {
                usage[id.index()].record(i64::from(day), &boxes(id).pitching);
                accumulate_box(&mut totals[id.index()], boxes(id))?;
            }
            let winner_id = if game.win { TeamId::A } else { TeamId::B };
            score[winner_id.index()] += 1;
            let game_highlight = series_moment(&game.highlight);
            let game_lowlight = series_moment(&game.lowlight);
            if let Some(moment) = &game_highlight { if highlight.as_ref().is_none_or(|best| moment.moment.swing > best.moment.swing) { highlight = Some(moment.clone()); } }
            if let Some(moment) = &game_lowlight { if lowlight.as_ref().is_none_or(|worst| moment.moment.swing < worst.moment.swing) { lowlight = Some(moment.clone()); } }
            let mvp = select_mvp(&[(TeamId::A, keys[0], boxes(TeamId::A)), (TeamId::B, keys[1], boxes(TeamId::B))]);
            games.push(SeriesGame {
                number, day, home_team_id: home_id, away_team_id: away_id, winner_id, stadium: game.stadium.clone(), stadium_name: game.stadium_name.clone(),
                score: SeriesScore { a: score[0], b: score[1] }, mvp, highlight: game_highlight, lowlight: game_lowlight, win_trace, result: game,
            });
            on_progress(SeriesProgress::Series { completed: number });
            index += 1;
        }
        let champion_id = if score[0] == WINS_NEEDED { TeamId::A } else { TeamId::B };
        if score[champion_id.index()] != WINS_NEEDED { return Err("Series ended without a champion".into()); }
        let team_boxes = [(TeamId::A, keys[0], &totals[0]), (TeamId::B, keys[1], &totals[1])];
        let mvp = select_mvp(&team_boxes);
        let superlatives = select_superlatives(&team_boxes);
        let [totals_a, totals_b] = totals;
        let team_result = |id: TeamId, totals: TeamBox| {
            let record = records.iter().find(|record| record.0 == id).expect("both seasons ran");
            let park = parks[id.index()];
            SeriesTeamResult {
                id, name: request.teams[id.index()].name.clone(), key: keys[id.index()].to_string(), record: SeriesRecord { wins: record.2, losses: record.3 },
                seed: if id == seed_one { 1 } else { 2 },
                home_stadium: ParkRef { id: park.stadium.id.clone(), version: park.stadium.version.clone() }, home_stadium_name: park.stadium.name.clone(), totals,
            }
        };
        Ok(SeriesResult {
            series_rules_version: SERIES_RULES_VERSION, seed_policy: SERIES_SEED_POLICY, mvp_version: MVP_VERSION, superlatives_version: SUPERLATIVES_VERSION,
            data_version: self.data.data_version.clone(), seed, teams: [team_result(TeamId::A, totals_a), team_result(TeamId::B, totals_b)], games, champion_id,
            score: SeriesScore { a: score[0], b: score[1] }, mvp, superlatives, highlight, lowlight,
        })
    }
}
