/**
 * Evaluates a Chebyshev series at `s`, which must lie in [-1, 1], with Clenshaw's recurrence.
 *
 * Runs once per axis, per body, per frame, so it reads a shared buffer in place and allocates
 * nothing. The `let` and the loop stay inside this function; eslint.config.js allows them here.
 */
export const evaluateChebyshev = (
  coefficients: Float64Array,
  offset: number,
  count: number,
  s: number,
): number => {
  let previous = 0
  let current = 0
  for (let k = count - 1; k >= 1; k -= 1) {
    const next = 2 * s * current - previous + (coefficients[offset + k] ?? 0)
    previous = current
    current = next
  }
  return s * current - previous + (coefficients[offset] ?? 0)
}
