import { assert, describe, it } from "@effect/vitest"
import { Option } from "effect"
import { readTryRequest } from "../src/service/try-request.js"
import {
  clockParts,
  dayFromMoment,
  lastDay,
  lightText,
  momentFromDay,
  percentOf,
  yearTicks,
} from "../src/ui/classroom-format.js"

describe("lightText", () => {
  it.each([
    [16.2, "16.2 min"],
    [59.94, "59.9 min"],
    [60, "1 h 00 min"],
    [83.6, "1 h 23 min"],
    [259.9, "4 h 19 min"],
  ])("writes %d minutes as %s", (minutes, text) => {
    assert.strictEqual(lightText(minutes), text)
  })
})

describe("the timeline's days", () => {
  const JAN_2000 = Date.UTC(2000, 0, 1)

  it("counts from the first day of the first year", () => {
    assert.strictEqual(dayFromMoment(JAN_2000, 2000), 0)
    assert.strictEqual(dayFromMoment(Date.UTC(2000, 0, 2, 12), 2000), 1)
  })

  it("turns a day back into a moment", () => {
    assert.strictEqual(momentFromDay(366, 2000), Date.UTC(2001, 0, 1))
  })

  // 2000 is a leap year, and 2000 through 2050 has 13 leap days in 51 years.
  it("ends on the last day of the last year", () => {
    assert.strictEqual(lastDay(2000, 2050), 51 * 365 + 13 - 1)
    assert.strictEqual(momentFromDay(lastDay(2000, 2050), 2000), Date.UTC(2050, 11, 31))
  })

  it("says how far along a moment is", () => {
    assert.closeTo(percentOf(Date.UTC(2026, 6, 2, 12), 2026, 2026), 50, 0.2)
    assert.strictEqual(percentOf(Date.UTC(1990, 0, 1), 2000, 2050), 0)
    assert.strictEqual(percentOf(Date.UTC(2090, 0, 1), 2000, 2050), 100)
  })
})

describe("yearTicks", () => {
  it("marks every ten years across a long span, ending at the last year", () => {
    assert.deepStrictEqual(yearTicks(2000, 2050), [2000, 2010, 2020, 2030, 2040, 2050])
  })

  it("marks each year across a short one", () => {
    assert.deepStrictEqual(yearTicks(2026, 2027), [2026, 2027])
  })
})

describe("clockParts", () => {
  const MOMENT = Date.UTC(2026, 7, 12, 17, 46)

  it("writes the date in capitals, for the big dots", () => {
    assert.strictEqual(clockParts(MOMENT, "en-US", "UTC").date, "AUG 12 2026")
  })

  it("names the time zone, since a shared link may cross one", () => {
    assert.match(clockParts(MOMENT, "en-US", "UTC").time, /5:46:00\sPM UTC/)
  })

  it("shows the date where the reader is", () => {
    assert.strictEqual(clockParts(Date.UTC(2026, 7, 12, 1), "en-US", "America/New_York").date, "AUG 11 2026")
  })
})

describe("readTryRequest", () => {
  it("reads a button's view, speed and planet", () => {
    const request = Option.getOrThrow(readTryRequest({ tryView: "inner", trySpeed: "week", tryPlanet: "Mercury" }))
    assert.strictEqual(request.framing, "inner")
    assert.strictEqual(request.speed, "week")
    assert.deepStrictEqual(Option.getOrUndefined(request.highlight), "Mercury")
  })

  it("needs no planet", () => {
    const request = Option.getOrThrow(readTryRequest({ tryView: "all", trySpeed: "year" }))
    assert.isTrue(Option.isNone(request.highlight))
  })

  it("ignores a button that makes no sense", () => {
    assert.isTrue(Option.isNone(readTryRequest({ tryView: "sideways", trySpeed: "week" })))
    assert.isTrue(Option.isNone(readTryRequest({ tryView: "all", trySpeed: "fortnight" })))
  })
})
