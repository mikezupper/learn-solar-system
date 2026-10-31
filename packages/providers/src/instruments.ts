import { Metric } from "effect"

/**
 * Every metric the system records, in one place, so docs/RELIABILITY.md and a PromQL query can name
 * them with confidence. Effect turns the camelCase keys' string names into OTLP metric names.
 */
export const Instruments = {
  tileBuildDuration: Metric.timer("tile_build"),
  tilesPublished: Metric.counter("tiles_published_total", { incremental: true }),
  tilesRejected: Metric.counter("tiles_rejected_total", { incremental: true }),
  frameDuration: Metric.histogram("frame_ms", {
    boundaries: Metric.linearBoundaries({ start: 2, width: 2, count: 16 }),
  }),
} as const
