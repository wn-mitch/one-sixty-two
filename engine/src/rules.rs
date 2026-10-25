//! The rules a game is played under. Classic play uses the standard rules; Draft Mode's
//! commissioner decrees change them for a chapter of the league season.
use serde::Deserialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GameRules {
    /// Regulation length; tied games continue an inning at a time.
    pub innings: u32,
    /// Outs that end a half inning.
    pub outs: u32,
    /// Every hit, home runs included, puts the batter on first and moves every runner exactly one
    /// base, as do errors; nobody steals.
    pub singles_only: bool,
    /// A walk or hit batter takes second and every runner advances two bases.
    pub free_pass_two: bool,
    /// A double play ends the half inning.
    pub double_play_ends: bool,
    /// Every runner advances one base on a caught outfield fly that is not the last out.
    pub everybody_tags: bool,
}

impl Default for GameRules {
    fn default() -> Self { Self { innings: 9, outs: 3, singles_only: false, free_pass_two: false, double_play_ends: false, everybody_tags: false } }
}

impl GameRules {
    pub fn validate(&self) -> Result<(), String> {
        if !(5..=15).contains(&self.innings) { return Err("Regulation must be 5 to 15 innings".into()); }
        if !(2..=4).contains(&self.outs) { return Err("A half inning must end at 2 to 4 outs".into()); }
        Ok(())
    }

    /// The standard-rules out count whose run expectancy stands in for `outs` under these rules:
    /// the last out before the half ends maps to two outs, and earlier ones count back from there.
    pub fn value_outs(&self, outs: u32) -> u32 { (outs + 3).saturating_sub(self.outs) }

    /// A double play is possible with at least two outs to spare.
    pub fn double_play_possible(&self, outs: u32) -> bool { outs + 1 < self.outs }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn value_outs_ends_every_half_at_three() {
        let standard = GameRules::default();
        assert_eq!((0..=3).map(|outs| standard.value_outs(outs)).collect::<Vec<_>>(), [0, 1, 2, 3]);
        let four = GameRules { outs: 4, ..standard };
        assert_eq!((0..=4).map(|outs| four.value_outs(outs)).collect::<Vec<_>>(), [0, 0, 1, 2, 3]);
        let two = GameRules { outs: 2, ..standard };
        assert_eq!((0..=2).map(|outs| two.value_outs(outs)).collect::<Vec<_>>(), [1, 2, 3]);
        assert!(two.double_play_possible(0) && !two.double_play_possible(1));
        assert!(four.double_play_possible(2) && !four.double_play_possible(3));
    }
}
