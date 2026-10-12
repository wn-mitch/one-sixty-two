//! Data-preparation entry points: matchup contact fits, linear run weights, defensive run values,
//! and the neutral contact basis. Data prep and draft pricing call these instead of a second engine.
use crate::contact_basis::{build_contact_basis, side_class_basis};
use crate::contact_profile::{contact_targets, fit_contact, league_contact_fit, platoon_matchup, shape_tables, side_of, ContactFit, ShapeTables, POWER_SHIFTS, REGION_COUNT, SIDE_COUNT, SIDE_UNKNOWN};
use crate::fielding::PHYSICAL_CLASS_COUNT;
use crate::flight::PreparedPark;
use crate::physical_expectation::{contact_classes, EventRunWeights, PhysicalReference};
use crate::rates::Rates;
use crate::types::{ContactBasis, ContactShape, DefensiveEnvironment, DefensiveSkills, StadiumConfig, POSITIONS};
use serde::{Deserialize, Serialize};

/// The neutral league reference for one defensive environment, in the neutral park.
pub struct DataPrep {
    reference: PhysicalReference,
    neutral_park: PreparedPark,
    tables: ShapeTables,
    weights: std::sync::OnceLock<Result<EventRunWeights, String>>,
}

/// Length of one park's traced classes: [side][shift][region][class].
pub const PARK_BASIS_LEN: usize = SIDE_COUNT * POWER_SHIFTS.len() * REGION_COUNT * PHYSICAL_CLASS_COUNT;

/// Traced physical outcome classes for every batting side (see `side_class_basis`), one entry per park.
pub struct ParkSet { bases: Vec<Vec<f64>> }

impl ParkSet {
    /// Splits `flat` into parks of `PARK_BASIS_LEN` classes, as `DataPrep::park_basis` returns them.
    pub fn from_flat(flat: &[f64]) -> Result<Self, String> {
        if flat.is_empty() || !flat.len().is_multiple_of(PARK_BASIS_LEN) { return Err(format!("Park bases must be a positive multiple of {PARK_BASIS_LEN} values")); }
        if flat.iter().any(|value| !value.is_finite() || *value < 0.0) { return Err("Park bases must be finite and non-negative".into()); }
        Ok(Self { bases: flat.chunks(PARK_BASIS_LEN).map(<[f64]>::to_vec).collect() })
    }
    pub fn len(&self) -> usize { self.bases.len() }
    pub fn is_empty(&self) -> bool { self.bases.is_empty() }
}

/// Expected runs and outs per plate appearance for one matchup in one park.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ParkRunValue { pub runs: f64, pub outs: f64 }

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
        Ok(Self { reference: PhysicalReference::new(environment, tables.clone(), league_fit)?, neutral_park: PreparedPark::new(neutral_park)?, tables, weights: std::sync::OnceLock::new() })
    }

    pub fn event_run_weights(&self) -> Result<EventRunWeights, String> { self.reference.event_run_weights() }

    /// League state visits per inning, by base-out state.
    pub fn state_visits(&self) -> &[f64] { &self.reference.state_visits }

    /// Season runs saved at `position` relative to a neutral defender.
    pub fn expected_defensive_runs(&self, position: &str, skills: &DefensiveSkills) -> Result<f64, String> {
        let index = POSITIONS.iter().position(|name| *name == position).ok_or_else(|| format!("Unknown position {position}"))?;
        self.reference.expected_defensive_runs(index, skills, &self.neutral_park)
    }

    /// Platoon-adjusted rates and the neutral contact fit for one query.
    fn fit(&self, query: &MatchupQuery) -> Result<(Rates, ContactFit), String> {
        let environment = &self.reference.environment;
        let rates = platoon_matchup(&query.batting_rates, &query.bats, &query.pitching_rates, &query.throws, &environment.league_rates)?;
        let side = if query.unknown_side { SIDE_UNKNOWN } else { side_of(&query.bats, &query.throws) };
        let fit = fit_contact(&environment.contact_model.basis, &self.reference.league_fit.region_weights, &contact_targets(&rates)?, side, query.speed)?;
        Ok((rates, fit))
    }

    pub fn fit_matchup(&self, query: &MatchupQuery) -> Result<MatchupFit, String> {
        let labelled = |error: String| if query.label.is_empty() { error } else { format!("{}: {error}", query.label) };
        let (rates, fit) = self.fit(query).map_err(labelled)?;
        let classes = contact_classes(&self.reference.environment.contact_model, &fit).map_err(labelled)?;
        Ok(MatchupFit { rates, error: fit.error, triple_error: fit.triple_error, classes })
    }

    /// Traces one park for every batting side; a few seconds per park, so callers cache it.
    pub fn park_basis(&self, park: &StadiumConfig) -> Result<Vec<f64>, String> {
        side_class_basis(&self.tables, &PreparedPark::new(park)?).map_err(|error| format!("{}: {error}", park.id))
    }

    /// Runs and outs per plate appearance when the query's contact plays out in each park of the
    /// set, in set order. The contact fit is the neutral one, made once; the outcome side follows
    /// the batter's (or switch hitter's) side against `throws`, unknown when either is blank.
    pub fn park_run_values(&self, set: &ParkSet, query: &MatchupQuery) -> Result<Vec<ParkRunValue>, String> {
        let labelled = |error: String| if query.label.is_empty() { error } else { format!("{}: {error}", query.label) };
        let weights = self.weights.get_or_init(|| self.reference.event_run_weights()).as_ref().map_err(|error| labelled(error.clone()))?;
        let (rates, fit) = self.fit(query).map_err(labelled)?;
        let side = side_of(&query.bats, &query.throws);
        let contact = rates[3] + rates[4] + rates[5] + rates[6] + rates[7];
        set.bases.iter().map(|basis| {
            let mut classes = [0.0; PHYSICAL_CLASS_COUNT];
            for region in 0..REGION_COUNT {
                let offset = ((side * POWER_SHIFTS.len() + fit.shift_index) * REGION_COUNT + region) * PHYSICAL_CLASS_COUNT;
                for cls in 0..PHYSICAL_CLASS_COUNT { classes[cls] += fit.region_weights[region] * basis[offset + cls]; }
            }
            let total = classes.iter().fold(0.0, |sum, value| sum + value);
            if !((total - 1.0).abs() < 1e-6) { return Err(labelled("Park contact classes do not sum to one".into())); }
            let mut runs = (rates[0] + rates[1]) * weights.walk + rates[2] * weights.strikeout;
            let mut outs = rates[2];
            for cls in 0..PHYSICAL_CLASS_COUNT {
                let share = contact * classes[cls] / total;
                runs += share * weights.classes[cls];
                outs += share * weights.class_outs[cls];
            }
            Ok(ParkRunValue { runs, outs })
        }).collect()
    }
}

/// Traces the full neutral lattice into the response basis stored with the contact model.
pub fn contact_basis(shape: &ContactShape, neutral_park: &StadiumConfig) -> Result<ContactBasis, String> {
    build_contact_basis(&shape_tables(shape)?, &PreparedPark::new(neutral_park)?)
}
