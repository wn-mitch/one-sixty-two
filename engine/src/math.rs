//! Transcendental functions. Every engine build calls these `libm` implementations, so native and
//! wasm builds round identically; `std` transcendentals are platform-dependent and never used.

#[inline]
pub fn exp(x: f64) -> f64 { libm::exp(x) }
#[inline]
pub fn log(x: f64) -> f64 { libm::log(x) }
#[inline]
pub fn sin(x: f64) -> f64 { libm::sin(x) }
#[inline]
pub fn cos(x: f64) -> f64 { libm::cos(x) }
#[inline]
pub fn pow(x: f64, y: f64) -> f64 { libm::pow(x, y) }

/// JavaScript `Math.round`: nearest integer, ties toward positive infinity.
#[inline]
pub fn js_round(x: f64) -> f64 {
    let floor = x.floor();
    if x - floor >= 0.5 { floor + 1.0 } else { floor }
}

/// JavaScript `Math.max(a, b)` for non-NaN inputs, including `max(-0, 0) = 0`.
#[inline]
pub fn max(a: f64, b: f64) -> f64 { if a > b || (a == b && b.is_sign_negative()) { a } else { b } }
/// JavaScript `Math.min(a, b)` for non-NaN inputs, including `min(0, -0) = -0`.
#[inline]
pub fn min(a: f64, b: f64) -> f64 { if a < b || (a == b && b.is_sign_positive()) { a } else { b } }

/// JavaScript `Math.sqrt(x * x + y * y)`, which is correctly rounded everywhere, unlike `hypot`.
#[inline]
pub fn planar_distance(x: f64, y: f64) -> f64 { (x * x + y * y).sqrt() }
