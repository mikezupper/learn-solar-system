---
name: read-telemetry
description: Query this worktree's logs, metrics and traces to see what a change did. Use to debug the worker or the page, or to check a timing claim.
---

# Read telemetry

Run `pnpm dev` or `pnpm obs:up` first. Each worktree has its own stack, so these queries see only your work.

```sh
pnpm obs:logs '{service.name="solar-worker"} "tile published" | fields _time, _msg | limit 5'
pnpm obs:metrics 'tile_build_count'
pnpm obs:metrics 'frame_ms_count{service.name="solar-web"}'
pnpm obs:traces solar-web
pnpm obs:traces solar-worker
```

- **Logs** use LogsQL, and **metrics** use PromQL. Traces print one JSON line per trace, with each span's
  name and duration.
- **Services:** `solar-worker` and `solar-web`. A browser's telemetry arrives only through `pnpm dev`, and it
  flushes every few seconds.
- **Metrics:** [docs/generated/instruments.md](../../docs/generated/instruments.md) lists every one. Effect
  adds a time-unit attribute to timers; here, `tile_build` is in milliseconds.
- **Spans** come from `Effect.fn("Name")`. Add one by naming the function, and nothing else is needed.

If a query comes back empty, run `pnpm obs:check`. It starts its own stack and proves all three signals
reach their stores. Stop with `pnpm obs:down`, or `pnpm dev:stop` if `pnpm dev` started the stack.
