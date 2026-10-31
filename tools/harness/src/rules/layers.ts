import { dirname, join, normalize } from "node:path/posix"
import { Array, Match, Option, pipe } from "effect"
import ts from "typescript"
import type { TextFile, Violation } from "./violation.js"

/**
 * The architecture, as data. Code depends only on earlier layers; cross-cutting concerns enter through
 * `providers`. ARCHITECTURE.md explains why, and docs/generated/workspace.md shows the current shape.
 */
const LAYERS = ["types", "config", "repo", "providers", "service", "runtime", "ui"] as const
type Layer = (typeof LAYERS)[number] | "entry"

const PACKAGE_EDGES: Readonly<Record<string, ReadonlyArray<string>>> = {
  "@solar/providers": [],
  "@solar/ephemeris": ["@solar/providers"],
  "@solar/classroom": ["@solar/ephemeris"],
  "@solar/worker": ["@solar/ephemeris", "@solar/providers"],
  "@solar/web": ["@solar/classroom", "@solar/ephemeris", "@solar/providers"],
}

/** Imports that only certain files may use: each entry states who, and why. */
const RESTRICTED: ReadonlyArray<{
  readonly matches: RegExp
  readonly allowedIn: RegExp
  readonly why: string
}> = [
  {
    matches: /^(node:|@effect\/platform-node)/,
    allowedIn: /^apps\/worker\//,
    why: "Node APIs would break in the browser; only the worker runs on Node",
  },
  {
    matches: /^three(\/|$)/,
    allowedIn: /^apps\/web\/src\/ui\/stage\.ts$/,
    why: "the WebGL stage owns Three.js, so nothing else needs a GPU to run or test",
  },
  {
    matches: /^@gyral\//,
    allowedIn: /^apps\/web\/src\/(ui\/|runtime\/|main\.ts$)/,
    why: "the domain stays free of any view framework",
  },
  {
    matches: /^effect\/http/,
    allowedIn: /(^packages\/[^/]+\/src\/repo\/)|(^apps\/[^/]+\/src\/(repo|runtime)\/)|(^packages\/providers\/)/,
    why: "network access belongs behind a repo port",
  },
  {
    matches: /^effect\/observability/,
    allowedIn: /^packages\/providers\//,
    why: "telemetry leaves the process in exactly one place",
  },
]

interface Location {
  readonly packageName: string
  readonly layer: Layer
}

const isLayer = (segment: string): segment is (typeof LAYERS)[number] =>
  LAYERS.some((layer) => layer === segment)

const locate = (path: string): Option.Option<Location | { readonly unknownLayer: string }> => {
  const match = /^(?:packages|apps)\/([^/]+)\/src\/(.+)$/.exec(path)
  const name = match?.[1]
  const rest = match?.[2]
  if (name === undefined || rest === undefined) return Option.none()
  const packageName = `@solar/${name}`
  if (name === "providers") return Option.some({ packageName, layer: "providers" })
  const [first = "", ...others] = rest.split("/")
  if (others.length === 0) return Option.some({ packageName, layer: "entry" })
  return Option.some(isLayer(first) ? { packageName, layer: first } : { unknownLayer: first })
}

const rank = (layer: Layer): number => (layer === "entry" ? LAYERS.length : LAYERS.indexOf(layer))

const directionViolation = (file: string, from: Layer, to: Layer, specifier: string): Violation => ({
  rule: "layer-direction",
  file,
  message: `${from} may not import ${to} (through "${specifier}"). Layers run ${LAYERS.join(" -> ")}, and code depends only on earlier ones.`,
  fix: `Move what both need down to an earlier layer, or move this code up to ${to}. Do not add an exception.`,
})

const checkRelative = (file: string, from: Location, specifier: string): ReadonlyArray<Violation> => {
  const target = locate(normalize(join(dirname(file), specifier)))
  if (Option.isNone(target) || "unknownLayer" in target.value) return []
  const to = target.value.layer
  return rank(to) > rank(from.layer) || (to === "entry" && from.layer !== "entry")
    ? [directionViolation(file, from.layer, to, specifier)]
    : []
}

const checkPackage = (file: string, from: Location, specifier: string): ReadonlyArray<Violation> => {
  const [scope = "", name = "", layer] = specifier.split("/")
  const target = `${scope}/${name}`
  if (!(PACKAGE_EDGES[from.packageName] ?? []).includes(target)) {
    return [
      {
        rule: "package-direction",
        file,
        message: `${from.packageName} may not depend on ${target}.`,
        fix: `Keep the dependency pointing inward: ${from.packageName} may use ${(PACKAGE_EDGES[from.packageName] ?? []).join(", ") || "nothing else"}. If the edge is truly needed, change PACKAGE_EDGES and ARCHITECTURE.md together.`,
      },
    ]
  }
  const to: Layer = name === "providers" ? "providers" : layer !== undefined && isLayer(layer) ? layer : "entry"
  return rank(to) > rank(from.layer) ? [directionViolation(file, from.layer, to, specifier)] : []
}

const checkRestricted = (file: string, specifier: string): ReadonlyArray<Violation> =>
  pipe(
    RESTRICTED,
    Array.filter(({ matches, allowedIn }) => matches.test(specifier) && !allowedIn.test(file)),
    Array.map(({ why }) => ({
      rule: "restricted-import",
      file,
      message: `"${specifier}" is not allowed here: ${why}.`,
      fix: "Reach it through a service or port that the right layer provides.",
    })),
  )

const importsOf = (text: string): ReadonlyArray<string> =>
  ts.preProcessFile(text, true, true).importedFiles.map((imported) => imported.fileName)

export const checkLayers = (files: ReadonlyArray<TextFile>): ReadonlyArray<Violation> =>
  files.flatMap(({ path, text }) =>
    Option.match(locate(path), {
      onNone: () => [],
      onSome: (location) =>
        Match.value(location).pipe(
          Match.when({ unknownLayer: Match.string }, ({ unknownLayer }) => [
            {
              rule: "unknown-layer",
              file: path,
              message: `"${unknownLayer}" is not a layer.`,
              fix: `Put this file in one of: ${LAYERS.join(", ")}.`,
            },
          ]),
          Match.orElse((from) =>
            importsOf(text).flatMap((specifier) => [
              ...(specifier.startsWith(".") ? checkRelative(path, from, specifier) : []),
              ...(specifier.startsWith("@solar/") ? checkPackage(path, from, specifier) : []),
              ...checkRestricted(path, specifier),
            ]),
          ),
        ),
    }),
  )
