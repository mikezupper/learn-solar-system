import { readFileSync } from "node:fs"
import { assert, describe, it } from "@effect/vitest"
import { renderToString } from "@gyral/ssr"
import { inputsFor, parse, run, step, viewOf } from "@gyral/testing"
import { Option, Schema } from "effect"
import { makeSky } from "@solar/classroom/service"
import { SPEEDS } from "@solar/classroom/types"
import { makeTile, selectTile, tdbFromUtcMillis } from "@solar/ephemeris/service"
import { TileCatalog } from "@solar/ephemeris/types"
import { clockReader, skyLoader } from "../src/runtime/tokens.js"
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
const LATE_DECEMBER = Date.UTC(2026, 11, 31, 23, 59)
const DAY_MILLIS = 86_400_000
const facts = (linkedMoment: string | undefined): PageFacts => ({
  linkedMoment,
  nowMillis: JUNE,
  locale: "en-US",
  timeZone: "UTC",
  reducedMotion: true,
})
const loaded = (year = 2026) =>
  SkyLoad.Loaded({
    sky,
    startSeconds: entry.startSeconds,
    endSeconds: entry.endSeconds,
    year,
    firstYear: 2026,
    lastYear: 2027,
  })
const openedWith = (linked: string | undefined): State =>
  run(SolarClassroom.spec, [
    { _tag: "PageRead", facts: facts(linked) },
    { _tag: "SkyAnswered", load: loaded() },
  ]).state
const ready = (linked = "2026-06-01T12:00:00Z"): State => openedWith(linked)
const following = (): State => openedWith(undefined)

const go = (state: State, ...messages: ReadonlyArray<Msg>): { readonly state: State } =>
  messages.reduce<{ readonly state: State }>(
    (last, message) => ({ state: step(SolarClassroom.spec, last.state, message).state }),
    { state },
  )

const chosen = (state: State) => {
  if (state.phase._tag !== "Ready") throw new Error(`Expected Ready, got ${state.phase._tag}`)
  return state.phase.chosen
}

describe("running time faster", () => {
  it("starts at the moment on screen, not at the present", () => {
    const { state } = go(ready(), { _tag: "SpeedChosen", speed: "month" })
    assert.strictEqual(chosen(state)._tag, "Travelling")
    assert.strictEqual(chosen(state).moment, JUNE)
  })

  it("advances by real seconds times the speed", () => {
    const { state } = go(
      ready(),
      { _tag: "SpeedChosen", speed: "day" },
      { _tag: "Tick", now: 1_000_000 },
      { _tag: "Tick", now: 1_001_000 },
    )
    assert.closeTo(chosen(state).moment - JUNE, DAY_MILLIS, 1)
  })

  it("keeps the same pace when the speed changes", () => {
    const { state } = go(
      ready(),
      { _tag: "SpeedChosen", speed: "day" },
      { _tag: "Tick", now: 1_000_000 },
      { _tag: "SpeedChosen", speed: "week" },
      { _tag: "Tick", now: 1_001_000 },
    )
    assert.closeTo(chosen(state).moment - JUNE, 7 * DAY_MILLIS, 1)
  })

  it("moves the table along with the picture", () => {
    const before = ready()
    const { state } = go(
      before,
      { _tag: "SpeedChosen", speed: "month" },
      { _tag: "Tick", now: 1_000_000 },
      { _tag: "Tick", now: 1_001_000 },
    )
    if (before.phase._tag !== "Ready" || state.phase._tag !== "Ready") return assert.fail("not ready")
    assert.notDeepEqual(state.phase.readings, before.phase.readings)
  })

  it("asks for next year's tile ahead of time, so the crossing does not stall", () => {
    const { commands } = step(SolarClassroom.spec, ready(), { _tag: "SpeedChosen", speed: "year" })
    assert.deepStrictEqual(inputsFor(commands, skyLoader), [{ moment: Date.UTC(2027, 0, 1, 0, 1) }])
  })
})

describe("reaching the end of a tile", () => {
  const travellingNearTheEnd = () =>
    go(
      ready(new Date(LATE_DECEMBER).toISOString()),
      { _tag: "SpeedChosen", speed: "year" },
      { _tag: "Tick", now: 1_000_000 },
    ).state

  it("steps onto the next tile when it has arrived", () => {
    const { state } = go(
      travellingNearTheEnd(),
      { _tag: "UpcomingAnswered", load: loaded(2027) },
      { _tag: "Tick", now: 1_001_000 },
    )
    if (state.phase._tag !== "Ready") return assert.fail("not ready")
    assert.strictEqual(state.phase.year, 2027)
  })

  it("waits at the boundary when the next tile is still on its way, without a jump afterward", () => {
    const waiting = go(travellingNearTheEnd(), { _tag: "Tick", now: 1_001_000 }).state
    const held = chosen(waiting).moment
    assert.isBelow(tdbFromUtcMillis(held), entry.endSeconds)
    const later = go(
      waiting,
      { _tag: "Tick", now: 1_060_000 },
      { _tag: "UpcomingAnswered", load: loaded(2027) },
      { _tag: "Tick", now: 1_060_250 },
    ).state
    assert.isBelow(chosen(later).moment - held, SPEEDS.year * 1000 * 0.3)
  })

  it("stops and says why when the data runs out", () => {
    const { state } = go(
      travellingNearTheEnd(),
      { _tag: "UpcomingAnswered", load: SkyLoad.OutsideCatalog({ firstYear: 2000, lastYear: 2026 }) },
      { _tag: "Tick", now: 1_001_000 },
    )
    assert.strictEqual(chosen(state)._tag, "Paused")
    assert.deepStrictEqual(state.notice, { _tag: "EndOfData", lastYear: 2026 })
  })

  it("stops and says why when next year's tile cannot be used", () => {
    const { state } = go(
      travellingNearTheEnd(),
      { _tag: "UpcomingAnswered", load: SkyLoad.Failed({ problem: "TileDamaged" }) },
      { _tag: "Tick", now: 1_001_000 },
    )
    assert.strictEqual(chosen(state)._tag, "Paused")
    assert.deepStrictEqual(state.notice, { _tag: "NextYearUnavailable" })
  })

  it("does not tear down the stage when the clock crosses New Year", () => {
    const { state, commands } = step(SolarClassroom.spec, following(), {
      _tag: "Tick",
      now: Date.UTC(2027, 0, 1, 0, 0, 10),
    })
    assert.strictEqual(state.phase._tag, "Ready")
    assert.deepStrictEqual(inputsFor(commands, skyLoader), [{ moment: Date.UTC(2027, 0, 1, 0, 1) }])
  })
})

