//! Contact shape tables, the per-matchup contact fit, and contact sampling (`src/lib/sim/contact-profile.ts`).
use crate::flight::carry_at;
use crate::math;
use crate::normal::normal_quantile;
use crate::rates::{matchup_rates, normalize, Rates};
use crate::types::{ContactBasis, ContactModel, ContactShape, Profile};

/// Conditional contact outcomes in order: 1B, 2B, 3B, HR, OUT (errors are OUT).
pub const CONTACT_OUTCOMES: usize = 5;
pub const FIT_TOLERANCE: f64 = 1e-4;
/// Uniforms consumed from the contact stream per contact sample.
pub const CONTACT_UNIFORMS: usize = 7;
pub const EV_MIN: f64 = 35.0;
pub const EV_WIDTH: f64 = 2.5;
pub const EV_COUNT: usize = 36;
pub const LAUNCH_MIN: f64 = -40.0;
pub const LAUNCH_WIDTH: f64 = 4.0;
pub const LAUNCH_COUNT: usize = 32;
pub const SPRAY_MIN: f64 = -45.0;
pub const SPRAY_WIDTH: f64 = 5.0;
pub const SPRAY_COUNT: usize = 18;
pub const REGION_COUNT: usize = 12;
pub const POWER_SHIFTS: [f64; 13] = [-15.0, -12.5, -10.0, -7.5, -5.0, -2.5, 0.0, 2.5, 5.0, 7.5, 10.0, 12.5, 15.0];
pub const SPEED_NODES: [f64; 5] = [0.0, 0.25, 0.5, 0.75, 1.0];
pub const SIDE_COUNT: usize = 3;

/// Batted-ball classes by launch angle: GB < 10, LD < 25, FB < 50, PU.
pub fn launch_class(launch: f64) -> usize {
    if launch < 10.0 { 0 } else if launch < 25.0 { 1 } else if launch < 50.0 { 2 } else { 3 }
}
fn ev_band(speed: f64) -> usize { if speed < 85.0 { 0 } else if speed < 100.0 { 1 } else { 2 } }

pub fn region_of(ev_index: usize, launch_index: usize) -> usize {
    launch_class(LAUNCH_MIN + (launch_index as f64 + 0.5) * LAUNCH_WIDTH) * 3 + ev_band(EV_MIN + (ev_index as f64 + 0.5) * EV_WIDTH)
}

/// Spray side: 0 = left-handed batter, 1 = right-handed batter, 2 = unknown (equal mixture).
pub type Side = usize;
pub const SIDE_UNKNOWN: Side = 2;

/// Effective batting side; switch hitters bat opposite the pitcher.
pub fn batting_side(batter: &Profile, pitcher: &Profile) -> Side { side_of(&batter.bats, &pitcher.throws) }

/// `batting_side` from the batter's `bats` and the pitcher's `throws`.
pub fn side_of(bats: &str, throws: &str) -> Side {
    let side = if bats == "B" {
        if throws == "L" { "R" } else if throws == "R" { "L" } else { "" }
    } else {
        bats
    };
    match side { "L" => 0, "R" => 1, _ => SIDE_UNKNOWN }
}

/// Immutable sampling tables derived from the shape.
#[derive(Clone, Debug)]
pub struct ShapeTables {
    pub region_share: [f64; REGION_COUNT],
    /// Per region, CDF over histogram cells (ev * LAUNCH_COUNT + launch).
    pub cell_cdf: Vec<Vec<f64>>,
    pub cells: Vec<Vec<usize>>,
    /// [side][launch class] CDF over spray bins.
    pub spray_cdf: Vec<[f64; SPRAY_COUNT]>,
}

