//! Ball flight, wall and roof collisions, and rolling (`src/lib/sim/flight.ts`).
use crate::math::{self, planar_distance};
use crate::types::{OverheadRuling, StadiumConfig};

pub const FLIGHT_DT: f64 = 1.0 / 60.0;
pub const LAUNCH_HEIGHT_M: f64 = 1.0;
pub const GRAVITY_MPS2: f64 = 9.80665;
pub const DRAG_COEFFICIENT: f64 = 0.0053;
pub const DRAG_SPEED_EXPONENT: f64 = -0.4;
pub const DRAG_REFERENCE_MPS: f64 = 44.704;
pub const LIFT_COEFFICIENT: f64 = 0.0037;
pub const MAX_FLIGHT_SECONDS: f64 = 20.0;
pub const MAX_REBOUNDS: u32 = 16;
pub const MPH_TO_MPS: f64 = 0.44704;
const WALL_OFFSET_M: f64 = 1e-6;
const MIN_STEP_FRACTION: f64 = 1e-12;
pub const CARRY_SIGMA: f64 = 0.075;
pub const CARRY_BIAS: f64 = 1.025;
/// Ground within this radius of the pitching rubber uses infield deceleration.
pub const INFIELD_CENTER: [f64; 2] = [0.0, 18.44];
pub const INFIELD_RADIUS_M: f64 = 95.0 * 0.3048;

pub fn lift_shape(launch_deg: f64) -> f64 {
    math::max(-1.0, math::min(1.0, (launch_deg - 12.0) / 15.0)) * math::max(0.0, 1.0 - math::max(0.0, launch_deg - 60.0) / 40.0)
}

/// Three-point Gauss-Hermite nodes (standard normal z, weight) for integrating carry.
pub fn carry_nodes() -> [(f64, f64); 3] { [(-(3.0f64).sqrt(), 1.0 / 6.0), (0.0, 2.0 / 3.0), ((3.0f64).sqrt(), 1.0 / 6.0)] }
pub fn carry_at(z: f64) -> f64 { CARRY_BIAS * math::exp(CARRY_SIGMA * z) }

pub const TRACE_STOPPED: u8 = 0;
pub const TRACE_HOME_RUN: u8 = 1;
pub const TRACE_AUTOMATIC_DOUBLE: u8 = 2;
pub const TRACE_DEAD_BALL: u8 = 3;
const EVENT_NONE: u8 = 0;
const EVENT_FENCE: u8 = 1;
const EVENT_OVERHEAD: u8 = 2;
const EVENT_GROUND: u8 = 3;
const TRACE_CAPACITY: usize = 1200 + 2 * MAX_REBOUNDS as usize + 8;

#[derive(Clone, Copy, Debug, Default)]
pub struct ContactSample { pub speed_mph: f64, pub launch_deg: f64, pub spray_deg: f64, pub carry: f64 }

/// A reusable trajectory buffer: airborne samples, then rolling samples with z = 0.
#[derive(Clone)]
pub struct FlightTrace {
    pub count: usize,
    pub t: Vec<f64>,
    pub x: Vec<f64>,
    pub y: Vec<f64>,
    pub z: Vec<f64>,
    /// First rolling sample, or -1 when the ball never reached the ground in play.
    pub landing: isize,
    pub end: u8,
    pub fair: bool,
    pub rebounds: u32,
    first_event: u8,
}

impl Default for FlightTrace {
    fn default() -> Self {
        Self {
            count: 0, t: vec![0.0; TRACE_CAPACITY], x: vec![0.0; TRACE_CAPACITY], y: vec![0.0; TRACE_CAPACITY], z: vec![0.0; TRACE_CAPACITY],
            landing: -1, end: TRACE_STOPPED, fair: true, rebounds: 0, first_event: EVENT_NONE,
        }
    }
}

/// Flat geometry for allocation-free intersection tests.
#[derive(Clone, Debug)]
pub struct PreparedPark {
    pub stadium: StadiumConfig,
    /// Per fence: ax, ay, bx, by, height, fair, unit normal x, unit normal y.
    fences: Vec<f64>,
    /// Per fence: min x, max x, min y, max y, padded by BOUNDS_PAD_M.
    bounds: Vec<f64>,
    grid: FenceGrid,
}

/// Fence lists per square cell. A fence is listed in every cell its padded box touches, in
/// ascending index order, so a step inside one cell tests exactly the fences whose box test
/// could pass, in the same order as a full scan.
#[derive(Clone, Debug)]
struct FenceGrid { origin: [f64; 2], columns: usize, rows: usize, cells: Vec<Vec<u16>> }

