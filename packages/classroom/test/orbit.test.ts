import { readFileSync } from "node:fs"
import { assert, describe, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import { makeTile, selectTile, tdbFromUtcMillis } from "@solar/ephemeris/service"
import { TdbSeconds, TileCatalog, type Vector3Km } from "@solar/ephemeris/types"
import { orbitFromState, orbitsAt } from "../src/service/orbit.js"
import { makeSky } from "../src/service/sky.js"
import { KM_PER_AU } from "../src/types/index.js"

const fixture = (path: string) => new URL(`../../../fixtures/${path}`, import.meta.url)
const catalog = Schema.decodeUnknownSync(TileCatalog)(
  JSON.parse(readFileSync(fixture("tiles/catalog.json"), "utf8")),
)
const JANUARY = tdbFromUtcMillis(Date.UTC(2026, 0, 15))
const entry = Option.getOrThrow(selectTile(catalog, JANUARY))
const sky = Option.getOrThrow(
  makeSky(makeTile(entry.segments, readFileSync(fixture(`tiles/${entry.blob}`)))),
)

const GM_SUN = 132_712_440_041.279
const SECONDS_PER_DAY = 86_400

/** The distance from a point to a line segment, since a drawn line is segments and not its vertices. */
const distanceToSegment = (p: Vector3Km, a: Vector3Km, b: Vector3Km): number => {
  const ab: Vector3Km = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const ap: Vector3Km = [p[0] - a[0], p[1] - a[1], p[2] - a[2]]
  const lengthSquared = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2]
  const along = (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / lengthSquared
  const t = Math.max(0, Math.min(1, along))
  return Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2])
}

const distanceTo = (points: ReadonlyArray<Vector3Km>, target: Vector3Km): number =>
  Math.min(
    ...points.map((point, index) =>
      distanceToSegment(target, point, points[(index + 1) % points.length] ?? point),
    ),
  )

describe("orbitFromState", () => {
  // In a circular orbit, speed is sqrt(GM / r): the textbook case with an evident answer.
  const circular = orbitFromState(
    [KM_PER_AU, 0, 0],
    [0, Math.sqrt(GM_SUN / KM_PER_AU), 0],
    GM_SUN,
    360,
  )

  it("finds a circle from a circular state", () => {
    assert.closeTo(circular.semiMajorAxisKm / KM_PER_AU, 1, 1e-12)
    assert.closeTo(circular.eccentricity, 0, 1e-12)
  })

  it("keeps every point of a circle at the same distance", () => {
    for (const [x, y, z] of circular.points) {
      assert.closeTo(Math.hypot(x, y, z) / KM_PER_AU, 1, 1e-9)
    }
  })

  it("stays in the plane the motion defines", () => {
    assert.isTrue(circular.points.every(([, , z]) => Math.abs(z) < 1e-3))
  })

  it("gives the number of points asked for", () => {
    assert.strictEqual(circular.points.length, 360)
  })

  // At perihelion, r = a(1 - e) and speed follows from the vis-viva equation.
  it("recovers a known ellipse from its perihelion", () => {
    const a = 1.5 * KM_PER_AU
    const e = 0.3
    const r = a * (1 - e)
    const speed = Math.sqrt(GM_SUN * (2 / r - 1 / a))
    const orbit = orbitFromState([r, 0, 0], [0, speed, 0], GM_SUN, 720)
    assert.closeTo(orbit.semiMajorAxisKm / a, 1, 1e-9)
    assert.closeTo(orbit.eccentricity, e, 1e-9)
    const farthest = Math.max(...orbit.points.map(([x, y, z]) => Math.hypot(x, y, z)))
    assert.closeTo(farthest / (a * (1 + e)), 1, 1e-6)
  })

  it("passes through the position it started from", () => {
    const position: Vector3Km = [0.8 * KM_PER_AU, 0.9 * KM_PER_AU, 0.1 * KM_PER_AU]
    const orbit = orbitFromState(position, [-20, 18, 1], GM_SUN, 720)
    // A chord of 1/720 of a turn sags by under a millionth of the radius, far below this limit.
    assert.isBelow(distanceTo(orbit.points, position) / KM_PER_AU, 1e-4)
  })
})

describe("orbitsAt, on JPL's data", () => {
  const orbits = orbitsAt(sky, JANUARY, 360)
  const orbit = (name: string) => {
    const found = orbits.find((candidate) => candidate.planet === name)
    if (found === undefined) throw new Error(`No orbit for ${name}`)
    return found
  }

  // Semi-major axes and eccentricities from NASA's Planetary Fact Sheet. These are long-term means
  // and an orbit at one moment differs slightly from them, so the tolerances allow for that.
  it.each([
    ["Mercury", 0.387, 0.2056],
    ["Venus", 0.723, 0.0068],
    ["Earth", 1.0, 0.0167],
    ["Mars", 1.524, 0.0934],
    ["Jupiter", 5.203, 0.0484],
    ["Saturn", 9.537, 0.0539],
    ["Uranus", 19.19, 0.0473],
    ["Neptune", 30.07, 0.0086],
  ] as const)("%s has the size and shape NASA publishes", (name, semiMajorAu, eccentricity) => {
    assert.closeTo(orbit(name).semiMajorAxisKm / KM_PER_AU / semiMajorAu, 1, 0.015)
    assert.closeTo(orbit(name).eccentricity, eccentricity, 0.012)
  })

  // A planet's real path, from JPL's data, across the rest of the year. One pixel is about 0.006 AU
  // in the inner view and 0.12 AU in the whole-system view, so a planet must stay on its line.
  it.each([
    ["Mercury", 199, 0.006],
    ["Venus", 299, 0.006],
    ["Earth", 399, 0.006],
    ["Mars", 4, 0.006],
    ["Jupiter", 5, 0.12],
    ["Saturn", 6, 0.12],
    ["Uranus", 7, 0.12],
    ["Neptune", 8, 0.12],
  ] as const)("%s stays within a pixel of its line all year", (name, _id, limitAu) => {
    const body = sky.planets.find((planet) => planet.name === name)
    if (body === undefined) throw new Error(`No track for ${name}`)
    const worst = Math.max(
      ...Array.from({ length: 24 }, (_, step) => {
        const at = TdbSeconds(JANUARY + step * 14 * SECONDS_PER_DAY)
        const [x, y, z] = body.track(at)
        const [sx, sy, sz] = sky.sun(at)
        return distanceTo(orbit(name).pointsIcrf, [x - sx, y - sy, z - sz])
      }),
    )
    assert.isBelow(worst / KM_PER_AU, limitAu)
  })

  it("lists an orbit for each of the eight planets, in order", () => {
    assert.deepStrictEqual(
      orbits.map((candidate) => candidate.planet),
      ["Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"],
    )
  })

  it("draws each line in the same axes as the dots", () => {
    const earth = orbit("Earth")
    assert.strictEqual(earth.pointsEcliptic.length, earth.pointsIcrf.length)
    // Earth's orbit defines the ecliptic, so its line lies flat in those axes.
    const tallest = Math.max(...earth.pointsEcliptic.map(([, , z]) => Math.abs(z)))
    assert.isBelow(tallest / KM_PER_AU, 0.001)
  })
})
