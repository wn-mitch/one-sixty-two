//! Draft Mode's eight-club league: one shared 648-game schedule played in eighteen nine-matchday
//! segments, with relief rest carried between segments and lineups free to change at each stop.
//! Each club's home crowd leans the strike zone at its home games.
use crate::game::{simulate_game, team_defense, GameInput, GameModels};
use crate::normal::normal_quantile;
use crate::random::{random_stream, shuffle, GameStreams};
use crate::relief::{ReliefUsage, RestState, RoleAssignment};
use crate::park_package::{apply, ParkPackage};
use crate::flight::PreparedPark;
use crate::rules::GameRules;
use crate::season::{club_team, Engine};
use crate::team::{accumulate_box, create_totals_box, TeamInput};
use crate::types::{GameResult, ParkRef, RosterPick, TeamBox};
use serde::{Deserialize, Serialize};

pub const CLUBS: usize = 8;
pub const MATCHDAYS: usize = 162;
pub const SEGMENTS: usize = 18;
pub const SEGMENT_MATCHDAYS: usize = MATCHDAYS / SEGMENTS;
/// The largest strike-zone lean a single game may carry, after volatility.
pub const MAX_EDGE: f64 = 0.4;
/// Extra outs a ridden starter may pitch before relief: two innings.
pub const RIDE_OUTS: u32 = 6;
/// Series lengths for each pairing in every round-robin round: 23 games a pairing.
const SERIES: [usize; 8] = [3, 3, 3, 3, 3, 3, 3, 2];
/// The pairing's designated host takes this many of a round's series (twelve of 23 games).
const HOST_SERIES: usize = 4;

/// One club's active roster and lineup for a segment.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeagueClub {
    pub id: String,
    pub name: String,
    pub home_stadium: ParkRef,
    pub roster: Vec<RosterPick>,
    pub batting_order: Vec<String>,
    pub starter_order: Vec<String>,
    pub relief_roles: Vec<RoleAssignment>,
    /// Named relievers, by season id, trained to recover quickly.
    #[serde(default)]
    pub quick_recovery: Vec<String>,
    /// Starters, by season id, ridden `RIDE_OUTS` past their usual budget this segment.
    #[serde(default)]
    pub ridden: Vec<String>,
    /// Named relievers, by season id, who skip rest this segment.
    #[serde(default)]
    pub tireless: Vec<String>,
    /// The franchise's exaggerated park condition at its home games, if it has one.
    #[serde(default)]
    pub park_package: Option<ParkPackage>,
}

/// A club's home crowd for a segment: the strike zone's mean lean toward the home side, and the
/// spread of a game's lean around it. Volatility is symmetric, so it never favors either side.
#[derive(Clone, Copy, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Crowd { pub edge: f64, pub volatility: f64 }

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeagueSegmentRequest {
    pub model_version: String,
    pub rules_version: String,
    pub seed: u32,
    pub clubs: Vec<LeagueClub>,
    /// Four disjoint rival pairs by club index; rivals meet once more than other pairings.
    pub rivals: Vec<[usize; 2]>,
    /// 0-17.
    pub segment: usize,
    /// Each club's home crowd, by club index.
    pub crowds: Vec<Crowd>,
    /// Each club's relief rest from the previous segment; empty for the first.
    pub carry: Vec<Vec<RestState>>,
    /// The club whose full game results are returned.
    pub detail_club: usize,
    /// The rules every game of the segment is played under, from the commissioner's decree.
    #[serde(default)]
    pub rules: GameRules,
}

/// One scheduled game by club index.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fixture { pub home: usize, pub away: usize }

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LeagueGame { pub matchday: usize, pub home: usize, pub away: usize, pub home_runs: i32, pub away_runs: i32 }

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LeagueSegmentResult {
    pub segment: usize,
    pub games: Vec<LeagueGame>,
    /// Each club's batting and pitching totals for the segment, by club index.
    pub totals: Vec<TeamBox>,
    /// The detail club's games in full; its side is the challenge side.
    pub detail_games: Vec<GameResult>,
    pub carry: Vec<Vec<RestState>>,
}

fn check_rivals(rivals: &[[usize; 2]]) -> Result<(), String> {
    let mut seen = [false; CLUBS];
    if rivals.len() != CLUBS / 2 { return Err("A league needs four rival pairs".into()); }
    for &[a, b] in rivals {
        if a >= CLUBS || b >= CLUBS || a == b || seen[a] || seen[b] { return Err("Rival pairs must cover each club exactly once".into()); }
        seen[a] = true;
        seen[b] = true;
    }
    Ok(())
}

