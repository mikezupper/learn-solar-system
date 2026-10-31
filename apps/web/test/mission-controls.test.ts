import { readFileSync } from "node:fs"
import { assert, describe, it } from "@effect/vitest"
import { inputsFor, parse, run, step } from "@gyral/testing"
import { Option, Schema } from "effect"
import { makeSky } from "@solar/classroom/service"
import { EARTH_MEAN_SPEED_KM_PER_S } from "@solar/classroom/types"
import { makeTile, selectTile, tdbFromUtcMillis } from "@solar/ephemeris/service"
import { TileCatalog } from "@solar/ephemeris/types"
import { clockReader, skyLoader } from "../src/runtime/tokens.js"
import { SkyLoad, type PageFacts } from "../src/types/index.js"
import { SolarClassroom, type Msg, type State } from "../src/ui/classroom.js"

const fixture = (path: string) => new URL(`../../../fixtures/${path}`, import.meta.url)
const catalog = Schema.decodeUnknownSync(TileCatalog)(
  JSON.parse(readFileSync(fixture("tiles/catalog.json"), "utf8")),
)
const place = (millis: number) => {
  const entry = Option.getOrThrow(selectTile(catalog, tdbFromUtcMillis(millis)))
  return SkyLoad.Loaded({
    sky: Option.getOrThrow(makeSky(makeTile(entry.segments, readFileSync(fixture(`tiles/${entry.blob}`))))),
    startSeconds: entry.startSeconds,
    endSeconds: entry.endSeconds,
    year: entry.year,
    firstYear: 2026,
    lastYear: 2027,
  })
}

const OCTOBER = Date.UTC(2026, 9, 31, 12)
const JUNE = Date.UTC(2026, 5, 1, 12)
const NEXT_MARCH = Date.UTC(2027, 2, 1)
const LATER_THAT_YEAR = Date.UTC(2026, 10, 1)
const load2026 = place(JUNE)
const load2027 = place(NEXT_MARCH)

const facts = (overrides: Partial<PageFacts> = {}): PageFacts => ({
  linkedMoment: "2026-06-01T12:00:00Z",
  nowMillis: OCTOBER,
  locale: "en-US",
  timeZone: "UTC",
  reducedMotion: false,
  ...overrides,
})

const open = (overrides: Partial<PageFacts> = {}): State =>
  run(SolarClassroom.spec, [
    { _tag: "PageRead", facts: facts(overrides) },
    { _tag: "SkyAnswered", load: load2026 },
  ]).state

const go = (state: State, ...messages: ReadonlyArray<Msg>): State =>
  messages.reduce((last, message) => step(SolarClassroom.spec, last, message).state, state)

const ready = (state: State) => {
  if (state.phase._tag !== "Ready") throw new Error(`Expected Ready, got ${state.phase._tag}`)
  return state.phase
}

describe("the cold open", () => {
  it("runs this year so far when the page opens on the present", () => {
    const { state, commands } = step(SolarClassroom.spec, run(SolarClassroom.spec, []).state, {
      _tag: "PageRead",
      facts: facts({ linkedMoment: undefined }),
    })
    assert.deepStrictEqual(inputsFor(commands, skyLoader), [{ moment: Date.UTC(2026, 0, 1) }])
    const opened = go(state, { _tag: "SkyAnswered", load: load2026 })
    assert.strictEqual(ready(opened).chosen._tag, "CatchingUp")
    assert.strictEqual(ready(opened).chosen.moment, Date.UTC(2026, 0, 1))
  })

  it("lands on the present and stays there", () => {
    const opened = open({ linkedMoment: undefined })
    const ticks = Array.from({ length: 20 }, (_, tick): Msg => ({ _tag: "Tick", now: OCTOBER + tick * 250 }))
    assert.strictEqual(ready(go(opened, ...ticks)).chosen._tag, "FollowingNow")
  })

  it("never moves a link, because a link holds still", () => {
    assert.strictEqual(ready(open()).chosen._tag, "PinnedByLink")
  })

  it("stays still for anyone who asked for less motion", () => {
    const opened = open({ linkedMoment: undefined, reducedMotion: true })
    assert.strictEqual(ready(opened).chosen._tag, "FollowingNow")
    assert.strictEqual(ready(opened).chosen.moment, OCTOBER)
  })
})

describe("the play button", () => {
  it("runs a year per second with all eight planets in view, which shows motion", () => {
    const chosen = ready(go(open(), { _tag: "PlayPressed" })).chosen
    assert.strictEqual(chosen._tag, "Travelling")
    assert.strictEqual(chosen._tag === "Travelling" ? chosen.speed : "", "year")
  })

  it("runs a week per second with the inner planets in view, since a year would be a blur", () => {
    const chosen = ready(
      go(open(), { _tag: "FramingChosen", framing: "inner" }, { _tag: "PlayPressed" }),
    ).chosen
    assert.strictEqual(chosen._tag === "Travelling" ? chosen.speed : "", "week")
  })

  it("remembers a speed the learner chose", () => {
    const chosen = ready(
      go(
        open(),
        { _tag: "SpeedChosen", speed: "day" },
        { _tag: "PlayPressed" },
        { _tag: "FramingChosen", framing: "inner" },
        { _tag: "PlayPressed" },
      ),
    ).chosen
    assert.strictEqual(chosen._tag === "Travelling" ? chosen.speed : "", "day")
  })

  it("stops time when it is already running", () => {
    assert.strictEqual(ready(go(open(), { _tag: "PlayPressed" }, { _tag: "PlayPressed" })).chosen._tag, "Paused")
  })
})

