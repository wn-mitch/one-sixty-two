//! The engine's prepared data and the 162-game season (`src/lib/sim/season.ts`).
use crate::contact::PreparedDefense;
use crate::contact_profile::{build_matchup_inputs, league_contact_fit, shape_tables, ContactFit, PreparedMatchups, ShapeTables};
use crate::flight::PreparedPark;
use crate::game::{simulate_game, team_defense, GameInput, GameModels};
use crate::physical_expectation::{PhysicalReference, INFINITY_TARGET};
use crate::random::{random_stream, shuffle, GameStreams};
use crate::team::{accumulate_box, create_totals_box, TeamInput};
use crate::types::{GameResult, Opponent, ParkRef, Profile, SeasonRequest, SeasonResult, SimulationData, StadiumConfig, WinPoint, POSITIONS};
use crate::value::RunValueModel;
use crate::win_expectancy::WinExpectancyModel;
use crate::workload::ReliefUsage;

/// Simulation data plus every table derived from it once.
pub struct Engine {
    pub data: SimulationData,
    pub tables: ShapeTables,
    pub league_fit: ContactFit,
    pub reference: PhysicalReference,
    pub values: RunValueModel,
    pub win_expectancy: WinExpectancyModel,
    parks: Vec<PreparedPark>,
}

#[derive(Clone, Copy, Debug)]
pub struct ScheduleGame { pub opponent: usize, pub is_home: bool }

/// Season output options. Skipping win expectancy changes no score, box, or random draw.
#[derive(Clone, Copy, Debug)]
pub struct SeasonOptions { pub win_expectancy: bool, pub keep_games: bool }

impl SeasonOptions {
    pub const FULL: Self = Self { win_expectancy: true, keep_games: true };
    pub const FAST: Self = Self { win_expectancy: false, keep_games: false };
}

/// Challenge-side matchups against one opponent: (challenge hitters vs their pitchers, their hitters vs challenge pitchers).
pub struct OpponentMatchups { pub challenge_batting: PreparedMatchups, pub opponent_batting: PreparedMatchups }

impl Engine {
    pub fn new(data: SimulationData) -> Result<Self, String> {
        let tables = shape_tables(&data.environment.contact_model.shape)?;
        let league_fit = league_contact_fit(&data.environment.contact_model, &tables, &data.environment.league_rates)?;
        let reference = PhysicalReference::new(&data.environment, tables.clone(), league_fit.clone())?;
        let values = RunValueModel::new(&reference);
        let win_expectancy = WinExpectancyModel::new(&reference.transitions[INFINITY_TARGET])?;
        let parks = data.stadiums.iter().map(PreparedPark::new).collect::<Result<Vec<_>, _>>()?;
        if data.opponents.len() != 30 { return Err("Season requires thirty distinct opponents".into()); }
        Ok(Self { data, tables, league_fit, reference, values, win_expectancy, parks })
    }

    pub fn from_json(json: &str) -> Result<Self, String> {
        Self::new(serde_json::from_str(json).map_err(|error| format!("Invalid simulation data: {error}"))?)
    }

    /// Resolves a pinned stadium; an unknown id or a different version is incompatible.
    pub fn park(&self, reference: &ParkRef) -> Result<&PreparedPark, String> {
        self.data.stadiums.iter().position(|stadium: &StadiumConfig| stadium.id == reference.id && stadium.version == reference.version)
            .map(|index| &self.parks[index])
            .ok_or_else(|| "Home stadium is incompatible with this dataset".into())
    }

    pub fn prior(&self) -> &[f64; crate::contact_profile::REGION_COUNT] { &self.league_fit.region_weights }

    pub fn matchups(&self, batters: &[&Profile], pitchers: &[&Profile]) -> Result<PreparedMatchups, String> {
        let environment = &self.data.environment;
        build_matchup_inputs(batters, pitchers, &environment.league_rates, &environment.contact_model.basis, self.prior())
    }

