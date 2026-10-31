import { Context, type Effect, type Scope } from "effect"
import type { KernelPin } from "../types/catalog.js"
import type { KernelReadError } from "../types/errors.js"
import type { RangeReader } from "../types/kernel.js"

/** Hands out a pinned kernel for reading. An implementation must refuse bytes that differ from the pin. */
export class KernelSource extends Context.Service<
  KernelSource,
  {
    readonly open: (pin: KernelPin) => Effect.Effect<RangeReader, KernelReadError, Scope.Scope>
  }
>()("ephemeris/repo/KernelSource") {}
