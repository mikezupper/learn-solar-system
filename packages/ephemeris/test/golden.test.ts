import { readFileSync } from "node:fs"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Option, Schema } from "effect"
import { makeTile, selectTile, tdbFromUtcMillis, trackFor, type Tile } from "../src/service/index.js"
import { Naif, NaifId, type Vector3Km } from "../src/types/bodies.js"
import { TileCatalog } from "../src/types/catalog.js"
import { TdbSeconds } from "../src/types/time.js"

/**
 * The accuracy claims, checked against sources outside this repository. The tile in fixtures/tiles
 * is real worker output; apps/worker's kernel test proves the worker still produces those bytes.
 */
const fixture = (path: string) => new URL(`../../../fixtures/${path}`, import.meta.url)

const loadFixtureTile = Effect.gen(function* () {
  const catalog = yield* Schema.decodeUnknownEffect(TileCatalog)(
    JSON.parse(readFileSync(fixture("tiles/catalog.json"), "utf8")),
  )
  const entry = Option.getOrThrow(selectTile(catalog, tdbFromUtcMillis(Date.UTC(2026, 5, 1))))
  return makeTile(entry.segments, readFileSync(fixture(`tiles/${entry.blob}`)))
})

interface GoldenBody {
  readonly name: string
  readonly target: number
  readonly center: number
  readonly rows: ReadonlyArray<{ readonly jdTdb: number; readonly positionKm: Vector3Km }>
}

const golden: { readonly bodies: ReadonlyArray<GoldenBody> } = JSON.parse(
  readFileSync(fixture("horizons/planets-2026.json"), "utf8"),
)

const atJd = (jd: number) => TdbSeconds((jd - 2451545.0) * 86_400)

describe("a compiled tile agrees with JPL Horizons", () => {
  it.effect.each(golden.bodies.map((body) => [body.name, body] as const))(
    "%s stays within 5 m across 2026",
    ([, body]) =>
      Effect.gen(function* () {
        const tile = yield* loadFixtureTile
        const track = Option.getOrThrow(trackFor(tile, NaifId(body.target), NaifId(body.center)))
        const worst = Math.max(
          ...body.rows.map((row) => {
            const [x, y, z] = track(atJd(row.jdTdb))
            return Math.hypot(
              x - row.positionKm[0],
              y - row.positionKm[1],
              z - row.positionKm[2],
            )
          }),
        )
        assert.isBelow(worst, 0.005)
      }),
  )
})

const C_KM_PER_S = 299_792.458
const EARTH_EQUATORIAL_RADIUS_KM = 6378.137

const minus = (a: Vector3Km, b: Vector3Km): Vector3Km => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const length = (a: Vector3Km) => Math.hypot(a[0], a[1], a[2])

/**
 * How far the Moon's shadow axis passes from Earth's center, in km. Light reaching Earth at `at` left
 * the Sun about 499 s earlier and passed the Moon about 1.3 s earlier.
 */
const shadowAxisMissKm = (tile: Tile, at: TdbSeconds): number => {
  const root = Naif.SolarSystemBarycenter
  const earth = Option.getOrThrow(trackFor(tile, Naif.Earth, root))(at)
  const moonTrack = Option.getOrThrow(trackFor(tile, Naif.Moon, root))
  const sunTrack = Option.getOrThrow(trackFor(tile, Naif.Sun, root))
  const retarded = (track: (t: TdbSeconds) => Vector3Km) =>
    track(TdbSeconds(at - length(minus(track(at), earth)) / C_KM_PER_S))
  const moon = retarded(moonTrack)
  const sun = retarded(sunTrack)
  const axis = minus(moon, sun)
  const unit: Vector3Km = [axis[0] / length(axis), axis[1] / length(axis), axis[2] / length(axis)]
  const toEarth = minus(earth, moon)
  const along = toEarth[0] * unit[0] + toEarth[1] * unit[1] + toEarth[2] * unit[2]
  return length(minus(toEarth, [along * unit[0], along * unit[1], along * unit[2]]))
}

describe("a compiled tile reproduces the total solar eclipse of 2026-08-12", () => {
  // Published by Espenak (eclipsewise.com) and NASA's eclipse catalog: greatest eclipse at
  // 17:47:05.8 Dynamical Time, gamma 0.89774. Neither value comes from Horizons or from this code.
  const AUGUST_12_00H_TDB = (2461264.5 - 2451545.0) * 86_400
  const SEARCH_SECONDS = Array.from({ length: 4 * 3600 }, (_, second) => 16 * 3600 + second)

  it.effect("at the published time and distance", () =>
    Effect.gen(function* () {
      const tile = yield* loadFixtureTile
      const closest = SEARCH_SECONDS.map((second) => ({
        second,
        missKm: shadowAxisMissKm(tile, TdbSeconds(AUGUST_12_00H_TDB + second)),
      })).reduce((best, candidate) => (candidate.missKm < best.missKm ? candidate : best))

      const PUBLISHED_SECOND = 17 * 3600 + 47 * 60 + 5.8
      assert.closeTo(closest.second, PUBLISHED_SECOND, 1)
      assert.closeTo(closest.missKm / EARTH_EQUATORIAL_RADIUS_KM, 0.89774, 0.0002)
    }),
  )
})
