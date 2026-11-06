import { Console, Effect, FileSystem, Option, Predicate, Schedule } from "effect"
import { currentIdentity, stackDown, stackUp, telemetryEnv } from "./obs.js"
import { HarnessFailure, runVisibly, toFailure } from "./shared.js"

const TILES = ".harness/tiles"
const PID_FILE = ".harness/dev.pid"
const WEB_PID_FILE = ".harness/web.pid"

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
    // Publishes only the years that are missing. The first run in a worktree takes a few minutes.
    yield* runVisibly("pnpm", ["-s", "tiles:build"], { ...telemetryEnv(identity), TILE_STORE_DIR: TILES })
    yield* Console.log(`dev: ${webUrl}  (telemetry: pnpm obs:logs, obs:metrics, obs:traces)`)
    yield* runVisibly(
      "pnpm",
      ["--filter", "@solar/web", "exec", "vite", "--port", String(identity.ports.web), "--strictPort"],
      {
        TILE_STORE_DIR: TILES,
        HARNESS_OTLP_TARGET: telemetryEnv(identity).OTEL_EXPORTER_OTLP_ENDPOINT,
        VITE_OTLP_BASE_URL: "/otlp",
        VITE_WORKTREE: identity.project,
      },
      (pid) => fs.writeFileString(WEB_PID_FILE, String(pid)).pipe(Effect.mapError(toFailure)),
    )
  }).pipe(
    Effect.ensuring(
      stackDown(identity).pipe(
        Effect.ignore,
        Effect.andThen(fs.remove(WEB_PID_FILE, { force: true }).pipe(Effect.ignore)),
        Effect.andThen(fs.remove(PID_FILE, { force: true }).pipe(Effect.ignore)),
      ),
    ),
  )
})

/** Reads a recorded process id. Zero and negatives are refused, because they signal whole process groups. */
const readRecord = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const text = yield* fs.readFileString(path).pipe(Effect.option)
    if (Option.isNone(text)) return Option.none<number>()
    const pid = Number(text.value)
    return Number.isInteger(pid) && pid > 0
      ? Option.some(pid)
      : yield* new HarnessFailure({ message: `${path} holds no process id. Delete it and run dev:stop again.` })
  })

const isNoSuchProcess = (cause: unknown) => Predicate.hasProperty(cause, "code") && cause.code === "ESRCH"

/** Sends a signal, or with 0 only asks. False means no such process, which is no failure when stopping one. */
const send = (pid: number, signal: NodeJS.Signals | 0) =>
  Effect.try({ try: () => process.kill(pid, signal), catch: (cause) => cause }).pipe(
    Effect.catchIf(isNoSuchProcess, () => Effect.succeed(false)),
    Effect.mapError(toFailure),
  )

/** Waits two minutes, because `docker compose down` has been measured at anything from 3 seconds to about a minute. */
const untilStopped = (name: string, isRunning: Effect.Effect<boolean, HarnessFailure>) =>
  isRunning.pipe(
    Effect.flatMap((running) =>
      running ? Effect.fail(new HarnessFailure({ message: `${name} is still stopping.` })) : Effect.void,
    ),
    Effect.retry({ schedule: Schedule.spaced("500 millis"), times: 240 }),
  )

/**
 * A dev killed outright leaves its web server running. Each child leads its own process group, so the
 * recorded id, negated, reaches pnpm and Vite together.
 */
const stopStrandedWeb = Effect.gen(function* () {
  const pid = yield* readRecord(WEB_PID_FILE)
  if (Option.isNone(pid)) return
  const group = -pid.value
  yield* send(group, "SIGTERM")
  yield* untilStopped("The web server", send(group, 0))
})

/**
 * Stops a running `dev` from another shell. A signal sent to `pnpm dev` stops pnpm alone and strands
 * the stack, so this signals the process that owns the cleanup, recorded when it started. If that
 * process died before it could clean up, nothing else will, so this removes what it left behind.
 */
export const stop = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const identity = yield* currentIdentity
  const pid = yield* readRecord(PID_FILE)
  const signalled = Option.isSome(pid) && (yield* send(pid.value, "SIGTERM"))
  if (!signalled) {
    yield* Console.log("dev:stop: nothing is running here; removing any leftover stack")
    yield* stopStrandedWeb
    yield* stackDown(identity)
    yield* fs.remove(WEB_PID_FILE, { force: true }).pipe(Effect.mapError(toFailure))
    return yield* fs.remove(PID_FILE, { force: true }).pipe(Effect.mapError(toFailure))
  }
  yield* untilStopped("dev", fs.exists(PID_FILE).pipe(Effect.mapError(toFailure)))
  yield* Console.log("dev:stop: stopped, and the stack is down")
})
