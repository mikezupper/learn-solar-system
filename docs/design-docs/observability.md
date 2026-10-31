# Observability

- **Status:** accepted · **Verified:** 2026-10-31

Every worktree can run its own telemetry stack, as the
[harness-engineering article](../references/harness-engineering.md) describes, so that an agent can query
what its change did.

```
app (worker, browser) -- OTLP protobuf --> Vector --> VictoriaLogs     pnpm obs:logs '<LogsQL>'
                                                 --> VictoriaMetrics  pnpm obs:metrics '<PromQL>'
                                                 --> VictoriaTraces   pnpm obs:traces <service>
```

**This is more than the app needs today, by decision.** The app is a 6-second batch job and a static page.
The agent recommended cutting the stack, and the project owner chose to keep it. It earns its place as the
product grows; meanwhile, keep it cheap: no volumes, and nothing runs unless a command starts it.

**Design choices worth keeping:**

- `-search.latencyOffset=0s` on the metric and trace stores. The default hides data for 30 seconds, which
  makes an agent's own run look like it recorded nothing.
- `pnpm obs:check` runs the real worker on separate ports and waits for all three signals to become
  queryable. An empty store fails the check.
- Ports derive from the worktree's path and stay below 32768, Linux's ephemeral range.
- The browser reaches the collector through the Vite dev server's `/otlp` proxy, which avoids CORS.
- Without an endpoint, `telemetryLayer` is the empty layer: production pages and CI's unit tests send
  nothing.