pub fn shape_tables(shape: &ContactShape) -> Result<ShapeTables, String> {
    if shape.histogram.len() != EV_COUNT * LAUNCH_COUNT || shape.histogram.iter().any(|value| !value.is_finite() || *value < 0.0) {
        return Err("Invalid contact shape histogram".into());
    }
    let total = shape.histogram.iter().fold(0.0, |sum, value| sum + value);
    if !(total > 0.0) { return Err("Empty contact shape".into()); }
    let mut region_share = [0.0; REGION_COUNT];
    let mut region_cells: Vec<Vec<usize>> = vec![Vec::new(); REGION_COUNT];
    for e in 0..EV_COUNT {
        for l in 0..LAUNCH_COUNT {
            let cell = e * LAUNCH_COUNT + l;
            if shape.histogram[cell] == 0.0 { continue; }
            let region = region_of(e, l);
            region_share[region] += shape.histogram[cell] / total;
            region_cells[region].push(cell);
        }
    }
    let mut cell_cdf = Vec::with_capacity(REGION_COUNT);
    for list in &region_cells {
        if list.is_empty() { return Err("Contact shape region is empty".into()); }
        let region_total = list.iter().fold(0.0, |sum, cell| sum + shape.histogram[*cell]);
        let mut cdf = vec![0.0; list.len()];
        let mut cumulative = 0.0;
        for (index, cell) in list.iter().enumerate() {
            cumulative += shape.histogram[*cell] / region_total;
            cdf[index] = cumulative;
        }
        cdf[list.len() - 1] = 1.0;
        cell_cdf.push(cdf);
    }
    let mut spray_cdf = Vec::with_capacity(SIDE_COUNT * 4);
    for side in 0..SIDE_COUNT {
        for launch_class_index in 0..4 {
            let mut counts = [0.0; SPRAY_COUNT];
            let sources: &[&Vec<Vec<f64>>] = match side { 0 => &[&shape.spray.left], 1 => &[&shape.spray.right], _ => &[&shape.spray.left, &shape.spray.right] };
            for source in sources {
                let row = source.get(launch_class_index).ok_or("Invalid contact shape spray")?;
                if row.len() != SPRAY_COUNT || row.iter().any(|value| !value.is_finite() || *value < 0.0) { return Err("Invalid contact shape spray".into()); }
                let row_total = row.iter().fold(0.0, |sum, value| sum + value);
                if !(row_total > 0.0) { return Err("Empty contact shape spray".into()); }
                for index in 0..SPRAY_COUNT { counts[index] += row[index] / row_total; }
            }
            let total_spray = counts.iter().fold(0.0, |sum, value| sum + value);
            let mut cdf = [0.0; SPRAY_COUNT];
            let mut cumulative = 0.0;
            for index in 0..SPRAY_COUNT {
                cumulative += counts[index] / total_spray;
                cdf[index] = cumulative;
            }
            cdf[SPRAY_COUNT - 1] = 1.0;
            spray_cdf.push(cdf);
        }
    }
    Ok(ShapeTables { region_share, cell_cdf, cells: region_cells, spray_cdf })
}

fn search(cdf: &[f64], uniform: f64) -> usize {
    let (mut low, mut high) = (0, cdf.len() - 1);
    while low < high {
        let mid = (low + high) >> 1;
        if uniform < cdf[mid] { high = mid; } else { low = mid + 1; }
    }
    low
}

#[derive(Clone, Copy, Debug, Default)]
pub struct ContactDraw {
    pub region: usize,
    pub speed_mph: f64,
    pub launch_deg: f64,
    pub spray_deg: f64,
    pub carry: f64,
}

/// Continuous draw: region, histogram cell, uniform position within it, a side-specific spray, then carry.
pub fn draw_contact(tables: &ShapeTables, region_cdf: &[f64], shift: f64, side: Side, uniforms: &[f64; CONTACT_UNIFORMS], output: &mut ContactDraw) {
    let mut region = 0;
    while region < REGION_COUNT - 1 && uniforms[0] >= region_cdf[region] { region += 1; }
    let cell = tables.cells[region][search(&tables.cell_cdf[region], uniforms[1])];
    let e = cell / LAUNCH_COUNT;
    let l = cell - e * LAUNCH_COUNT;
    output.region = region;
    output.speed_mph = EV_MIN + (e as f64 + uniforms[2]) * EV_WIDTH + shift;
    output.launch_deg = LAUNCH_MIN + (l as f64 + uniforms[3]) * LAUNCH_WIDTH;
    let spray_bin = search(&tables.spray_cdf[side * 4 + launch_class(output.launch_deg)], uniforms[4]);
    output.spray_deg = SPRAY_MIN + (spray_bin as f64 + uniforms[5]) * SPRAY_WIDTH;
    // Uniforms are in (0, 1) here except an exact 0, which the TS engine lifts to Number.MIN_VALUE.
    let p = math::max(f64::from_bits(1), uniforms[6]);
    output.carry = carry_at(normal_quantile(p).expect("contact carry uniform is in (0, 1)"));
}

