import { readFileSync } from "node:fs"
import { assert, describe, it } from "@effect/vitest"
import { inputsFor, resolve, run, step, viewOf } from "@gyral/testing"
import { renderToString } from "@gyral/ssr"
import { Option, Schema } from "effect"
import { makeSky } from "@solar/classroom/service"
import { makeTile, selectTile, tdbFromUtcMillis } from "@solar/ephemeris/service"
import { TileCatalog } from "@solar/ephemeris/types"
import { frameRecorder, pageFacts, skyLoader } from "../src/runtime/tokens.js"
import { SkyLoad, type PageFacts } from "../src/types/index.js"
import { SolarClassroom, type Msg, type State } from "../src/ui/classroom.js"
import { COPY } from "../src/ui/copy.js"

const fixture = (path: string) => new URL(`../../../fixtures/${path}`, import.meta.url)
const catalog = Schema.decodeUnknownSync(TileCatalog)(
  JSON.parse(readFileSync(fixture("tiles/catalog.json"), "utf8")),
)
const entry = Option.getOrThrow(selectTile(catalog, tdbFromUtcMillis(Date.UTC(2026, 5, 1))))
const sky = Option.getOrThrow(
  makeSky(makeTile(entry.segments, readFileSync(fixture(`tiles/${entry.blob}`)))),
)

const JUNE = Date.UTC(2026, 5, 1, 12)
const facts = (overrides: Partial<PageFacts> = {}): PageFacts => ({
  linkedMoment: undefined,
  nowMillis: JUNE,
  locale: "en-US",
  timeZone: "UTC",
  ...overrides,
})

const pageRead = (overrides: Partial<PageFacts> = {}): Msg => ({
  _tag: "PageRead",
  facts: facts(overrides),
})
const skyAnswered = (load: SkyLoad): Msg => ({ _tag: "SkyAnswered", load })
const loaded = SkyLoad.Loaded({ sky, endSeconds: entry.endSeconds, year: 2026 })

const render = (state: State) => renderToString(viewOf(SolarClassroom, state), { dev: false })

describe("opening the page", () => {
  it("asks the page for its link and clock before anything else", () => {
    const { state, commands } = run(SolarClassroom.spec, [])
    assert.strictEqual(state.phase._tag, "Starting")
    assert.strictEqual(inputsFor(commands, pageFacts).length, 1)
  })

  it("loads the sky for the current moment when the link names none", () => {
    const { state, commands } = step(
      SolarClassroom.spec,
      run(SolarClassroom.spec, []).state,
      pageRead(),
    )
    assert.strictEqual(state.phase._tag, "Waiting")
    assert.deepStrictEqual(inputsFor(commands, skyLoader), [{ moment: JUNE }])
  })

  it("loads the sky for the moment a shared link names", () => {
    const { commands } = step(
      SolarClassroom.spec,
      run(SolarClassroom.spec, []).state,
      pageRead({ linkedMoment: "2026-08-12T17:46:00Z" }),
    )
    assert.deepStrictEqual(inputsFor(commands, skyLoader), [{ moment: Date.UTC(2026, 7, 12, 17, 46) }])
  })

  it("explains a link whose date it cannot read, and loads nothing", () => {
    const { state, commands } = step(
      SolarClassroom.spec,
      run(SolarClassroom.spec, []).state,
      pageRead({ linkedMoment: "tomorrow" }),
    )
    assert.strictEqual(state.phase._tag, "BadLink")
    assert.strictEqual(inputsFor(commands, skyLoader).length, 0)
  })
})

