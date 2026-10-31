import { readFileSync } from "node:fs"
import { assert, describe, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import { makeSky, orbitsAt } from "@solar/classroom/service"
import { KM_PER_AU, SPEEDS, SUN_DIAMETER_KM, type PlanetName } from "@solar/classroom/types"
import { makeTile, selectTile, tdbFromUtcMillis } from "@solar/ephemeris/service"
import { TdbSeconds, TileCatalog, type Vector3Km } from "@solar/ephemeris/types"

/**
 * The page states numbers in plain HTML, where no type checks them. These tests hold those numbers
 * against JPL's data and against laws that do not depend on this code, so a typo cannot reach a class.
 */
const page = readFileSync(new URL("../index.html", import.meta.url), "utf8")

const fixture = (path: string) => new URL(`../../../fixtures/${path}`, import.meta.url)
const catalog = Schema.decodeUnknownSync(TileCatalog)(
  JSON.parse(readFileSync(fixture("tiles/catalog.json"), "utf8")),
)
const JANUARY = tdbFromUtcMillis(Date.UTC(2026, 0, 15))
const entry = Option.getOrThrow(selectTile(catalog, JANUARY))
const sky = Option.getOrThrow(
  makeSky(makeTile(entry.segments, readFileSync(fixture(`tiles/${entry.blob}`)))),
)

const SECONDS_PER_DAY = 86_400
const DAYS_PER_YEAR = 365.25

/** The rows of the table whose caption contains `caption`, keyed by planet, as numbers. */
const tableRows = (caption: string): ReadonlyMap<string, ReadonlyArray<number>> => {
  const table = [...page.matchAll(/<table>[\s\S]*?<\/table>/g)]
    .map((match) => match[0])
    .find((text) => new RegExp(`<caption>[\\s\\S]*?${caption}`).test(text))
  if (table === undefined) throw new Error(`No table captioned "${caption}"`)
  return new Map(
    [...table.matchAll(/<th scope="row">(\w+)<\/th>([\s\S]*?)<\/tr>/g)].map((row) => [
      row[1] ?? "",
      [...(row[2] ?? "").matchAll(/<td>([^<]*)<\/td>/g)].map((cell) =>
        Number((cell[1] ?? "").replaceAll(",", "")),
      ),
    ]),
  )
}

const PLANETS: ReadonlyArray<PlanetName> = [
  "Mercury",
  "Venus",
  "Earth",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
]

const planet = (name: string) => {
  const found = sky.planets.find((candidate) => candidate.name === name)
  if (found === undefined) throw new Error(`No track for ${name}`)
  return found
}

/** A planet's speed around the Sun across the fixture's first year, sampled daily. */
const speedsAcrossYear = (name: string): ReadonlyArray<number> => {
  const heliocentric = (at: number): Vector3Km => {
    const [x, y, z] = planet(name).orbitTrack(TdbSeconds(at))
    const [sx, sy, sz] = sky.sun(TdbSeconds(at))
    return [x - sx, y - sy, z - sz]
  }
  return Array.from({ length: 364 }, (_, day) => {
    const at = entry.startSeconds + (day + 1) * SECONDS_PER_DAY
    const [ax, ay, az] = heliocentric(at - 3600)
    const [bx, by, bz] = heliocentric(at + 3600)
    return Math.hypot(bx - ax, by - ay, bz - az) / 7200
  })
}

describe("the table of orbit sizes", () => {
  const rows = tableRows("Kepler's third law")

  it.each(PLANETS)("%s obeys Kepler's third law, which owes nothing to this code", (name) => {
    const [a = 0, years = 0] = rows.get(name) ?? []
    assert.closeTo((years * years) / (a * a * a), 1, 0.005)
  })

  it.each(PLANETS)("%s has its columns worked out correctly", (name) => {
    const [a = 0, years = 0, aCubed = 0, yearsSquared = 0] = rows.get(name) ?? []
    assert.closeTo(aCubed / (a * a * a), 1, 0.003)
    assert.closeTo(yearsSquared / (years * years), 1, 0.003)
  })

  it.each(PLANETS)("%s has the size JPL's data gives", (name) => {
    const [a = 0] = rows.get(name) ?? []
    const orbit = orbitsAt(sky, JANUARY, 360).find((candidate) => candidate.planet === name)
    assert.closeTo((orbit?.semiMajorAxisKm ?? 0) / KM_PER_AU / a, 1, 0.015)
  })
})

describe("the table of orbit shapes", () => {
  const rows = tableRows("How each orbit is shaped")

  it.each(PLANETS)("%s has the eccentricity JPL's data gives", (name) => {
    const [eccentricity = -1] = rows.get(name) ?? []
    const orbit = orbitsAt(sky, JANUARY, 360).find((candidate) => candidate.planet === name)
    assert.closeTo(orbit?.eccentricity ?? 0, eccentricity, 0.012)
  })

  it.each(PLANETS)("%s has the tilt JPL's data gives", (name) => {
    const [, , , tilt = -1] = rows.get(name) ?? []
    const points = orbitsAt(sky, JANUARY, 360).find((candidate) => candidate.planet === name)?.pointsEcliptic
    const [ax = 0, ay = 0, az = 0] = points?.[0] ?? []
    const [bx = 0, by = 0, bz = 0] = points?.[90] ?? []
    const normal = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx] as const
    const measured = (Math.acos(normal[2] / Math.hypot(...normal)) * 180) / Math.PI
    assert.closeTo(measured, tilt, 0.1)
  })

  // Only these two complete an orbit, and so reach both extremes, inside the year the fixture holds.
  it.each(["Mercury", "Earth"])("%s reaches the slowest and fastest speeds stated", (name) => {
    const [, slowest = 0, fastest = 0] = rows.get(name) ?? []
    const speeds = speedsAcrossYear(name)
    assert.closeTo(Math.min(...speeds) / slowest, 1, 0.01)
    assert.closeTo(Math.max(...speeds) / fastest, 1, 0.01)
  })
})