fn speed_position(speed: f64) -> Result<(usize, f64), String> {
    if !speed.is_finite() || !(0.0..=1.0).contains(&speed) { return Err("Invalid batter speed".into()); }
    let scaled = speed * (SPEED_NODES.len() - 1) as f64;
    let low = math::min((SPEED_NODES.len() - 2) as f64, scaled.floor());
    Ok((low as usize, scaled - low))
}

/// Region responses [region][outcome] for a side, batter speed, and shift node.
pub fn region_responses(basis: &ContactBasis, side: Side, speed: f64, shift_index: usize, output: &mut [f64; REGION_COUNT * CONTACT_OUTCOMES]) -> Result<(), String> {
    let (low, fraction) = speed_position(speed)?;
    let stride = POWER_SHIFTS.len() * REGION_COUNT * CONTACT_OUTCOMES;
    let base = side * SPEED_NODES.len() * stride + shift_index * REGION_COUNT * CONTACT_OUTCOMES;
    for index in 0..REGION_COUNT * CONTACT_OUTCOMES {
        output[index] = (1.0 - fraction) * basis.responses[base + low * stride + index] + fraction * basis.responses[base + (low + 1) * stride + index];
    }
    Ok(())
}

/// Solves the small symmetric positive-definite system in place (Gaussian elimination, partial pivoting).
fn solve(matrix: &mut [f64], rhs: &mut [f64], size: usize) -> bool {
    for column in 0..size {
        let mut pivot = column;
        for row in column + 1..size { if matrix[row * size + column].abs() > matrix[pivot * size + column].abs() { pivot = row; } }
        if !(matrix[pivot * size + column].abs() > 1e-300) { return false; }
        if pivot != column {
            for k in 0..size { matrix.swap(column * size + k, pivot * size + k); }
            rhs.swap(column, pivot);
        }
        for row in column + 1..size {
            let factor = matrix[row * size + column] / matrix[column * size + column];
            if factor == 0.0 { continue; }
            for k in column..size { matrix[row * size + k] -= factor * matrix[column * size + k]; }
            rhs[row] -= factor * rhs[column];
        }
    }
    for row in (0..size).rev() {
        let mut value = rhs[row];
        for k in row + 1..size { value -= matrix[row * size + k] * rhs[k]; }
        rhs[row] = value / matrix[row * size + row];
    }
    true
}

const COLS: usize = REGION_COUNT;
const FIT_MATRIX_ROWS: usize = CONTACT_OUTCOMES + 1 + REGION_COUNT;

/// Work buffers for one NNLS solve; every buffer is written before it is read.
struct NnlsScratch {
    passive: [bool; COLS],
    gradient: [f64; COLS],
    z: [f64; COLS],
    normal: [f64; COLS * COLS],
    rhs: [f64; COLS],
    index: [usize; COLS],
    residual: [f64; FIT_MATRIX_ROWS],
    gram: [f64; COLS * COLS],
    projection: [f64; COLS],
}

/// Lawson-Hanson non-negative least squares for min ||A x - b|| with x >= 0 (A is rows x cols, row-major).
fn nnls(a: &[f64], b: &[f64], x: &mut [f64; COLS]) -> Result<(), String> {
    let rows = FIT_MATRIX_ROWS;
    let cols = COLS;
    let mut s = NnlsScratch {
        passive: [false; COLS], gradient: [0.0; COLS], z: [0.0; COLS], normal: [0.0; COLS * COLS], rhs: [0.0; COLS],
        index: [0; COLS], residual: [0.0; FIT_MATRIX_ROWS], gram: [0.0; COLS * COLS], projection: [0.0; COLS],
    };
    x.fill(0.0);
    for i in 0..cols {
        let mut value = 0.0;
        for row in 0..rows { value += a[row * cols + i] * b[row]; }
        s.projection[i] = value;
        for j in i..cols {
            let mut entry = 0.0;
            for row in 0..rows { entry += a[row * cols + i] * a[row * cols + j]; }
            s.gram[i * cols + j] = entry;
            s.gram[j * cols + i] = entry;
        }
    }
    for _outer in 0..3 * cols {
        for row in 0..rows {
            let mut value = b[row];
            for col in 0..cols { value -= a[row * cols + col] * x[col]; }
            s.residual[row] = value;
        }
        let mut best: isize = -1;
        let mut best_value = 1e-12;
        for col in 0..cols {
            let mut value = 0.0;
            for row in 0..rows { value += a[row * cols + col] * s.residual[row]; }
            s.gradient[col] = value;
            if !s.passive[col] && value > best_value { best_value = value; best = col as isize; }
        }
        if best < 0 { return Ok(()); }
        s.passive[best as usize] = true;
        for _inner in 0..3 * cols {
            let mut size = 0;
            for col in 0..cols { if s.passive[col] { s.index[size] = col; size += 1; } }
            for i in 0..size {
                s.rhs[i] = s.projection[s.index[i]];
                for j in 0..size { s.normal[i * size + j] = s.gram[s.index[i] * cols + s.index[j]]; }
            }
            if !solve(&mut s.normal, &mut s.rhs, size) { return Err("Contact fit normal equations are singular".into()); }
            s.z.fill(0.0);
            for i in 0..size { s.z[s.index[i]] = s.rhs[i]; }
            let mut feasible = true;
            for i in 0..size { if s.z[s.index[i]] <= 0.0 { feasible = false; } }
            if feasible { *x = s.z; break; }
            let mut alpha = f64::INFINITY;
            for i in 0..size {
                let col = s.index[i];
                if s.z[col] <= 0.0 { alpha = math::min(alpha, x[col] / (x[col] - s.z[col])); }
            }
            for col in 0..cols {
                x[col] += alpha * (s.z[col] - x[col]);
                if s.passive[col] && x[col] <= 1e-15 { s.passive[col] = false; x[col] = 0.0; }
            }
        }
    }
    Ok(())
}

