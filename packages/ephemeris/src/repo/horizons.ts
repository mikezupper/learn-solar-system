import { Context, Effect, Layer, Schedule, Schema } from "effect"
import { HttpClient } from "effect/http"
import type { Vector3Km } from "../types/bodies.js"
import { HorizonsError } from "../types/errors.js"
import { TdbSeconds } from "../types/time.js"

export interface HorizonsRequest {
  /** What is being asked for, in error messages and spans. */
  readonly label: string
  readonly command: string
  readonly center: string
  readonly instants: ReadonlyArray<TdbSeconds>
}

export interface HorizonsRow {
  readonly at: TdbSeconds
  readonly positionKm: Vector3Km
}

/** JPL's own calculator: an independent check on a tile, and the only source for spacecraft. */
export class Horizons extends Context.Service<
  Horizons,
  {
    readonly vectors: (
      request: HorizonsRequest,
    ) => Effect.Effect<ReadonlyArray<HorizonsRow>, HorizonsError>
  }
>()("ephemeris/repo/Horizons") {}

const J2000_JD = 2451545.0
const SECONDS_PER_DAY = 86_400
const API = "https://ssd.jpl.nasa.gov/api/horizons.api"

export const tlistFor = (instants: ReadonlyArray<TdbSeconds>): string =>
  instants.map((at) => `'${(at / SECONDS_PER_DAY + J2000_JD).toFixed(6)}'`).join(",")

const Numbers = Schema.Tuple([
  Schema.FiniteFromString,
  Schema.FiniteFromString,
  Schema.FiniteFromString,
  Schema.FiniteFromString,
])
const decodeNumbers = Schema.decodeUnknownEffect(Numbers)

/** Reads a CSV vector table: "JD, calendar date, X, Y, Z,", between the $$SOE and $$EOE markers. */
export const parseVectorTable = Effect.fnUntraced(function* (
  label: string,
  text: string,
): Effect.fn.Return<ReadonlyArray<HorizonsRow>, HorizonsError> {
  const start = text.indexOf("$$SOE")
  const end = text.indexOf("$$EOE")
  if (start < 0 || end < 0) {
    return yield* new HorizonsError({ request: label, reason: text.trim().slice(0, 300) })
  }
  const lines = text.slice(start + 5, end).trim().split("\n")
  return yield* Effect.forEach(lines, (line) => {
    const fields = line.split(",").map((field) => field.trim())
    return decodeNumbers([fields[0], fields[2], fields[3], fields[4]]).pipe(
      Effect.map(
        ([jd, x, y, z]): HorizonsRow => ({
          at: TdbSeconds((jd - J2000_JD) * SECONDS_PER_DAY),
          positionKm: [x, y, z],
        }),
      ),
      Effect.mapError(
        (cause) =>
          new HorizonsError({ request: label, reason: `Unreadable row "${line}": ${String(cause)}` }),
      ),
    )
  })
})

const decodeAnswer = Schema.decodeUnknownEffect(Schema.Struct({ result: Schema.String }))

/** Calls the public API, retrying brief failures. Callers send one request at a time: it is shared. */
export const HorizonsHttp = Layer.effect(
  Horizons,
  Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk)
    return Horizons.of({
      vectors: Effect.fn("Horizons.vectors")((request: HorizonsRequest) =>
        client
          .get(API, {
            urlParams: {
              format: "json",
              OBJ_DATA: "'NO'",
              MAKE_EPHEM: "'YES'",
              EPHEM_TYPE: "'VECTORS'",
              COMMAND: `'${request.command}'`,
              CENTER: `'${request.center}'`,
              TLIST: tlistFor(request.instants),
              TLIST_TYPE: "'JD'",
              TIME_TYPE: "'TDB'",
              VEC_TABLE: "'1'",
              REF_PLANE: "'FRAME'",
              OUT_UNITS: "'KM-S'",
              CSV_FORMAT: "'YES'",
              VEC_LABELS: "'NO'",
            },
          })
          .pipe(
            Effect.flatMap((response) => response.json),
            Effect.flatMap(decodeAnswer),
            Effect.retry({ schedule: Schedule.exponential("1 second"), times: 3 }),
            Effect.mapError(
              (cause) => new HorizonsError({ request: request.label, reason: String(cause) }),
            ),
            Effect.flatMap((answer) => parseVectorTable(request.label, answer.result)),
          ),
      ),
    })
  }),
)
