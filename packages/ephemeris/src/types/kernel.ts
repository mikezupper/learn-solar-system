import type { Effect } from "effect"
import type { KernelReadError } from "./errors.js"

/** Random access to a kernel file. Byte ranges matter because the kernels with moons exceed 1 GB. */
export interface RangeReader {
  readonly read: (offset: number, length: number) => Effect.Effect<Uint8Array, KernelReadError>
}