/// Relative equation weight; each binding row is scaled by its target so rare outcomes still bind.
const EQUATION_WEIGHT: f64 = 1e4;
const PRIOR_WEIGHT: f64 = 1.0;
/// Triples are best-effort: no region's neutral triple rate approaches historical triple leaders.
const TRIPLE_WEIGHT: f64 = 2.0;
/// Fit rows: singles, extra-base non-home-run hits (2B + 3B), triples, home runs, outs.
const FIT_ROWS: usize = CONTACT_OUTCOMES;

fn row_value(values: &[f64], offset: usize, row: usize) -> f64 {
    match row { 1 => values[offset + 1] + values[offset + 2], 2 => values[offset + 2], _ => values[offset + row] }
}

fn shift_penalty(shift_index: usize) -> f64 { math::pow(POWER_SHIFTS[shift_index] / 10.0, 2.0) }

/// Shift nodes by ascending penalty; ties in score still go to the lower index.
fn shift_search_order() -> [usize; 13] {
    let mut order: [usize; 13] = std::array::from_fn(|index| index);
    order.sort_by(|left, right| shift_penalty(*left).partial_cmp(&shift_penalty(*right)).unwrap().then(left.cmp(right)));
    order
}

/// `error` covers the binding rows (1B, 2B + 3B, HR, OUT); `triple_error` is the best-effort split.
#[derive(Clone, Debug, PartialEq)]
pub struct ContactFit {
    pub region_weights: [f64; REGION_COUNT],
    pub shift_index: usize,
    pub error: f64,
    pub triple_error: f64,
}

