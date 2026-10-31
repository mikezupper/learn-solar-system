import { NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"
import { WorkerConfig } from "./config/index.js"
import { WorkerLayer } from "./runtime/worker-layer.js"
import { buildCatalog, parseYears } from "./service/build-catalog.js"

const program = Effect.gen(function* () {
  const lockFile = yield* WorkerConfig.lockFile
  const years = parseYears(yield* WorkerConfig.years)
  const entries = yield* buildCatalog({ lockFile, years })
  yield* Effect.logInfo("catalog ready", { tiles: entries.map((entry) => entry.id) })
})

NodeRuntime.runMain(program.pipe(Effect.provide(WorkerLayer)))