const GRID_CELL_M: f64 = 8.0;

impl FenceGrid {
    fn new(bounds: &[f64]) -> Self {
        let count = bounds.len() / 4;
        let (mut min_x, mut max_x, mut min_y, mut max_y) = (f64::INFINITY, f64::NEG_INFINITY, f64::INFINITY, f64::NEG_INFINITY);
        for fence in 0..count {
            min_x = min_x.min(bounds[fence * 4]); max_x = max_x.max(bounds[fence * 4 + 1]);
            min_y = min_y.min(bounds[fence * 4 + 2]); max_y = max_y.max(bounds[fence * 4 + 3]);
        }
        let origin = [min_x.floor() - GRID_CELL_M, min_y.floor() - GRID_CELL_M];
        let columns = ((max_x - origin[0]) / GRID_CELL_M).ceil() as usize + 2;
        let rows = ((max_y - origin[1]) / GRID_CELL_M).ceil() as usize + 2;
        let mut cells = vec![Vec::new(); columns * rows];
        for row in 0..rows {
            for column in 0..columns {
                let [x0, x1, y0, y1] = Self::cell_bounds(origin, column, row);
                for fence in 0..count {
                    let b = &bounds[fence * 4..fence * 4 + 4];
                    if b[0] <= x1 && b[1] >= x0 && b[2] <= y1 && b[3] >= y0 { cells[row * columns + column].push(fence as u16); }
                }
            }
        }
        Self { origin, columns, rows, cells }
    }

    fn cell_bounds(origin: [f64; 2], column: usize, row: usize) -> [f64; 4] {
        [origin[0] + column as f64 * GRID_CELL_M, origin[0] + (column + 1) as f64 * GRID_CELL_M, origin[1] + row as f64 * GRID_CELL_M, origin[1] + (row + 1) as f64 * GRID_CELL_M]
    }

    /// The candidate fences for a step from p to q, or None when the step spans cells (scan them all).
    /// A step wholly outside the grid crosses no fence, since every padded fence box lies inside it.
    fn candidates(&self, px: f64, py: f64, qx: f64, qy: f64) -> Option<&[u16]> {
        let (min_x, max_x, min_y, max_y) = (px.min(qx), px.max(qx), py.min(qy), py.max(qy));
        let column = ((min_x - self.origin[0]) / GRID_CELL_M).floor();
        let row = ((min_y - self.origin[1]) / GRID_CELL_M).floor();
        if !(column >= 0.0 && row >= 0.0) || column >= self.columns as f64 || row >= self.rows as f64 { return None; }
        let (column, row) = (column as usize, row as usize);
        let [x0, x1, y0, y1] = Self::cell_bounds(self.origin, column, row);
        if min_x >= x0 && max_x <= x1 && min_y >= y0 && max_y <= y1 { Some(&self.cells[row * self.columns + column]) } else { None }
    }
}
const FENCE_STRIDE: usize = 8;
const BOUNDS_PAD_M: f64 = 1e-3;

impl PreparedPark {
    pub fn new(stadium: &StadiumConfig) -> Result<Self, String> {
        let mut fences = Vec::with_capacity(stadium.fences.len() * FENCE_STRIDE);
        let mut bounds = Vec::with_capacity(stadium.fences.len() * 4);
        for (index, fence) in stadium.fences.iter().enumerate() {
            bounds.extend_from_slice(&[
                math::min(fence.start[0], fence.end[0]) - BOUNDS_PAD_M, math::max(fence.start[0], fence.end[0]) + BOUNDS_PAD_M,
                math::min(fence.start[1], fence.end[1]) - BOUNDS_PAD_M, math::max(fence.start[1], fence.end[1]) + BOUNDS_PAD_M,
            ]);
            let dx = fence.end[0] - fence.start[0];
            let dy = fence.end[1] - fence.start[1];
            let length = planar_distance(dx, dy);
            if !(length > 0.0) { return Err(format!("Degenerate fence segment {index}: {}", stadium.id)); }
            fences.extend_from_slice(&[fence.start[0], fence.start[1], fence.end[0], fence.end[1], fence.height_m, if fence.fair { 1.0 } else { 0.0 }, -dy / length, dx / length]);
        }
        let grid = FenceGrid::new(&bounds);
        Ok(Self { stadium: stadium.clone(), fences, bounds, grid })
    }
    /// The first fence crossed by p->q (lowest parameter, lowest index on ties) and its parameter.
    fn first_crossing(&self, px: f64, py: f64, qx: f64, qy: f64) -> (f64, usize) {
        let (mut best, mut index) = (f64::INFINITY, usize::MAX);
        match self.grid.candidates(px, py, qx, qy) {
            Some(fences) => for &fence in fences {
                let s = fence_crossing(self, fence as usize, px, py, qx, qy);
                if s < best { best = s; index = fence as usize; }
            },
            None => for fence in 0..self.stadium.fences.len() {
                let s = fence_crossing(self, fence, px, py, qx, qy);
                if s < best { best = s; index = fence; }
            },
        }
        (best, index)
    }
}