/// Chooses a power-shift node and region weights whose neutral-park outcomes reproduce `target`,
/// preferring weights close to `prior` and small shifts (see `fitContact` in TS).
pub fn fit_contact(basis: &ContactBasis, prior: &[f64; REGION_COUNT], target: &[f64; CONTACT_OUTCOMES], side: Side, speed: f64) -> Result<ContactFit, String> {
    if target.iter().any(|value| !value.is_finite() || *value < 0.0) || (target.iter().fold(0.0, |sum, value| sum + value) - 1.0).abs() > 1e-9 {
        return Err("Invalid contact target".into());
    }
    let mut responses = [0.0; REGION_COUNT * CONTACT_OUTCOMES];
    let mut a = [0.0; FIT_MATRIX_ROWS * REGION_COUNT];
    let mut b = [0.0; FIT_MATRIX_ROWS];
    let mut weights = [0.0; REGION_COUNT];
    let mut best: Option<ContactFit> = None;
    let mut best_score = f64::INFINITY;
    for shift_index in shift_search_order() {
        // Every score is at least its shift penalty, so a larger penalty cannot win.
        if shift_penalty(shift_index) > best_score { continue; }
        region_responses(basis, side, speed, shift_index, &mut responses)?;
        a.fill(0.0);
        for row in 0..FIT_ROWS {
            let goal = row_value(target, 0, row);
            let scale = if row == 2 { TRIPLE_WEIGHT / math::max(goal, 0.005) } else { EQUATION_WEIGHT / math::max(goal, 0.005) };
            for region in 0..REGION_COUNT { a[row * REGION_COUNT + region] = scale * row_value(&responses, region * CONTACT_OUTCOMES, row); }
            b[row] = scale * goal;
        }
        for region in 0..REGION_COUNT { a[CONTACT_OUTCOMES * REGION_COUNT + region] = EQUATION_WEIGHT * 20.0; }
        b[CONTACT_OUTCOMES] = EQUATION_WEIGHT * 20.0;
        for region in 0..REGION_COUNT {
            a[(CONTACT_OUTCOMES + 1 + region) * REGION_COUNT + region] = PRIOR_WEIGHT / math::max(prior[region], 1e-4).sqrt();
            b[CONTACT_OUTCOMES + 1 + region] = PRIOR_WEIGHT * prior[region] / math::max(prior[region], 1e-4).sqrt();
        }
        nnls(&a, &b, &mut weights)?;
        let total = weights.iter().fold(0.0, |sum, value| sum + value);
        if !(total > 0.0) { continue; }
        for weight in weights.iter_mut() { *weight /= total; }
        let (mut error, mut triple_error, mut distance) = (0.0, 0.0, 0.0);
        for row in 0..FIT_ROWS {
            let mut predicted = 0.0;
            for region in 0..REGION_COUNT { predicted += weights[region] * row_value(&responses, region * CONTACT_OUTCOMES, row); }
            let miss = (predicted - row_value(target, 0, row)).abs();
            if row == 2 { triple_error = miss; } else { error = math::max(error, miss); }
        }
        for region in 0..REGION_COUNT { distance += math::pow(weights[region] - prior[region], 2.0) / math::max(prior[region], 1e-4); }
        let score = (if error <= FIT_TOLERANCE { 0.0 } else { 1e6 * error }) + 1e3 * triple_error + distance + shift_penalty(shift_index);
        if score < best_score || (score == best_score && best.as_ref().is_some_and(|fit| shift_index < fit.shift_index)) {
            best_score = score;
            best = Some(ContactFit { region_weights: weights, shift_index, error, triple_error });
        }
    }
    best.ok_or_else(|| "Contact fit failed".into())
}

/// Conditional contact targets [1B, 2B, 3B, HR, OUT] from an eight-event rate vector.
pub fn contact_targets(rates: &Rates) -> Result<[f64; CONTACT_OUTCOMES], String> {
    let contact = rates[3] + rates[4] + rates[5] + rates[6] + rates[7];
    if !(contact > 0.0) { return Err("Contact targets require positive contact".into()); }
    Ok([rates[3] / contact, rates[4] / contact, rates[5] / contact, rates[6] / contact, rates[7] / contact])
}

/// Neutral eight-event matchup with platoon adjustment; venues act later through flight.
pub fn matchup(batter: &Profile, pitcher: &Profile, league: &Rates) -> Result<Rates, String> {
    let (Some(batting), Some(pitching)) = (&batter.batting_rates, &pitcher.pitching_rates) else {
        return Err("Matchup requires batting and pitching rates".into());
    };
    platoon_matchup(batting, &batter.bats, pitching, &pitcher.throws, league)
}

/// `matchup` from raw rates and handedness.
pub fn platoon_matchup(batting: &Rates, bats: &str, pitching: &Rates, throws: &str, league: &Rates) -> Result<Rates, String> {
    let mut weights = matchup_rates(batting, pitching, league)?;
    let side = side_of(bats, throws);
    let known = side != SIDE_UNKNOWN && (throws == "L" || throws == "R");
    let same = (side == 0 && throws == "L") || (side == 1 && throws == "R");
    let hit_and_walk = if known { if same { 0.95 } else { 1.025 } } else { 1.0 };
    let strikeout = if known { if same { 1.05 } else { 0.975 } } else { 1.0 };
    weights[0] *= hit_and_walk;
    weights[2] *= strikeout;
    for event in 3..=6 { weights[event] *= hit_and_walk; }
    normalize(&weights)
}

