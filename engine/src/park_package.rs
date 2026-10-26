//! Draft Mode's exaggerated home parks: a franchise's real stadium with one physical identity
//! pushed beyond any real park. Both clubs play under it. Coordinates put home plate at the origin
//! with center field along +y and left field at negative x. Strengths are provisional, sized so a
//! package moves scoring at its park by roughly 15-25% against the real park.
use crate::math;
use crate::types::StadiumConfig;
use serde::Deserialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ParkPackage {
    /// Colorado's Mile High-er: thinner air, so batted balls carry farther.
    ThinAir,
    /// Seattle's Marine Layer: heavy coastal air that kills carry.
    HeavyAir,
    /// Boston's Greenest Monster: the left-field wall grows several times taller.
    TallLeftWall,
    /// The Yankees' Shortest Porch: right field pulled toward the plate.
    ShortRightField,
    /// San Francisco's Splash Zone: a steady wind blowing out toward right field.
    WindToRight,
}

/// Air density as a share of the real park's.
pub const THIN_AIR: f64 = 0.92;
pub const HEAVY_AIR: f64 = 1.08;
/// Left-field fence height as a multiple of the real one.
pub const WALL_SCALE: f64 = 2.5;
/// Share of the distance to the right-field fence removed at full strength.
pub const PORCH_PULL: f64 = 0.14;
/// Wind speed toward right field, in meters per second.
pub const WIND_MPS: f64 = 3.0;

/// Spray angle in degrees from center field: negative toward left field, 45 down the right-field line.
fn angle(point: [f64; 2]) -> f64 { math::atan2(point[0], point[1]).to_degrees() }

/// How strongly the porch pulls a fence point: none left of right-center, full from the right-field
/// line into the near foul territory, easing back to none before the walls behind the plate.
fn porch_weight(point: [f64; 2]) -> f64 {
    let theta = angle(point);
    if theta <= 15.0 || theta >= 90.0 { 0.0 } else if theta < 45.0 { (theta - 15.0) / 30.0 } else if theta <= 60.0 { 1.0 } else { (90.0 - theta) / 30.0 }
}

/// The stadium under `package`, keeping its id so results still name the real park.
pub fn apply(stadium: &StadiumConfig, package: ParkPackage) -> StadiumConfig {
    let mut park = stadium.clone();
    match package {
        ParkPackage::ThinAir => park.air_density_kg_m3 *= THIN_AIR,
        ParkPackage::HeavyAir => park.air_density_kg_m3 *= HEAVY_AIR,
        ParkPackage::TallLeftWall => {
            for fence in park.fences.iter_mut().filter(|fence| fence.fair) {
                let middle = [(fence.start[0] + fence.end[0]) / 2.0, (fence.start[1] + fence.end[1]) / 2.0];
                if angle(middle) < -15.0 { fence.height_m *= WALL_SCALE; }
            }
        }
        ParkPackage::ShortRightField => {
            // Every fence endpoint moves by the same rule, so shared corners stay joined.
            let pull = |point: [f64; 2]| { let scale = 1.0 - PORCH_PULL * porch_weight(point); [point[0] * scale, point[1] * scale] };
            for fence in park.fences.iter_mut() {
                fence.start = pull(fence.start);
                fence.end = pull(fence.end);
            }
        }
        ParkPackage::WindToRight => {
            let direction = 45f64.to_radians();
            park.wind_mps = [WIND_MPS * math::sin(direction), WIND_MPS * math::cos(direction), 0.0];
        }
    }
    park
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::FenceSegment;

    #[test]
    fn the_porch_pulls_right_field_in_and_leaves_left_field_and_the_backstop_alone() {
        assert_eq!(porch_weight([-60.0, 60.0]), 0.0);
        assert_eq!(porch_weight([0.0, 120.0]), 0.0);
        assert_eq!(porch_weight([70.0, 70.0]), 1.0);
        assert_eq!(porch_weight([10.0, -20.0]), 0.0);
        assert!(porch_weight([30.0, 100.0]) > 0.0 && porch_weight([30.0, 100.0]) < 1.0);
    }

    /// A closed ring of fences around home plate every 15 degrees, fair from line to line.
    fn ring() -> StadiumConfig {
        let point = |degrees: f64| { let radians = degrees.to_radians(); [110.0 * math::sin(radians), 110.0 * math::cos(radians)] };
        let corners: Vec<[f64; 2]> = (0..24).map(|step| point(-180.0 + 15.0 * step as f64)).collect();
        let fences = (0..24).map(|step| {
            let from = -180.0 + 15.0 * step as f64;
            FenceSegment { start: corners[step], end: corners[(step + 1) % 24], height_m: 3.0, fair: from >= -45.0 && from + 15.0 <= 45.0 }
        }).collect();
        StadiumConfig {
            id: "ring".into(), version: "1".into(), franchise_id: "X".into(), name: "Ring".into(), fences, overhead: Vec::new(),
            air_density_kg_m3: 1.2, wind_mps: [0.0; 3], infield_deceleration_mps2: 1.0, outfield_deceleration_mps2: 1.0, wall_restitution: 0.3,
        }
    }

    #[test]
    fn packages_change_only_their_own_feature_and_keep_the_fence_closed() {
        let park = ring();
        let wall = apply(&park, ParkPackage::TallLeftWall);
        for (before, after) in park.fences.iter().zip(&wall.fences) {
            let left = before.fair && angle([(before.start[0] + before.end[0]) / 2.0, (before.start[1] + before.end[1]) / 2.0]) < -15.0;
            assert_eq!(after.height_m, if left { 3.0 * WALL_SCALE } else { 3.0 });
        }
        let porch = apply(&park, ParkPackage::ShortRightField);
        for (index, fence) in porch.fences.iter().enumerate() { assert_eq!(fence.end, porch.fences[(index + 1) % porch.fences.len()].start); }
        let distance = |point: [f64; 2]| math::planar_distance(point[0], point[1]);
        assert!(distance(porch.fences[15].end) < 110.0 * (1.0 - PORCH_PULL) + 1e-9);
        assert!((distance(porch.fences[9].end) - 110.0).abs() < 1e-9);
        assert_eq!(apply(&park, ParkPackage::ThinAir).air_density_kg_m3, 1.2 * THIN_AIR);
        let wind = apply(&park, ParkPackage::WindToRight).wind_mps;
        assert!(wind[0] > 0.0 && (wind[0] - wind[1]).abs() < 1e-9 && wind[2] == 0.0);
    }
}