/// The full season, matchday by matchday, four games a day. Rival pairs sit opposite on a circle
/// of eight; a club hosts twelve of 23 games against the three clubs clockwise from it and eleven
/// against the rest, and rivals split their 24 games evenly, so every club plays 81 at home.
/// Pairings come from a round robin played as two- and three-game series in seeded order, never the
/// same round twice running; the extra rival game is a one-day round of its own.
pub fn build_league_schedule(seed: u32, rivals: &[[usize; 2]]) -> Result<Vec<[Fixture; 4]>, String> {
    check_rivals(rivals)?;
    let mut random = random_stream(seed, "league:schedule");
    let mut pairs = rivals.to_vec();
    shuffle(&mut pairs, &mut random);
    let mut circle = [0usize; CLUBS];
    for (position, &[a, b]) in pairs.iter().enumerate() {
        let (first, second) = if random.next() < 0.5 { (a, b) } else { (b, a) };
        circle[position] = first;
        circle[position + CLUBS / 2] = second;
    }
    // Host of the larger share between circle positions: a club hosts twelve against offsets 1-3
    // clockwise, and the lower position hosts twelve of the rival round robin games.
    let host = |p: usize, q: usize| -> (usize, usize) {
        let offset = (q + CLUBS - p) % CLUBS;
        if offset < CLUBS / 2 || (offset == CLUBS / 2 && p < q) { (circle[p], circle[q]) } else { (circle[q], circle[p]) }
    };
    // Circle-method round robin over positions: seven rounds of four pairings.
    let rounds: Vec<[(usize, usize); 4]> = (0..CLUBS - 1).map(|round| {
        let mut games = [(CLUBS - 1, round); 4];
        for k in 1..4 { games[k] = ((round + k) % (CLUBS - 1), (round + CLUBS - 1 - k) % (CLUBS - 1)); }
        games.map(|(p, q)| host(p, q))
    }).collect();
    // Each round's series in seeded order.
    let mut pending: Vec<Vec<usize>> = (0..rounds.len()).map(|_| {
        let mut series: Vec<usize> = (0..SERIES.len()).collect();
        shuffle(&mut series, &mut random);
        series
    }).collect();
    // Random next round, never the previous one; a round holding more than half of what is left
    // must go now, which guarantees the order completes.
    let mut blocks: Vec<(usize, usize)> = Vec::with_capacity(rounds.len() * SERIES.len() + 1);
    let mut previous = usize::MAX;
    loop {
        let left: usize = pending.iter().map(Vec::len).sum();
        if left == 0 { break; }
        let forced = (0..pending.len()).find(|&round| round != previous && pending[round].len() * 2 > left);
        let round = match forced {
            Some(round) => round,
            None => {
                let open: Vec<usize> = (0..pending.len()).filter(|&round| round != previous && !pending[round].is_empty()).collect();
                if open.is_empty() { return Err("Could not order the league schedule".into()); }
                open[((random.next() * open.len() as f64) as usize).min(open.len() - 1)]
            }
        };
        blocks.push((round, pending[round].pop().unwrap()));
        previous = round;
    }
    // The extra rival day goes between two rounds with no rival pairing, so no pairing repeats on
    // consecutive series.
    let rival_free = |round: usize| rounds[round].iter().all(|&(a, b)| !rivals.iter().any(|&[x, y]| (x, y) == (a, b) || (y, x) == (a, b)));
    let spots: Vec<usize> = (1..blocks.len()).filter(|&spot| rival_free(blocks[spot - 1].0) && rival_free(blocks[spot].0)).collect();
    if spots.is_empty() { return Err("Could not place the extra rival day".into()); }
    let spot = spots[((random.next() * spots.len() as f64) as usize).min(spots.len() - 1)];
    blocks.insert(spot, (rounds.len(), 0));
    let rival_day: [Fixture; 4] = {
        let mut day = [Fixture { home: 0, away: 0 }; 4];
        for (index, position) in (0..CLUBS / 2).enumerate() {
            // The rival who hosted eleven in the round robin hosts the extra game.
            let (twelve, eleven) = host(position, position + CLUBS / 2);
            debug_assert_eq!((twelve, eleven), host(position + CLUBS / 2, position));
            day[index] = Fixture { home: eleven, away: twelve };
        }
        day
    };
    let mut schedule = Vec::with_capacity(MATCHDAYS);
    for (round, series) in blocks {
        if round == rounds.len() { schedule.push(rival_day); continue; }
        let day = rounds[round].map(|(major, minor)| if series < HOST_SERIES { Fixture { home: major, away: minor } } else { Fixture { home: minor, away: major } });
        for _ in 0..SERIES[series] { schedule.push(day); }
    }
    if schedule.len() != MATCHDAYS { return Err("League schedule must have 162 matchdays".into()); }
    Ok(schedule)
}