describe("showing the sky", () => {
  const ready = run(SolarClassroom.spec, [pageRead(), skyAnswered(loaded)]).state

  it("lists all eight planets once the tile arrives", () => {
    assert.strictEqual(ready.phase._tag, "Ready")
    if (ready.phase._tag !== "Ready") return
    assert.strictEqual(ready.phase.readings.length, 8)
  })

  it("moves the readings forward as the clock ticks", () => {
    if (ready.phase._tag !== "Ready") return assert.fail("not ready")
    const before = ready.phase.readings
    const later = step(SolarClassroom.spec, ready, { _tag: "Tick", now: JUNE + 86_400_000 }).state
    if (later.phase._tag !== "Ready") return assert.fail("not ready")
    assert.notDeepEqual(later.phase.readings, before)
  })

  it("holds still on a shared moment, however the clock ticks", () => {
    const pinned = run(SolarClassroom.spec, [
      pageRead({ linkedMoment: "2026-08-12T17:46:00Z" }),
      skyAnswered(loaded),
    ]).state
    assert.strictEqual(step(SolarClassroom.spec, pinned, { _tag: "Tick", now: JUNE }).state, pinned)
  })

  it("answers a loader command with the message the reducer expects", () => {
    const { commands } = step(SolarClassroom.spec, run(SolarClassroom.spec, []).state, pageRead())
    const [command] = commands
    if (command === undefined) return assert.fail("expected a command")
    assert.deepStrictEqual(resolve(command, loaded), skyAnswered(loaded))
  })
})

describe("when something goes wrong", () => {
  it("says which years it has when a link asks for another", () => {
    const { state } = run(SolarClassroom.spec, [
      pageRead({ linkedMoment: "1990-01-01" }),
      skyAnswered(SkyLoad.OutsideCatalog({ firstYear: 2025, lastYear: 2027 })),
    ])
    assert.strictEqual(state.phase._tag, "OutsideCatalog")
  })

  it.each(["CatalogUnavailable", "TileDamaged"] as const)(
    "keeps numbers off the screen after %s",
    (problem) => {
      const { state } = run(SolarClassroom.spec, [
        pageRead(),
        skyAnswered(SkyLoad.Failed({ problem })),
      ])
      assert.strictEqual(state.phase._tag, "Failed")
    },
  )

  it("keeps the table when the 3D view cannot start", () => {
    const { state } = run(SolarClassroom.spec, [
      pageRead(),
      skyAnswered(loaded),
      { _tag: "StageReported", report: { _tag: "StageUnavailable" } },
    ])
    assert.isFalse(state.stageAvailable)
    assert.strictEqual(state.phase._tag, "Ready")
  })
})

describe("telemetry from the stage", () => {
  it("passes frame timings to the recorder and changes nothing on screen", () => {
    const stats = { _tag: "FramesMeasured", count: 60, meanMs: 4, worstMs: 9 } as const
    const ready = run(SolarClassroom.spec, [pageRead(), skyAnswered(loaded)]).state
    const { state, commands } = step(SolarClassroom.spec, ready, {
      _tag: "StageReported",
      report: stats,
    })
    assert.strictEqual(state, ready)
    assert.deepStrictEqual(inputsFor(commands, frameRecorder), [stats])
  })
})

describe("what the page says", () => {
  const ready = run(SolarClassroom.spec, [
    pageRead({ linkedMoment: "2026-06-01T12:00:00Z" }),
    skyAnswered(loaded),
  ]).state

  it("puts the numbers in a real table, with a header for each column and row", async () => {
    const markup = await render(ready)
    assert.include(markup, "<table")
    assert.include(markup, '<th scope="col"')
    assert.include(markup, '<th scope="row">Neptune</th>')
  })

  it("marks the moment up as a time a machine can read", async () => {
    const markup = await render(ready)
    assert.include(markup, 'datetime="2026-06-01T12:00:00.000Z"')
  })

  it("tells a class it is looking at a fixed moment, and how to leave it", async () => {
    const markup = await render(ready)
    assert.include(markup, COPY.pinnedNote)
    assert.include(markup, 'href="/"')
  })

  it("explains what a learner cannot infer from the picture alone", async () => {
    const markup = await render(ready)
    assert.include(markup, "astronomical unit")
    assert.include(markup, COPY.figureCaption)
  })

  it("says plainly when the 3D view is unavailable", async () => {
    const markup = await render({ ...ready, stageAvailable: false })
    assert.include(markup, COPY.stageUnavailable)
  })

  it("uses no class or style attributes, and no div or span", async () => {
    const markup = await render(ready)
    assert.notMatch(markup, /\sclass=|\sstyle=|<div|<span/)
  })
})