describe("right now", () => {
  it("runs back to the present when it is in the same year", () => {
    const { commands, state } = step(SolarClassroom.spec, open(), { _tag: "BackToNow" })
    assert.strictEqual(inputsFor(commands, clockReader).length, 1)
    const chosen = ready(go(state, { _tag: "ClockRead", now: OCTOBER })).chosen
    assert.strictEqual(chosen._tag, "CatchingUp")
  })

  it("goes straight there for anyone who asked for less motion", () => {
    const chosen = ready(go(open({ reducedMotion: true }), { _tag: "ClockRead", now: OCTOBER })).chosen
    assert.strictEqual(chosen._tag, "FollowingNow")
  })

  it("loads the present's year instead of crossing years it does not have", () => {
    const { state, commands } = step(SolarClassroom.spec, open(), {
      _tag: "ClockRead",
      now: NEXT_MARCH,
    })
    assert.strictEqual(state.phase._tag, "Waiting")
    assert.deepStrictEqual(inputsFor(commands, skyLoader), [{ moment: NEXT_MARCH }])
  })
})

describe("dragging the timeline", () => {
  it("moves at once within the year it has", () => {
    const { state, commands } = step(SolarClassroom.spec, open(), { _tag: "Scrubbed", moment: LATER_THAT_YEAR })
    assert.strictEqual(ready(state).chosen._tag, "Paused")
    assert.strictEqual(ready(state).chosen.moment, LATER_THAT_YEAR)
    assert.deepStrictEqual(inputsFor(commands, skyLoader), [])
    assert.isTrue(Option.isNone(ready(state).seeking))
  })

  it("keeps the picture's date until another year's data arrives, so that it never guesses", () => {
    const { state, commands } = step(SolarClassroom.spec, open(), { _tag: "Scrubbed", moment: NEXT_MARCH })
    assert.deepStrictEqual(inputsFor(commands, skyLoader), [{ moment: NEXT_MARCH }])
    assert.strictEqual(ready(state).chosen.moment, JUNE)
    assert.strictEqual(ready(state).year, 2026)
    assert.deepStrictEqual(Option.getOrUndefined(ready(state).seeking), NEXT_MARCH)
  })

  it("shows the new year once its data lands", () => {
    const landed = ready(
      go(open(), { _tag: "Scrubbed", moment: NEXT_MARCH }, { _tag: "SkyAnswered", load: load2027 }),
    )
    assert.strictEqual(landed.year, 2027)
    assert.strictEqual(landed.chosen.moment, NEXT_MARCH)
    assert.isTrue(Option.isNone(landed.seeking))
  })

  it("ignores an answer for a year the learner has already dragged away from", () => {
    const back = go(
      open(),
      { _tag: "Scrubbed", moment: NEXT_MARCH },
      { _tag: "Scrubbed", moment: LATER_THAT_YEAR },
      { _tag: "SkyAnswered", load: load2027 },
    )
    assert.strictEqual(ready(back).year, 2026)
    assert.strictEqual(ready(back).chosen.moment, LATER_THAT_YEAR)
  })

  it("says so when that year's data cannot be loaded", () => {
    const failed = go(
      open(),
      { _tag: "Scrubbed", moment: NEXT_MARCH },
      { _tag: "SkyAnswered", load: SkyLoad.Failed({ problem: "CatalogUnavailable" }) },
    )
    assert.strictEqual(failed.notice._tag, "NextYearUnavailable")
    assert.isTrue(Option.isNone(ready(failed).seeking))
    assert.strictEqual(ready(failed).chosen.moment, JUNE)
  })

  it("holds time still while dragging, and lets it carry on afterward", () => {
    const dragged = go(
      open(),
      { _tag: "SpeedChosen", speed: "week" },
      { _tag: "Scrubbed", moment: LATER_THAT_YEAR },
    )
    assert.strictEqual(ready(dragged).chosen._tag, "Paused")
    const released = ready(go(dragged, { _tag: "ScrubReleased" })).chosen
    assert.strictEqual(released._tag === "Travelling" ? released.speed : "", "week")
    assert.strictEqual(released.moment, LATER_THAT_YEAR)
  })

  it("stays stopped afterward if time was stopped before", () => {
    const released = go(open(), { _tag: "Scrubbed", moment: LATER_THAT_YEAR }, { _tag: "ScrubReleased" })
    assert.strictEqual(ready(released).chosen._tag, "Paused")
  })

  it("carries on only after a new year has landed, when released before it did", () => {
    const waiting = go(
      open(),
      { _tag: "SpeedChosen", speed: "week" },
      { _tag: "Scrubbed", moment: NEXT_MARCH },
      { _tag: "ScrubReleased" },
    )
    assert.strictEqual(ready(waiting).chosen._tag, "Paused")
    const landed = ready(go(waiting, { _tag: "SkyAnswered", load: load2027 }))
    assert.strictEqual(landed.chosen._tag, "Travelling")
    assert.strictEqual(landed.chosen.moment, NEXT_MARCH)
  })

  it("reads the timeline's value as days from the first year", () => {
    const parsed = parse(SolarClassroom, "ScrubValue", { value: "31" })
    assert.deepStrictEqual(parsed, { _tag: "ScrubValue", day: 31 })
  })

  it("turns a timeline position into a moment", () => {
    const state = go(open(), { _tag: "ScrubValue", day: 31 })
    assert.strictEqual(ready(state).chosen.moment, Date.UTC(2026, 1, 1))
  })
})

