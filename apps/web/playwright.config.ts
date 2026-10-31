import { defineConfig } from "@playwright/test"

const PORT = 4610

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
