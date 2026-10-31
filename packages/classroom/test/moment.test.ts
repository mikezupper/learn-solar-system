import { assert, describe, it } from "@effect/vitest"
import { Option, Result } from "effect"
import { advanceMoment, chooseMoment, startCatchingUp, startTravelling } from "../src/service/moment.js"
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

describe("catching up to the present", () => {
  const JANUARY = Moment(Date.UTC(2026, 0, 1))
  const NOW_MILLIS = Date.UTC(2026, 9, 31, 12)
  const moment = (chosen: ChosenMoment) => chosen.moment

  it("covers the whole gap in the time it was given", () => {
    const start = startCatchingUp(JANUARY, NOW_MILLIS, 2000)
    const first = advanceMoment(start, NOW_MILLIS)
    const halfway = advanceMoment(first, NOW_MILLIS + 1000)
    assert.strictEqual(moment(first), JANUARY)
    assert.closeTo(moment(halfway), (JANUARY + NOW_MILLIS) / 2, 1000)
  })

  it("lands on the clock and follows it from there", () => {
    const first = advanceMoment(startCatchingUp(JANUARY, NOW_MILLIS, 500), NOW_MILLIS)
    const landed = advanceMoment(first, NOW_MILLIS + 1000)
    assert.strictEqual(landed._tag, "FollowingNow")
    assert.strictEqual(moment(landed), NOW_MILLIS + 1000)
  })

  it("rewinds when the moment on screen is ahead of the clock", () => {
    const ahead = Moment(NOW_MILLIS + 30 * 86_400_000)
    const first = advanceMoment(startCatchingUp(ahead, NOW_MILLIS, 1000), NOW_MILLIS)
    const landed = advanceMoment(first, NOW_MILLIS + 1000)
    assert.isBelow(moment(advanceMoment(first, NOW_MILLIS + 500)), ahead)
    assert.strictEqual(landed._tag, "FollowingNow")
  })

  it("waits out a sleeping laptop instead of leaping", () => {
    const first = advanceMoment(startCatchingUp(JANUARY, NOW_MILLIS, 10_000), NOW_MILLIS)
    const woken = advanceMoment(first, NOW_MILLIS + 3_600_000)
    assert.strictEqual(woken._tag, "CatchingUp")
    assert.closeTo(moment(woken) - JANUARY, (NOW_MILLIS - JANUARY) / 10, 1000)
  })
})
