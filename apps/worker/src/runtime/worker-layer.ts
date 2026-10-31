import { NodeHttpClient, NodeServices } from "@effect/platform-node"
import { Effect, Layer, Option, Path } from "effect"
import { DigestWebCrypto, HorizonsHttp } from "@solar/ephemeris/repo"
import { telemetryLayer } from "@solar/providers"
import { WorkerConfig } from "../config/index.js"
import { kernelSourceFile } from "../repo/kernel-file.js"
import { tileStoreFile } from "../repo/tile-store-file.js"

/** Wires every live implementation the worker uses. `main.ts` is the only caller. */
export const WorkerLayer = Layer.unwrap(
  Effect.gen(function* () {
    const path = yield* Path.Path
    const home = yield* WorkerConfig.home
    const cacheDir = Option.getOrElse(yield* WorkerConfig.kernelCacheDir, () =>
      path.join(home, ".cache", "solar-system", "kernels"),
    )
    const dir = yield* WorkerConfig.tileStoreDir
    const telemetry = telemetryLayer({
      serviceName: "solar-worker",
      otlpBaseUrl: yield* WorkerConfig.otlpBaseUrl,
      worktree: yield* WorkerConfig.worktree,
    })
    return Layer.mergeAll(
      kernelSourceFile({ cacheDir }),
      tileStoreFile({ dir }),
      HorizonsHttp,
      DigestWebCrypto,
      telemetry,
    )
  }),
).pipe(Layer.provideMerge(NodeServices.layer), Layer.provideMerge(NodeHttpClient.layerFetch))