describe("stopping and returning", () => {
  it("pausing holds the moment, however the clock ticks", () => {
    const { state } = go(
      ready(),
      { _tag: "SpeedChosen", speed: "month" },
      { _tag: "Tick", now: 1_000_000 },
      { _tag: "Tick", now: 1_001_000 },
      { _tag: "PlayPressed" },
    )
    assert.strictEqual(chosen(state)._tag, "Paused")
    assert.strictEqual(step(SolarClassroom.spec, state, { _tag: "Tick", now: 9_000_000 }).state, state)
  })

  it("choosing a speed clears an old notice", () => {
    const stopped = go(
      ready(),
      { _tag: "SpeedChosen", speed: "year" },
      { _tag: "UpcomingAnswered", load: SkyLoad.Failed({ problem: "TileDamaged" }) },
    ).state
    const { state } = go({ ...stopped, notice: { _tag: "NextYearUnavailable" } }, {
      _tag: "SpeedChosen",
      speed: "day",
    })
    assert.deepStrictEqual(state.notice, { _tag: "NoNotice" })
  })

  it("asks the clock when returning to the present", () => {
    const { commands } = step(SolarClassroom.spec, ready(), { _tag: "BackToNow" })
    assert.strictEqual(inputsFor(commands, clockReader).length, 1)
  })

  it("follows the clock again if the present is in the tile on screen", () => {
    const now = Date.UTC(2026, 9, 31)
    const { state, commands } = step(SolarClassroom.spec, ready(), { _tag: "ClockRead", now })
    assert.strictEqual(chosen(state)._tag, "FollowingNow")
    assert.strictEqual(chosen(state).moment, now)
    assert.strictEqual(inputsFor(commands, skyLoader).length, 0)
  })

  it("fetches the right tile if the present is in another year", () => {
    const now = Date.UTC(2028, 1, 1)
    const { state, commands } = step(SolarClassroom.spec, ready(), { _tag: "ClockRead", now })
    assert.strictEqual(state.phase._tag, "Waiting")
    assert.deepStrictEqual(inputsFor(commands, skyLoader), [{ moment: now }])
  })
})

describe("what a learner can do", () => {
  const render = (state: State) => renderToString(viewOf(SolarClassroom, state), { dev: false })

  it.each(["day", "week", "month", "year"] as const)("offers %s per second as a real radio button", async (speed) => {
    const markup = await render(ready())
    assert.include(markup, `value="${speed}"`)
    assert.include(markup, 'type="radio"')
  })

  it("groups the controls under a legend, which is how a screen reader names them", async () => {
    const markup = await render(ready())
    assert.include(markup, "<fieldset")
    assert.include(markup, COPY.speedLegend)
    assert.include(markup, COPY.viewLegend)
  })

  it("explains why it does not start moving by itself", async () => {
    assert.include(await render(following()), COPY.followingNote("year"))
  })

  it("offers a link to a paused moment, to share with a class", async () => {
    const { state } = go(ready(), { _tag: "SpeedChosen", speed: "day" }, { _tag: "PlayPressed" })
    const markup = await render(state)
    assert.include(markup, "/?at=2026-06-01T12:00:00.000Z")
    assert.include(markup, COPY.linkToMoment)
  })

  it("says when the data has run out", async () => {
    const { state } = go(
      ready(),
      { _tag: "SpeedChosen", speed: "year" },
    )
    const markup = await render({ ...state, notice: { _tag: "EndOfData", lastYear: 2050 } })
    assert.include(markup, COPY.endOfData(2050))
  })

  it("gives the real reason when a page cannot check its data", async () => {
    const opened = run(SolarClassroom.spec, [
      { _tag: "PageRead", facts: facts("2026-06-01") },
      { _tag: "SkyAnswered", load: SkyLoad.Failed({ problem: "TileUncheckable" }) },
    ]).state
    assert.include(await render(opened), COPY.tileUncheckable)
  })

  it("still uses no class or style attributes, and no div or span", async () => {
    assert.notMatch(await render(ready()), /\sclass=|\sstyle=|<div|<span/)
  })
})

describe("reading the controls", () => {
  it.each(["day", "week", "month", "year"] as const)("accepts %s", (speed) => {
    assert.deepStrictEqual(parse(SolarClassroom, "SpeedChosen", { value: speed }), {
      _tag: "SpeedChosen",
      speed,
    })
  })

  it("declines a value it does not know", () => {
    assert.isUndefined(parse(SolarClassroom, "SpeedChosen", { value: "fortnight" }))
  })

  it("accepts each view", () => {
    assert.deepStrictEqual(parse(SolarClassroom, "FramingChosen", { value: "inner" }), {
      _tag: "FramingChosen",
      framing: "inner",
    })
    assert.isUndefined(parse(SolarClassroom, "FramingChosen", { value: "sideways" }))
  })
})
