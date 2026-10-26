//! Team inputs and box totals (`src/lib/sim/team.ts`, `createBox` in `game.ts`).
use crate::relief::Roles;
use crate::types::{BatterLine, DefensiveRunComponents, PitcherLine, PitcherRole, Profile, TeamBox, POSITIONS};

#[derive(Clone, Debug)]
pub struct TeamInput<'p> {
    pub id: String,
    pub name: String,
    pub hitters: Vec<&'p Profile>,
    /// Lineup index fielding each of POSITIONS.
    pub defense: [usize; 8],
    pub pitchers: Vec<&'p Profile>,
    pub starter_index: usize,
    /// Outs beyond his usual budget today's starter is ridden for.
    pub starter_extra_outs: u32,
    pub closer_index: usize,
    /// Named relievers RP1 onward, in bullpen order.
    pub relievers: Vec<usize>,
    /// The remainder arm for relief innings no available named pitcher takes.
    pub bullpen_index: usize,
    /// Whether each pitcher may enter today, by pitcher index; read for the closer and named relievers.
    pub available: Vec<bool>,
    /// Whether each named pitcher sat out the previous game; secondary roles call only rested arms.
    pub rested: Vec<bool>,
    /// Relief roles by pitcher index; set for the closer and every named reliever.
    pub roles: Vec<Option<Roles>>,
}

impl TeamInput<'_> {
    /// The closer, then the named relievers, in bullpen order.
    pub fn named_relief(&self) -> impl Iterator<Item = usize> + '_ { std::iter::once(self.closer_index).chain(self.relievers.iter().copied()) }
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
            grand_slams: 0, walk_off_home_runs: 0,
        }).collect(),
        pitching: team.pitchers.iter().enumerate().map(|(index, profile)| PitcherLine {
            season_id: profile.season_id.clone(), player_id: profile.player_id.clone(), display_name: profile.display_name.clone(), year: profile.year,
            role: if index == team.bullpen_index { PitcherRole::Support } else if index == team.closer_index { PitcherRole::Closer }
                else if team.relievers.contains(&index) { PitcherRole::Reliever } else { PitcherRole::Starter },
            outs: 0, h: 0, bb: 0, hbp: 0, so: 0, r: 0,
            starts: (index == team.starter_index) as i32, appearances: (index == team.starter_index) as i32,
            bf: 0, pitching_runs_above_neutral: 0.0, saves: 0, blown_saves: 0, save_opportunities: 0,
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
        total.grand_slams += line.grand_slams; total.walk_off_home_runs += line.walk_off_home_runs;
        total.defensive_components.add(&line.defensive_components);
    }
    for (total, line) in totals.pitching.iter_mut().zip(&game.pitching) {
        total.outs += line.outs; total.h += line.h; total.bb += line.bb; total.hbp += line.hbp; total.so += line.so; total.r += line.r;
        total.starts += line.starts; total.appearances += line.appearances; total.bf += line.bf;
        total.saves += line.saves; total.blown_saves += line.blown_saves; total.save_opportunities += line.save_opportunities;
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