    /// Matchups against every opponent in data order.
    pub fn season_matchups(&self, challenge: &TeamInput) -> Result<Vec<OpponentMatchups>, String> {
        self.data.opponents.iter().map(|opponent| {
            let team = opponent_team(opponent)?;
            Ok(OpponentMatchups {
                challenge_batting: self.matchups(&challenge.hitters, &team.pitchers)?,
                opponent_batting: self.matchups(&team.hitters, &challenge.pitchers)?,
            })
        }).collect()
    }

    fn defense(&self, team: &TeamInput) -> Result<PreparedDefense, String> { team_defense(team, &self.data.environment.league_error_rates) }

    pub fn simulate_season(&self, request: &SeasonRequest, on_game: &mut dyn FnMut(&GameResult)) -> Result<SeasonResult, String> {
        let challenge = draft_team(request, &self.data.bullpen, "challenge", "Your team")?;
        let matchups = self.season_matchups(&challenge)?;
        self.simulate_prepared(request, &challenge, &matchups, SeasonOptions::FULL, on_game)
    }

    /// All randomness comes from per-game named streams, independent of the schedule.
    pub fn simulate_prepared(&self, request: &SeasonRequest, challenge: &TeamInput, matchups: &[OpponentMatchups], options: SeasonOptions, on_game: &mut dyn FnMut(&GameResult)) -> Result<SeasonResult, String> {
        let data = &self.data;
        let mut challenge = challenge.clone();
        let home_park = self.park(&request.home_stadium)?;
        let ids: Vec<&str> = data.opponents.iter().map(|opponent| opponent.id.as_str()).collect();
        let schedule = build_schedule(request.seed, &ids)?;
        let mut challenge_usage = ReliefUsage::new(&challenge)?;
        let challenge_defense = self.defense(&challenge)?;
        struct Prepared<'p> { team: TeamInput<'p>, park: usize, appearances: usize, usage: ReliefUsage, defense: PreparedDefense }
        let mut opponents = data.opponents.iter().map(|opponent| {
            let team = opponent_team(opponent)?;
            let park = data.stadiums.iter().position(|stadium| stadium.id == opponent.home_stadium.id && stadium.version == opponent.home_stadium.version)
                .ok_or("Opponent home stadium is incompatible with this dataset")?;
            let defense = self.defense(&team)?;
            Ok(Prepared { usage: ReliefUsage::new(&team)?, team, park, appearances: 0, defense })
        }).collect::<Result<Vec<_>, String>>()?;
        if matchups.len() != opponents.len() { return Err("Season matchups must cover every opponent".into()); }
        let mut totals = create_totals_box(&challenge);
        let mut result = SeasonResult {
            model_version: request.model_version.clone(), rules_version: request.rules_version.clone(), data_version: data.data_version.clone(), seed: request.seed,
            home_stadium: request.home_stadium.clone(), defense_method_version: data.defense_method_version.clone(), valuation_version: data.valuation_version.clone(),
            wins: 0, losses: 0, first_loss: None, longest_winning_streak: 0, runs_for: 0, runs_against: 0,
            games: Vec::with_capacity(if options.keep_games { schedule.len() } else { 0 }), batting: Vec::new(), pitching: Vec::new(), starter_starts: [0; 3],
            highlight: None, lowlight: None, highlight_trace: None, lowlight_trace: None,
        };
        let models = GameModels { values: &self.values, tables: &self.tables, win_expectancy: options.win_expectancy.then_some(&self.win_expectancy) };
        // One buffer reused per game; only a game that sets a new season highlight or lowlight keeps a copy.
        let mut trace: Vec<WinPoint> = Vec::with_capacity(128);
        let mut streak = 0;
        for (index, scheduled) in schedule.iter().enumerate() {
            let opponent = &mut opponents[scheduled.opponent];
            let number = index as u32 + 1;
            challenge.starter_index = index % 3;
            challenge_usage.prepare(&mut challenge, i64::from(number));
            opponent.team.starter_index = opponent.appearances % 5;
            opponent.appearances += 1;
            opponent.usage.prepare(&mut opponent.team, i64::from(number));
            let pair = &matchups[scheduled.opponent];
            let (home, away, home_defense, away_defense) = if scheduled.is_home {
                (&challenge, &opponent.team, challenge_defense.clone(), opponent.defense.clone())
            } else {
                (&opponent.team, &challenge, opponent.defense.clone(), challenge_defense.clone())
            };
            let game = simulate_game(GameInput {
                number, opponent_id: &opponent.team.id, opponent_name: &opponent.team.name, challenge_is_home: scheduled.is_home,
                home, away, home_defense, away_defense,
                park: if scheduled.is_home { home_park } else { &self.parks[opponent.park] },
                home_matchups: if scheduled.is_home { &pair.challenge_batting } else { &pair.opponent_batting },
                away_matchups: if scheduled.is_home { &pair.opponent_batting } else { &pair.challenge_batting },
            }, &models, &mut GameStreams::new(request.seed, number), Some(&mut trace))?;
            let (challenge_box, opponent_box) = if scheduled.is_home { (&game.home, &game.away) } else { (&game.away, &game.home) };
            challenge_usage.record(i64::from(number), &challenge_box.pitching);
            opponent.usage.record(i64::from(number), &opponent_box.pitching);
            if let Some(moment) = &game.highlight {
                if result.highlight.as_ref().is_none_or(|best| moment.swing > best.swing) {
                    result.highlight = Some(moment.clone());
                    result.highlight_trace = Some(trace.clone());
                }
            }
            if let Some(moment) = &game.lowlight {
                if result.lowlight.as_ref().is_none_or(|worst| moment.swing < worst.swing) {
                    result.lowlight = Some(moment.clone());
                    result.lowlight_trace = Some(trace.clone());
                }
            }
            trace.clear();
            result.starter_starts[challenge.starter_index] += 1;
            accumulate_box(&mut totals, challenge_box)?;
            result.runs_for += game.challenge_runs;
            result.runs_against += game.opponent_runs;
            if game.win {
                result.wins += 1;
                streak += 1;
                result.longest_winning_streak = result.longest_winning_streak.max(streak);
            } else {
                result.losses += 1;
                result.first_loss.get_or_insert(number);
                streak = 0;
            }
            on_game(&game);
            if options.keep_games { result.games.push(game); }
        }
        result.batting = totals.batting;
        result.pitching = totals.pitching;
        Ok(result)
    }
}

