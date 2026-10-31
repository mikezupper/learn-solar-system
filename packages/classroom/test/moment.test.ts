import { assert, describe, it } from "@effect/vitest"
import { Option, Result } from "effect"
import { advanceMoment, chooseMoment, startTravelling } from "../src/service/moment.js"
import { ChosenMoment, Moment, SPEEDS } from "../src/types/index.js"

const NOW = Moment(Date.UTC(2026, 9, 31, 12))

describe("chooseMoment", () => {
  it("follows the clock when the link names no moment", () => {
    const chosen = Result.getOrThrow(chooseMoment(Option.none(), NOW))
    assert.strictEqual(chosen._tag, "FollowingNow")
    assert.strictEqual(chosen.moment, NOW)
  })

  it("stays on the moment a link names, so a class sees the same sky", () => {
    const chosen = Result.getOrThrow(chooseMoment(Option.some("2026-08-12T17:46:00Z"), NOW))
    assert.strictEqual(chosen._tag, "PinnedByLink")
    assert.strictEqual(chosen.moment, Date.UTC(2026, 7, 12, 17, 46))
  })

  it("reads a date alone as midnight UTC", () => {
    const chosen = Result.getOrThrow(chooseMoment(Option.some("2026-08-12"), NOW))
    assert.strictEqual(chosen.moment, Date.UTC(2026, 7, 12))
  })

  it("honors a time zone offset", () => {
    const chosen = Result.getOrThrow(chooseMoment(Option.some("2026-08-12T17:46:00+02:00"), NOW))
    assert.strictEqual(chosen.moment, Date.UTC(2026, 7, 12, 15, 46))
  })

  it.each(["tomorrow", "2026-13-40", "12/08/2026", ""])("refuses %j rather than guessing", (text) => {
    assert.isTrue(Result.isFailure(chooseMoment(Option.some(text), NOW)))
  })
})

describe("advanceMoment", () => {
  const start = Moment(Date.UTC(2026, 0, 1))
  const YEAR_MILLIS = 365.25 * 86_400_000

  it("follows the clock when following the present", () => {
    const later = advanceMoment(ChosenMoment.FollowingNow({ moment: start }), start + 5000)
    assert.strictEqual(later.moment, start + 5000)
  })

  it.each(["PinnedByLink", "Paused"] as const)("holds still when %s", (tag) => {
    const chosen = ChosenMoment[tag]({ moment: start })
    assert.strictEqual(advanceMoment(chosen, start + 5000), chosen)
  })

  it("starts counting on the first tick after time starts to run", () => {
    const moving = startTravelling(start, "year")
    const ticked = advanceMoment(moving, 1_000_000)
    assert.strictEqual(ticked.moment, start)
  })

  it("makes one real second worth a year at the fastest speed", () => {
    const first = advanceMoment(startTravelling(start, "year"), 1_000_000)
    const second = advanceMoment(first, 1_001_000)
    assert.closeTo(second.moment - start, YEAR_MILLIS, 1)
  })

  it("waits instead of leaping ahead after a laptop has slept", () => {
    const first = advanceMoment(startTravelling(start, "year"), 1_000_000)
    const afterSleep = advanceMoment(first, 1_000_000 + 3_600_000)
    assert.closeTo(afterSleep.moment - start, YEAR_MILLIS, 1)
  })

  it("adds up across ticks of any length", () => {
    const first = advanceMoment(startTravelling(start, "day"), 1_000_000)
    const second = advanceMoment(first, 1_000_250)
    const third = advanceMoment(second, 1_001_000)
    assert.closeTo(third.moment - start, 86_400_000, 1)
  })
})

describe("SPEEDS", () => {
  it("states each speed as simulated seconds per real second", () => {
    assert.strictEqual(SPEEDS.day, 86_400)
    assert.strictEqual(SPEEDS.week, 7 * 86_400)
    assert.strictEqual(SPEEDS.year, 365.25 * 86_400)
    assert.strictEqual(SPEEDS.month, (365.25 / 12) * 86_400)
  })
})
