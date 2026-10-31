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

/**
 * Reads the values Vite injects at build time. With none set, tiles come from `/tiles`. A telemetry
 * path is resolved against `origin`, because the page may be reached by any name.
 */
export const readWebConfig = (env: unknown, origin: string): WebConfig => {
  const decoded = Option.getOrElse(Schema.decodeUnknownOption(Env)(env), () => ({
    VITE_TILE_BASE_URL: undefined,
    VITE_OTLP_BASE_URL: undefined,
    VITE_WORKTREE: undefined,
  }))
  return {
    tileBaseUrl: decoded.VITE_TILE_BASE_URL ?? "/tiles",
    otlpBaseUrl: Option.map(Option.fromNullishOr(decoded.VITE_OTLP_BASE_URL), (url) => new URL(url, origin).href),
    worktree: decoded.VITE_WORKTREE ?? "unset",
  }
}
