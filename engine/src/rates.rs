//! Event-rate helpers matching the runtime parts of `src/lib/sim/rates.ts`.
pub type Rates = [f64; 8];

pub fn normalize(weights: &Rates) -> Result<Rates, String> {
    if weights.iter().any(|value| !value.is_finite() || *value < 0.0) { return Err("Invalid event weights".into()); }
    let total = weights.iter().fold(0.0, |sum, value| sum + value);
    if total <= 0.0 { return Err("Empty event distribution".into()); }
    Ok(weights.map(|value| value / total))
}

/// Neutral categorical matchup; gameplay adds platoon, and venues act through batted-ball flight.
pub fn matchup_rates(batter: &Rates, pitcher: &Rates, league: &Rates) -> Result<Rates, String> {
    if league.iter().any(|value| *value <= 0.0) { return Err("Invalid matchup league rates".into()); }
    let mut weights = [0.0; 8];
    for index in 0..8 { weights[index] = batter[index] * pitcher[index] / league[index]; }
    normalize(&weights)
}
