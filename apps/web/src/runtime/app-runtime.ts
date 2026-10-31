import type { DriverList } from "@gyral/core"
import { Effect, Layer, ManagedRuntime } from "effect"
import { FetchHttpClient } from "effect/http"
import { Moment } from "@solar/classroom/types"
import { DigestWebCrypto, tileSourceHttp } from "@solar/ephemeris/repo"
import { telemetryLayer } from "@solar/providers"
import { readWebConfig } from "../config/index.js"
import { loadSky, recordFrames } from "../service/load-sky.js"
import { clockReader, frameRecorder, pageFacts, skyLoader } from "./tokens.js"

const config = readWebConfig(import.meta.env, location.origin)

/** The page's single Effect runtime. Every Effect in the browser runs through a driver below. */
const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    tileSourceHttp(config.tileBaseUrl).pipe(Layer.provide(FetchHttpClient.layer)),
    DigestWebCrypto,
    telemetryLayer({
      serviceName: "solar-web",
      otlpBaseUrl: config.otlpBaseUrl,
      worktree: config.worktree,
    }),
  ),
)

export const appDrivers: DriverList = [
  pageFacts.provide(() => ({
    linkedMoment: new URLSearchParams(location.search).get("at") ?? undefined,
    nowMillis: Date.now(),
    locale: navigator.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  })),
  clockReader.provide(() => Date.now()),
  skyLoader.provide(({ moment }, { signal }) => runtime.runPromise(loadSky(Moment(moment)), { signal })),
  frameRecorder.provide((stats) => runtime.runPromise(recordFrames(stats).pipe(Effect.as(undefined)))),
]
