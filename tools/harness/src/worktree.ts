const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193
const PORT_SPAN = 1000

const fnv1a = (text: string): number =>
  new TextEncoder()
    .encode(text)
    .reduce((hash, byte) => Math.imul(hash ^ byte, FNV_PRIME) >>> 0, FNV_OFFSET)

export interface WorktreeIdentity {
  readonly project: string
  readonly ports: {
    readonly web: number
    readonly otlp: number
    readonly logs: number
    readonly metrics: number
    readonly traces: number
  }
}

/**
 * Derives a Compose project and ports from a path, so that worktrees can run side by side. The ports
 * stay below 32768, where Linux would otherwise assign them to outgoing connections.
 */
export const worktreeIdentity = (root: string): WorktreeIdentity => {
  const hash = fnv1a(root)
  const offset = hash % PORT_SPAN
  return {
    project: `solar-${hash.toString(16).padStart(8, "0")}`,
    ports: {
      web: 21_000 + offset,
      otlp: 22_000 + offset,
      logs: 23_000 + offset,
      metrics: 24_000 + offset,
      traces: 25_000 + offset,
    },
  }
}
