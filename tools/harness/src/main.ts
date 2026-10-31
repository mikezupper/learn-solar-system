import { NodeHttpClient, NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { dev, stop, where } from "./commands/dev.js"
import { genDocs } from "./commands/gen-docs.js"
import { budget, lintDocs, lintLayers, lintTaste, quality } from "./commands/lints.js"
import { obs } from "./commands/obs.js"
import { HarnessFailure } from "./commands/shared.js"

const [command = "", ...args] = process.argv.slice(2)

const program = Effect.suspend(() => {
  switch (command) {
    case "lint-layers":
      return lintLayers
    case "lint-docs":
      return lintDocs
    case "lint-taste":
      return lintTaste
    case "quality":
      return quality
    case "budget":
      return budget
    case "gen-docs":
      return genDocs(args)
    case "obs":
      return obs(args)
    case "dev":
      return dev
    case "stop":
      return stop
    case "where":
      return where
    default:
      return Effect.fail(
        new HarnessFailure({
          message: `Unknown command "${command}". Use: lint-layers, lint-docs, lint-taste, quality, budget, gen-docs, obs, dev, stop, where.`,
        }),
      )
  }
})

const Live = Layer.mergeAll(NodeServices.layer, NodeHttpClient.layerFetch)

NodeRuntime.runMain(program.pipe(Effect.provide(Live)))
