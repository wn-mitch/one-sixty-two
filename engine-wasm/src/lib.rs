//! wasm-bindgen glue: JSON strings cross the boundary; all logic lives in the `engine` crate.
use engine::exhibition::ExhibitionRequest;
use engine::league::LeagueChapterRequest;
use engine::prep::MatchupQuery;
use engine::series::SeriesRequest;
use engine::types::{ContactShape, DefensiveEnvironment, DefensiveSkills, SeasonRequest, StadiumConfig};
use wasm_bindgen::prelude::*;

fn parse<T: serde::de::DeserializeOwned>(json: &str, label: &str) -> Result<T, JsError> {
    serde_json::from_str(json).map_err(|error| JsError::new(&format!("Invalid {label}: {error}")))
}

fn fail(error: String) -> JsError { JsError::new(&error) }

fn to_json<T: serde::Serialize>(value: &T) -> Result<String, JsError> {
    serde_json::to_string(value).map_err(|error| JsError::new(&error.to_string()))
}

/// The simulation engine prepared from one simulation data file.
#[wasm_bindgen]
pub struct Engine { inner: engine::Engine }

#[wasm_bindgen]
impl Engine {
    #[wasm_bindgen(constructor)]
    pub fn new(simulation_json: &str) -> Result<Engine, JsError> {
        Ok(Engine { inner: engine::Engine::from_json(simulation_json).map_err(|error| JsError::new(&error))? })
    }

    /// Plays one season; `on_game(number)` runs after every game.
    #[wasm_bindgen(js_name = simulateSeason)]
    pub fn simulate_season(&self, request_json: &str, on_game: &js_sys::Function) -> Result<String, JsError> {
        let request: SeasonRequest = parse(request_json, "season request")?;
        let result = self.inner.simulate_season(&request, &mut |game| { let _ = on_game.call1(&JsValue::NULL, &JsValue::from(game.number)); })
            .map_err(|error| JsError::new(&error))?;
        to_json(&result)
    }

    /// Plays both regular seasons and the series; `on_progress(json)` receives each progress step.
    #[wasm_bindgen(js_name = simulateSeries)]
    pub fn simulate_series(&self, request_json: &str, on_progress: &js_sys::Function) -> Result<String, JsError> {
        let request: SeriesRequest = parse(request_json, "series request")?;
        let result = self.inner.simulate_series(&request, &mut |progress| {
            if let Ok(json) = serde_json::to_string(&progress) { let _ = on_progress.call1(&JsValue::NULL, &JsValue::from(json)); }
        }).map_err(|error| JsError::new(&error))?;
        to_json(&result)
    }

    /// Plays one Draft Mode league chapter; `on_game(count)` runs after every game.
    #[wasm_bindgen(js_name = simulateLeagueChapter)]
    pub fn simulate_league_chapter(&self, request_json: &str, on_game: &js_sys::Function) -> Result<String, JsError> {
        let request: LeagueChapterRequest = parse(request_json, "league chapter request")?;
        let result = self.inner.simulate_league_chapter(&request, &mut |count| { let _ = on_game.call1(&JsValue::NULL, &JsValue::from(count as u32)); })
            .map_err(fail)?;
        to_json(&result)
    }

    /// Plays one standalone game for calibration; returns the game result JSON.
    #[wasm_bindgen(js_name = simulateExhibition)]
    pub fn simulate_exhibition(&self, request_json: &str) -> Result<String, JsError> {
        let request: ExhibitionRequest = parse(request_json, "exhibition request")?;
        to_json(&self.inner.simulate_exhibition(&request).map_err(fail)?)
    }
}

/// League contact fits, run weights, and defensive values for data preparation and pricing.
#[wasm_bindgen]
pub struct DataPrep { inner: engine::prep::DataPrep }

#[wasm_bindgen]
impl DataPrep {
    /// `environment_json` is a `DefensiveEnvironment`; `neutral_park_json` the neutral reference stadium.
    #[wasm_bindgen(constructor)]
    pub fn new(environment_json: &str, neutral_park_json: &str) -> Result<DataPrep, JsError> {
        let environment: DefensiveEnvironment = parse(environment_json, "defensive environment")?;
        let park: StadiumConfig = parse(neutral_park_json, "neutral park")?;
        Ok(DataPrep { inner: engine::prep::DataPrep::new(&environment, &park).map_err(fail)? })
    }

