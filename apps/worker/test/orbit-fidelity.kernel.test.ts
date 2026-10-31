import { homedir } from "node:os"
import { join } from "node:path"
import { readFileSync } from "node:fs"
import { NodeHttpClient, NodeServices } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema } from "effect"
import { makeSky, orbitsAt } from "@solar/classroom/service"
import { KM_PER_AU } from "@solar/classroom/types"
import { KernelSource } from "@solar/ephemeris/repo"
import { compileTile, makeTile, readSpkSegments, tdbFromUtcMillis } from "@solar/ephemeris/service"
import { KernelLock, TdbSeconds, type Vector3Km } from "@solar/ephemeris/types"
import { kernelSourceFile } from "../src/repo/kernel-file.js"

const lock = Schema.decodeUnknownSync(KernelLock)(
  JSON.parse(readFileSync(new URL("../../../data/kernels.lock.json", import.meta.url), "utf8")),
)
const live = kernelSourceFile({
  cacheDir: join(homedir(), ".cache", "solar-system", "kernels"),
}).pipe(Layer.provide(NodeServices.layer), Layer.provide(NodeHttpClient.layerFetch))

const distanceToSegment = (p: Vector3Km, a: Vector3Km, b: Vector3Km): number => {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]] as const
  const along = (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)
  const t = Math.max(0, Math.min(1, along))
  return Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2])
}

/** Orbital periods in days, from NASA's Planetary Fact Sheet. */
const PERIOD_DAYS: Readonly<Record<string, number>> = {
  Mercury: 87.969,
  Venus: 224.701,
  Earth: 365.256,
  Mars: 686.98,
  Jupiter: 4332.59,
  Saturn: 10_759.2,
  Uranus: 30_688.5,
  Neptune: 60_182,
}

// A pixel is about 0.006 AU in the inner view and 0.12 AU with every planet in frame. The line is
// redrawn as time runs, so what shows on screen stays far closer than a whole orbit's drift allows.
const LIMIT_AU: Readonly<Record<string, number>> = {
  Mercury: 0.006,
  Venus: 0.006,
  Earth: 0.006,
  Mars: 0.006,
  Jupiter: 0.12,
  Saturn: 0.12,
  Uranus: 0.2,
  Neptune: 0.12,
}

describe("each line against JPL's real path, over one full orbit", () => {
  it.live("stays within the limit for all eight planets", () =>
    Effect.gen(function* () {
      const kernels = yield* KernelSource
      const [pin] = lock.kernels
      if (pin === undefined) return assert.fail("Missing lock entry")
      const reader = yield* kernels.open(pin)
      const compiled = yield* compileTile({
        reader,
        segments: yield* readSpkSegments(reader),
        startSeconds: tdbFromUtcMillis(Date.UTC(1880, 0, 1)),
        endSeconds: tdbFromUtcMillis(Date.UTC(2140, 0, 1)),
      })
      const sky = Option.getOrThrow(makeSky(makeTile(compiled.segments, compiled.bytes)))
      const middle = tdbFromUtcMillis(Date.UTC(2026, 9, 31))
      for (const orbit of orbitsAt(sky, middle, 720)) {
        const body = sky.planets.find((planet) => planet.name === orbit.planet)
        if (body === undefined) return assert.fail(`No track for ${orbit.planet}`)
        const span = (PERIOD_DAYS[orbit.planet] ?? 0) * 86_400
        const points = orbit.pointsIcrf
        const worstKm = Math.max(
          ...Array.from({ length: 97 }, (_, step) => {
            const at = TdbSeconds(middle - span / 2 + (step / 96) * span)
            const [x, y, z] = body.track(at)
            const [sx, sy, sz] = sky.sun(at)
            const target: Vector3Km = [x - sx, y - sy, z - sz]
            return Math.min(
              ...points.map((point, index) =>
                distanceToSegment(target, point, points[(index + 1) % points.length] ?? point),
              ),
            )
          }),
        )
        assert.isBelow(worstKm / KM_PER_AU, LIMIT_AU[orbit.planet] ?? 0, orbit.planet)
      }
    }).pipe(Effect.scoped, Effect.provide(live)),
  )
})
