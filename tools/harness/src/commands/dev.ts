import { Console, Effect, FileSystem } from "effect"
import { currentIdentity, stackDown, stackUp, telemetryEnv } from "./obs.js"
import { runVisibly, toFailure } from "./shared.js"

const TILES = ".harness/tiles"

/** Prints this worktree's project and ports, for an agent that needs to reach them. */
export const where = currentIdentity.pipe(
  Effect.flatMap((identity) => Console.log(JSON.stringify(identity))),
)

/**
 * Boots this worktree: its own telemetry stack, its own tiles and its own web server, on ports no other
 * worktree uses. Stopping the command tears the stack down, so nothing outlives the task.
 */
export const dev = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const identity = yield* currentIdentity
  const webUrl = `http://localhost:${String(identity.ports.web)}`
  yield* Effect.gen(function* () {
    yield* stackUp(identity)
    const haveTiles = yield* fs.exists(`${TILES}/catalog.json`).pipe(Effect.mapError(toFailure))
    if (!haveTiles) {
      yield* runVisibly("pnpm", ["-s", "tiles:build"], { ...telemetryEnv(identity), TILE_STORE_DIR: TILES })
    }
    yield* Console.log(`dev: ${webUrl}  (telemetry: pnpm obs:logs, obs:metrics, obs:traces)`)
    yield* runVisibly(
      "pnpm",
      ["--filter", "@solar/web", "exec", "vite", "--port", String(identity.ports.web), "--strictPort"],
      {
        TILE_STORE_DIR: TILES,
        HARNESS_OTLP_TARGET: telemetryEnv(identity).OTEL_EXPORTER_OTLP_ENDPOINT,
        VITE_OTLP_BASE_URL: `${webUrl}/otlp`,
        VITE_WORKTREE: identity.project,
      },
    )
  }).pipe(Effect.ensuring(stackDown(identity).pipe(Effect.ignore)))
})
