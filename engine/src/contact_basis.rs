//! Neutral-park response basis over the contact lattice (`src/lib/sim/contact-basis.ts`).
use crate::contact_profile::{launch_class, region_of, ShapeTables, CONTACT_OUTCOMES, EV_COUNT, EV_MIN, EV_WIDTH, LAUNCH_COUNT, LAUNCH_MIN, LAUNCH_WIDTH, POWER_SHIFTS, REGION_COUNT, SIDE_COUNT, SIDE_UNKNOWN, SPEED_NODES, SPRAY_COUNT, SPRAY_MIN, SPRAY_WIDTH};
use crate::fielding::{build_fielding_plan, compute_candidates, fielding_outcomes, physical_class, FieldingCandidates, FieldingPlan, PhysicalOutcomes, OUTCOME_FOUL, PHYSICAL_CLASS_COUNT};
use crate::flight::{carry_at, carry_nodes, trace_flight, ContactSample, FlightTrace, PreparedPark};
use crate::types::ContactBasis;

/// Lattice exit-velocity positions cover every histogram bin under every power shift.
const SHIFT_STEPS: usize = POWER_SHIFTS.len();
const SHIFT_ORIGIN: usize = 6;
pub const LATTICE_EV_COUNT: usize = EV_COUNT + SHIFT_STEPS - 1;
pub const LATTICE_POINTS: usize = LATTICE_EV_COUNT * LAUNCH_COUNT * SPRAY_COUNT;

/// Midpoint of histogram cell (ev + shift step, launch, spray).
fn lattice_sample(ev_index: usize, launch_index: usize, spray_index: usize, output: &mut ContactSample) {
    output.speed_mph = EV_MIN + (ev_index as f64 - SHIFT_ORIGIN as f64 + 0.5) * EV_WIDTH;
    output.launch_deg = LAUNCH_MIN + (launch_index as f64 + 0.5) * LAUNCH_WIDTH;
    output.spray_deg = SPRAY_MIN + (spray_index as f64 + 0.5) * SPRAY_WIDTH;
}

/// Traces every lattice midpoint in the neutral park at each carry quadrature node; `weight` is the node weight.
pub fn for_each_lattice_trace(park: &PreparedPark, visit: &mut dyn FnMut(usize, usize, usize, &FlightTrace, f64)) -> Result<(), String> {
    let mut trace = FlightTrace::default();
    let mut sample = ContactSample { carry: 1.0, ..Default::default() };
    for e in 0..LATTICE_EV_COUNT {
        for l in 0..LAUNCH_COUNT {
            for s in 0..SPRAY_COUNT {
                lattice_sample(e, l, s, &mut sample);
                for (z, weight) in carry_nodes() {
                    sample.carry = carry_at(z);
                    trace_flight(&sample, park, &mut trace)?;
                    visit(e, l, s, &trace, weight);
                }
            }
        }
    }
    Ok(())
}

fn lattice_index(e: usize, l: usize, s: usize) -> usize { (e * LAUNCH_COUNT + l) * SPRAY_COUNT + s }

/// Integrates neutral-park outcomes over the league shape: for each region, histogram cell
/// probabilities times side-specific spray probabilities times the lattice midpoint response.
pub fn build_contact_basis(tables: &ShapeTables, park: &PreparedPark) -> Result<ContactBasis, String> {
    let speed_count = SPEED_NODES.len();
    let mut node_responses = vec![0.0; LATTICE_POINTS * speed_count * CONTACT_OUTCOMES];
    let mut node_classes = vec![0.0; LATTICE_POINTS * PHYSICAL_CLASS_COUNT];
    let mut candidates = FieldingCandidates::default();
    let mut plan = FieldingPlan::default();
    let mut outcomes = PhysicalOutcomes::default();
    let zeros = [0.0; 8];
    let mask = [0u8; 8];
    let average_speed = 2;
    let mut failure: Option<String> = None;
    for_each_lattice_trace(park, &mut |e, l, s, trace, carry_weight| {
        let point = lattice_index(e, l, s);
        compute_candidates(trace, &zeros, &mut candidates);
        build_fielding_plan(trace, &candidates, &mask, &zeros, &mut plan);
        for speed in 0..speed_count {
            fielding_outcomes(&plan, SPEED_NODES[speed], &mut outcomes);
            let mut fair = 0.0;
            for index in 0..outcomes.count { if outcomes.kind[index] != OUTCOME_FOUL { fair += outcomes.probability[index]; } }
            if !(fair > 0.0) { failure.get_or_insert(format!("Neutral lattice point is never fair: {e}:{l}:{s}")); return; }
            for index in 0..outcomes.count {
                let kind = outcomes.kind[index];
                if kind == OUTCOME_FOUL { continue; }
                let probability = carry_weight * outcomes.probability[index] / fair;
                let cls = physical_class(kind, outcomes.fielder[index], outcomes.bases[index]);
                let column = if cls == 42 { 3 } else if cls == 43 { 1 } else if cls >= 18 { outcomes.bases[index] as usize - 1 } else if cls >= 13 { 0 } else { 4 };
                node_responses[(point * speed_count + speed) * CONTACT_OUTCOMES + column] += probability;
                if speed == average_speed { node_classes[point * PHYSICAL_CLASS_COUNT + cls] += probability; }
            }
        }
    })?;
    if let Some(message) = failure { return Err(message); }
    let mut responses = vec![0.0; SIDE_COUNT * speed_count * SHIFT_STEPS * REGION_COUNT * CONTACT_OUTCOMES];
    let mut classes = vec![0.0; SHIFT_STEPS * REGION_COUNT * PHYSICAL_CLASS_COUNT];
    for region in 0..REGION_COUNT {
        let cdf = &tables.cell_cdf[region];
        for (position, cell) in tables.cells[region].iter().enumerate() {
            let cell_probability = cdf[position] - if position == 0 { 0.0 } else { cdf[position - 1] };
            let e = cell / LAUNCH_COUNT;
            let l = cell - e * LAUNCH_COUNT;
            if region_of(e, l) != region { return Err("Contact basis region mismatch".into()); }
            let launch_class_index = launch_class(LAUNCH_MIN + (l as f64 + 0.5) * LAUNCH_WIDTH);
            for side in 0..SIDE_COUNT {
                let spray_cdf = &tables.spray_cdf[side * 4 + launch_class_index];
                for s in 0..SPRAY_COUNT {
                    let weight = cell_probability * (spray_cdf[s] - if s == 0 { 0.0 } else { spray_cdf[s - 1] });
                    if weight == 0.0 { continue; }
                    for shift in 0..SHIFT_STEPS {
                        let point = lattice_index(e + shift, l, s);
                        for speed in 0..speed_count {
                            let target = (((side * speed_count + speed) * SHIFT_STEPS + shift) * REGION_COUNT + region) * CONTACT_OUTCOMES;
                            let source = (point * speed_count + speed) * CONTACT_OUTCOMES;
                            for outcome in 0..CONTACT_OUTCOMES { responses[target + outcome] += weight * node_responses[source + outcome]; }
                        }
                        if side == SIDE_UNKNOWN {
                            let target = (shift * REGION_COUNT + region) * PHYSICAL_CLASS_COUNT;
                            for cls in 0..PHYSICAL_CLASS_COUNT { classes[target + cls] += weight * node_classes[point * PHYSICAL_CLASS_COUNT + cls]; }
                        }
                    }
                }
            }
        }
    }
    Ok(ContactBasis { responses, classes })
}

