/** Complementary error function (Numerical Recipes Chebyshev fit, relative error below 1.2e-7). */
function erfc(x: number): number {
 const z = Math.abs(x);
 const t = 1 / (1 + 0.5 * z);
 const value = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
  t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
 return x >= 0 ? value : 2 - value;
}

/** Standard normal CDF. Sampling and integration both use this function, so they agree exactly. */
export function normalCdf(x: number): number { return 0.5 * erfc(-x / Math.SQRT2); }

const density = (x: number): number => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

/** Inverse of `normalCdf`: Acklam's rational start refined by Newton steps on this module's CDF. */
export function normalQuantile(p: number): number {
 if (!(p > 0 && p < 1)) throw new Error('Invalid normal quantile probability');
 const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
 const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
 const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
 const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
 let x: number;
 if (p < 0.02425) {
  const q = Math.sqrt(-2 * Math.log(p));
  x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
 } else if (p > 1 - 0.02425) {
  const q = Math.sqrt(-2 * Math.log(1 - p));
  x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
 } else {
  const q = p - 0.5;
  const r = q * q;
  x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
 }
 for (let step = 0; step < 3; step++) x -= (normalCdf(x) - p) / density(x);
 return x;
}

/** Samples N(mean, sd) truncated to [low, high] from one uniform by inverse CDF. */
export function truncatedNormal(mean: number, sd: number, low: number, high: number, uniform: number): number {
 const lower = normalCdf((low - mean) / sd);
 const upper = normalCdf((high - mean) / sd);
 if (!(upper > lower)) throw new Error('Empty truncated normal range');
 const p = lower + uniform * (upper - lower);
 if (p <= 0 || p >= 1) return p <= 0 ? low : high;
 return Math.min(high, Math.max(low, mean + sd * normalQuantile(p)));
}
