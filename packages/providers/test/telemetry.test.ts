import { assert, describe, it } from "@effect/vitest"
import { Layer, Option } from "effect"
import { telemetryLayer } from "../src/index.js"

describe("telemetryLayer", () => {
  it("with no endpoint is the empty layer: production pages and CI send nothing anywhere", () => {
    const layer = telemetryLayer({ serviceName: "test", otlpBaseUrl: Option.none(), worktree: "test" })
    assert.strictEqual(layer, Layer.empty)
  })
})