impl Engine {
    /// Plays one segment of the league: nine matchdays of the shared schedule with the given lineups and crowds.
    pub fn simulate_league_segment(&self, request: &LeagueSegmentRequest, on_game: &mut dyn FnMut(usize)) -> Result<LeagueSegmentResult, String> {
        if request.clubs.len() != CLUBS { return Err("A league needs eight clubs".into()); }
        if request.segment >= SEGMENTS { return Err("A league season has eighteen segments".into()); }
        if request.detail_club >= CLUBS { return Err("Detail club is outside the league".into()); }
        request.rules.validate()?;
        if request.crowds.len() != CLUBS { return Err("Every club needs a home crowd".into()); }
        if request.crowds.iter().any(|crowd| !(crowd.edge.abs() <= MAX_EDGE && (0.0..=MAX_EDGE).contains(&crowd.volatility))) { return Err("Crowd effects are out of bounds".into()); }
        if !request.carry.is_empty() && request.carry.len() != CLUBS { return Err("Carried rest must cover every club".into()); }
        if request.segment > 0 && request.carry.is_empty() { return Err("A later segment needs the previous segment's rest".into()); }
        let schedule = build_league_schedule(request.seed, &request.rivals)?;
        let remainder = &self.data.bullpen;
        let mut clubs: Vec<TeamInput> = request.clubs.iter()
            .map(|club| club_team(&club.roster, &club.batting_order, &club.starter_order, &club.relief_roles, remainder, &club.id, &club.name))
            .collect::<Result<_, _>>()?;
        // A club with a park package plays its home games in its park under that condition.
        let variants = request.clubs.iter().map(|club| club.park_package.map(|package| PreparedPark::new(&apply(&self.park(&club.home_stadium)?.stadium, package))).transpose())
            .collect::<Result<Vec<_>, _>>()?;
        let parks = request.clubs.iter().zip(&variants).map(|(club, variant)| variant.as_ref().map_or_else(|| self.park(&club.home_stadium), Ok)).collect::<Result<Vec<_>, _>>()?;
        let defenses = clubs.iter().map(|club| team_defense(club, &self.data.environment.league_error_rates)).collect::<Result<Vec<_>, _>>()?;
        // Batting matchups for every ordered pair: club a's hitters against club b's staff.
        let mut matchups = Vec::with_capacity(CLUBS * CLUBS);
        for a in 0..CLUBS {
            for b in 0..CLUBS {
                matchups.push(if a == b { None } else { Some(self.matchups(&clubs[a].hitters, &clubs[b].pitchers)?) });
            }
        }
        let mut usage: Vec<ReliefUsage> = clubs.iter().enumerate()
            .map(|(index, club)| ReliefUsage::with_recovery(club, request.carry.get(index).map_or(&[][..], Vec::as_slice), &request.clubs[index].quick_recovery).with_tireless(club, &request.clubs[index].tireless))
            .collect();
        let mut totals: Vec<TeamBox> = clubs.iter().map(create_totals_box).collect();
        let models = GameModels { values: &self.values, tables: &self.tables, win_expectancy: None };
        let mut result = LeagueSegmentResult { segment: request.segment, games: Vec::with_capacity(SEGMENT_MATCHDAYS * 4), totals: Vec::new(), detail_games: Vec::new(), carry: Vec::new() };
        let first = request.segment * SEGMENT_MATCHDAYS;
        for (matchday, fixtures) in schedule.iter().enumerate().skip(first).take(SEGMENT_MATCHDAYS) {
            for (index, club) in clubs.iter_mut().enumerate() {
                club.starter_index = matchday % 3;
                club.starter_extra_outs = if request.clubs[index].ridden.contains(&club.pitchers[club.starter_index].season_id) { RIDE_OUTS } else { 0 };
                usage[index].prepare(club, matchday as i64);
            }
            for (slot, fixture) in fixtures.iter().enumerate() {
                let (home, away) = (fixture.home, fixture.away);
                // The detail club is the challenge side when it plays; otherwise the home club is.
                let challenge_is_home = away != request.detail_club;
                let opponent = if challenge_is_home { away } else { home };
                let number = (matchday * 4 + slot + 1) as u32;
                let home_edge = crowd_edge(request.seed, number, request.crowds[home])?;
                let game = simulate_game(GameInput {
                    number, opponent_id: &clubs[opponent].id, opponent_name: &clubs[opponent].name, challenge_is_home,
                    home: &clubs[home], away: &clubs[away], home_defense: defenses[home].clone(), away_defense: defenses[away].clone(),
                    park: parks[home],
                    home_matchups: matchups[home * CLUBS + away].as_ref().unwrap(),
                    away_matchups: matchups[away * CLUBS + home].as_ref().unwrap(),
                    home_edge, rules: request.rules,
                }, &models, &mut GameStreams::new(request.seed, number), None)?;
                usage[home].record(matchday as i64, &game.home.pitching);
                usage[away].record(matchday as i64, &game.away.pitching);
                accumulate_box(&mut totals[home], &game.home)?;
                accumulate_box(&mut totals[away], &game.away)?;
                result.games.push(LeagueGame { matchday, home, away, home_runs: game.home.runs, away_runs: game.away.runs });
                if home == request.detail_club || away == request.detail_club { result.detail_games.push(game); }
                on_game(result.games.len());
            }
        }
        result.carry = usage.iter().zip(&clubs).map(|(usage, club)| usage.carry(club)).collect();
        result.totals = totals;
        Ok(result)
    }
}

