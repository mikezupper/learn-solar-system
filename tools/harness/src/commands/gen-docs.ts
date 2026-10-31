import { Console, Effect, FileSystem, Schema } from "effect"
import {
  renderGeneratedIndex,
  renderInstruments,
  renderSkills,
  renderWorkspace,
  type WorkspacePackage,
} from "../generate.js"
import { capture, HarnessFailure, listRepositoryFiles, toFailure } from "./shared.js"

const OUTPUT = "docs/generated"
const PackageJson = Schema.fromJsonString(
  Schema.Struct({
    name: Schema.String,
    dependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  }),
)

const layerCounts = (directory: string, paths: ReadonlyArray<string>) => {
  const prefix = `${directory}/src/`
  const counts = paths
    .filter((path) => path.startsWith(prefix) && path.endsWith(".ts"))
    .map((path) => path.slice(prefix.length).split("/"))
    .reduce<Readonly<Record<string, number>>>((tally, parts) => {
      const layer = parts.length > 1 ? (parts[0] ?? "src") : "entry"
      return { ...tally, [layer]: (tally[layer] ?? 0) + 1 }
    }, {})
  return Object.entries(counts).map(([layer, files]) => ({ layer, files }))
}

const SUBMODULE = /^160000 ([0-9a-f]+) \d+\t(.+)$/

const expectedDocuments = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const paths = yield* listRepositoryFiles
  const manifests = paths.filter((path) => /^(packages|apps|tools)\/[^/]+\/package\.json$/.test(path))
  const packages = yield* Effect.forEach(manifests, (manifest) =>
    fs.readFileString(manifest).pipe(
      Effect.flatMap(Schema.decodeEffect(PackageJson)),
      Effect.map((parsed): WorkspacePackage => {
        const directory = manifest.replace("/package.json", "")
        return {
          name: parsed.name,
          path: directory,
          dependencies: Object.keys(parsed.dependencies ?? {}),
          layers: layerCounts(directory, paths),
        }
      }),
      Effect.mapError(toFailure),
    ),
  )
  const stage = yield* capture("git", ["ls-files", "-s", "skills"])
  const skills = stage.split("\n").flatMap((line) => {
    const [, commit, path] = SUBMODULE.exec(line) ?? []
    return commit === undefined || path === undefined ? [] : [{ path, commit: commit.slice(0, 12) }]
  })
  const instruments = yield* fs
    .readFileString("packages/providers/src/instruments.ts")
    .pipe(Effect.mapError(toFailure))
  return [
    ["index.md", renderGeneratedIndex()],
    ["workspace.md", renderWorkspace(packages)],
    ["skills.md", renderSkills(skills)],
    ["instruments.md", renderInstruments(instruments)],
  ] as const
})

/** Writes the generated documents, or with --check reports any that differ from the code. */
export const genDocs = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const documents = yield* expectedDocuments
    if (!args.includes("--check")) {
      yield* Effect.forEach(documents, ([name, text]) =>
        fs.writeFileString(`${OUTPUT}/${name}`, text).pipe(Effect.mapError(toFailure)),
      )
      yield* Console.log(`gen-docs: wrote ${String(documents.length)} files to ${OUTPUT}`)
      return
    }
    const drifted = yield* Effect.filter(documents, ([name, text]) =>
      fs.readFileString(`${OUTPUT}/${name}`).pipe(
        Effect.map((current) => current !== text),
        Effect.orElseSucceed(() => true),
      ),
    )
    if (drifted.length > 0) {
      return yield* new HarnessFailure({
        message: `gen-docs: ${drifted.map(([name]) => name).join(", ")} differ from the code. Run pnpm gen-docs and commit the result.`,
      })
    }
    yield* Console.log(`gen-docs: ok (${String(documents.length)} files)`)
  })