    #[wasm_bindgen(js_name = eventRunWeights)]
    pub fn event_run_weights(&self) -> Result<String, JsError> { to_json(&self.inner.event_run_weights().map_err(fail)?) }

    #[wasm_bindgen(js_name = stateVisits)]
    pub fn state_visits(&self) -> Vec<f64> { self.inner.state_visits().to_vec() }

    /// Skills are passed as numbers so per-position bisection avoids JSON on every call.
    #[wasm_bindgen(js_name = expectedDefensiveRuns)]
    pub fn expected_defensive_runs(&self, position: &str, hit_prevention: f64, double_play: f64, outfield_throwing: f64, error_avoidance: f64, catcher_throwing: f64) -> Result<f64, JsError> {
        let skills = DefensiveSkills { hit_prevention, double_play, outfield_throwing, error_avoidance, catcher_throwing };
        self.inner.expected_defensive_runs(position, &skills).map_err(fail)
    }

    /// Fits a JSON array of matchup queries; returns a JSON array of fits in the same order.
    #[wasm_bindgen(js_name = fitMatchups)]
    pub fn fit_matchups(&self, queries_json: &str) -> Result<String, JsError> {
        let queries: Vec<MatchupQuery> = parse(queries_json, "matchup queries")?;
        let fits = queries.iter().map(|query| self.inner.fit_matchup(query)).collect::<Result<Vec<_>, _>>().map_err(fail)?;
        to_json(&fits)
    }
}

#[wasm_bindgen]
impl DataPrep {
    /// Traces `stadium_json` (a `StadiumConfig`) for every batting side; a few seconds per park.
    #[wasm_bindgen(js_name = parkBasis)]
    pub fn park_basis(&self, stadium_json: &str) -> Result<Vec<f64>, JsError> {
        let park: StadiumConfig = parse(stadium_json, "stadium")?;
        self.inner.park_basis(&park).map_err(fail)
    }

    /// Runs and outs per plate appearance for each query in each park of `bases` (park bases
    /// concatenated in order), flattened query-major as `[runs, outs]` per park.
    #[wasm_bindgen(js_name = parkRunValues)]
    pub fn park_run_values(&self, bases: &[f64], queries_json: &str) -> Result<Vec<f64>, JsError> {
        let set = engine::prep::ParkSet::from_flat(bases).map_err(fail)?;
        let queries: Vec<MatchupQuery> = parse(queries_json, "matchup queries")?;
        let mut values = Vec::with_capacity(queries.len() * set.len() * 2);
        for query in &queries {
            for value in self.inner.park_run_values(&set, query).map_err(fail)? {
                values.push(value.runs);
                values.push(value.outs);
            }
        }
        Ok(values)
    }
}

/// The neutral contact basis for a contact shape, as JSON.
#[wasm_bindgen(js_name = buildContactBasis)]
pub fn build_contact_basis(shape_json: &str, neutral_park_json: &str) -> Result<String, JsError> {
    let shape: ContactShape = parse(shape_json, "contact shape")?;
    let park: StadiumConfig = parse(neutral_park_json, "neutral park")?;
    to_json(&engine::prep::contact_basis(&shape, &park).map_err(fail)?)
}

/// The season schedule for `seed` against thirty opponent ids, as JSON `[{opponentId, isHome}]`.
#[wasm_bindgen(js_name = buildSchedule)]
pub fn build_schedule(seed: u32, opponent_ids_json: &str) -> Result<String, JsError> {
    let ids: Vec<String> = parse(opponent_ids_json, "opponent ids")?;
    let refs: Vec<&str> = ids.iter().map(String::as_str).collect();
    let schedule = engine::season::build_schedule(seed, &refs).map_err(fail)?;
    let games: Vec<serde_json::Value> = schedule.iter().map(|game| serde_json::json!({ "opponentId": refs[game.opponent], "isHome": game.is_home })).collect();
    to_json(&games)
}

/// The Draft Mode league schedule for `seed` and four rival pairs, as JSON `[[{home, away}; 4]; 162]`.
#[wasm_bindgen(js_name = buildLeagueSchedule)]
pub fn build_league_schedule(seed: u32, rivals_json: &str) -> Result<String, JsError> {
    let rivals: Vec<[usize; 2]> = parse(rivals_json, "rival pairs")?;
    to_json(&engine::league::build_league_schedule(seed, &rivals).map_err(fail)?)
}
