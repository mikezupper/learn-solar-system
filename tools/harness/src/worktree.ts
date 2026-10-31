const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193
const PORT_SPAN = 1000

const fnv1a = (text: string): number =>
  [...text].reduce(
    (hash, character) => Math.imul(hash ^ (character.codePointAt(0) ?? 0), FNV_PRIME) >>> 0,
    FNV_OFFSET,
  )

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

/** Derives a Compose project and ports from a path, so that worktrees can run side by side. */
export const worktreeIdentity = (root: string): WorktreeIdentity => {
  const hash = fnv1a(root)
  const offset = hash % PORT_SPAN
  return {
    project: `solar-${hash.toString(16).padStart(8, "0")}`,
    ports: {
      web: 41_000 + offset,
      otlp: 42_000 + offset,
      logs: 43_000 + offset,
      metrics: 44_000 + offset,
      traces: 45_000 + offset,
    },
  }
}
