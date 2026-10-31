import { Context, Effect, Layer } from "effect"
import { DigestError } from "../types/errors.js"

export class Digest extends Context.Service<
  Digest,
  { readonly sha256: (bytes: Uint8Array) => Effect.Effect<string, DigestError> }
>()("ephemeris/repo/Digest") {}

const toHex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("")

/** Web Crypto exists in Node and in browsers, so the worker and the page hash bytes identically. */
export const DigestWebCrypto = Layer.succeed(
  Digest,
  Digest.of({
    sha256: Effect.fn("Digest.sha256")((bytes: Uint8Array) =>
      Effect.tryPromise({
        try: () => crypto.subtle.digest("SHA-256", bytes.slice()),
        catch: (cause) => new DigestError({ reason: String(cause) }),
      }).pipe(Effect.map(toHex)),
    ),
  }),
)
