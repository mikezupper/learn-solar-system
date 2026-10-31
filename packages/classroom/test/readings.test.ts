import { readFileSync } from "node:fs"
import { assert, describe, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import { makeTile, selectTile, tdbFromUtcMillis } from "@solar/ephemeris/service"
import { TileCatalog, TdbSeconds, type Vector3Km } from "@solar/ephemeris/types"
import { eclipticFromIcrf, cameraRelative, makeSky, readingsAt, skyPositionsAt } from "../src/service/index.js"
import { KM_PER_AU, LIGHT_MINUTES_PER_KM } from "../src/types/index.js"

const fixture = (path: string) => new URL(`../../../fixtures/${path}`, import.meta.url)

const catalog = Schema.decodeUnknownSync(TileCatalog)(
  JSON.parse(readFileSync(fixture("tiles/catalog.json"), "utf8")),
)
const entry = Option.getOrThrow(selectTile(catalog, tdbFromUtcMillis(Date.UTC(2026, 5, 1))))
const sky = Option.getOrThrow(
  makeSky(makeTile(entry.segments, readFileSync(fixture(`tiles/${entry.blob}`)))),
)

interface GoldenBody {
  readonly name: string
  readonly rows: ReadonlyArray<{ readonly jdTdb: number; readonly positionKm: Vector3Km }>
}
const golden: { readonly bodies: ReadonlyArray<GoldenBody> } = JSON.parse(
  readFileSync(fixture("horizons/planets-2026.json"), "utf8"),
)
const horizonsRow = (name: string, index: number) => {
  const row = golden.bodies.find((body) => body.name === name)?.rows[index]
  if (row === undefined) throw new Error(`No golden row for ${name}`)
  return row
}
const at = TdbSeconds((horizonsRow("Mars", 3).jdTdb - 2451545.0) * 86_400)
const reading = (name: string) => {
  const found = readingsAt(sky, at).find((candidate) => candidate.planet === name)
  if (found === undefined) throw new Error(`No reading for ${name}`)
  return found
}

describe("readingsAt", () => {
  it("lists the eight planets in order from the Sun", () => {
    assert.deepStrictEqual(
      readingsAt(sky, at).map((candidate) => candidate.planet),
      ["Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"],
    )
  })

  it("gives each planet's distance from the Sun, matching Horizons", () => {
    const [x, y, z] = horizonsRow("Mars", 3).positionKm
    assert.closeTo(reading("Mars").sunDistanceAu, Math.hypot(x, y, z) / KM_PER_AU, 1e-9)
  })

  it("gives the distance from Earth, derived from Horizons' two vectors", () => {
    const mars = horizonsRow("Mars", 3).positionKm
    const earth = horizonsRow("Earth", 3).positionKm
    const expected = Math.hypot(mars[0] - earth[0], mars[1] - earth[1], mars[2] - earth[2])
    const actual = Option.getOrThrow(reading("Mars").earthDistanceAu)
    assert.closeTo(actual, expected / KM_PER_AU, 1e-9)
  })

  it("gives the time light takes to arrive from that distance", () => {
    const mars = reading("Mars")
    const km = Option.getOrThrow(mars.earthDistanceAu) * KM_PER_AU
    assert.closeTo(Option.getOrThrow(mars.lightMinutesFromEarth), km * LIGHT_MINUTES_PER_KM, 1e-9)
  })

  it("has no distance from Earth for Earth itself", () => {
    assert.isTrue(Option.isNone(reading("Earth").earthDistanceAu))
    assert.isTrue(Option.isNone(reading("Earth").lightMinutesFromEarth))
  })

  it("keeps a light-minute consistent with the speed of light", () => {
    // Sunlight takes about 8.3 minutes to travel one astronomical unit.
    assert.closeTo(KM_PER_AU * LIGHT_MINUTES_PER_KM, 8.317, 0.001)
  })
})

describe("eclipticFromIcrf", () => {
  const OBLIQUITY = ((84_381.448 / 3600) * Math.PI) / 180 // IAU 1976, in arcseconds

  it("leaves the equinox direction where it is", () => {
    assert.deepStrictEqual(eclipticFromIcrf([1, 0, 0]), [1, 0, 0])
  })

  it("carries the ecliptic's north pole onto the z axis", () => {
    const [x, y, z] = eclipticFromIcrf([0, -Math.sin(OBLIQUITY), Math.cos(OBLIQUITY)])
    assert.closeTo(x, 0, 1e-12)
    assert.closeTo(y, 0, 1e-12)
    assert.closeTo(z, 1, 1e-12)
  })

  it("keeps Earth close to the plane its orbit defines", () => {
    const [, , z] = eclipticFromIcrf(horizonsRow("Earth", 3).positionKm)
    // The Earth-Moon wobble and 26 years of drift move Earth off the J2000 ecliptic by thousands
    // of km, against 150 million km of distance from the Sun.
    assert.isBelow(Math.abs(z), 30_000)
  })

  it("preserves lengths", () => {
    const icrf: Vector3Km = [3, -4, 12]
    const [x, y, z] = eclipticFromIcrf(icrf)
    assert.closeTo(Math.hypot(x, y, z), 13, 1e-12)
  })
})

describe("cameraRelative", () => {
  const NEPTUNE_KM = 4.5e9
  const nearby: Vector3Km = [NEPTUNE_KM + 10, 0, 0]
  const camera: Vector3Km = [NEPTUNE_KM, 0, 0]

  it("keeps a nearby object's position exact after the GPU's 32-bit rounding", () => {
    const [x] = cameraRelative(nearby, camera)
    assert.closeTo(Math.fround(x), 10, 1e-3)
  })

  it("is what rounding would otherwise destroy: 32 bits near Neptune resolve 512 km", () => {
    const naive = Math.fround(nearby[0]) - Math.fround(camera[0])
    assert.notStrictEqual(naive, 10)
  })
})

describe("skyPositionsAt", () => {
  it("places the Sun near the origin it orbits and the planets at their true distances", () => {
    const positions = skyPositionsAt(sky, at)
    const mars = positions.find((body) => body.name === "Mars")
    const sun = positions.find((body) => body.name === "Sun")
    if (mars === undefined || sun === undefined) throw new Error("Missing a body")
    const distance = Math.hypot(
      mars.eclipticKm[0] - sun.eclipticKm[0],
      mars.eclipticKm[1] - sun.eclipticKm[1],
      mars.eclipticKm[2] - sun.eclipticKm[2],
    )
    assert.closeTo(distance / KM_PER_AU, reading("Mars").sunDistanceAu, 1e-9)
  })
})
