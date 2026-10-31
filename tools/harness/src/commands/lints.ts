import { Clock, Effect, DateTime, FileSystem, Option } from "effect"
import { gzipSync } from "node:zlib"
import { checkDocs, checkFreshness, isDocument } from "../rules/docs.js"
import { checkLayers } from "../rules/layers.js"
import { checkTaste } from "../rules/taste.js"
import type { Violation } from "../rules/violation.js"
import { HarnessFailure, listRepositoryFiles, readTextFiles, report, toFailure } from "./shared.js"

export const lintLayers = Effect.gen(function* () {
  const paths = yield* listRepositoryFiles
  const files = yield* readTextFiles(paths.filter((path) => path.endsWith(".ts")))
  yield* report("lint-layers", files.length, checkLayers(files))
})

export const lintTaste = Effect.gen(function* () {
  const files = yield* readTextFiles(yield* listRepositoryFiles)
  yield* report("lint-taste", files.length, checkTaste(files))
})

export const lintDocs = Effect.gen(function* () {
  const paths = yield* listRepositoryFiles
  const pages = yield* readTextFiles(paths.filter(isDocument))
  yield* report("lint-docs", pages.length, checkDocs(pages, paths))
})

const PACKAGE_DIRECTORY = /^((?:packages|apps|tools)\/[^/]+)\/package\.json$/

export const quality = Effect.gen(function* () {
  const paths = yield* listRepositoryFiles
  const pages = yield* readTextFiles(paths.filter(isDocument))
  const score = pages.find((page) => page.path === "docs/QUALITY_SCORE.md")?.text ?? ""
  const ungraded = paths
    .flatMap((path) => Option.toArray(Option.fromNullishOr(PACKAGE_DIRECTORY.exec(path)?.[1])))
    .filter((directory) => !score.includes(directory))
    .map(
      (directory): Violation => ({
        rule: "ungraded-package",
        file: "docs/QUALITY_SCORE.md",
        message: `${directory} has no grade.`,
        fix: "Add a row for it, with the gaps you know about.",
      }),
    )
  yield* report("quality", pages.length, ungraded)
})

/**
 * Whether anyone has re-checked the design documents lately. This depends on the date and not on a
 * change, so it runs on a schedule and never in a pull request: a contributor's green branch must not
 * turn red because a maintainer's calendar ran out.
 */
export const lintFreshness = Effect.gen(function* () {
  const paths = yield* listRepositoryFiles
  const pages = yield* readTextFiles(paths.filter(isDocument))
  const millis = yield* Clock.currentTimeMillis
  const today = DateTime.formatIso(DateTime.makeUnsafe(millis)).slice(0, 10)
  yield* report("lint-freshness", pages.length, checkFreshness(pages, today))
})

/** Three.js is most of this. Growth past the budget should be a decision, not an accident. */
const BUNDLE_BUDGET_KIB = 240
const ASSETS = "apps/web/dist/assets"

export const budget = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const names = yield* fs.readDirectory(ASSETS).pipe(Effect.mapError(toFailure))
  const sizes = yield* Effect.forEach(
    names.filter((name) => name.endsWith(".js")),
    (name) =>
      fs.readFile(`${ASSETS}/${name}`).pipe(
        Effect.map((bytes) => gzipSync(bytes).byteLength),
        Effect.mapError(toFailure),
      ),
  )
  const kib = sizes.reduce((sum, size) => sum + size, 0) / 1024
  yield* Effect.logInfo(`budget: ${kib.toFixed(1)} KiB of JavaScript, gzipped; limit ${String(BUNDLE_BUDGET_KIB)} KiB`)
  if (kib > BUNDLE_BUDGET_KIB) {
    return yield* new HarnessFailure({
      message: `The page ships ${kib.toFixed(1)} KiB of gzipped JavaScript, over the ${String(BUNDLE_BUDGET_KIB)} KiB budget. Remove what grew, or raise the budget in a decision log with the reason.`,
    })
  }
})