describe("the sentences about time and distance", () => {
  const lapSeconds = (name: string, speed: keyof typeof SPEEDS): number => {
    const [, years = 0] = tableRows("Kepler's third law").get(name) ?? []
    return Math.round((years * DAYS_PER_YEAR * SECONDS_PER_DAY) / SPEEDS[speed])
  }

  it.each([
    ["1 day per second", "Mercury", "day"],
    ["1 week per second", "Mercury", "week"],
    ["1 week per second", "Earth", "week"],
    ["1 month per second", "Earth", "month"],
    ["1 month per second", "Mars", "month"],
    ["1 year per second", "Jupiter", "year"],
    ["1 year per second", "Saturn", "year"],
  ] as const)("at %s, the lap time stated for %s is right", (label, name, speed) => {
    const line = new RegExp(`<dt>${label}</dt>\\s*<dd>[^<]*${name}[^.]*?${String(lapSeconds(name, speed))} seconds`)
    assert.match(page, line)
  })

  it("states the astronomical unit exactly", () => {
    assert.include(page, KM_PER_AU.toLocaleString("en-US"))
  })

  it("states how far ahead of UTC JPL's time scale runs in 2026", () => {
    const millis = Date.UTC(2026, 0, 1)
    const aheadSeconds = tdbFromUtcMillis(millis) - (millis - Date.UTC(2000, 0, 1, 12)) / 1000
    assert.include(page, `about ${String(Math.round(aheadSeconds))} seconds ahead`)
  })

  // NASA's fact sheets: 149.6 million km to the Sun, which is 1.3914 million km across.
  it("states how many whole Suns fit between the Sun and Earth", () => {
    assert.strictEqual(Math.floor(KM_PER_AU / SUN_DIAMETER_KM), 107)
    assert.include(page, "about 107 times")
  })

  it("says plainly that the stars are decoration", () => {
    assert.include(page, "The stars behind the planets are decoration")
  })

  it("names only the moment the example link opens", () => {
    assert.include(page, 'href="/?at=2026-08-12T17:46:00Z"')
    assert.notMatch(page, /\sclass=|\sstyle=|<div\b|<span\b/)
  })
})
