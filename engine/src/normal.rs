//! Normal distribution helpers matching `src/lib/sim/normal.ts`.
use crate::math;

/// Complementary error function (Numerical Recipes Chebyshev fit, relative error below 1.2e-7).
fn erfc(x: f64) -> f64 {
    let z = x.abs();
    let t = 1.0 / (1.0 + 0.5 * z);
    let value = t * math::exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806
        + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    if x >= 0.0 { value } else { 2.0 - value }
}

/// Standard normal CDF. Sampling and integration both use this function, so they agree exactly.
pub fn normal_cdf(x: f64) -> f64 { 0.5 * erfc(-x / std::f64::consts::SQRT_2) }

fn density(x: f64) -> f64 { math::exp(-0.5 * x * x) / (2.0 * std::f64::consts::PI).sqrt() }

/// Inverse of `normal_cdf`: Acklam's rational start refined by Newton steps on this module's CDF.
pub fn normal_quantile(p: f64) -> Result<f64, String> {
    if !(p > 0.0 && p < 1.0) { return Err("Invalid normal quantile probability".into()); }
    const A: [f64; 6] = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
    const B: [f64; 5] = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
    const C: [f64; 6] = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const D: [f64; 4] = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
    let mut x;
    if p < 0.02425 {
        let q = (-2.0 * math::log(p)).sqrt();
        x = (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) / ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1.0);
    } else if p > 1.0 - 0.02425 {
        let q = (-2.0 * math::log(1.0 - p)).sqrt();
        x = -(((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) / ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1.0);
    } else {
        let q = p - 0.5;
        let r = q * q;
        x = (((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q / (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1.0);
    }
    for _ in 0..3 { x -= (normal_cdf(x) - p) / density(x); }
    Ok(x)
}