/// One game's strike-zone lean: the crowd's edge plus its volatility times a seeded standard normal draw.
fn crowd_edge(seed: u32, number: u32, crowd: Crowd) -> Result<f64, String> {
    if crowd.volatility == 0.0 { return Ok(crowd.edge); }
    let draw = random_stream(seed, &format!("league:crowd:{number}")).next().clamp(1e-9, 1.0 - 1e-9);
    Ok((crowd.edge + crowd.volatility * normal_quantile(draw)?).clamp(-MAX_EDGE, MAX_EDGE))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_schedule_gives_every_club_162_games_81_at_home_and_23_or_24_per_opponent() {
        let rivals = [[0, 5], [1, 2], [3, 7], [4, 6]];
        for seed in 0..200 {
            let schedule = build_league_schedule(seed, &rivals).unwrap();
            assert_eq!(schedule.len(), MATCHDAYS);
            let mut games = [0; CLUBS];
            let mut home = [0; CLUBS];
            let mut meetings = [[0; CLUBS]; CLUBS];
            for day in &schedule {
                let mut playing = [false; CLUBS];
                for fixture in day {
                    for club in [fixture.home, fixture.away] { assert!(!playing[club], "a club plays twice in a day"); playing[club] = true; games[club] += 1; }
                    home[fixture.home] += 1;
                    meetings[fixture.home][fixture.away] += 1;
                    meetings[fixture.away][fixture.home] += 1;
                }
            }
            assert_eq!(games, [162; CLUBS]);
            assert_eq!(home, [81; CLUBS]);
            for a in 0..CLUBS {
                for b in 0..CLUBS {
                    if a == b { continue; }
                    let rival = rivals.iter().any(|&[x, y]| (x, y) == (a, b) || (y, x) == (a, b));
                    assert_eq!(meetings[a][b], if rival { 24 } else { 23 }, "{a} vs {b}");
                }
            }
            // Never the same pairing two series running.
            let mut run = 1;
            for pair in schedule.windows(2) {
                if pair[0] == pair[1] { run += 1; assert!(run <= 3, "a series runs longer than three games"); continue; }
                run = 1;
                let shared = pair[0].iter().filter(|a| pair[1].iter().any(|b| (a.home, a.away) == (b.home, b.away) || (a.home, a.away) == (b.away, b.home))).count();
                assert_eq!(shared, 0, "back-to-back pairing {:?} {:?}", pair[0], pair[1]);
            }
        }
        assert_ne!(build_league_schedule(1, &rivals).unwrap(), build_league_schedule(2, &rivals).unwrap());
        assert!(build_league_schedule(1, &[[0, 1], [1, 2], [3, 4], [5, 6]]).is_err());
    }
}
