import { describe, expect, it } from "@effect/vitest"
import { tdbFromUtcMillis } from "../src/service/time-scale.js"

const utc = (iso: string): number => Date.parse(iso)

describe("tdbFromUtcMillis", () => {
  // By definition TT = TAI + 32.184 s, and J2000 is 2000-01-01 12:00:00 TT. With 32 leap seconds in
  // force, that instant reads 11:58:55.816 UTC. TDB differs from TT by under 2 ms.
  it("places the J2000 epoch at zero", () => {
    expect(Math.abs(tdbFromUtcMillis(utc("2000-01-01T11:58:55.816Z")))).toBeLessThan(0.002)
  })

  // 37 leap seconds plus 32.184 s is 69.184 s ahead of UTC, the offset that puts Earth about
  // 2,000 km off when it is forgotten.
  it("runs 69.184 s ahead of UTC in 2026, within the 2 ms TDB wobble", () => {
    const instant = utc("2026-10-31T00:00:00Z")
    const secondsPastJ2000AsIfUtcWereTdb = (instant - Date.UTC(2000, 0, 1, 12)) / 1000
    const offset = tdbFromUtcMillis(instant) - secondsPastJ2000AsIfUtcWereTdb
    expect(Math.abs(offset - 69.184)).toBeLessThan(0.002)
  })

  // The leap second at the end of 2016 lasted one real second that UTC clocks did not count, so one
  // displayed second across the boundary spans two seconds of TDB.
  it("counts the leap second at the end of 2016", () => {
    const before = tdbFromUtcMillis(utc("2016-12-31T23:59:59Z"))
    const after = tdbFromUtcMillis(utc("2017-01-01T00:00:00Z"))
    expect(after - before).toBeCloseTo(2, 3)
  })

  it("advances one second per second between leap seconds", () => {
    const before = tdbFromUtcMillis(utc("2026-06-01T00:00:00Z"))
    const after = tdbFromUtcMillis(utc("2026-06-01T00:00:01Z"))
    expect(after - before).toBeCloseTo(1, 6)
  })
})