pub fn point_in_polygon(x: f64, y: f64, polygon: &[[f64; 2]]) -> bool {
    let mut inside = false;
    let mut previous = polygon.len() - 1;
    for index in 0..polygon.len() {
        let [xi, yi] = polygon[index];
        let [xj, yj] = polygon[previous];
        if (yi > y) != (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi { inside = !inside; }
        previous = index;
    }
    inside
}

fn push(trace: &mut FlightTrace, t: f64, x: f64, y: f64, z: f64) -> Result<(), String> {
    if trace.count >= trace.t.len() { return Err("Flight trace capacity exceeded".into()); }
    let index = trace.count;
    trace.count += 1;
    trace.t[index] = t; trace.x[index] = x; trace.y[index] = y; trace.z[index] = z;
    Ok(())
}

/// Parameter along p->q where it crosses fence `index`, or infinity.
fn fence_crossing(park: &PreparedPark, index: usize, px: f64, py: f64, qx: f64, qy: f64) -> f64 {
    let b = &park.bounds[index * 4..index * 4 + 4];
    if (px < b[0] && qx < b[0]) || (px > b[1] && qx > b[1]) || (py < b[2] && qy < b[2]) || (py > b[3] && qy > b[3]) { return f64::INFINITY; }
    let f = &park.fences[index * FENCE_STRIDE..index * FENCE_STRIDE + FENCE_STRIDE];
    let (ax, ay) = (f[0], f[1]);
    let (ex, ey) = (f[2] - ax, f[3] - ay);
    let (dx, dy) = (qx - px, qy - py);
    let denominator = dx * ey - dy * ex;
    if denominator == 0.0 { return f64::INFINITY; }
    let (wx, wy) = (ax - px, ay - py);
    let s = (wx * ey - wy * ex) / denominator;
    let u = (wx * dy - wy * dx) / denominator;
    if s > MIN_STEP_FRACTION && s <= 1.0 && u >= 0.0 && u <= 1.0 { s } else { f64::INFINITY }
}

/// Integration state for one trace; replaces the TS module-level buffers.
struct Ball { position: [f64; 3], velocity: [f64; 3], lift: f64, drag_scale: f64 }

/// Reflects the horizontal velocity about the wall normal and backs the point inside the wall.
fn reflect(fences: &[f64], index: usize, restitution: f64, ball: &mut Ball) {
    let offset = index * FENCE_STRIDE;
    let (mut nx, mut ny) = (fences[offset + 6], fences[offset + 7]);
    let normal = ball.velocity[0] * nx + ball.velocity[1] * ny;
    if normal < 0.0 { nx = -nx; ny = -ny; }
    let outward = normal.abs();
    ball.velocity[0] -= (1.0 + restitution) * outward * nx;
    ball.velocity[1] -= (1.0 + restitution) * outward * ny;
    ball.position[0] -= WALL_OFFSET_M * nx;
    ball.position[1] -= WALL_OFFSET_M * ny;
}

fn record_first(trace: &mut FlightTrace, kind: u8) {
    if trace.first_event == EVENT_NONE { trace.first_event = kind; }
}

fn accelerate(stadium: &StadiumConfig, ball: &Ball, v: &[f64; 3]) -> [f64; 3] {
    let [wx, wy, wz] = stadium.wind_mps;
    let (rx, ry, rz) = (v[0] - wx, v[1] - wy, v[2] - wz);
    let speed = (rx * rx + ry * ry + rz * rz).sqrt();
    let drag = -DRAG_COEFFICIENT * ball.drag_scale * stadium.air_density_kg_m3 * math::pow(speed / DRAG_REFERENCE_MPS, DRAG_SPEED_EXPONENT) * speed;
    let mut output = [drag * rx, drag * ry, drag * rz - GRAVITY_MPS2];
    let horizontal = planar_distance(rx, ry);
    if ball.lift == 0.0 || horizontal == 0.0 { return output; }
    let scale = ball.lift * stadium.air_density_kg_m3 * speed;
    output[0] -= scale * rz * rx / horizontal;
    output[1] -= scale * rz * ry / horizontal;
    output[2] += scale * horizontal;
    output
}

fn airborne_step(park: &PreparedPark, trace: &mut FlightTrace, ball: &mut Ball, time: f64) -> Result<f64, String> {
    let stadium = &park.stadium;
    let mut acceleration = accelerate(stadium, ball, &ball.velocity);
    let mut midpoint = [0.0; 3];
    for axis in 0..3 { midpoint[axis] = ball.velocity[axis] + acceleration[axis] * FLIGHT_DT / 2.0; }
    let [px, py, pz] = ball.position;
    let (qx, qy, qz) = (px + midpoint[0] * FLIGHT_DT, py + midpoint[1] * FLIGHT_DT, pz + midpoint[2] * FLIGHT_DT);
    acceleration = accelerate(stadium, ball, &midpoint);
    let vx = ball.velocity[0] + acceleration[0] * FLIGHT_DT;
    let vy = ball.velocity[1] + acceleration[1] * FLIGHT_DT;
    let vz = ball.velocity[2] + acceleration[2] * FLIGHT_DT;
    let (mut best, mut index) = park.first_crossing(px, py, qx, qy);
    let mut kind = if index == usize::MAX { EVENT_NONE } else { EVENT_FENCE };
    for (object_index, object) in stadium.overhead.iter().enumerate() {
        let h = object.height_m;
        if (pz - h) * (qz - h) > 0.0 || pz == qz { continue; }
        let s = (h - pz) / (qz - pz);
        if !(s > MIN_STEP_FRACTION && s <= 1.0) { continue; }
        if s < best && point_in_polygon(px + (qx - px) * s, py + (qy - py) * s, &object.polygon) { best = s; kind = EVENT_OVERHEAD; index = object_index; }
    }
    if qz <= 0.0 && pz > 0.0 {
        let s = pz / (pz - qz);
        if s < best { best = s; kind = EVENT_GROUND; }
    }
    if kind == EVENT_NONE {
        ball.position = [qx, qy, qz];
        ball.velocity = [vx, vy, vz];
        push(trace, time + FLIGHT_DT, qx, qy, qz)?;
        return Ok(time + FLIGHT_DT);
    }
    let event_time = time + best * FLIGHT_DT;
    ball.position[0] = px + (qx - px) * best;
    ball.position[1] = py + (qy - py) * best;
    ball.position[2] = if kind == EVENT_GROUND { 0.0 } else { pz + (qz - pz) * best };
    ball.velocity[0] += (vx - ball.velocity[0]) * best;
    ball.velocity[1] += (vy - ball.velocity[1]) * best;
    ball.velocity[2] += (vz - ball.velocity[2]) * best;
    if kind == EVENT_FENCE {
        let height = park.fences[index * FENCE_STRIDE + 4];
        let fair = park.fences[index * FENCE_STRIDE + 5] == 1.0;
        record_first(trace, kind);
        if trace.landing < 0 && trace.rebounds == 0 { trace.fair = fair; }
        push(trace, event_time, ball.position[0], ball.position[1], ball.position[2])?;
        if ball.position[2] > height {
            trace.end = if fair { TRACE_HOME_RUN } else { TRACE_DEAD_BALL };
            return Ok(-1.0);
        }
        trace.rebounds += 1;
        if trace.rebounds > MAX_REBOUNDS { return Err(format!("Flight exceeded {MAX_REBOUNDS} rebounds")); }
        reflect(&park.fences, index, stadium.wall_restitution, ball);
        return Ok(event_time);
    }
    if kind == EVENT_OVERHEAD {
        let object = &stadium.overhead[index];
        record_first(trace, kind);
        push(trace, event_time, ball.position[0], ball.position[1], ball.position[2])?;
        if object.ruling == OverheadRuling::LiveRebound {
            trace.rebounds += 1;
            if trace.rebounds > MAX_REBOUNDS { return Err(format!("Flight exceeded {MAX_REBOUNDS} rebounds")); }
            ball.velocity[2] = -stadium.wall_restitution * ball.velocity[2];
            ball.position[2] += if ball.velocity[2] > 0.0 { WALL_OFFSET_M } else { -WALL_OFFSET_M };
            return Ok(event_time);
        }
        if trace.landing < 0 && trace.rebounds == 0 { trace.fair = ball.position[0].abs() <= ball.position[1]; }
        trace.end = match object.ruling {
            OverheadRuling::HomeRun => if trace.fair { TRACE_HOME_RUN } else { TRACE_DEAD_BALL },
            OverheadRuling::AutomaticDouble => if trace.fair { TRACE_AUTOMATIC_DOUBLE } else { TRACE_DEAD_BALL },
            _ => TRACE_DEAD_BALL,
        };
        return Ok(-1.0);
    }
    record_first(trace, kind);
    if trace.rebounds == 0 { trace.fair = ball.position[0].abs() <= ball.position[1]; }
    ball.velocity[2] = 0.0;
    trace.landing = trace.count as isize;
    push(trace, event_time, ball.position[0], ball.position[1], 0.0)?;
    Ok(event_time)
}

fn rolling_step(park: &PreparedPark, trace: &mut FlightTrace, ball: &mut Ball, time: f64) -> Result<f64, String> {
    let stadium = &park.stadium;
    let speed = planar_distance(ball.velocity[0], ball.velocity[1]);
    if speed <= 0.0 { return Ok(-1.0); }
    let infield = planar_distance(ball.position[0] - INFIELD_CENTER[0], ball.position[1] - INFIELD_CENTER[1]) <= INFIELD_RADIUS_M;
    let deceleration = if infield { stadium.infield_deceleration_mps2 } else { stadium.outfield_deceleration_mps2 };
    let step = math::min(FLIGHT_DT, speed / deceleration);
    let next_speed = math::max(0.0, speed - deceleration * step);
    let distance = (speed + next_speed) / 2.0 * step;
    let (ux, uy) = (ball.velocity[0] / speed, ball.velocity[1] / speed);
    let (px, py) = (ball.position[0], ball.position[1]);
    let (qx, qy) = (px + ux * distance, py + uy * distance);
    let (best, index) = park.first_crossing(px, py, qx, qy);
    if index == usize::MAX {
        ball.position[0] = qx; ball.position[1] = qy;
        ball.velocity[0] = ux * next_speed; ball.velocity[1] = uy * next_speed;
        push(trace, time + step, qx, qy, 0.0)?;
        return Ok(if next_speed == 0.0 { -1.0 } else { time + step });
    }
    // Within one short step, time is treated as proportional to distance travelled.
    let event_time = time + step * best;
    let event_speed = speed - deceleration * step * best;
    ball.position[0] = px + (qx - px) * best;
    ball.position[1] = py + (qy - py) * best;
    ball.velocity[0] = ux * event_speed; ball.velocity[1] = uy * event_speed;
    record_first(trace, EVENT_FENCE);
    push(trace, event_time, ball.position[0], ball.position[1], 0.0)?;
    trace.rebounds += 1;
    if trace.rebounds > MAX_REBOUNDS { return Err(format!("Flight exceeded {MAX_REBOUNDS} rebounds")); }
    reflect(&park.fences, index, stadium.wall_restitution, ball);
    Ok(event_time)
}

/// Deterministically resolves one contact sample against the active park geometry into `trace`.
pub fn trace_flight(sample: &ContactSample, park: &PreparedPark, trace: &mut FlightTrace) -> Result<(), String> {
    let ContactSample { speed_mph, launch_deg, spray_deg, carry } = *sample;
    if !speed_mph.is_finite() || speed_mph <= 0.0 || !launch_deg.is_finite() || launch_deg <= -90.0 || launch_deg >= 90.0 || !spray_deg.is_finite() || spray_deg.abs() >= 90.0 {
        return Err("Invalid contact sample".into());
    }
    trace.count = 0; trace.landing = -1; trace.end = TRACE_STOPPED; trace.fair = true; trace.rebounds = 0; trace.first_event = EVENT_NONE;
    let speed = speed_mph * MPH_TO_MPS;
    let launch = launch_deg * std::f64::consts::PI / 180.0;
    let spray = spray_deg * std::f64::consts::PI / 180.0;
    if !carry.is_finite() || carry < 0.0 { return Err("Invalid contact carry".into()); }
    let mut ball = Ball {
        position: [0.0, 0.0, LAUNCH_HEIGHT_M],
        velocity: [speed * math::cos(launch) * math::sin(spray), speed * math::cos(launch) * math::cos(spray), speed * math::sin(launch)],
        lift: LIFT_COEFFICIENT * lift_shape(launch_deg),
        drag_scale: 1.0 / carry,
    };
    push(trace, 0.0, 0.0, 0.0, LAUNCH_HEIGHT_M)?;
    let mut time = 0.0;
    while time >= 0.0 {
        if time > MAX_FLIGHT_SECONDS { return Err(format!("Flight exceeded {MAX_FLIGHT_SECONDS} seconds")); }
        time = if trace.landing < 0 { airborne_step(park, trace, &mut ball, time)? } else { rolling_step(park, trace, &mut ball, time)? };
    }
    Ok(())
}
