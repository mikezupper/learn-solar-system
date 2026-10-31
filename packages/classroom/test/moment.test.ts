import { assert, describe, it } from "@effect/vitest"
import { Option, Result } from "effect"
import { chooseMoment } from "../src/service/moment.js"
import { Moment } from "../src/types/index.js"

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
