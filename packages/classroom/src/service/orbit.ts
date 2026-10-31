import { TdbSeconds, type Vector3Km } from "@solar/ephemeris/types"
import { GM_SUN_KM3_PER_S2, PLANETS, type PlanetName, type Sky } from "../types/index.js"
import { eclipticFromIcrf } from "./sky.js"

export interface Orbit {
  readonly semiMajorAxisKm: number
  readonly eccentricity: number
  /** The closed path around the Sun, relative to the Sun, in the axes of the input. */
  readonly points: ReadonlyArray<Vector3Km>
}

const dot = (a: Vector3Km, b: Vector3Km): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const length = (a: Vector3Km): number => Math.sqrt(dot(a, a))
const scale = (a: Vector3Km, by: number): Vector3Km => [a[0] * by, a[1] * by, a[2] * by]
const minus = (a: Vector3Km, b: Vector3Km): Vector3Km => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: Vector3Km, b: Vector3Km): Vector3Km => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

/** Below this, a shape is a circle and its perihelion direction means nothing. */
const CIRCULAR_ECCENTRICITY = 1e-10

/**
 * The ellipse a body would follow if only the Sun pulled on it, from its position and velocity at
 * one moment. This is the standard "osculating orbit". Every planet is bound to the Sun, so the
 * state always gives an ellipse, and `orbit.test.ts` measures how closely real paths stay on it.
 */
export const orbitFromState = (
  position: Vector3Km,
  velocity: Vector3Km,
  gm: number,
  pointCount: number,
): Orbit => {
  const distance = length(position)
  const angularMomentum = cross(position, velocity)
  const eccentricityVector = minus(
    scale(cross(velocity, angularMomentum), 1 / gm),
    scale(position, 1 / distance),
  )
  const eccentricity = length(eccentricityVector)
  const toPerihelion =
    eccentricity > CIRCULAR_ECCENTRICITY
      ? scale(eccentricityVector, 1 / eccentricity)
      : scale(position, 1 / distance)
  const ahead = cross(scale(angularMomentum, 1 / length(angularMomentum)), toPerihelion)
  const semiLatusRectum = dot(angularMomentum, angularMomentum) / gm
  return {
    semiMajorAxisKm: 1 / (2 / distance - dot(velocity, velocity) / gm),
    eccentricity,
    points: Array.from({ length: pointCount }, (_, index): Vector3Km => {
      const anomaly = (2 * Math.PI * index) / pointCount
      const radius = semiLatusRectum / (1 + eccentricity * Math.cos(anomaly))
      const along = radius * Math.cos(anomaly)
      const across = radius * Math.sin(anomaly)
      return [
        toPerihelion[0] * along + ahead[0] * across,
        toPerihelion[1] * along + ahead[1] * across,
        toPerihelion[2] * along + ahead[2] * across,
      ]
    }),
  }
}

export interface PlanetOrbit {
  readonly planet: PlanetName
  readonly semiMajorAxisKm: number
  readonly eccentricity: number
  readonly pointsIcrf: ReadonlyArray<Vector3Km>
  readonly pointsEcliptic: ReadonlyArray<Vector3Km>
}

/** Half the span used to measure velocity: short against any orbit, long against rounding. */
const VELOCITY_STEP_SECONDS = 3600

/** Every planet's line, as it stands at one moment. */
export const orbitsAt = (sky: Sky, at: TdbSeconds, pointCount: number): ReadonlyArray<PlanetOrbit> => {
  const before = TdbSeconds(at - VELOCITY_STEP_SECONDS)
  const after = TdbSeconds(at + VELOCITY_STEP_SECONDS)
  const sunBefore = sky.sun(before)
  const sunAfter = sky.sun(after)
  const sunNow = sky.sun(at)
  return sky.planets.map(({ name, orbitTrack }) => {
    const velocity = scale(
      minus(minus(orbitTrack(after), sunAfter), minus(orbitTrack(before), sunBefore)),
      1 / (2 * VELOCITY_STEP_SECONDS),
    )
    const gm =
      GM_SUN_KM3_PER_S2 + (PLANETS.find((planet) => planet.name === name)?.gmKm3PerS2 ?? 0)
    const orbit = orbitFromState(minus(orbitTrack(at), sunNow), velocity, gm, pointCount)
    return {
      planet: name,
      semiMajorAxisKm: orbit.semiMajorAxisKm,
      eccentricity: orbit.eccentricity,
      pointsIcrf: orbit.points,
      pointsEcliptic: orbit.points.map(eclipticFromIcrf),
    }
  })
}
