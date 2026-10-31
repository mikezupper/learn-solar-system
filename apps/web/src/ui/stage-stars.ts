import { Array as Arr } from "effect"

/** The same stars on every visit. Lehmer's generator, since time and randomness are inputs here. */
const SEED = 20_261_031
const MULTIPLIER = 16_807
const MODULUS = 2_147_483_647

const randoms = (count: number): ReadonlyArray<number> =>
  Arr.mapAccum(Array.from({ length: count }), SEED, (state) => {
    const next = (state * MULTIPLIER) % MODULUS
    return [next, (next - 1) / (MODULUS - 1)] as const
  })[1]

/** Warm and cool tints, as real stars have. Mostly white. */
const TINTS: ReadonlyArray<readonly [number, number, number]> = [
  [0.95, 0.96, 1],
  [0.78, 0.86, 1],
  [1, 0.9, 0.74],
  [1, 0.76, 0.62],
]

const tintFor = (roll: number) => TINTS[roll < 0.68 ? 0 : roll < 0.84 ? 1 : roll < 0.95 ? 2 : 3] ?? [1, 1, 1]

const NUMBERS_PER_STAR = 6
const SHARE_IN_BAND = 0.45
const BAND_TILT = 1.05
const BAND_THICKNESS = 0.16

export interface StarField {
  readonly positions: Float32Array
  readonly colors: Float32Array
}

/**
 * Stars spread over a sphere, about half of them gathered into a faint band like the Milky Way. They
 * are decoration: the positions are random, and the page says so. They never twinkle, because
 * twinkling is caused by Earth's air, and this view is from space.
 */
export const starField = (count: number, radius: number, faintest: number): StarField => {
  const numbers = randoms(count * NUMBERS_PER_STAR)
  const stars = Array.from({ length: count }, (_, index) => {
    const at = (offset: number) => numbers[index * NUMBERS_PER_STAR + offset] ?? 0
    const inBand = at(0) < SHARE_IN_BAND
    const around = at(1) * Math.PI * 2
    // A sum of three uniforms gathers near zero, which thins the band smoothly toward its edges.
    const height = inBand
      ? ((at(2) + at(3) + at(4) - 1.5) / 1.5) * BAND_THICKNESS
      : at(2) * 2 - 1
    const flat = Math.sqrt(Math.max(0, 1 - height * height))
    const x = flat * Math.cos(around)
    const y = flat * Math.sin(around)
    const tilted = [x, y * Math.cos(BAND_TILT) - height * Math.sin(BAND_TILT), y * Math.sin(BAND_TILT) + height * Math.cos(BAND_TILT)] as const
    const glow = faintest + (1 - faintest) * at(5) * at(5)
    const tint = tintFor(at(3))
    return {
      position: tilted.map((axis) => axis * radius),
      color: tint.map((channel) => channel * glow),
    }
  })
  return {
    positions: Float32Array.from(stars.flatMap(({ position }) => position)),
    colors: Float32Array.from(stars.flatMap(({ color }) => color)),
  }
}
