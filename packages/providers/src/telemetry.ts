import { Layer, Option } from "effect"
import { FetchHttpClient } from "effect/http"
import { Otlp } from "effect/observability"

/**
 * The one place telemetry leaves the process. With no endpoint it does nothing, so production pages
 * and CI send nothing anywhere. Spans come from `Effect.fn`; logs and metrics from Effect itself.
 */
export const telemetryLayer = (options: {
  readonly serviceName: string
  readonly otlpBaseUrl: Option.Option<string>
  readonly worktree: string
}) =>
  Option.match(options.otlpBaseUrl, {
    onNone: () => Layer.empty,
    onSome: (baseUrl) =>
      Otlp.layerProtobuf({
        baseUrl,
        resource: {
          serviceName: options.serviceName,
          attributes: { "harness.worktree": options.worktree },
        },
      }).pipe(Layer.provide(FetchHttpClient.layer)),
  })
