//! One standalone game between two supplied clubs, for calibration outside the season schedule.
//! Named relievers take their default roles.
use crate::game::{simulate_game, team_defense, GameInput, GameModels};
use crate::flight::PreparedPark;
use crate::random::GameStreams;
use crate::relief::default_roles;
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
    pub relievers: Vec<usize>,
    pub bullpen_index: usize,
    /// Whether each pitcher may enter, by pitcher index.
    pub available: Vec<bool>,
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
        for &index in [self.starter_index, self.closer_index, self.bullpen_index].iter().chain(&self.relievers) {
            if index >= self.pitchers.len() { return Err(format!("{}: pitcher index is outside the staff", self.id)); }
        }
        if self.relievers.len() > 5 { return Err(format!("{}: at most five named relievers", self.id)); }
        let mut roles = vec![None; self.pitchers.len()];
        let named = std::iter::once(self.closer_index).chain(self.relievers.iter().copied());
        for (index, assigned) in named.zip(default_roles(1 + self.relievers.len())) { roles[index] = Some(assigned); }
        Ok(TeamInput {
            id: self.id.clone(), name: self.name.clone(), hitters: self.hitters.iter().collect(), defense, pitchers: self.pitchers.iter().collect(),
            starter_index: self.starter_index, starter_extra_outs: 0, closer_index: self.closer_index, relievers: self.relievers.clone(), bullpen_index: self.bullpen_index,
            available: self.available.clone(), rested: self.available.clone(), roles,
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
            park: &park, home_matchups: &home_matchups, away_matchups: &away_matchups, home_edge: 0.0, crowd: &mut Default::default(), rules: Default::default(),
        }, &models, &mut GameStreams::new(request.seed, request.game), None)
    }
}
