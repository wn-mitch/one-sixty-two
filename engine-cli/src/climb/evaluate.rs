//! Season evaluation for search: cached matchup rows per candidate, fast seasons across a seed panel.
use super::data::Dataset;
use super::roster::Roster;
use engine::contact_profile::{matchup_row, MatchupRow, PreparedMatchups};
use engine::season::{draft_team, opponent_team, OpponentMatchups};
use engine::team::TeamInput;
use engine::types::Profile;
use engine::SeasonOptions;
use rayon::prelude::*;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// One season's outcome on one seed.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonScore { pub wins: u32, pub runs_for: i32, pub runs_against: i32 }

/// One game as the probability report needs it: opponent, venue, rotation spot, result.
#[derive(Clone, Copy, Debug)]
pub struct GameOutcome { pub opponent: usize, pub is_home: bool, pub rotation: usize, pub win: bool }

pub struct Evaluator<'d> {
    data: &'d Dataset,
    opponents: Vec<TeamInput<'d>>,
    opponent_index: HashMap<&'d str, usize>,
    /// Hitter candidate -> rows against every opponent pitcher, opponent-major.
    batting_rows: Mutex<HashMap<usize, Arc<Vec<MatchupRow>>>>,
    /// Pitcher candidate -> rows for every opponent hitter against it, opponent-major.
    pitching_rows: Mutex<HashMap<usize, Arc<Vec<MatchupRow>>>>,
}

impl<'d> Evaluator<'d> {
    pub fn new(data: &'d Dataset) -> Result<Self, String> {
        let opponents = data.engine.data.opponents.iter().map(opponent_team).collect::<Result<Vec<_>, _>>()?;
        let opponent_index = data.engine.data.opponents.iter().enumerate().map(|(index, opponent)| (opponent.id.as_str(), index)).collect();
        Ok(Self { data, opponents, opponent_index, batting_rows: Mutex::default(), pitching_rows: Mutex::default() })
    }

    fn row(&self, batter: &Profile, pitcher: &Profile) -> Result<MatchupRow, String> {
        let environment = &self.data.engine.data.environment;
        matchup_row(batter, pitcher, &environment.league_rates, &environment.contact_model.basis, self.data.engine.prior())
    }

    /// Fills both row caches for the roster's picks, fitting missing candidates in parallel.
    fn ensure_rows(&self, roster: &Roster) -> Result<(), String> {
        let missing_batting: Vec<usize> = { let cache = self.batting_rows.lock().unwrap(); roster.picks[..9].iter().copied().filter(|c| !cache.contains_key(c)).collect() };
        let missing_pitching: Vec<usize> = { let cache = self.pitching_rows.lock().unwrap(); roster.picks[9..].iter().copied().filter(|c| !cache.contains_key(c)).collect() };
        let candidates = &self.data.candidates;
        let batting = missing_batting.par_iter().map(|&candidate| {
            let batter = &candidates[candidate].profile;
            let rows = self.opponents.iter().flat_map(|team| team.pitchers.iter().map(move |pitcher| (batter, *pitcher)))
                .map(|(batter, pitcher)| self.row(batter, pitcher)).collect::<Result<Vec<_>, _>>()?;
            Ok((candidate, Arc::new(rows)))
        }).collect::<Result<Vec<_>, String>>()?;
        let pitching = missing_pitching.par_iter().map(|&candidate| {
            let pitcher = &candidates[candidate].profile;
            let rows = self.opponents.iter().flat_map(|team| team.hitters.iter().map(move |batter| (*batter, pitcher)))
                .map(|(batter, pitcher)| self.row(batter, pitcher)).collect::<Result<Vec<_>, _>>()?;
            Ok((candidate, Arc::new(rows)))
        }).collect::<Result<Vec<_>, String>>()?;
        self.batting_rows.lock().unwrap().extend(batting);
        self.pitching_rows.lock().unwrap().extend(pitching);
        Ok(())
    }

    /// The same matchups `Engine::season_matchups` builds for this roster, assembled from cached rows.
    pub fn matchups(&self, roster: &Roster) -> Result<Vec<OpponentMatchups>, String> {
        self.ensure_rows(roster)?;
        let batting_cache = self.batting_rows.lock().unwrap();
        let pitching_cache = self.pitching_rows.lock().unwrap();
        let hitters: Vec<Arc<Vec<MatchupRow>>> = roster.batting.iter().map(|&slot| batting_cache[&roster.picks[slot]].clone()).collect();
        let staff: Vec<usize> = roster.rotation.iter().copied().chain([12, 13]).collect();
        let pitchers: Vec<Arc<Vec<MatchupRow>>> = staff.iter().map(|&slot| pitching_cache[&roster.picks[slot]].clone()).collect();
        let mut batting_offset = 0;
        let mut pitching_offset = 0;
        Ok(self.opponents.iter().map(|team| {
            let (opponent_pitchers, opponent_hitters) = (team.pitchers.len(), team.hitters.len());
            let challenge_batting = PreparedMatchups::from_rows(hitters.len(), opponent_pitchers,
                hitters.iter().flat_map(|rows| rows[batting_offset..batting_offset + opponent_pitchers].iter().cloned()));
            let opponent_batting = PreparedMatchups::from_rows(opponent_hitters, pitchers.len(),
                (0..opponent_hitters).flat_map(|hitter| pitchers.iter().map(move |rows| rows[pitching_offset + hitter].clone())));
            batting_offset += opponent_pitchers;
            pitching_offset += opponent_hitters;
            OpponentMatchups { challenge_batting, opponent_batting }
        }).collect())
    }

    /// Fast seasons on every seed, in seed order.
    pub fn scores(&self, roster: &Roster, seeds: &[u32]) -> Result<Vec<SeasonScore>, String> {
        self.run(roster, seeds, |_, _| {})
    }

    /// Fast seasons on every seed, reporting each game to `visit(seed index, game)`.
    pub fn run(&self, roster: &Roster, seeds: &[u32], visit: impl Fn(usize, GameOutcome) + Sync) -> Result<Vec<SeasonScore>, String> {
        let matchups = self.matchups(roster)?;
        seeds.par_iter().enumerate().map(|(index, &seed)| {
            let request = roster.request(self.data, seed);
            let challenge = draft_team(&request, "challenge", "Your team")?;
            let result = self.data.engine.simulate_prepared(&request, &challenge, &matchups, SeasonOptions::FAST, &mut |game| {
                visit(index, GameOutcome { opponent: self.opponent_index[game.opponent_id.as_str()], is_home: game.is_home, rotation: (game.number as usize - 1) % 3, win: game.win });
            })?;
            Ok(SeasonScore { wins: result.wins, runs_for: result.runs_for, runs_against: result.runs_against })
        }).collect()
    }

    pub fn cached_candidates(&self) -> usize { self.batting_rows.lock().unwrap().len() + self.pitching_rows.lock().unwrap().len() }
}
