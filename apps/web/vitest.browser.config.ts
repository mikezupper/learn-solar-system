import { gyral } from "@gyral/core/vite"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [gyral({ clientOnly: true, optimize: "auto" })],
  test: {
    name: "browser",
    include: ["test/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
})
