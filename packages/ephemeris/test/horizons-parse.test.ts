import { readFileSync } from "node:fs"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { parseVectorTable, tlistFor } from "../src/repo/horizons.js"
import { HorizonsError } from "../src/types/errors.js"
import { TdbSeconds } from "../src/types/time.js"

// A real answer from the Horizons API, kept verbatim: 12 instants of Mercury relative to the Sun.
const recorded = readFileSync(
  new URL("../../../fixtures/horizons/vectors-response.txt", import.meta.url),
  "utf8",
)

describe("parseVectorTable", () => {
  it.effect("reads every row of a recorded answer", () =>
    Effect.gen(function* () {
      const rows = yield* parseVectorTable("Mercury", recorded)
      assert.strictEqual(rows.length, 12)
    }),
  )

  it.effect("reads the instant as TDB seconds past J2000", () =>
    Effect.gen(function* () {
      const [first] = yield* parseVectorTable("Mercury", recorded)
      // The request's first instant was JD 2461045.2 TDB.
      assert.closeTo(first?.at ?? 0, (2461045.2 - 2451545.0) * 86_400, 0.01)
    }),
  )

  it.effect("places Mercury a plausible distance from the Sun", () =>
    Effect.gen(function* () {
      const [first] = yield* parseVectorTable("Mercury", recorded)
      const [x, y, z] = first?.positionKm ?? [0, 0, 0]
      const distance = Math.hypot(x, y, z)
      // Mercury's perihelion and aphelion are 46.0 and 69.8 million km.
      assert.isAbove(distance, 45.9e6)
      assert.isBelow(distance, 69.9e6)
    }),
  )

  it.effect("reports an answer that holds no table, such as a Horizons error message", () =>
    Effect.gen(function* () {
      const error = yield* parseVectorTable("Mercury", "Cannot find central body").pipe(Effect.flip)
      assert.instanceOf(error, HorizonsError)
      assert.include(error.reason, "Cannot find central body")
    }),
  )

  it.effect("reports a row it cannot read rather than skipping it", () =>
    Effect.gen(function* () {
      const error = yield* parseVectorTable("Mercury", "$$SOE\nnot, a, row\n$$EOE").pipe(Effect.flip)
      assert.instanceOf(error, HorizonsError)
    }),
  )
})

describe("tlistFor", () => {
  it("writes instants as quoted Julian dates", () => {
    assert.strictEqual(tlistFor([TdbSeconds(0), TdbSeconds(86_400)]), "'2451545.000000','2451546.000000'")
  })
})
