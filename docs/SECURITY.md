# Security

- **Status:** accepted · **Verified:** 2026-10-31

The site is static and holds no accounts and no personal data. The main risks are integrity and supply chain.

| Risk | Defense | Limit |
|---|---|---|
| A tampered kernel produces wrong tiles | SHA-256 pin in `data/kernels.lock.json`, checked on every open | Trusts the pin; review any change to it |
| A damaged tile shows wrong planets | Length and SHA-256 checked against the catalog | Catches corruption, not an attacker who controls both the catalog and the blob |
| A hostile `?at=` value | Parsed against an ISO pattern; quoted back through Gyral's escaping binding | |
| Malformed Horizons or catalog data | Decoded with `Schema` at the boundary, and rejected if it does not fit | |
| A malicious site reads the dev server through DNS rebinding | Vite answers only to localhost and the names in `ALLOWED_HOSTS` | Real names live in a `.env` that git ignores |
| Telemetry leaks data | With no endpoint nothing is sent. The dev stack binds to 127.0.0.1 only | |
| Dependencies | Exact versions, lockfile, and a build-script allowlist in `pnpm-workspace.yaml` | No automated audit yet |

No secrets exist in this repository, and none are needed to run it. `.mcp.json` names a public Gyral
endpoint and needs no token. A strict Content-Security-Policy is in the [debt tracker](exec-plans/tech-debt-tracker.md).
