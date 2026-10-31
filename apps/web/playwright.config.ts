import { defineConfig } from "@playwright/test"

/** Derived from the checkout's path, so that two worktrees can run this suite at the same time. */
const PORT =
  4600 + new TextEncoder().encode(import.meta.dirname).reduce((sum, byte) => sum + byte, 0) % 800

export default defineConfig({
  testDir: "e2e",
  forbidOnly: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    timezoneId: "UTC",
    locale: "en-US",
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
  webServer: {
    command: `pnpm exec vite preview --port ${String(PORT)} --strictPort`,
    port: PORT,
    reuseExistingServer: false,
    env: { TILE_STORE_DIR: "fixtures/tiles" },
  },
})
