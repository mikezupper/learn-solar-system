import { Brand, Data, type Option } from "effect"
import { Naif, type NaifId, type Track, type Vector3Km } from "@solar/ephemeris/types"

/** An instant as JavaScript counts it: milliseconds since 1970, in UTC. */
export type Moment = number & Brand.Brand<"Moment">
export const Moment = Brand.nominal<Moment>()

/** Simulated seconds that pass in each real second, at each speed a learner can choose. */
export const SPEEDS = {
  day: 86_400,
  week: 7 * 86_400,
  month: (365.25 / 12) * 86_400,
  year: 365.25 * 86_400,
} as const
export type SpeedName = keyof typeof SPEEDS

/** How the moment on screen behaves: each variant holds only what that behavior needs. */
export type ChosenMoment = Data.TaggedEnum<{
  /** The clock on the wall. */
  FollowingNow: { readonly moment: Moment }
  /** A moment named by a shared link. */
  PinnedByLink: { readonly moment: Moment }
  /** Stopped by the learner. */
  Paused: { readonly moment: Moment }
  /** Running faster than life. `lastNow` is the wall clock at the previous tick, once there is one. */
  Travelling: {
    readonly moment: Moment
    readonly speed: SpeedName
    readonly lastNow: Option.Option<number>
  }
  /** Running to the present and then following it. `rate` is simulated time per real time. */
  CatchingUp: {
    readonly moment: Moment
    readonly rate: number
    readonly lastNow: Option.Option<number>
  }
}>
export const ChosenMoment = Data.taggedEnum<ChosenMoment>()

/** The exact definition of the astronomical unit, set by the IAU in 2012. */
export const KM_PER_AU = 149_597_870.7
const LIGHT_KM_PER_SECOND = 299_792.458
export const LIGHT_MINUTES_PER_KM = 1 / (LIGHT_KM_PER_SECOND * 60)

/** Twice the Sun's volumetric mean radius, from NASA's Sun fact sheet. */
export const SUN_DIAMETER_KM = 1_391_400

/** Earth's mean speed around the Sun, from NASA's Earth fact sheet. */
export const EARTH_MEAN_SPEED_KM_PER_S = 29.78

/** The Sun's gravity, from JPL's gm_de440.tpc. */
export const GM_SUN_KM3_PER_S2 = 132_712_440_041.27942

/**
 * The planets, nearest the Sun first. `orbitTarget` is the point whose path around the Sun a line
 * should follow: for Earth, the center of mass it shares with the Moon, since Earth itself wobbles
 * around that point every month. `gmKm3PerS2` is each system's gravity, from JPL's gm_de440.tpc.
 * `diameterKm` is from NASA's planetary fact sheet.
 */
export const PLANETS = [
  { name: "Mercury", target: Naif.Mercury, orbitTarget: Naif.Mercury, gmKm3PerS2: 22_031.868551, diameterKm: 4_879 },
  { name: "Venus", target: Naif.Venus, orbitTarget: Naif.Venus, gmKm3PerS2: 324_858.592, diameterKm: 12_104 },
  { name: "Earth", target: Naif.Earth, orbitTarget: Naif.EarthMoonBarycenter, gmKm3PerS2: 403_503.235625, diameterKm: 12_756 },
  { name: "Mars", target: Naif.MarsBarycenter, orbitTarget: Naif.MarsBarycenter, gmKm3PerS2: 42_828.375816, diameterKm: 6_792 },
  { name: "Jupiter", target: Naif.JupiterBarycenter, orbitTarget: Naif.JupiterBarycenter, gmKm3PerS2: 126_712_764.1, diameterKm: 142_984 },
  { name: "Saturn", target: Naif.SaturnBarycenter, orbitTarget: Naif.SaturnBarycenter, gmKm3PerS2: 37_940_584.8418, diameterKm: 120_536 },
  { name: "Uranus", target: Naif.UranusBarycenter, orbitTarget: Naif.UranusBarycenter, gmKm3PerS2: 5_794_556.4, diameterKm: 51_118 },
  { name: "Neptune", target: Naif.NeptuneBarycenter, orbitTarget: Naif.NeptuneBarycenter, gmKm3PerS2: 6_836_527.100580, diameterKm: 49_528 },
] as const satisfies ReadonlyArray<{
  readonly name: string
  readonly target: NaifId
  readonly orbitTarget: NaifId
  readonly gmKm3PerS2: number
  readonly diameterKm: number
}>

export type PlanetName = (typeof PLANETS)[number]["name"]
export type BodyName = PlanetName | "Sun"

/** What the table shows for one planet at one moment. */
export interface Reading {
  readonly planet: PlanetName
  readonly sunDistanceAu: number
  /** None for Earth, which has no distance from itself. */
  readonly earthDistanceAu: Option.Option<number>
  readonly lightMinutesFromEarth: Option.Option<number>
}

export interface SkyPosition {
  readonly name: BodyName
  readonly eclipticKm: Vector3Km
}

/** A tile with every track the classroom needs already resolved, so reading it cannot fail. */
export interface Sky {
  readonly sun: Track
  readonly earth: Track
  readonly planets: ReadonlyArray<{
    readonly name: PlanetName
    readonly track: Track
    readonly orbitTrack: Track
  }>
}
