import { OUTPUT_EVENT, settled } from "@gyral/core"
import { fakeDriver, mount } from "@gyral/testing"
import { Option } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import { KM_PER_AU, PLANETS, type Sky } from "@solar/classroom/types"
import { TdbSeconds, type Vector3Km } from "@solar/ephemeris/types"
import { frameRecorder, pageFacts, skyLoader } from "../src/runtime/tokens.js"
import { SkyLoad, type PageFacts } from "../src/types/index.js"
import { SolarClassroom } from "../src/ui/classroom.js"

const at = (au: number) => (): Vector3Km => [au * KM_PER_AU, 0, 0]

/** A sky with evident answers: every planet sits on one line, Earth at 1 AU, Mars at 1.5 AU. */
const sky: Sky = {
  sun: at(0),
  earth: at(1),
  planets: PLANETS.map(({ name }) => ({
    name,
    track: at(name === "Earth" ? 1 : name === "Mars" ? 1.5 : 9),
    orbitTrack: at(name === "Earth" ? 1 : name === "Mars" ? 1.5 : 9),
  })),
}

const facts: PageFacts = {
  linkedMoment: "2026-06-01T12:00:00Z",
  nowMillis: Date.UTC(2026, 5, 1),
  locale: "en-US",
  timeZone: "UTC",
  reducedMotion: true,
}

const mountClassroom = async (load: SkyLoad) => {
  const recorder = fakeDriver(frameRecorder, () => undefined)
  const classroom = await mount(SolarClassroom, {
    drivers: [
      fakeDriver(pageFacts, () => facts),
      fakeDriver(skyLoader, () => load),
      recorder,
    ],
  })
  await settled()
  return { classroom, recorder }
}

const loaded = SkyLoad.Loaded({
  sky,
  startSeconds: TdbSeconds(-1e12),
  endSeconds: TdbSeconds(1e12),
  year: 2026,
  firstYear: 2026,
  lastYear: 2027,
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("the classroom in a real browser", () => {
  it("renders the distances into the table", async () => {
    const { classroom } = await mountClassroom(loaded)
    const mars = [...classroom.el.querySelectorAll("tbody tr")].find((row) =>
      row.textContent.includes("Mars"),
    )
    const cells = [...(mars?.querySelectorAll("td") ?? [])].map((cell) => cell.textContent.trim())
    expect(cells).toEqual(["1.500", "0.500", "4.2 min"])
  })

  it("hides the stage and keeps the table when the stage reports it cannot start", async () => {
    const { classroom } = await mountClassroom(loaded)
    const stage = classroom.el.querySelector("sky-stage")
    stage?.dispatchEvent(
      new CustomEvent(OUTPUT_EVENT, { detail: { _tag: "StageUnavailable" }, bubbles: true }),
    )
    await settled()
    expect(classroom.el.querySelector("sky-stage")).toBeNull()
    expect(classroom.el.querySelector('[role="status"]')?.textContent).toContain("every number")
    expect(classroom.el.querySelector("table")).not.toBeNull()
  })

  it("passes frame timings from the stage to the recorder", async () => {
    const { classroom, recorder } = await mountClassroom(loaded)
    const report = { _tag: "FramesMeasured", count: 120, meanMs: 3, worstMs: 8 }
    classroom.el
      .querySelector("sky-stage")
      ?.dispatchEvent(new CustomEvent(OUTPUT_EVENT, { detail: report, bubbles: true }))
    await settled()
    expect(recorder.calls.map((call) => call.input)).toEqual([report])
  })

  it("ignores a stage event it cannot decode", async () => {
    const { classroom, recorder } = await mountClassroom(loaded)
    classroom.el
      .querySelector("sky-stage")
      ?.dispatchEvent(new CustomEvent(OUTPUT_EVENT, { detail: { _tag: "Nonsense" }, bubbles: true }))
    await settled()
    expect(recorder.calls).toEqual([])
    expect(classroom.el.querySelector("sky-stage")).not.toBeNull()
  })

  it("announces failures to assistive technology", async () => {
    const { classroom } = await mountClassroom(SkyLoad.Failed({ problem: "CatalogUnavailable" }))
    expect(classroom.el.querySelector('[role="alert"]')?.textContent).toContain(
      "could not be loaded",
    )
    expect(Option.fromNullishOr(classroom.el.querySelector("table"))._tag).toBe("None")
  })
})
