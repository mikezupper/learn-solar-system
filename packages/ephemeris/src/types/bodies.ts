import { Brand, Schema } from "effect"

/** A body's identifier in NAIF's numbering, which JPL's kernels and Horizons both use. */
export type NaifId = number & Brand.Brand<"NaifId">
export const NaifId = Brand.nominal<NaifId>()
export const NaifIdSchema = Schema.Int.pipe(Schema.fromBrand("NaifId", NaifId))

/** The centers of mass and bodies held by DE440s. Moon kernels add planet centers for Mars onward. */
export const Naif = {
  SolarSystemBarycenter: NaifId(0),
  Sun: NaifId(10),
  Mercury: NaifId(199),
  Venus: NaifId(299),
  Earth: NaifId(399),
  Moon: NaifId(301),
  EarthMoonBarycenter: NaifId(3),
  MarsBarycenter: NaifId(4),
  JupiterBarycenter: NaifId(5),
  SaturnBarycenter: NaifId(6),
  UranusBarycenter: NaifId(7),
  NeptuneBarycenter: NaifId(8),
  PlutoBarycenter: NaifId(9),
} as const

/** A position in kilometers, on the axes of the ICRF, the frame all of JPL's data uses. */
export type Vector3Km = readonly [x: number, y: number, z: number]
