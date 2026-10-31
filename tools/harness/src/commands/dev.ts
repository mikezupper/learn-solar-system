import { Console, Effect, FileSystem, Option, Schedule } from "effect"
import { currentIdentity, stackDown, stackUp, telemetryEnv } from "./obs.js"
import { HarnessFailure, runVisibly, toFailure } from "./shared.js"

const TILES = ".harness/tiles"
const PID_FILE = ".harness/dev.pid"

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
  yield* fs.makeDirectory(".harness", { recursive: true }).pipe(Effect.mapError(toFailure))
  yield* fs.writeFileString(PID_FILE, String(process.pid)).pipe(Effect.mapError(toFailure))
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
  }).pipe(
    Effect.ensuring(
      stackDown(identity).pipe(
        Effect.ignore,
        Effect.andThen(fs.remove(PID_FILE, { force: true }).pipe(Effect.ignore)),
      ),
    ),
  )
})

/**
 * Stops a running `dev` from another shell. A signal sent to `pnpm dev` stops pnpm alone and strands
 * the stack, so this signals the process that owns the cleanup, recorded when it started.
 */
export const stop = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const identity = yield* currentIdentity
  const pid = yield* fs.readFileString(PID_FILE).pipe(Effect.option)
  if (Option.isNone(pid)) {
    yield* Console.log("dev:stop: nothing is running here; removing any leftover stack")
    return yield* stackDown(identity)
  }
  yield* Effect.try({
    try: () => process.kill(Number(pid.value), "SIGTERM"),
    catch: toFailure,
  })
  yield* fs.exists(PID_FILE).pipe(
    Effect.mapError(toFailure),
    Effect.flatMap((running) =>
      running ? Effect.fail(new HarnessFailure({ message: "dev is still stopping." })) : Effect.void,
    ),
    Effect.retry({ schedule: Schedule.spaced("500 millis"), times: 60 }),
  )
  yield* Console.log("dev:stop: stopped, and the stack is down")
})
