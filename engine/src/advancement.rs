//! Base state and forced advances (`src/lib/sim/advancement.ts`).

/// Runner and responsible pitcher per base; -1 marks an empty base.
#[derive(Clone, Debug)]
pub struct Bases {
    pub runners: [i16; 3],
    pub pitchers: [i16; 3],
    pub target: f64,
    pub winning_advance: u32,
    pub ended: bool,
}

impl Default for Bases {
    fn default() -> Self { Self { runners: [-1; 3], pitchers: [-1; 3], target: f64::INFINITY, winning_advance: 0, ended: false } }
}

/// Packs the forced destination mask and any run (bit 3) for a one-base award.
pub fn forced_base_transition(mask: u32) -> u32 {
    if mask & 1 == 0 { return mask | 1; }
    if mask & 2 == 0 { return (mask & 4) | 3; }
    if mask & 4 == 0 { return 7; }
    7 | 8
}
