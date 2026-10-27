//! Draft Mode's exaggerated home parks: a franchise's real stadium with one physical identity
//! pushed beyond any real park. Both clubs play under it, and the home club holds a familiarity edge
//! there (`MAX_FAMILIARITY`). Coordinates put home plate at the origin with center field along +y
//! and left field at negative x. Strengths are provisional, sized so a package moves scoring at its
//! park by roughly 15-25% against the real park.
use crate::math;
use crate::types::{OverheadObject, OverheadRuling, StadiumConfig};
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
    /// Arizona's Hot Corner: a baked, hard infield that sends ground balls through fast.
    HotCorner,
    /// Miami's Everglades: soggy turf that slows ground balls and every runner.
    Everglades,
    /// Tampa Bay's Catwalk Baseball: four catwalk rings hung low over the field.
    Catwalk,
    /// Milwaukee's Seventh-Inning Fermentation: from the seventh inning on, harder contact and sloppier fielding.
    Fermentation,
    /// Minnesota's Deep Freeze: a season calendar of cold, thaw, warm, warm, cool and cold chapters.
    DeepFreeze,
}

/// What a park condition does during play, beyond the stadium itself. Both clubs play under it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Conditions {
    /// Taken off every runner's speed skill, floored at zero.
    pub runner_slowdown: f64,
    /// From this inning on (zero for never), batted balls leave `1 + late_power` times as fast and
    /// every fielder's hit prevention falls by `late_fielding`.
    pub late_inning: u32,
    pub late_power: f64,
    pub late_fielding: f64,
    /// Multiplier on every starter's out budget.
    pub endurance: f64,
    /// Multiplier on the exit speed of ground balls off the park's surface.
    pub grounder_speed: f64,
}

impl Default for Conditions {
    fn default() -> Self { Self { runner_slowdown: 0.0, late_inning: 0, late_power: 0.0, late_fielding: 0.0, endurance: 1.0, grounder_speed: 1.0 } }
}

/// Ground-ball deceleration as a multiple of the real park's: Arizona's hard infield, Miami's soggy turf.
pub const HOT_GROUND: f64 = 0.5;
pub const SOGGY_GROUND: f64 = 1.8;
/// Ground-ball exit speed as a multiple of the usual: Arizona's baked infield, Miami's mud.
pub const HOT_GROUNDERS: f64 = 1.15;
pub const SOGGY_GROUNDERS: f64 = 0.88;
/// Miami's slowdown of every runner's speed skill.
pub const SOGGY_RUNNERS: f64 = 0.35;
/// Milwaukee from the seventh inning: exit-speed gain and fielders' hit-prevention loss.
pub const FERMENT_INNING: u32 = 7;
pub const FERMENT_POWER: f64 = 0.03;
pub const FERMENT_FIELDING: f64 = 0.3;
/// Minnesota's chapters: starter endurance and air density (a multiple of the real park's).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Weather { Cold, Thaw, Warm, Cool }
pub const FREEZE_CALENDAR: [Weather; 6] = [Weather::Cold, Weather::Thaw, Weather::Warm, Weather::Warm, Weather::Cool, Weather::Cold];
fn freeze(weather: Weather) -> (f64, f64) {
    match weather { Weather::Cold => (0.7, 1.05), Weather::Thaw | Weather::Cool => (0.85, 1.025), Weather::Warm => (1.0, 1.0) }
}
/// Tampa Bay's rings, innermost first: inner and outer radius around the ring center, height, and
/// ruling. The two upper rings are live and catchable; contact with the two lower rings is a home run.
pub const RING_CENTER: [f64; 2] = [0.0, 40.0];
pub const RINGS: [(f64, f64, f64, OverheadRuling); 4] = [
    (18.0, 24.0, 34.0, OverheadRuling::LiveRebound),
    (38.0, 44.0, 29.0, OverheadRuling::LiveRebound),
    (58.0, 64.0, 22.0, OverheadRuling::HomeRun),
    (78.0, 84.0, 16.0, OverheadRuling::HomeRun),
];
const RING_SECTORS: usize = 36;

