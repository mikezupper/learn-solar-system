import { defineConfig } from "vitest/config"

/**
 * Three projects, split by what each needs from the outside world:
 * - unit: nothing. No network, no browser, no kernel. Runs on every change.
 * - browser: Chromium. Gyral elements in a real DOM.
 * - kernel: the real JPL kernel, downloaded once into a shared cache.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: [
            "packages/*/test/**/*.test.ts",
            "apps/*/test/**/*.test.ts",
            "tools/*/test/**/*.test.ts",
          ],
          exclude: ["**/*.browser.test.ts", "**/*.kernel.test.ts"],
        },
      },
      {
        test: {
          name: "kernel",
          environment: "node",
          include: ["apps/worker/test/**/*.kernel.test.ts"],
          testTimeout: 300_000,
        },
      },
      "apps/web/vitest.browser.config.ts",
    ],
    coverage: {
      provider: "v8",
      include: [
        "packages/*/src/**/*.ts",
        "apps/worker/src/**/*.ts",
        "apps/web/src/**/*.ts",
        "tools/harness/src/**/*.ts",
      ],
      // Entry points and the WebGL stage only run in a browser or against real services.
      // Their behaviour is pinned by the e2e suite. docs/QUALITY_SCORE.md tracks the gap.
      exclude: [
        "**/index.ts",
        "**/main.ts",
        "apps/web/src/ui/stage.ts",
        "apps/web/src/ui/stage-scene.ts",
        "apps/web/src/runtime/**",
        "apps/worker/src/runtime/**",
        "tools/harness/src/commands/**",
      ],
      thresholds: { lines: 85 },
      reporter: ["text-summary", "json-summary"],
    },
  },
})
