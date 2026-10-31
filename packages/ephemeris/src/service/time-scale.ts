import { Array, Option, pipe } from "effect"
import { TdbSeconds } from "../types/time.js"

/** When each count of leap seconds took effect (TAI minus UTC), oldest first, from IERS Bulletin C. */
const LEAP_SECONDS: ReadonlyArray<readonly [effectiveUtcMillis: number, taiMinusUtc: number]> = [
  [Date.UTC(1972, 0, 1), 10],
  [Date.UTC(1972, 6, 1), 11],
  [Date.UTC(1973, 0, 1), 12],
  [Date.UTC(1974, 0, 1), 13],
  [Date.UTC(1975, 0, 1), 14],
  [Date.UTC(1976, 0, 1), 15],
  [Date.UTC(1977, 0, 1), 16],
  [Date.UTC(1978, 0, 1), 17],
  [Date.UTC(1979, 0, 1), 18],
  [Date.UTC(1980, 0, 1), 19],
  [Date.UTC(1981, 6, 1), 20],
  [Date.UTC(1982, 6, 1), 21],
  [Date.UTC(1983, 6, 1), 22],
  [Date.UTC(1985, 6, 1), 23],
  [Date.UTC(1988, 0, 1), 24],
  [Date.UTC(1990, 0, 1), 25],
  [Date.UTC(1991, 0, 1), 26],
  [Date.UTC(1992, 6, 1), 27],
  [Date.UTC(1993, 6, 1), 28],
  [Date.UTC(1994, 6, 1), 29],
  [Date.UTC(1996, 0, 1), 30],
  [Date.UTC(1997, 6, 1), 31],
  [Date.UTC(1999, 0, 1), 32],
  [Date.UTC(2006, 0, 1), 33],
  [Date.UTC(2009, 0, 1), 34],
  [Date.UTC(2012, 6, 1), 35],
  [Date.UTC(2015, 6, 1), 36],
  [Date.UTC(2017, 0, 1), 37],
]

const J2000_AS_UTC_MILLIS = Date.UTC(2000, 0, 1, 12)
const TT_MINUS_TAI_SECONDS = 32.184

// The constants in NAIF's leapseconds kernel (naif0012.tls) for the periodic part of TDB - TT.
const TDB_K = 1.657e-3
const TDB_EB = 1.671e-2
const TDB_M0 = 6.239996
const TDB_M1 = 1.99096871e-7

/** Before 1972 UTC had no leap seconds; the first entry stands in, and no catalog reaches that far. */
const leapSecondsAt = (utcMillis: number): number =>
  pipe(
    LEAP_SECONDS,
    Array.findLast(([effective]) => utcMillis >= effective),
    Option.match({ onNone: () => 10, onSome: ([, count]) => count }),
  )

/** Converts a UTC instant, as JavaScript counts it, to the seconds past J2000 that JPL's data uses. */
export const tdbFromUtcMillis = (utcMillis: number): TdbSeconds => {
  const tt =
    (utcMillis - J2000_AS_UTC_MILLIS) / 1000 + leapSecondsAt(utcMillis) + TT_MINUS_TAI_SECONDS
  const meanAnomaly = TDB_M0 + TDB_M1 * tt
  const eccentricAnomaly = meanAnomaly + TDB_EB * Math.sin(meanAnomaly)
  return TdbSeconds(tt + TDB_K * Math.sin(eccentricAnomaly))
}
