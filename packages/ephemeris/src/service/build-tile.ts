import { Effect, Metric, Option } from "effect"
import { Instruments } from "@solar/providers"
import { Digest, KernelSource, TileStore } from "../repo/index.js"
import type { KernelPin, TileEntry } from "../types/catalog.js"
import { TileRejectedError } from "../types/errors.js"
import { compileTile } from "./compile-tile.js"
import { decidePublication } from "./decisions.js"
import { readSpkSegments } from "./spk.js"
import { makeTile } from "./tile.js"
import { tdbFromUtcMillis } from "./time-scale.js"
import { spreadInstants, verifyTile } from "./verify-tile.js"

/** The most a published tile may differ from Horizons. Measured differences are a few meters. */
export const PUBLISH_LIMIT_KM = 1
const INSTANTS_CHECKED = 12

/** Compiles, verifies and publishes one year. A rejected tile never reaches the store. */
export const buildYearTile = Effect.fn("Tile.buildYear")(function* (pin: KernelPin, year: number) {
  const kernels = yield* KernelSource
  const store = yield* TileStore
  const digest = yield* Digest

  const tileId = `planets-${String(year)}`
  const startSeconds = tdbFromUtcMillis(Date.UTC(year, 0, 1))
  const endSeconds = tdbFromUtcMillis(Date.UTC(year + 1, 0, 1))

  const reader = yield* kernels.open(pin)
  const spkSegments = yield* readSpkSegments(reader)
  const compiled = yield* compileTile({
    reader,
    segments: spkSegments,
    startSeconds,
    endSeconds,
  })

  const outcome = yield* verifyTile({
    tileId,
    tile: makeTile(compiled.segments, compiled.bytes),
    instants: spreadInstants(startSeconds, endSeconds, INSTANTS_CHECKED),
    limitKm: PUBLISH_LIMIT_KM,
  })
  if (outcome._tag === "TileRejected") {
    yield* Metric.update(Instruments.tilesRejected, 1)
    return yield* new TileRejectedError({
      tileId,
      worstBody: outcome.worstBody,
      errorKm: outcome.errorKm,
      limitKm: outcome.limitKm,
    })
  }

  const sha256 = yield* digest.sha256(compiled.bytes)
  const entry: TileEntry = {
    id: tileId,
    system: "planets",
    year,
    startSeconds,
    endSeconds,
    blob: `${tileId}-${sha256.slice(0, 16)}.bin`,
    byteLength: compiled.bytes.byteLength,
    sha256,
    segments: compiled.segments,
    provenance: { kernel: pin.name, kernelSha256: pin.sha256 },
    verification: outcome.verification,
  }

  const catalog = yield* store.readCatalog
  const decision = decidePublication(catalog, entry)
  if (Option.isSome(decision)) {
    // Blob first, catalog second: a crash in between leaves an unlisted blob, which a rerun reuses.
    yield* store.putBlob(entry.blob, compiled.bytes)
    yield* store.putCatalog(decision.value.catalog)
    yield* Metric.update(Instruments.tilesPublished, 1)
    yield* Effect.logInfo("tile published", {
      tileId,
      sha256,
      bytes: entry.byteLength,
      maxErrorKm: entry.verification.maxErrorKm,
    })
  } else {
    yield* Effect.logInfo("tile unchanged", { tileId, sha256 })
  }
  return entry
}, Effect.scoped, Effect.trackDuration(Instruments.tileBuildDuration))
