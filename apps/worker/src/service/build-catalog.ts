import { Array, Effect, FileSystem, Option, pipe, Schema } from "effect"
import { buildYearTile } from "@solar/ephemeris/service"
import { KernelLock, KernelReadError } from "@solar/ephemeris/types"

const decodeLock = Schema.decodeEffect(Schema.fromJsonString(KernelLock))

const PLANET_KERNEL = "de440s.bsp"

/** Reads the pins and builds each requested year, one at a time so the catalog has a single writer. */
export const buildCatalog = Effect.fn("Worker.buildCatalog")(function* (input: {
  readonly lockFile: string
  readonly years: ReadonlyArray<number>
}) {
  const fs = yield* FileSystem.FileSystem
  const failure = (cause: unknown) =>
    new KernelReadError({ path: input.lockFile, reason: String(cause) })
  const lock = yield* fs.readFileString(input.lockFile).pipe(
    Effect.flatMap(decodeLock),
    Effect.mapError(failure),
  )
  const pin = yield* pipe(
    lock.kernels,
    Array.findFirst((kernel) => kernel.name === PLANET_KERNEL),
    Option.match({
      onSome: Effect.succeed,
      onNone: () => Effect.fail(failure(`The lock file has no entry for ${PLANET_KERNEL}.`)),
    }),
  )
  return yield* Effect.forEach(input.years, (year) => buildYearTile(pin, year))
})

/** Reads "2025, 2026" into years, leaving out anything that is not a whole number. */
export const parseYears = (text: string): ReadonlyArray<number> =>
  pipe(
    text.split(","),
    Array.map((part) => Number(part.trim())),
    Array.filter((year) => Number.isInteger(year) && year > 0),
  )
