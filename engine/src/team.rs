//! Team inputs and box totals (`src/lib/sim/team.ts`, `createBox` in `game.ts`).
use crate::types::{BatterLine, DefensiveRunComponents, PitcherLine, PitcherRole, Profile, TeamBox, POSITIONS};
use crate::workload::closer_budget;

#[derive(Clone, Debug)]
pub struct TeamInput<'p> {
    pub id: String,
    pub name: String,
    pub hitters: Vec<&'p Profile>,
    /// Lineup index fielding each of POSITIONS.
    pub defense: [usize; 8],
    pub pitchers: Vec<&'p Profile>,
    pub starter_index: usize,
    pub closer_index: usize,
    pub bullpen_index: usize,
    pub closer_available: bool,
    pub closer_outs_remaining: f64,
}

pub fn create_box(team: &TeamInput) -> TeamBox {
    TeamBox {
        id: team.id.clone(), name: team.name.clone(), runs: 0, innings: Vec::with_capacity(12),
        batting: team.hitters.iter().enumerate().map(|(index, profile)| BatterLine {
            season_id: profile.season_id.clone(), player_id: profile.player_id.clone(), display_name: profile.display_name.clone(),
            position: team.defense.iter().position(|fielder| *fielder == index).map_or("DH", |position| POSITIONS[position]).to_string(),
            year: profile.year,
            pa: 0, ab: 0, h: 0, doubles: 0, triples: 0, hr: 0, bb: 0, hbp: 0, so: 0, r: 0, rbi: 0, sb: 0, cs: 0, sf: 0,
            batting_runs: 0.0, steal_runs: 0.0, defensive_runs: 0.0, defensive_components: DefensiveRunComponents::default(), fielding_outs: 0, caught_advancing: 0,
        }).collect(),
        pitching: team.pitchers.iter().enumerate().map(|(index, profile)| PitcherLine {
            season_id: profile.season_id.clone(), player_id: profile.player_id.clone(), display_name: profile.display_name.clone(), year: profile.year,
            role: if index == team.bullpen_index { PitcherRole::Support } else if index == team.closer_index { PitcherRole::Closer } else { PitcherRole::Starter },
            outs: 0, h: 0, bb: 0, hbp: 0, so: 0, r: 0,
            starts: (index == team.starter_index) as i32, appearances: (index == team.starter_index) as i32,
            bf: 0, pitching_runs_above_neutral: 0.0,
        }).collect(),
        batting_runs: 0.0, steal_runs: 0.0, defensive_runs: 0.0, defensive_components: DefensiveRunComponents::default(), pitching_runs_above_neutral: 0.0,
    }
}

/// A zeroed totals box; a fresh game box otherwise counts one starter appearance.
pub fn create_totals_box(team: &TeamInput) -> TeamBox {
    let mut totals = create_box(team);
    for pitcher in totals.pitching.iter_mut() { pitcher.starts = 0; pitcher.appearances = 0; }
    totals
}

/// Adds one game box into running totals for the same club; rosters must match in identity and order.
pub fn accumulate_box(totals: &mut TeamBox, game: &TeamBox) -> Result<(), String> {
    if totals.id != game.id || totals.batting.len() != game.batting.len() || totals.pitching.len() != game.pitching.len()
        || totals.batting.iter().zip(&game.batting).any(|(a, b)| a.season_id != b.season_id)
        || totals.pitching.iter().zip(&game.pitching).any(|(a, b)| a.season_id != b.season_id) {
        return Err("Cannot total boxes for different rosters".into());
    }
    for (total, line) in totals.batting.iter_mut().zip(&game.batting) {
        total.pa += line.pa; total.ab += line.ab; total.h += line.h; total.doubles += line.doubles; total.triples += line.triples;
        total.hr += line.hr; total.bb += line.bb; total.hbp += line.hbp; total.so += line.so; total.r += line.r; total.rbi += line.rbi;
        total.sb += line.sb; total.cs += line.cs; total.sf += line.sf;
        total.batting_runs += line.batting_runs; total.steal_runs += line.steal_runs; total.defensive_runs += line.defensive_runs;
        total.fielding_outs += line.fielding_outs; total.caught_advancing += line.caught_advancing;
        total.defensive_components.add(&line.defensive_components);
    }
    for (total, line) in totals.pitching.iter_mut().zip(&game.pitching) {
        total.outs += line.outs; total.h += line.h; total.bb += line.bb; total.hbp += line.hbp; total.so += line.so; total.r += line.r;
        total.starts += line.starts; total.appearances += line.appearances; total.bf += line.bf;
        total.pitching_runs_above_neutral += line.pitching_runs_above_neutral;
    }
    totals.runs += game.runs;
    totals.batting_runs += game.batting_runs;
    totals.steal_runs += game.steal_runs;
    totals.defensive_runs += game.defensive_runs;
    totals.pitching_runs_above_neutral += game.pitching_runs_above_neutral;
    totals.defensive_components.add(&game.defensive_components);
    Ok(())
}

pub fn closer_cap(team: &TeamInput) -> Result<f64, String> { closer_budget(team.pitchers[team.closer_index]) }