/// Physical outcome classes in `park` at average runner speed for every batting side, integrated
/// over the league shape like `build_contact_basis`: [side][shift][region][class]. Draft park fit
/// compares these across parks; the neutral basis keeps only the unknown side.
pub fn side_class_basis(tables: &ShapeTables, park: &PreparedPark) -> Result<Vec<f64>, String> {
    let mut node_classes = vec![0.0; LATTICE_POINTS * PHYSICAL_CLASS_COUNT];
    let mut candidates = FieldingCandidates::default();
    let mut plan = FieldingPlan::default();
    let mut outcomes = PhysicalOutcomes::default();
    let zeros = [0.0; 8];
    let mask = [0u8; 8];
    let average_speed = SPEED_NODES[2];
    let mut failure: Option<String> = None;
    for_each_lattice_trace(park, &mut |e, l, s, trace, carry_weight| {
        let point = lattice_index(e, l, s);
        compute_candidates(trace, &zeros, &mut candidates);
        build_fielding_plan(trace, &candidates, &mask, &zeros, &mut plan);
        fielding_outcomes(&plan, average_speed, &mut outcomes);
        let mut fair = 0.0;
        for index in 0..outcomes.count { if outcomes.kind[index] != OUTCOME_FOUL { fair += outcomes.probability[index]; } }
        if !(fair > 0.0) { failure.get_or_insert(format!("Lattice point is never fair in this park: {e}:{l}:{s}")); return; }
        for index in 0..outcomes.count {
            if outcomes.kind[index] == OUTCOME_FOUL { continue; }
            let cls = physical_class(outcomes.kind[index], outcomes.fielder[index], outcomes.bases[index]);
            node_classes[point * PHYSICAL_CLASS_COUNT + cls] += carry_weight * outcomes.probability[index] / fair;
        }
    })?;
    if let Some(message) = failure { return Err(message); }
    let mut classes = vec![0.0; SIDE_COUNT * SHIFT_STEPS * REGION_COUNT * PHYSICAL_CLASS_COUNT];
    for region in 0..REGION_COUNT {
        let cdf = &tables.cell_cdf[region];
        for (position, cell) in tables.cells[region].iter().enumerate() {
            let cell_probability = cdf[position] - if position == 0 { 0.0 } else { cdf[position - 1] };
            let e = cell / LAUNCH_COUNT;
            let l = cell - e * LAUNCH_COUNT;
            let launch_class_index = launch_class(LAUNCH_MIN + (l as f64 + 0.5) * LAUNCH_WIDTH);
            for side in 0..SIDE_COUNT {
                let spray_cdf = &tables.spray_cdf[side * 4 + launch_class_index];
                for s in 0..SPRAY_COUNT {
                    let weight = cell_probability * (spray_cdf[s] - if s == 0 { 0.0 } else { spray_cdf[s - 1] });
                    if weight == 0.0 { continue; }
                    for shift in 0..SHIFT_STEPS {
                        let point = lattice_index(e + shift, l, s);
                        let target = ((side * SHIFT_STEPS + shift) * REGION_COUNT + region) * PHYSICAL_CLASS_COUNT;
                        for cls in 0..PHYSICAL_CLASS_COUNT { classes[target + cls] += weight * node_classes[point * PHYSICAL_CLASS_COUNT + cls]; }
                    }
                }
            }
        }
    }
    Ok(classes)
}
