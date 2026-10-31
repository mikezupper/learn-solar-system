import { Config } from "effect"

/** Every setting the worker reads. Each worktree points these at its own directories. */
export const WorkerConfig = {
  tileStoreDir: Config.String("TILE_STORE_DIR").pipe(Config.withDefault(".harness/tiles")),
  home: Config.String("HOME"),
  kernelCacheDir: Config.option(Config.String("KERNEL_CACHE_DIR")),
  lockFile: Config.String("KERNEL_LOCK_FILE").pipe(Config.withDefault("data/kernels.lock.json")),
  /** Calendar years to publish. Long enough that a learner can watch Saturn go around twice. */
  years: Config.String("TILE_YEARS").pipe(Config.withDefault("2000-2050")),
  otlpBaseUrl: Config.option(Config.String("OTEL_EXPORTER_OTLP_ENDPOINT")),
  worktree: Config.String("HARNESS_WORKTREE").pipe(Config.withDefault("unset")),
}