/// The conditions `package` plays under in chapter `chapter` (0-5).
pub fn conditions(package: Option<ParkPackage>, chapter: usize) -> Conditions {
    match package {
        Some(ParkPackage::HotCorner) => Conditions { grounder_speed: HOT_GROUNDERS, ..Conditions::default() },
        Some(ParkPackage::Everglades) => Conditions { runner_slowdown: SOGGY_RUNNERS, grounder_speed: SOGGY_GROUNDERS, ..Conditions::default() },
        Some(ParkPackage::Fermentation) => Conditions { late_inning: FERMENT_INNING, late_power: FERMENT_POWER, late_fielding: FERMENT_FIELDING, ..Conditions::default() },
        Some(ParkPackage::DeepFreeze) => Conditions { endurance: freeze(FREEZE_CALENDAR[chapter.min(5)]).0, ..Conditions::default() },
        _ => Conditions::default(),
    }
}

/// Each ring as ten-degree quadrilaterals, so every overhead polygon stays convex.
fn catwalk_rings() -> Vec<OverheadObject> {
    let at = |radius: f64, degrees: f64| { let radians = degrees.to_radians(); [RING_CENTER[0] + radius * math::sin(radians), RING_CENTER[1] + radius * math::cos(radians)] };
    let step = 360.0 / RING_SECTORS as f64;
    RINGS.iter().enumerate().flat_map(|(ring, &(inner, outer, height, ruling))| (0..RING_SECTORS).map(move |sector| {
        let (from, to) = (step * sector as f64, step * (sector + 1) as f64);
        OverheadObject { id: format!("ring-{}-{sector}", ["a", "b", "c", "d"][ring]), polygon: vec![at(inner, from), at(outer, from), at(outer, to), at(inner, to)], height_m: height, ruling }
    })).collect()
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

/// The largest familiarity edge a home club can hold: its batted balls leave this share faster at
/// home, and the visitors' this share slower.
pub const MAX_FAMILIARITY: f64 = 0.02;

/// Spray angle in degrees from center field: negative toward left field, 45 down the right-field line.
fn angle(point: [f64; 2]) -> f64 { math::atan2(point[0], point[1]).to_degrees() }

/// How strongly the porch pulls a fence point: none left of right-center, full from the right-field
/// line into the near foul territory, easing back to none before the walls behind the plate.
fn porch_weight(point: [f64; 2]) -> f64 {
    let theta = angle(point);
    if theta <= 15.0 || theta >= 90.0 { 0.0 } else if theta < 45.0 { (theta - 15.0) / 30.0 } else if theta <= 60.0 { 1.0 } else { (90.0 - theta) / 30.0 }
}

/// The stadium under `package` in chapter `chapter` (0-5), keeping its id so results still name the real park.
pub fn apply(stadium: &StadiumConfig, package: ParkPackage, chapter: usize) -> StadiumConfig {
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
        ParkPackage::HotCorner => park.infield_deceleration_mps2 *= HOT_GROUND,
        ParkPackage::Everglades => {
            park.infield_deceleration_mps2 *= SOGGY_GROUND;
            park.outfield_deceleration_mps2 *= SOGGY_GROUND;
        }
        ParkPackage::Catwalk => park.overhead.extend(catwalk_rings()),
        ParkPackage::Fermentation => {}
        ParkPackage::DeepFreeze => park.air_density_kg_m3 *= freeze(FREEZE_CALENDAR[chapter.min(5)]).1,
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
        let wall = apply(&park, ParkPackage::TallLeftWall, 0);
        for (before, after) in park.fences.iter().zip(&wall.fences) {
            let left = before.fair && angle([(before.start[0] + before.end[0]) / 2.0, (before.start[1] + before.end[1]) / 2.0]) < -15.0;
            assert_eq!(after.height_m, if left { 3.0 * WALL_SCALE } else { 3.0 });
        }
        let porch = apply(&park, ParkPackage::ShortRightField, 0);
        for (index, fence) in porch.fences.iter().enumerate() { assert_eq!(fence.end, porch.fences[(index + 1) % porch.fences.len()].start); }
        let distance = |point: [f64; 2]| math::planar_distance(point[0], point[1]);
        assert!(distance(porch.fences[15].end) < 110.0 * (1.0 - PORCH_PULL) + 1e-9);
        assert!((distance(porch.fences[9].end) - 110.0).abs() < 1e-9);
        assert_eq!(apply(&park, ParkPackage::ThinAir, 0).air_density_kg_m3, 1.2 * THIN_AIR);
        let wind = apply(&park, ParkPackage::WindToRight, 0).wind_mps;
        assert!(wind[0] > 0.0 && (wind[0] - wind[1]).abs() < 1e-9 && wind[2] == 0.0);
    }

    #[test]
    fn surface_ring_inning_and_calendar_packages_change_what_they_name() {
        let park = ring();
        assert_eq!(apply(&park, ParkPackage::HotCorner, 0).infield_deceleration_mps2, HOT_GROUND);
        assert_eq!(apply(&park, ParkPackage::HotCorner, 0).outfield_deceleration_mps2, 1.0);
        let soggy = apply(&park, ParkPackage::Everglades, 0);
        assert_eq!([soggy.infield_deceleration_mps2, soggy.outfield_deceleration_mps2], [SOGGY_GROUND; 2]);
        assert_eq!(conditions(Some(ParkPackage::Everglades), 0).runner_slowdown, SOGGY_RUNNERS);
        assert_eq!(conditions(Some(ParkPackage::Everglades), 0).grounder_speed, SOGGY_GROUNDERS);
        assert_eq!(conditions(Some(ParkPackage::HotCorner), 0).grounder_speed, HOT_GROUNDERS);
        // Four rings of 36 sectors; the two upper rings are live, the two lower ones home runs.
        let rings = apply(&park, ParkPackage::Catwalk, 0).overhead;
        assert_eq!(rings.len(), 4 * RING_SECTORS);
        assert!(rings[..2 * RING_SECTORS].iter().all(|ring| ring.ruling == OverheadRuling::LiveRebound));
        assert!(rings[2 * RING_SECTORS..].iter().all(|ring| ring.ruling == OverheadRuling::HomeRun && ring.height_m < 25.0));
        let over = |x: f64, y: f64| rings.iter().filter(|ring| crate::flight::point_in_polygon(x, y, &ring.polygon)).count();
        assert_eq!(over(RING_CENTER[0], RING_CENTER[1] + 21.0), 1);
        assert_eq!(over(RING_CENTER[0], RING_CENTER[1] + 30.0), 0);
        assert_eq!(over(RING_CENTER[0] - 81.0, RING_CENTER[1]), 1);
        // Milwaukee changes only play from the seventh; the stadium is untouched.
        let late = conditions(Some(ParkPackage::Fermentation), 3);
        assert_eq!((late.late_inning, late.late_power, late.late_fielding), (FERMENT_INNING, FERMENT_POWER, FERMENT_FIELDING));
        assert_eq!(apply(&park, ParkPackage::Fermentation, 3).air_density_kg_m3, 1.2);
        // Minnesota follows its calendar: cold chapters tire starters and thicken the air, warm ones are ordinary.
        let freeze = |chapter| (conditions(Some(ParkPackage::DeepFreeze), chapter).endurance, apply(&park, ParkPackage::DeepFreeze, chapter).air_density_kg_m3);
        assert!(freeze(0).0 < freeze(1).0 && freeze(1).0 < freeze(2).0 && freeze(2) == (1.0, 1.2) && freeze(3) == freeze(2));
        assert!(freeze(0).1 > freeze(1).1 && freeze(5) == freeze(0) && freeze(4) == freeze(1));
        assert_eq!(conditions(None, 0), Conditions::default());
        assert_eq!(conditions(Some(ParkPackage::ThinAir), 0), Conditions::default());
    }
}
