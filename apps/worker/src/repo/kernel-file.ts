import { createHash } from "node:crypto"
import { Effect, FileSystem, Layer, Option, Path, Stream } from "effect"
import { HttpClient } from "effect/http"
import { KernelSource } from "@solar/ephemeris/repo"
import { KernelReadError, type KernelPin, type RangeReader } from "@solar/ephemeris/types"

/**
 * Keeps pinned kernels in a directory that every worktree shares, so a new worktree does not download
 * 33 MB. A file enters the cache only after its hash matches the pin, and a rename makes that entry
 * atomic. The hash is checked on every open, because the file is the system of record for every tile.
 */
export const kernelSourceFile = (options: { readonly cacheDir: string }) =>
  Layer.effect(
    KernelSource,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk)

      const fail = (pin: KernelPin) => (cause: unknown) =>
        new KernelReadError({ path: pin.name, reason: String(cause) })

      const sha256Of = (file: string, pin: KernelPin) =>
        Effect.suspend(() => {
          const hash = createHash("sha256")
          return fs.stream(file).pipe(
            Stream.runForEach((chunk) => Effect.sync(() => hash.update(chunk))),
            Effect.map(() => hash.digest("hex")),
            Effect.mapError(fail(pin)),
          )
        })

      /**
       * Each download works in its own directory, inside the cache so that the rename stays atomic. Two
       * worktrees starting at once therefore cannot overwrite or move each other's partial file: each
       * checks its own bytes, and the last rename replaces a file with the same verified contents.
       */
      const download = Effect.fn("KernelSource.download")(function* (pin: KernelPin, target: string) {
        const workspace = yield* fs
          .makeTempDirectory({ directory: path.dirname(target), prefix: `${pin.name}.partial-` })
          .pipe(Effect.mapError(fail(pin)))
        const partial = path.join(workspace, pin.name)
        yield* Effect.gen(function* () {
          yield* Effect.logInfo("downloading kernel", { kernel: pin.name, url: pin.url })
          const response = yield* client.get(pin.url).pipe(Effect.mapError(fail(pin)))
          yield* response.stream.pipe(Stream.run(fs.sink(partial)), Effect.mapError(fail(pin)))
          const actual = yield* sha256Of(partial, pin)
          if (actual !== pin.sha256) {
            return yield* new KernelReadError({
              path: pin.name,
              reason: `Expected SHA-256 ${pin.sha256}, downloaded ${actual}. Update data/kernels.lock.json only after reading why the file changed.`,
            })
          }
          yield* fs.rename(partial, target).pipe(Effect.mapError(fail(pin)))
        }).pipe(Effect.ensuring(fs.remove(workspace, { recursive: true, force: true }).pipe(Effect.ignore)))
      })

      const isIntact = (file: string, pin: KernelPin) =>
        fs.exists(file).pipe(
          Effect.mapError(fail(pin)),
          Effect.flatMap((exists) =>
            exists
              ? sha256Of(file, pin).pipe(Effect.map((actual) => actual === pin.sha256))
              : Effect.succeed(false),
          ),
        )

      return KernelSource.of({
        open: Effect.fn("KernelSource.open")(function* (pin: KernelPin) {
          yield* fs.makeDirectory(options.cacheDir, { recursive: true }).pipe(Effect.mapError(fail(pin)))
          const file = path.join(options.cacheDir, pin.name)
          if (!(yield* isIntact(file, pin))) yield* download(pin, file)
          const handle = yield* fs.open(file).pipe(Effect.mapError(fail(pin)))
          const read: RangeReader["read"] = (offset, length) =>
            handle.seek(BigInt(offset), "start").pipe(
              Effect.flatMap(() => handle.readAlloc(length)),
              Effect.map(Option.getOrElse(() => new Uint8Array(0))),
              Effect.mapError(fail(pin)),
            )
          return { read }
        }),
      })
    }),
  )
