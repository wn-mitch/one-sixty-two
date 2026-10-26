//! The 162-0 simulation engine. Every build (wasm in the browser and Node, native for search)
//! runs this one implementation; transcendentals go through `math` so results match everywhere.
// The code mirrors the TS engine's indexed loops and NaN-rejecting comparisons line for line.
#![allow(clippy::needless_range_loop, clippy::neg_cmp_op_on_partial_ord, clippy::too_many_arguments, clippy::should_implement_trait, clippy::manual_range_contains, clippy::assign_op_pattern, clippy::excessive_precision)]
pub mod advancement;
pub mod contact;
pub mod contact_basis;
pub mod contact_profile;
pub mod crowd;
pub mod defense_rules;
pub mod exhibition;
pub mod fielding;
pub mod flight;
pub mod game;
pub mod inning;
pub mod league;
pub mod math;
pub mod normal;
pub mod park_package;
pub mod physical_expectation;
pub mod prep;
pub mod random;
pub mod rates;
pub mod relief;
pub mod rules;
pub mod season;
pub mod series;
pub mod team;
pub mod types;
pub mod value;
pub mod win_expectancy;
pub mod workload;

#[cfg(test)]
mod test_vectors;

pub use season::{Engine, SeasonOptions};