describe("the odometer", () => {
  it("counts Earth's travel at real speed", () => {
    const state = go(
      open({ linkedMoment: undefined, reducedMotion: true }),
      { _tag: "Tick", now: OCTOBER + 10_000 },
    )
    assert.closeTo(state.flownKm, 10 * EARTH_MEAN_SPEED_KM_PER_S, 1e-6)
  })

  it("counts simulated time while time runs fast", () => {
    const state = go(
      open(),
      { _tag: "SpeedChosen", speed: "day" },
      { _tag: "Tick", now: 1_000_000 },
      { _tag: "Tick", now: 1_001_000 },
    )
    assert.closeTo(state.flownKm, 86_400 * EARTH_MEAN_SPEED_KM_PER_S, 1)
  })

  it("does not count the cold open, or a drag along the timeline", () => {
    const opened = open({ linkedMoment: undefined })
    const state = go(
      opened,
      { _tag: "Tick", now: OCTOBER },
      { _tag: "Tick", now: OCTOBER + 250 },
      { _tag: "Scrubbed", moment: JUNE },
    )
    assert.strictEqual(state.flownKm, 0)
  })
})

describe("what to show", () => {
  it("rides along with Earth at first", () => {
    const state = go(open(), { _tag: "FramingChosen", framing: "ride" })
    assert.strictEqual(state.framing, "ride")
    assert.strictEqual(state.rider, "Earth")
  })

  it("starts riding as soon as a planet is chosen", () => {
    const state = go(open(), { _tag: "RiderChosen", planet: "Mars" })
    assert.strictEqual(state.framing, "ride")
    assert.strictEqual(state.rider, "Mars")
  })

  it("keeps enlarged sizes off until asked for, because they are not true", () => {
    assert.isFalse(open().showSizes)
    assert.isTrue(go(open(), { _tag: "SizesToggled", on: true }).showSizes)
  })

  it("flies in when the stage's ring is chosen", () => {
    const state = go(open(), { _tag: "StageReported", report: { _tag: "RingChosen" } })
    assert.strictEqual(state.framing, "inner")
  })
})

describe("following a planet's light", () => {
  it("draws the path from the planet chosen, and names it", () => {
    const state = go(open(), { _tag: "PlanetPicked", planet: "Mars" })
    assert.deepStrictEqual(Option.getOrUndefined(state.lightFrom), "Mars")
    assert.strictEqual(state.heroPlanet, "Mars")
  })

  it("takes the path away when the same planet is chosen again", () => {
    const state = go(open(), { _tag: "PlanetPicked", planet: "Mars" }, { _tag: "PlanetPicked", planet: "Mars" })
    assert.isTrue(Option.isNone(state.lightFrom))
    assert.strictEqual(state.heroPlanet, "Mars")
  })
})

describe("a button in the explanation", () => {
  it("sets up the view it describes, and runs time", () => {
    const state = go(open(), {
      _tag: "TryRequested",
      request: { framing: "inner", speed: "week", highlight: Option.some("Mercury") },
    })
    assert.strictEqual(state.framing, "inner")
    assert.deepStrictEqual(Option.getOrUndefined(state.highlight), "Mercury")
    const chosen = ready(state).chosen
    assert.strictEqual(chosen._tag === "Travelling" ? chosen.speed : "", "week")
  })

  it("can stop on a moment instead", () => {
    const state = go(open(), { _tag: "SpeedChosen", speed: "year" }, {
      _tag: "TryRequested",
      request: { framing: "inner", speed: "stop", highlight: Option.some("Mercury") },
    })
    assert.strictEqual(ready(state).chosen._tag, "Paused")
  })

  it("forgets the highlighted planet when the learner changes the view", () => {
    const state = go(
      open(),
      { _tag: "TryRequested", request: { framing: "inner", speed: "week", highlight: Option.some("Mercury") } },
      { _tag: "FramingChosen", framing: "all" },
    )
    assert.isTrue(Option.isNone(state.highlight))
  })
})
