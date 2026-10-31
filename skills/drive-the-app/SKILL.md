---
name: drive-the-app
description: Boot this worktree and see a change working in a real browser, with DOM snapshots, screenshots and console output. Use after changing the UI, to reproduce a bug, or before saying a UI change works.
---

# Drive the app

Tests prove behavior. This shows you what a learner sees, which tests cannot judge.

1. **Boot.** Run `pnpm dev` in the background. It starts a telemetry stack, builds tiles if they are
   missing, and serves the app. It needs Docker and network access to JPL.
2. **Find it.** `pnpm harness where` prints this worktree's ports as JSON. The app is at `ports.web`.
3. **Look.** With the `chrome-devtools` MCP server from `.mcp.json`: navigate, take a DOM snapshot, take a
   screenshot, list console messages. With Playwright instead, launch Chromium with
   `--use-angle=swiftshader --enable-unsafe-swiftshader` so that WebGL works headless.
4. **Pin the moment.** Open `/?at=2026-08-12T17:46:00Z` so that two runs show the same sky. Labels and dots
   live in the shadow root of `sky-stage`.
5. **Check the telemetry.** See [read-telemetry](../read-telemetry/SKILL.md).
6. **Stop.** `pnpm dev:stop`. Never kill `pnpm dev` by its PID: the signal stops pnpm alone and strands
   the containers and the web server.

Look at both a wide window and a 390 px phone. The clipped Neptune label was only visible that way.
