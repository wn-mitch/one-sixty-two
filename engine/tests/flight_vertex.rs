//! A ground ball whose path runs exactly through the corner of two outfield wall segments must
//! still meet the wall. Before the crossing test overlapped segment ends, this Chase Field lattice
//! sample rolled through the corner and out of the park until the 20-second flight limit.
use engine::flight::{trace_flight, ContactSample, FlightTrace, PreparedPark};
use engine::types::StadiumConfig;

#[test]
fn a_roll_through_a_wall_corner_rebounds() {
    let stadium: StadiumConfig = serde_json::from_str(include_str!("fixtures/ari-fences.json")).unwrap();
    let park = PreparedPark::new(&stadium).unwrap();
    let mut trace = FlightTrace::default();
    let sample = ContactSample { speed_mph: 133.75, launch_deg: -14.0, spray_deg: 22.5, carry: engine::flight::carry_at(-(3.0f64).sqrt()) };
    trace_flight(&sample, &park, &mut trace).unwrap();
    assert!(trace.rebounds >= 1, "the ball never met the wall");
    let last = trace.count - 1;
    let (x, y) = (trace.x[last], trace.y[last]);
    assert!(x * x + y * y < 130.0 * 130.0, "the ball left the park");
}
