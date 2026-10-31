import { assert, describe, it } from "@effect/vitest"
import { renderInstruments, renderSkills, renderWorkspace } from "../src/generate.js"

describe("renderWorkspace", () => {
  const text = renderWorkspace([
    {
      name: "@solar/ephemeris",
      path: "packages/ephemeris",
      dependencies: ["@solar/providers", "effect"],
      layers: [{ layer: "types", files: 5 }, { layer: "service", files: 9 }],
    },
  ])

  it("lists each package with its path and layers", () => {
    assert.include(text, "`@solar/ephemeris`")
    assert.include(text, "`packages/ephemeris`")
    assert.include(text, "(5)")
    assert.include(text, "(9)")
  })

  // Git lists untracked files first, so arrival order changes when a file is committed. A document
  // generated before a commit must still match after it, or the first CI run fails on it.
  it("orders layers by name, whatever order they arrive in", () => {
    assert.include(text, "service (9), types (5)")
  })

  it("warns readers not to edit it", () => {
    assert.include(text, "pnpm gen-docs")
  })
})

describe("renderSkills", () => {
  it("records the commit each skill is pinned to", () => {
    const text = renderSkills([{ path: "skills/effect-fp-skill", commit: "63fa62e84a4f" }])
    assert.include(text, "`skills/effect-fp-skill`")
    assert.include(text, "`63fa62e84a4f`")
  })
})

describe("renderInstruments", () => {
  it("finds each metric by reading the source that defines it", () => {
    const text = renderInstruments(
      'a: Metric.timer("tile_build"),\nb: Metric.counter("tiles_published_total", {}),\nc: Metric.histogram("frame_ms", {})',
    )
    assert.include(text, "| `tile_build` | timer |")
    assert.include(text, "| `tiles_published_total` | counter |")
    assert.include(text, "| `frame_ms` | histogram |")
  })
})
