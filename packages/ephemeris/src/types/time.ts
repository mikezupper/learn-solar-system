import { Brand, Schema } from "effect"

/**
 * Seconds past the J2000 epoch on the TDB time scale, the clock JPL's ephemerides run on.
 * NAIF's documentation calls the same number "ET".
 */
export type TdbSeconds = number & Brand.Brand<"TdbSeconds">
export const TdbSeconds = Brand.nominal<TdbSeconds>()
export const TdbSecondsSchema = Schema.Number.pipe(Schema.fromBrand("TdbSeconds", TdbSeconds))
