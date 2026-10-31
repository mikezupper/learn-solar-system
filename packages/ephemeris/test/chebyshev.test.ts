import { describe, expect, it } from "@effect/vitest"
import { evaluateChebyshev } from "../src/service/chebyshev.js"

const series = (...coefficients: ReadonlyArray<number>) => Float64Array.from(coefficients)

describe("evaluateChebyshev", () => {
  it("returns the constant term for a series of one", () => {
    expect(evaluateChebyshev(series(7), 0, 1, 0.3)).toBe(7)
  })

  it("treats the second term as T1(s) = s", () => {
    expect(evaluateChebyshev(series(0, 1), 0, 2, 0.25)).toBe(0.25)
  })

  it("treats the third term as T2(s) = 2s^2 - 1", () => {
    expect(evaluateChebyshev(series(0, 0, 1), 0, 3, 0.5)).toBeCloseTo(-0.5, 12)
  })

  it("adds the terms: 3 + 2 T1 + 4 T2 at s = -1 is 3 - 2 + 4", () => {
    expect(evaluateChebyshev(series(3, 2, 4), 0, 3, -1)).toBeCloseTo(5, 12)
  })

  it("reads its series from the given offset, ignoring the numbers around it", () => {
    expect(evaluateChebyshev(series(99, 99, 3, 2, 99), 2, 2, 1)).toBeCloseTo(5, 12)
  })

  // T_k(s) = cos(k arccos s) is the textbook definition, independent of the recurrence under test.
  it.each([1, 2, 3, 5, 8, 13])("matches cos(k arccos s) for k = %i", (k) => {
    const coefficients = new Float64Array(k + 1)
    coefficients[k] = 1
    for (const s of [-1, -0.73, -0.2, 0, 0.11, 0.64, 1]) {
      expect(evaluateChebyshev(coefficients, 0, k + 1, s)).toBeCloseTo(Math.cos(k * Math.acos(s)), 9)
    }
  })
})
