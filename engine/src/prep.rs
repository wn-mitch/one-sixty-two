//! Data-preparation entry points: matchup contact fits, linear run weights, defensive run values,
//! and the neutral contact basis. Data prep and draft pricing call these instead of a second engine.
use crate::contact_basis::build_contact_basis;
use crate::contact_profile::{contact_targets, fit_contact, league_contact_fit, platoon_matchup, shape_tables, side_of, SIDE_UNKNOWN};
use crate::flight::PreparedPark;
use crate::physical_expectation::{contact_classes, EventRunWeights, PhysicalReference};
use crate::rates::Rates;
use crate::types::{ContactBasis, ContactShape, DefensiveEnvironment, DefensiveSkills, StadiumConfig, POSITIONS};
use serde::{Deserialize, Serialize};

/// The neutral league reference for one defensive environment, in the neutral park.
pub struct DataPrep {
    reference: PhysicalReference,
    neutral_park: PreparedPark,
}

/// One batter/pitcher pairing. `unknownSide` fits at unknown side instead of the platoon side.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchupQuery {
    pub batting_rates: Rates,
    pub bats: String,
    pub pitching_rates: Rates,
    pub throws: String,
    pub speed: f64,
    #[serde(default)]
    pub unknown_side: bool,
    /// Prefixes any error, typically the season id being priced.
    #[serde(default)]
    pub label: String,
}

/// The platoon-adjusted eight-event rates, the contact fit's misses, and its neutral outcome classes.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchupFit {
    pub rates: Rates,
    pub error: f64,
    pub triple_error: f64,
    pub classes: Vec<f64>,
}

impl DataPrep {
    pub fn new(environment: &DefensiveEnvironment, neutral_park: &StadiumConfig) -> Result<Self, String> {
        let tables = shape_tables(&environment.contact_model.shape)?;
        let league_fit = league_contact_fit(&environment.contact_model, &tables, &environment.league_rates)?;
        Ok(Self { reference: PhysicalReference::new(environment, tables, league_fit)?, neutral_park: PreparedPark::new(neutral_park)? })
    }

    pub fn event_run_weights(&self) -> Result<EventRunWeights, String> { self.reference.event_run_weights() }

    /// League state visits per inning, by base-out state.
    pub fn state_visits(&self) -> &[f64] { &self.reference.state_visits }

    /// Season runs saved at `position` relative to a neutral defender.
    pub fn expected_defensive_runs(&self, position: &str, skills: &DefensiveSkills) -> Result<f64, String> {
        let index = POSITIONS.iter().position(|name| *name == position).ok_or_else(|| format!("Unknown position {position}"))?;
        self.reference.expected_defensive_runs(index, skills, &self.neutral_park)
    }

    pub fn fit_matchup(&self, query: &MatchupQuery) -> Result<MatchupFit, String> {
        let labelled = |error: String| if query.label.is_empty() { error } else { format!("{}: {error}", query.label) };
        let environment = &self.reference.environment;
        let rates = platoon_matchup(&query.batting_rates, &query.bats, &query.pitching_rates, &query.throws, &environment.league_rates).map_err(labelled)?;
        let side = if query.unknown_side { SIDE_UNKNOWN } else { side_of(&query.bats, &query.throws) };
        let fit = fit_contact(&environment.contact_model.basis, &self.reference.league_fit.region_weights, &contact_targets(&rates).map_err(labelled)?, side, query.speed).map_err(labelled)?;
        let classes = contact_classes(&environment.contact_model, &fit).map_err(labelled)?;
        Ok(MatchupFit { rates, error: fit.error, triple_error: fit.triple_error, classes })
    }
}

/// Traces the full neutral lattice into the response basis stored with the contact model.
pub fn contact_basis(shape: &ContactShape, neutral_park: &StadiumConfig) -> Result<ContactBasis, String> {
    build_contact_basis(&shape_tables(shape)?, &PreparedPark::new(neutral_park)?)
}