/// League region prior: the league-average matchup fitted from the raw 2025 region shares.
pub fn league_contact_fit(model: &ContactModel, tables: &ShapeTables, league: &Rates) -> Result<ContactFit, String> {
    let fit = fit_contact(&model.basis, &tables.region_share, &contact_targets(league)?, SIDE_UNKNOWN, 0.5)?;
    if !(fit.error <= FIT_TOLERANCE) { return Err(format!("League contact fit misses its target by {}", fit.error)); }
    Ok(fit)
}

pub const NON_CONTACT: usize = 4;

/// Per batter/pitcher pair: BB/HBP/SO/contact CDF, region CDF, power shift, and batting side.
#[derive(Clone, Debug)]
pub struct PreparedMatchups {
    pub batter_count: usize,
    pub pitcher_count: usize,
    pub non_contact_cdf: Vec<f64>,
    pub region_cdf: Vec<f64>,
    pub shift: Vec<f64>,
    pub side: Vec<Side>,
}

/// One batter/pitcher pair's prepared row.
#[derive(Clone, Debug, PartialEq)]
pub struct MatchupRow {
    pub non_contact_cdf: [f64; NON_CONTACT],
    pub region_cdf: [f64; REGION_COUNT],
    pub shift: f64,
    pub side: Side,
}

pub fn matchup_row(batter: &Profile, pitcher: &Profile, league: &Rates, basis: &ContactBasis, prior: &[f64; REGION_COUNT]) -> Result<MatchupRow, String> {
    let rates = matchup(batter, pitcher, league)?;
    let non_contact_cdf = [rates[0], rates[0] + rates[1], rates[0] + rates[1] + rates[2], 1.0];
    let side = batting_side(batter, pitcher);
    let fit = fit_contact(basis, prior, &contact_targets(&rates)?, side, batter.speed)
        .map_err(|error| format!("{error}: {} vs {}", batter.season_id, pitcher.season_id))?;
    let mut region_cdf = [0.0; REGION_COUNT];
    let mut cumulative = 0.0;
    for region in 0..REGION_COUNT {
        cumulative += fit.region_weights[region];
        region_cdf[region] = cumulative;
    }
    region_cdf[REGION_COUNT - 1] = 1.0;
    Ok(MatchupRow { non_contact_cdf, region_cdf, shift: POWER_SHIFTS[fit.shift_index], side })
}

impl PreparedMatchups {
    pub fn from_rows(batter_count: usize, pitcher_count: usize, rows: impl IntoIterator<Item = MatchupRow>) -> Self {
        let pairs = batter_count * pitcher_count;
        let mut prepared = PreparedMatchups {
            batter_count, pitcher_count,
            non_contact_cdf: Vec::with_capacity(pairs * NON_CONTACT), region_cdf: Vec::with_capacity(pairs * REGION_COUNT),
            shift: Vec::with_capacity(pairs), side: Vec::with_capacity(pairs),
        };
        for row in rows {
            prepared.non_contact_cdf.extend_from_slice(&row.non_contact_cdf);
            prepared.region_cdf.extend_from_slice(&row.region_cdf);
            prepared.shift.push(row.shift);
            prepared.side.push(row.side);
        }
        assert_eq!(prepared.shift.len(), pairs, "matchup rows must cover every pair");
        prepared
    }
}

pub fn build_matchup_inputs(batters: &[&Profile], pitchers: &[&Profile], league: &Rates, basis: &ContactBasis, prior: &[f64; REGION_COUNT]) -> Result<PreparedMatchups, String> {
    let mut rows = Vec::with_capacity(batters.len() * pitchers.len());
    for batter in batters {
        for pitcher in pitchers { rows.push(matchup_row(batter, pitcher, league, basis, prior)?); }
    }
    Ok(PreparedMatchups::from_rows(batters.len(), pitchers.len(), rows))
}

/// Returns 0 = BB, 1 = HBP, 2 = SO, 3 = contact.
pub fn sample_non_contact(prepared: &PreparedMatchups, pair: usize, uniform: f64) -> usize {
    let offset = pair * NON_CONTACT;
    for event in 0..NON_CONTACT { if uniform < prepared.non_contact_cdf[offset + event] { return event; } }
    NON_CONTACT - 1
}

pub fn sample_contact(prepared: &PreparedMatchups, tables: &ShapeTables, pair: usize, uniforms: &[f64; CONTACT_UNIFORMS], output: &mut ContactDraw) {
    draw_contact(tables, &prepared.region_cdf[pair * REGION_COUNT..(pair + 1) * REGION_COUNT], prepared.shift[pair], prepared.side[pair], uniforms, output);
}
