import { defineConfig, devices } from "@playwright/test"

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
  },
  projects: [
    {
      name: "chromium",
      use: { launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } },
    },
    {
      // Most phones that reach this page run Safari, so the layouts that matter there run in its engine too.
      name: "webkit",
      testMatch: ["layered-ui.spec.ts"],
      use: { ...devices["iPhone 13 Mini"] },
    },
  ],
  webServer: {
    command: `pnpm exec vite preview --port ${String(PORT)} --strictPort`,
    port: PORT,
    reuseExistingServer: false,
    env: { TILE_STORE_DIR: "fixtures/tiles" },
  },
})