/// The drafted club: batting order hitters, SP1-SP3 in starter order, the closer, named relievers
/// RP1 onward in slot order, then `remainder`, the league remainder arm every club shares.
pub fn draft_team<'p>(request: &'p SeasonRequest, remainder: &'p Profile, id: &str, name: &str) -> Result<TeamInput<'p>, String> {
    if request.roster.iter().any(|pick| pick.slot == "BP") { return Err("Roster slot BP is not part of this model".into()); }
    let profile = |season_id: &str| request.roster.iter().find(|pick| pick.profile.season_id == season_id).map(|pick| &pick.profile).ok_or_else(|| format!("Missing roster profile {season_id}"));
    let slot = |slot: &str| request.roster.iter().find(|pick| pick.slot == slot).map(|pick| &pick.profile).ok_or_else(|| format!("Missing roster slot {slot}"));
    let hitters = request.batting_order.iter().map(|id| profile(id)).collect::<Result<Vec<_>, _>>()?;
    let mut defense = [0usize; 8];
    for (position, name) in POSITIONS.iter().enumerate() {
        let fielder = slot(name)?;
        defense[position] = hitters.iter().position(|hitter| std::ptr::eq(*hitter, fielder)).ok_or("Fielder is missing from the batting order")?;
    }
    let mut pitchers = request.starter_order.iter().map(|id| profile(id)).collect::<Result<Vec<_>, _>>()?;
    pitchers.push(slot("CL")?);
    let named = request.roster.iter().filter(|pick| pick.slot.starts_with("RP")).count();
    for number in 1..=named { pitchers.push(slot(&format!("RP{number}"))?); }
    pitchers.push(remainder);
    let available = vec![true; pitchers.len()];
    Ok(TeamInput {
        id: id.to_string(), name: name.to_string(), hitters, defense, pitchers,
        starter_index: 0, closer_index: 3, relievers: (4..4 + named).collect(), bullpen_index: 4 + named, available,
    })
}

