import { Array, Option, pipe } from "effect"
import { trackFor } from "@solar/ephemeris/service"
import { Naif, type TdbSeconds, type Tile, type Vector3Km } from "@solar/ephemeris/types"
import {
  KM_PER_AU,
  LIGHT_MINUTES_PER_KM,
  PLANETS,
  type Reading,
  type Sky,
  type SkyPosition,
} from "../types/index.js"

/** Answers none when the tile lacks a body the classroom shows. */
export const makeSky = (tile: Tile): Option.Option<Sky> => {
  const root = Naif.SolarSystemBarycenter
  return Option.map(
    Option.all({
      sun: trackFor(tile, Naif.Sun, root),
      earth: trackFor(tile, Naif.Earth, root),
      planets: Option.all(
        PLANETS.map(({ name, target }) =>
          Option.map(trackFor(tile, target, root), (track) => ({ name, track })),
        ),
      ),
    }),
    (sky): Sky => sky,
  )
}

const distanceKm = (a: Vector3Km, b: Vector3Km): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

export const readingsAt = (sky: Sky, at: TdbSeconds): ReadonlyArray<Reading> => {
  const sun = sky.sun(at)
  const earth = sky.earth(at)
  return sky.planets.map(({ name, track }) => {
    const position = track(at)
    const fromEarthKm = name === "Earth" ? Option.none() : Option.some(distanceKm(position, earth))
    return {
      planet: name,
      sunDistanceAu: distanceKm(position, sun) / KM_PER_AU,
      earthDistanceAu: Option.map(fromEarthKm, (km) => km / KM_PER_AU),
      lightMinutesFromEarth: Option.map(fromEarthKm, (km) => km * LIGHT_MINUTES_PER_KM),
    }
  })
}

// The J2000 obliquity of the ecliptic, 84381.448 arcseconds (IAU 1976).
const OBLIQUITY = (84_381.448 / 3600) * (Math.PI / 180)
const COS_OBLIQUITY = Math.cos(OBLIQUITY)
const SIN_OBLIQUITY = Math.sin(OBLIQUITY)

/** Turns ICRF axes, tied to Earth's equator, to axes tied to the plane of Earth's orbit. */
export const eclipticFromIcrf = ([x, y, z]: Vector3Km): Vector3Km => [
  x,
  y * COS_OBLIQUITY + z * SIN_OBLIQUITY,
  z * COS_OBLIQUITY - y * SIN_OBLIQUITY,
]

/** Every body the stage draws, relative to the solar system's center of mass, as JPL states it. */
export const skyPositionsAt = (sky: Sky, at: TdbSeconds): ReadonlyArray<SkyPosition> =>
  pipe(
    sky.planets,
    Array.map(({ name, track }): SkyPosition => ({ name, eclipticKm: eclipticFromIcrf(track(at)) })),
    Array.prepend<SkyPosition>({ name: "Sun", eclipticKm: eclipticFromIcrf(sky.sun(at)) }),
  )
