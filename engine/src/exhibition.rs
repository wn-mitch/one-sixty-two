//! One standalone game between two supplied clubs, for calibration outside the season schedule.
use crate::game::{simulate_game, team_defense, GameInput, GameModels};
use crate::flight::PreparedPark;
use crate::random::GameStreams;
use crate::season::Engine;
use crate::team::TeamInput;
use crate::types::{GameResult, Profile, StadiumConfig, POSITIONS};
use serde::Deserialize;
use std::collections::HashMap;

/// A club as the TS `TeamInput`: `defense` maps each position to a lineup index.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExhibitionTeam {
    pub id: String,
    pub name: String,
    pub hitters: Vec<Profile>,
    pub defense: HashMap<String, usize>,
    pub pitchers: Vec<Profile>,
    pub starter_index: usize,
    pub closer_index: usize,
    pub bullpen_index: usize,
    pub closer_available: bool,
    pub closer_outs_remaining: f64,
}

/// One game in `stadium`, drawing from the streams for (`seed`, `game`).
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExhibitionRequest {
    pub number: u32,
    pub challenge_is_home: bool,
    pub home: ExhibitionTeam,
    pub away: ExhibitionTeam,
    pub stadium: StadiumConfig,
    pub seed: u32,
    pub game: u32,
}

impl ExhibitionTeam {
    fn input(&self) -> Result<TeamInput<'_>, String> {
        let mut defense = [0usize; 8];
        for (position, name) in POSITIONS.iter().enumerate() {
            let index = *self.defense.get(*name).ok_or_else(|| format!("{}: missing fielder at {name}", self.id))?;
            if index >= self.hitters.len() { return Err(format!("{}: fielder at {name} is outside the lineup", self.id)); }
            defense[position] = index;
        }
        for index in [self.starter_index, self.closer_index, self.bullpen_index] {
            if index >= self.pitchers.len() { return Err(format!("{}: pitcher index is outside the staff", self.id)); }
        }
        Ok(TeamInput {
            id: self.id.clone(), name: self.name.clone(), hitters: self.hitters.iter().collect(), defense, pitchers: self.pitchers.iter().collect(),
            starter_index: self.starter_index, closer_index: self.closer_index, bullpen_index: self.bullpen_index,
            closer_available: self.closer_available, closer_outs_remaining: self.closer_outs_remaining,
        })
    }
}

impl Engine {
    /// Plays one full game without win expectancy; scores and boxes match a season game's.
    pub fn simulate_exhibition(&self, request: &ExhibitionRequest) -> Result<GameResult, String> {
        let home = request.home.input()?;
        let away = request.away.input()?;
        let errors = &self.data.environment.league_error_rates;
        let opponent = if request.challenge_is_home { &away } else { &home };
        let park = PreparedPark::new(&request.stadium)?;
        let home_matchups = self.matchups(&home.hitters, &away.pitchers)?;
        let away_matchups = self.matchups(&away.hitters, &home.pitchers)?;
        let models = GameModels { values: &self.values, tables: &self.tables, win_expectancy: None };
        simulate_game(GameInput {
            number: request.number, opponent_id: &opponent.id, opponent_name: &opponent.name, challenge_is_home: request.challenge_is_home,
            home: &home, away: &away, home_defense: team_defense(&home, errors)?, away_defense: team_defense(&away, errors)?,
            park: &park, home_matchups: &home_matchups, away_matchups: &away_matchups,
        }, &models, &mut GameStreams::new(request.seed, request.game), None)
    }
}
