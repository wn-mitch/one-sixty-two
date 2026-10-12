//! Engine inputs (deserialized from the TS data contract) and results (serialized back to it).
//! Field names follow `src/lib/game/types.ts` and `src/lib/sim/types.ts`; unknown input fields are ignored.
use crate::rates::Rates;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const POSITIONS: [&str; 8] = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
pub const SLOTS: [&str; 16] = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "SP1", "SP2", "SP3", "CL", "RP1", "RP2", "RP3"];
pub const MODEL_VERSION: &str = "contact-v1";
pub const RULES_VERSION: &str = "classic-v2";

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DefensiveSkills {
    pub hit_prevention: f64,
    pub double_play: f64,
    pub outfield_throwing: f64,
    pub error_avoidance: f64,
    pub catcher_throwing: f64,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct DefenseRecord {
    pub positions: HashMap<String, DefensiveSkills>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct PitchingCounts {
    #[serde(rename = "GS")]
    pub gs: f64,
    #[serde(rename = "IPouts")]
    pub ip_outs: f64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub season_id: String,
    pub player_id: String,
    pub display_name: String,
    pub franchise_id: String,
    pub year: i32,
    pub team_games: f64,
    pub bats: String,
    pub throws: String,
    pub eligible_slots: Vec<String>,
    #[serde(default)]
    pub pitching: Option<PitchingCounts>,
    #[serde(default)]
    pub batting_rates: Option<Rates>,
    #[serde(default)]
    pub pitching_rates: Option<Rates>,
    pub defense: DefenseRecord,
    pub speed: f64,
    pub steal_attempt: f64,
    pub steal_success: f64,
    pub double_play: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct ParkRef {
    pub id: String,
    pub version: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FenceSegment {
    pub start: [f64; 2],
    pub end: [f64; 2],
    pub height_m: f64,
    pub fair: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum OverheadRuling {
    LiveRebound,
    AutomaticDouble,
    HomeRun,
    DeadBall,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverheadObject {
    pub id: String,
    pub polygon: Vec<[f64; 2]>,
    pub height_m: f64,
    pub ruling: OverheadRuling,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StadiumConfig {
    pub id: String,
    pub version: String,
    pub franchise_id: String,
    pub name: String,
    pub fences: Vec<FenceSegment>,
    pub overhead: Vec<OverheadObject>,
    pub air_density_kg_m3: f64,
    pub wind_mps: [f64; 3],
    pub infield_deceleration_mps2: f64,
    pub outfield_deceleration_mps2: f64,
    pub wall_restitution: f64,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ContactSpray {
    #[serde(rename = "L")]
    pub left: Vec<Vec<f64>>,
    #[serde(rename = "R")]
    pub right: Vec<Vec<f64>>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ContactShape {
    pub histogram: Vec<f64>,
    pub spray: ContactSpray,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ContactBasis {
    /// [side][speed node][shift][region][outcome].
    pub responses: Vec<f64>,
    /// [shift][region][class] at unknown side and average speed.
    pub classes: Vec<f64>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ContactModel {
    pub shape: ContactShape,
    pub basis: ContactBasis,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DefensiveEnvironment {
    pub league_rates: Rates,
    pub league_error_rates: HashMap<String, f64>,
    pub league_steal_attempt: f64,
    pub league_steal_success: f64,
    pub league_double_play: f64,
    pub contact_model: ContactModel,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Opponent {
    pub id: String,
    pub name: String,
    pub home_stadium: ParkRef,
    pub hitters: Vec<Profile>,
    pub starters: Vec<Profile>,
    pub closer: Profile,
    /// Named relievers in leverage order: the 8th, the 7th, then middle relief.
    pub relievers: Vec<Profile>,
    /// The remainder arm: the rest of the club's real bullpen, pooled.
    pub bullpen: Profile,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationData {
    pub data_version: String,
    pub defense_method_version: String,
    pub valuation_version: String,
    pub opponents: Vec<Opponent>,
    pub stadiums: Vec<StadiumConfig>,
    /// The drafted club's remainder arm, the same for every roster.
    pub bullpen: Profile,
    #[serde(flatten)]
    pub environment: DefensiveEnvironment,
}

#[derive(Clone, Debug, Deserialize)]
pub struct RosterPick {
    pub profile: Profile,
    pub slot: String,
}

/// One drafted season; validated by the TS caller against the data contract before it gets here.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonRequest {
    pub model_version: String,
    pub rules_version: String,
    pub seed: u32,
    pub home_stadium: ParkRef,
    pub roster: Vec<RosterPick>,
    pub batting_order: Vec<String>,
    pub starter_order: Vec<String>,
}

#[derive(Clone, Copy, Debug, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DefensiveRunComponents {
    pub hit_prevention: f64,
    pub error_avoidance: f64,
    pub double_play: f64,
    pub outfield_throwing: f64,
    pub catcher_throwing: f64,
}

impl DefensiveRunComponents {
    pub fn add(&mut self, other: &Self) {
        self.hit_prevention += other.hit_prevention;
        self.error_avoidance += other.error_avoidance;
        self.double_play += other.double_play;
        self.outfield_throwing += other.outfield_throwing;
        self.catcher_throwing += other.catcher_throwing;
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DefenseComponent {
    HitPrevention,
    ErrorAvoidance,
    DoublePlay,
    OutfieldThrowing,
    CatcherThrowing,
}

impl DefensiveRunComponents {
    pub fn get_mut(&mut self, component: DefenseComponent) -> &mut f64 {
        match component {
            DefenseComponent::HitPrevention => &mut self.hit_prevention,
            DefenseComponent::ErrorAvoidance => &mut self.error_avoidance,
            DefenseComponent::DoublePlay => &mut self.double_play,
            DefenseComponent::OutfieldThrowing => &mut self.outfield_throwing,
            DefenseComponent::CatcherThrowing => &mut self.catcher_throwing,
        }
    }
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BatterLine {
    pub season_id: String,
    pub player_id: String,
    pub display_name: String,
    pub position: String,
    pub year: i32,
    #[serde(rename = "PA")]
    pub pa: i32,
    #[serde(rename = "AB")]
    pub ab: i32,
    #[serde(rename = "H")]
    pub h: i32,
    pub doubles: i32,
    pub triples: i32,
    #[serde(rename = "HR")]
    pub hr: i32,
    #[serde(rename = "BB")]
    pub bb: i32,
    #[serde(rename = "HBP")]
    pub hbp: i32,
    #[serde(rename = "SO")]
    pub so: i32,
    #[serde(rename = "R")]
    pub r: i32,
    #[serde(rename = "RBI")]
    pub rbi: i32,
    #[serde(rename = "SB")]
    pub sb: i32,
    #[serde(rename = "CS")]
    pub cs: i32,
    #[serde(rename = "SF")]
    pub sf: i32,
    pub batting_runs: f64,
    pub steal_runs: f64,
    pub defensive_runs: f64,
    pub defensive_components: DefensiveRunComponents,
    pub fielding_outs: i32,
    pub caught_advancing: i32,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PitcherRole {
    Starter,
    Closer,
    /// A named reliever: the 8th, the 7th or middle relief.
    Reliever,
    /// The remainder arm for relief innings no available named pitcher takes.
    Support,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PitcherLine {
    pub season_id: String,
    pub player_id: String,
    pub display_name: String,
    pub year: i32,
    pub role: PitcherRole,
    pub outs: i32,
    #[serde(rename = "H")]
    pub h: i32,
    #[serde(rename = "BB")]
    pub bb: i32,
    #[serde(rename = "HBP")]
    pub hbp: i32,
    #[serde(rename = "SO")]
    pub so: i32,
    #[serde(rename = "R")]
    pub r: i32,
    pub starts: i32,
    pub appearances: i32,
    #[serde(rename = "BF")]
    pub bf: i32,
    pub pitching_runs_above_neutral: f64,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TeamBox {
    pub id: String,
    pub name: String,
    pub runs: i32,
    pub innings: Vec<Option<i32>>,
    pub batting: Vec<BatterLine>,
    pub pitching: Vec<PitcherLine>,
    pub batting_runs: f64,
    pub steal_runs: f64,
    pub defensive_runs: f64,
    pub defensive_components: DefensiveRunComponents,
    pub pitching_runs_above_neutral: f64,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MomentOutcome {
    Walk,
    HitByPitch,
    Strikeout,
    Single,
    Double,
    Triple,
    HomeRun,
    GroundedIntoDoublePlay,
    SacrificeFly,
    Out,
    ReachedOnError,
    StolenBase,
    CaughtStealing,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Half {
    Top,
    Bottom,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SeasonMoment {
    pub game_number: u32,
    pub opponent_name: String,
    pub is_home: bool,
    pub inning: u32,
    pub half: Half,
    pub outs_before: u32,
    pub bases_before: u32,
    pub challenge_runs_before: i32,
    pub opponent_runs_before: i32,
    pub challenge_runs_after: i32,
    pub opponent_runs_after: i32,
    pub batter_name: String,
    pub batter_season_id: String,
    pub pitcher_name: String,
    pub pitcher_season_id: String,
    pub challenge_batting: bool,
    pub outcome: MomentOutcome,
    pub runs_scored: i32,
    pub win_before: f64,
    pub win_after: f64,
    pub swing: f64,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
pub struct WinPoint {
    pub half: u32,
    pub win: f64,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GameResult {
    pub number: u32,
    pub opponent_id: String,
    pub opponent_name: String,
    pub is_home: bool,
    pub stadium: ParkRef,
    pub stadium_name: String,
    pub home: TeamBox,
    pub away: TeamBox,
    pub challenge_runs: i32,
    pub opponent_runs: i32,
    pub win: bool,
    pub highlight: Option<SeasonMoment>,
    pub lowlight: Option<SeasonMoment>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SeasonResult {
    pub model_version: String,
    pub rules_version: String,
    pub data_version: String,
    pub seed: u32,
    pub home_stadium: ParkRef,
    pub defense_method_version: String,
    pub valuation_version: String,
    pub wins: u32,
    pub losses: u32,
    pub first_loss: Option<u32>,
    pub longest_winning_streak: u32,
    pub runs_for: i32,
    pub runs_against: i32,
    pub games: Vec<GameResult>,
    pub batting: Vec<BatterLine>,
    pub pitching: Vec<PitcherLine>,
    pub starter_starts: [u32; 3],
    pub highlight: Option<SeasonMoment>,
    pub lowlight: Option<SeasonMoment>,
    pub highlight_trace: Option<Vec<WinPoint>>,
    pub lowlight_trace: Option<Vec<WinPoint>>,
}
