//! Seeded streams identical to `src/lib/game/random.ts`.

/// Mulberry32: one 32-bit state, uniform doubles in [0, 1).
#[derive(Clone, Debug)]
pub struct Mulberry32 { state: u32 }

impl Mulberry32 {
    pub fn new(seed: u32) -> Self { Self { state: seed } }
    #[inline]
    pub fn next(&mut self) -> f64 {
        self.state = self.state.wrapping_add(0x6D2B79F5);
        let s = self.state;
        let mut value = (s ^ (s >> 15)).wrapping_mul(s | 1);
        value ^= value.wrapping_add((value ^ (value >> 7)).wrapping_mul(value | 61));
        f64::from(value ^ (value >> 14)) / 4294967296.0
    }
}

/// FNV-1a over `{seed}:{stream}`, one step per code point using its first UTF-16 unit, like
/// `for (const char of text) char.charCodeAt(0)`.
pub fn stream_seed(seed: u32, stream: &str) -> u32 {
    let mut hash: u32 = 2166136261;
    let text = format!("{seed}:{stream}");
    for character in text.chars() {
        let mut units = [0u16; 2];
        let unit = character.encode_utf16(&mut units)[0];
        hash = (hash ^ u32::from(unit)).wrapping_mul(16777619);
    }
    hash
}

pub fn random_stream(seed: u32, stream: &str) -> Mulberry32 { Mulberry32::new(stream_seed(seed, stream)) }

/// Per-game streams named `game:{n}:pa|contact|fielding|advancement`.
pub struct GameStreams { pub pa: Mulberry32, pub contact: Mulberry32, pub fielding: Mulberry32, pub advancement: Mulberry32 }

impl GameStreams {
    pub fn new(seed: u32, game: u32) -> Self {
        Self {
            pa: random_stream(seed, &format!("game:{game}:pa")),
            contact: random_stream(seed, &format!("game:{game}:contact")),
            fielding: random_stream(seed, &format!("game:{game}:fielding")),
            advancement: random_stream(seed, &format!("game:{game}:advancement")),
        }
    }
}

/// Fisher-Yates from the end, `Math.floor(random() * (i + 1))`.
pub fn shuffle<T>(items: &mut [T], random: &mut Mulberry32) {
    for i in (1..items.len()).rev() {
        let j = (random.next() * (i as f64 + 1.0)).floor() as usize;
        items.swap(i, j);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_the_typescript_stream_vectors() {
        // Values from `randomStream(162, 'schedule')` and `streamSeed` in Node.
        assert_eq!(stream_seed(162, "schedule"), crate::test_vectors::SCHEDULE_SEED);
        let mut stream = random_stream(162, "schedule");
        for expected in crate::test_vectors::SCHEDULE_DRAWS { assert_eq!(stream.next().to_bits(), expected.to_bits()); }
    }
}
