import { assert, describe, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import { decidePublication, decideVerification } from "../src/service/decisions.js"
import { EmptyCatalog, type TileEntry } from "../src/types/catalog.js"
import { NaifId } from "../src/types/bodies.js"
import { TdbSeconds } from "../src/types/time.js"

// The specs in docs/product-specs/where-are-the-planets-now.md, in the same order and words.

const sample = (body: string, errorKm: number) => ({
  body,
  at: TdbSeconds(0),
  expectedKm: [1000, 0, 0] as const,
  actualKm: [1000 + errorKm, 0, 0] as const,
})

const entry = (id: string, sha256: string, startSeconds: number): TileEntry => ({
  id,
  system: "planets",
  startSeconds: TdbSeconds(startSeconds),
  endSeconds: TdbSeconds(startSeconds + 1),
  blob: `${id}-${sha256}.bin`,
  byteLength: 8,
  sha256,
  segments: [
    {
      target: NaifId(2),
      center: NaifId(0),
      initSeconds: TdbSeconds(0),
      intervalSeconds: 1,
      coefficientsPerAxis: 1,
      recordCount: 1,
      byteOffset: 0,
    },
  ],
  provenance: { kernel: "de440s.bsp", kernelSha256: "abc" },
  verification: {
    source: "JPL Horizons",
    instantsChecked: 1,
    bodiesChecked: 1,
    maxErrorKm: 0,
    limitKm: 1,
  },
})

describe("VerifyTile", () => {
  it("success: every sample lies within the limit", () => {
    const outcome = decideVerification({
      tileId: "planets-2026",
      samples: [sample("Mars", 0.002), sample("Venus", 0.5)],
      limitKm: 1,
    })
    assert.strictEqual(outcome._tag, "TileVerified")
    if (outcome._tag !== "TileVerified") return
    assert.closeTo(outcome.verification.maxErrorKm, 0.5, 1e-9)
    assert.strictEqual(outcome.verification.bodiesChecked, 2)
  })

  it("boundary: an error exactly at the limit still passes", () => {
    const outcome = decideVerification({
      tileId: "planets-2026",
      samples: [sample("Mars", 1)],
      limitKm: 1,
    })
    assert.strictEqual(outcome._tag, "TileVerified")
  })

  it("failure: one sample beyond the limit rejects the tile and names the worst body", () => {
    const outcome = decideVerification({
      tileId: "planets-2026",
      samples: [sample("Mars", 0.1), sample("Neptune", 1.5), sample("Venus", 1.2)],
      limitKm: 1,
    })
    assert.strictEqual(outcome._tag, "TileRejected")
    if (outcome._tag !== "TileRejected") return
    assert.strictEqual(outcome.worstBody, "Neptune")
    assert.closeTo(outcome.errorKm, 1.5, 1e-9)
  })

  it("failure: a tile checked against nothing proves nothing", () => {
    const outcome = decideVerification({ tileId: "planets-2026", samples: [], limitKm: 1 })
    assert.strictEqual(outcome._tag, "TileRejected")
  })
})

describe("PublishTile", () => {
  it("success: a verified tile joins the catalog", () => {
    const decision = decidePublication(EmptyCatalog, entry("planets-2026", "aaa", 10))
    const published = Option.getOrThrow(decision)
    assert.strictEqual(published.event._tag, "TilePublished")
    assert.deepStrictEqual(
      published.catalog.tiles.map((tile) => tile.id),
      ["planets-2026"],
    )
  })

  it("the catalog stays in date order, whatever order tiles arrive in", () => {
    const first = Option.getOrThrow(decidePublication(EmptyCatalog, entry("planets-2027", "bbb", 20)))
    const second = Option.getOrThrow(decidePublication(first.catalog, entry("planets-2026", "aaa", 10)))
    assert.deepStrictEqual(
      second.catalog.tiles.map((tile) => tile.id),
      ["planets-2026", "planets-2027"],
    )
  })

  it("idempotence: publishing the same bytes twice records nothing", () => {
    const first = Option.getOrThrow(decidePublication(EmptyCatalog, entry("planets-2026", "aaa", 10)))
    assert.isTrue(Option.isNone(decidePublication(first.catalog, entry("planets-2026", "aaa", 10))))
  })

  it("a rebuild from a newer kernel replaces the entry and leaves one tile per year", () => {
    const first = Option.getOrThrow(decidePublication(EmptyCatalog, entry("planets-2026", "aaa", 10)))
    const second = Option.getOrThrow(decidePublication(first.catalog, entry("planets-2026", "ccc", 10)))
    assert.deepStrictEqual(
      second.catalog.tiles.map((tile) => tile.sha256),
      ["ccc"],
    )
  })
})

it.effect("the decisions are pure: same input, same answer", () =>
  Effect.sync(() => {
    const input = { tileId: "t", samples: [sample("Mars", 0.25)], limitKm: 1 }
    assert.deepStrictEqual(decideVerification(input), decideVerification(input))
  }),
)
