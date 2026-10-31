import { Option, Schema } from "effect"

const Env = Schema.Struct({
  VITE_TILE_BASE_URL: Schema.optional(Schema.String),
  VITE_OTLP_BASE_URL: Schema.optional(Schema.String),
  VITE_WORKTREE: Schema.optional(Schema.String),
})

export interface WebConfig {
  readonly tileBaseUrl: string
  readonly otlpBaseUrl: Option.Option<string>
  readonly worktree: string
}

/** Reads the values Vite injects at build time. With none set, tiles come from `/tiles`. */
export const readWebConfig = (env: unknown): WebConfig => {
  const decoded = Option.getOrElse(Schema.decodeUnknownOption(Env)(env), () => ({
    VITE_TILE_BASE_URL: undefined,
    VITE_OTLP_BASE_URL: undefined,
    VITE_WORKTREE: undefined,
  }))
  return {
    tileBaseUrl: decoded.VITE_TILE_BASE_URL ?? "/tiles",
    otlpBaseUrl: Option.fromNullishOr(decoded.VITE_OTLP_BASE_URL),
    worktree: decoded.VITE_WORKTREE ?? "unset",
  }
}
