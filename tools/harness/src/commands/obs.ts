import { Clock, Console, Effect, FileSystem, Schedule, Schema } from "effect"
import { HttpClient } from "effect/http"
import { worktreeIdentity, type WorktreeIdentity } from "../worktree.js"
import { capture, HarnessFailure, runVisibly, toFailure } from "./shared.js"

const COMPOSE_FILE = "observability/compose.yaml"
const CHECK_TILES = ".harness/obs-check-tiles"
const MICROS_PER_MILLI = 1000
const TEN_MINUTES_MICROS = 600_000_000

export const currentIdentity = capture("git", ["rev-parse", "--show-toplevel"]).pipe(
  Effect.map((root) => worktreeIdentity(root.trim())),
)

const composeEnv = ({ ports }: WorktreeIdentity) => ({
  HARNESS_OTLP_PORT: String(ports.otlp),
  HARNESS_LOGS_PORT: String(ports.logs),
  HARNESS_METRICS_PORT: String(ports.metrics),
  HARNESS_TRACES_PORT: String(ports.traces),
})

const compose = (identity: WorktreeIdentity, ...args: ReadonlyArray<string>) =>
  runVisibly(
    "docker",
    ["compose", "-p", identity.project, "-f", COMPOSE_FILE, ...args],
    composeEnv(identity),
  )

export const stackUp = (identity: WorktreeIdentity) => compose(identity, "up", "-d", "--wait", "--quiet-pull")
export const stackDown = (identity: WorktreeIdentity) => compose(identity, "down", "-v", "--remove-orphans")

/** The variables that send a process's telemetry to this worktree's collector. */
export const telemetryEnv = (identity: WorktreeIdentity) => ({
  OTEL_EXPORTER_OTLP_ENDPOINT: `http://localhost:${String(identity.ports.otlp)}`,
  HARNESS_WORKTREE: identity.project,
})

const getText = (url: string, urlParams: Readonly<Record<string, string>>) =>
  Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk)
    const response = yield* client.get(url, { urlParams })
    return yield* response.text
  }).pipe(Effect.mapError(toFailure))

const queryLogs = (identity: WorktreeIdentity, query: string) =>
  getText(`http://localhost:${String(identity.ports.logs)}/select/logsql/query`, { query })

const queryMetrics = (identity: WorktreeIdentity, query: string) =>
  getText(`http://localhost:${String(identity.ports.metrics)}/api/v1/query`, { query })

const JaegerTraces = Schema.fromJsonString(
  Schema.Struct({
    data: Schema.Array(
      Schema.Struct({
        traceID: Schema.String,
        spans: Schema.Array(Schema.Struct({ operationName: Schema.String, duration: Schema.Number })),
      }),
    ),
  }),
)

const queryTraces = (identity: WorktreeIdentity, service: string) =>
  Effect.gen(function* () {
    const millis = yield* Clock.currentTimeMillis
    const end = millis * MICROS_PER_MILLI
    const text = yield* getText(
      `http://localhost:${String(identity.ports.traces)}/select/jaeger/api/traces`,
      {
        service,
        start: String(end - TEN_MINUTES_MICROS),
        end: String(end),
        limit: "20",
      },
    )
    const { data } = yield* Schema.decodeEffect(JaegerTraces)(text).pipe(Effect.mapError(toFailure))
    return data.map((trace) => ({
      traceId: trace.traceID,
      spans: trace.spans.map((span) => ({
        name: span.operationName,
        ms: Math.round(span.duration / MICROS_PER_MILLI),
      })),
    }))
  })

const untilTrue = (label: string, probe: Effect.Effect<boolean, HarnessFailure, HttpClient.HttpClient>) =>
  probe.pipe(
    Effect.flatMap((found) =>
      found
        ? Effect.void
        : Effect.fail(new HarnessFailure({ message: `${label} never reached its store.` })),
    ),
    Effect.retry({ schedule: Schedule.spaced("1 second"), times: 30 }),
    Effect.tap(() => Console.log(`obs check: ${label} ok`)),
  )

/**
 * Proves the stack end to end on its own ports: runs the real worker, then waits for its log line,
 * metric and spans to become queryable. An empty store fails this check instead of misleading an agent.
 */
const check = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const { project, ports } = yield* currentIdentity
  const identity = worktreeIdentity(`${project}#check`)
  yield* Console.log(`obs check: starting ${identity.project} (${String(ports.web)} stays free)`)
  yield* fs.remove(CHECK_TILES, { recursive: true, force: true }).pipe(Effect.mapError(toFailure))
  yield* Effect.gen(function* () {
    yield* stackUp(identity)
    yield* runVisibly("pnpm", ["-s", "tiles:build"], {
      ...telemetryEnv(identity),
      TILE_STORE_DIR: CHECK_TILES,
      TILE_YEARS: "2026",
    })
    yield* untilTrue(
      "logs",
      queryLogs(identity, '{service.name="solar-worker"} "tile published"').pipe(
        Effect.map((text) => text.includes("planets-2026")),
      ),
    )
    yield* untilTrue(
      "metrics",
      queryMetrics(identity, "tiles_published_total").pipe(
        Effect.map((text) => text.includes('"result":[{')),
      ),
    )
    yield* untilTrue(
      "traces",
      queryTraces(identity, "solar-worker").pipe(
        Effect.map((traces) =>
          traces.some((trace) => trace.spans.some((span) => span.name === "Tile.buildYear")),
        ),
      ),
    )
  }).pipe(
    Effect.ensuring(
      stackDown(identity).pipe(
        Effect.ignore,
        Effect.andThen(fs.remove(CHECK_TILES, { recursive: true, force: true }).pipe(Effect.ignore)),
      ),
    ),
  )
})

/** `obs up|down|check`, and `obs logs|metrics|traces <query>` for this worktree's stack. */
export const obs = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const [action = "", query = ""] = args
    if (action === "check") return yield* check
    const identity = yield* currentIdentity
    if (action === "up") return yield* stackUp(identity)
    if (action === "down") return yield* stackDown(identity)
    if (action === "logs") return yield* Console.log(yield* queryLogs(identity, query || "*"))
    if (action === "metrics") return yield* Console.log(yield* queryMetrics(identity, query))
    if (action === "traces") {
      const traces = yield* queryTraces(identity, query || "solar-worker")
      return yield* Effect.forEach(traces, (trace) => Console.log(JSON.stringify(trace)))
    }
    return yield* new HarnessFailure({
      message: `Unknown action "${action}". Use: obs up | down | check | logs <LogsQL> | metrics <PromQL> | traces <service>.`,
    })
  })