/// A fixed 2025 opponent: hitters assigned to their single listed position, five starters, closer,
/// named relievers, then the pooled remainder of its bullpen.
pub fn opponent_team(opponent: &Opponent) -> Result<TeamInput<'_>, String> {
    if opponent.starters.len() != 5 { return Err("Invalid opponent rotation".into()); }
    let mut defense = [0usize; 8];
    for (position, name) in POSITIONS.iter().enumerate() {
        defense[position] = opponent.hitters.iter().position(|profile| profile.eligible_slots.len() == 1 && profile.eligible_slots[0] == *name)
            .ok_or("Invalid opponent defensive assignment")?;
    }
    let mut pitchers: Vec<&Profile> = opponent.starters.iter().collect();
    pitchers.push(&opponent.closer);
    pitchers.extend(opponent.relievers.iter());
    pitchers.push(&opponent.bullpen);
    let named = opponent.relievers.len();
    let available = vec![true; pitchers.len()];
    Ok(TeamInput {
        id: opponent.id.clone(), name: opponent.name.clone(), hitters: opponent.hitters.iter().collect(), defense, pitchers,
        starter_index: 0, closer_index: 5, relievers: (6..6 + named).collect(), bullpen_index: 6 + named, available,
    })
}

/// Builds the season as series (see `buildSchedule` in TS); returned opponents index `opponent_ids`.
pub fn build_schedule(seed: u32, opponent_ids: &[&str]) -> Result<Vec<ScheduleGame>, String> {
    let mut sorted: Vec<&str> = opponent_ids.to_vec();
    sorted.sort_unstable();
    sorted.dedup();
    if opponent_ids.len() != 30 || sorted.len() != 30 || opponent_ids.iter().any(|id| id.is_empty()) { return Err("Schedule requires a valid seed and thirty distinct opponents".into()); }
    let mut random = random_stream(seed, "schedule");
    let ids = sorted;
    let mut shuffled = ids.clone();
    shuffle(&mut shuffled, &mut random);
    let in_range = |id: &str, start: usize, end: usize| shuffled[start..end].contains(&id);
    struct Series<'a> { opponent: &'a str, games: usize, is_home: bool }
    let mut series: Vec<Series> = Vec::with_capacity(60);
    for &opponent in &ids {
        if in_range(opponent, 0, 6) {
            series.push(Series { opponent, games: 3, is_home: true });
            series.push(Series { opponent, games: 3, is_home: false });
        } else if in_range(opponent, 6, 12) {
            let home = in_range(opponent, 6, 9);
            series.push(Series { opponent, games: 4, is_home: home });
            series.push(Series { opponent, games: 2, is_home: !home });
        } else {
            let home = in_range(opponent, 12, 21);
            series.push(Series { opponent, games: 3, is_home: home });
            series.push(Series { opponent, games: 2, is_home: !home });
        }
    }
    // Draw series in random order, never the previous opponent again, and never leaving a tail
    // that forces a repeat.
    let mut order: Vec<Series> = Vec::with_capacity(series.len());
    let mut pool = series;
    while !pool.is_empty() {
        let last = order.last().map(|set| set.opponent);
        let legal: Vec<usize> = (0..pool.len()).filter(|&index| {
            let set = &pool[index];
            if Some(set.opponent) == last { return false; }
            let rest: Vec<&Series> = pool.iter().enumerate().filter(|(at, _)| *at != index).map(|(_, set)| set).collect();
            if rest.len() == 1 && rest[0].opponent == set.opponent { return false; }
            !(rest.len() == 2 && rest[0].opponent == rest[1].opponent)
        }).collect();
        if legal.is_empty() { return Err("Schedule could not separate repeat series".into()); }
        let pick = legal[(random.next() * legal.len() as f64).floor() as usize];
        order.push(pool.remove(pick));
    }
    Ok(order.iter().flat_map(|set| {
        let opponent = opponent_ids.iter().position(|id| *id == set.opponent).expect("scheduled opponent exists");
        std::iter::repeat_n(ScheduleGame { opponent, is_home: set.is_home }, set.games)
    }).collect())
}
