import { createReadStream, existsSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import type { Connect } from "vite"
import { defineConfig, type Plugin } from "vite"
import { gyral } from "@gyral/core/vite"

const repositoryRoot = resolve(import.meta.dirname, "../..")
const tileDir = resolve(repositoryRoot, process.env.TILE_STORE_DIR ?? ".harness/tiles")

/** Serves the worker's output at /tiles, with the cache rules a CDN would apply in production. */
const tileMiddleware: Connect.NextHandleFunction = (request, response, next) => {
  const name = basename(new URL(request.url ?? "/", "http://local").pathname)
  const file = join(tileDir, name)
  if (!existsSync(file)) {
    next()
    return
  }
  response.setHeader("Content-Type", name.endsWith(".json") ? "application/json" : "application/octet-stream")
  response.setHeader("Cache-Control", name === "catalog.json" ? "no-cache" : "public, max-age=31536000, immutable")
  createReadStream(file).pipe(response)
}

const serveTiles = (): Plugin => ({
  name: "solar:serve-tiles",
  configureServer: (server) => {
    server.middlewares.use("/tiles", tileMiddleware)
  },
  configurePreviewServer: (server) => {
    server.middlewares.use("/tiles", tileMiddleware)
  },
})

// In a worktree's dev server, the browser sends telemetry here to reach that worktree's collector.
const otlpTarget = process.env.HARNESS_OTLP_TARGET

export default defineConfig({
  // This app renders only in the browser, so builds leave out Gyral's hydration code.
  plugins: [gyral({ clientOnly: true }), serveTiles()],
  server:
    otlpTarget === undefined
      ? {}
      : {
          proxy: {
            "/otlp": { target: otlpTarget, rewrite: (path) => path.replace(/^\/otlp/, "") },
          },
        },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        about: resolve(import.meta.dirname, "about-the-data.html"),
      },
    },
  },
})
