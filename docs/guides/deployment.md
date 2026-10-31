# Deploying your own copy

- **Status:** accepted · **Verified:** 2026-10-31

This project has no public deployment yet, so this guide is how a copy gets online. The site is static: some HTML,
CSS and JavaScript, plus a folder of data files. It needs no server code, database, account or secret.

The steps below were rehearsed on a plain static file server, over `localhost`. No particular hosting company has
been tried.

## What a host must provide

| Requirement | Why |
|---|---|
| **The site at the root of its domain** | Links such as `/about-the-data.html` and `/?at=...` start from the root, so a subfolder such as `example.github.io/learn-solar-system/` does not work yet |
| **HTTPS** | The page checks its data with SHA-256, which browsers offer only on `https` and `localhost`. Over plain `http`, the page asks for `https` and shows no numbers |
| **Modern browsers for your visitors** | The build targets ES2022 and the view needs WebGL. Without WebGL the table still works |

## 1. Publish the data

```sh
pnpm install --frozen-lockfile
pnpm tiles:build
```

This writes to `.harness/tiles`, which Git ignores. `TILE_STORE_DIR` chooses another folder, and `TILE_YEARS` other
years, such as `2020-2030`. The first run downloads JPL's 33 MB kernel into a shared cache, and confirms it matches
the hash in `data/kernels.lock.json`. It then compiles each year, checks it against JPL Horizons, and writes it. All 51
years take about two minutes, make 459 requests to Horizons, and come to 5.4 MB. A rerun skips years it has already
published from the same kernel.

A year that disagrees with Horizons by more than 1 km stops the build and is not published. If Horizons cannot be
reached, the build stops too, because an unverified file is not a verified one. Try again later.

## 2. Build the page

```sh
pnpm build
```

The result is in `apps/web/dist`: `index.html`, `about-the-data.html`, and `assets/`.

## 3. Put them together

The page looks for its data at `/tiles`, so the simplest arrangement puts the folder beside the page:

```sh
mkdir -p apps/web/dist/tiles
cp .harness/tiles/* apps/web/dist/tiles/
```

To rehearse before uploading, serve the folder locally:

```sh
python3 -m http.server 8000 --directory apps/web/dist
```

## 4. Check it

Open `/?at=2026-08-12T17:46:00Z`, on `localhost` or your own domain. Mars's row should read **1.495** AU from the
Sun, **1.947** AU from Earth, and **16.2** minutes of light travel. If those numbers appear, the page found the data
and its hash matched. Then open the page with no `?at=` and see that it follows the clock.

## 5. Set cache headers

Most hosts have a sensible default, and the page works without any of this. These rules make it faster and keep it
correct when you publish new data. The dev server already behaves this way.

| Files | `Cache-Control` | Why |
|---|---|---|
| `tiles/catalog.json` | `no-cache` | It is the one file that changes, and a stale copy hides new years |
| `tiles/*.bin` | `public, max-age=31536000, immutable` | Each name contains its hash, so its contents never change |
| `assets/*` | `public, max-age=31536000, immutable` | Vite puts a hash in these names too |
| `*.html` | `no-cache` | They point to the current assets |

## Keeping the data on another host

To serve the data from a CDN or bucket, name its address when you build:

```sh
VITE_TILE_BASE_URL=https://tiles.example.com pnpm build
```

That address must allow the site's origin, by sending `Access-Control-Allow-Origin`. The page sends plain requests,
so nothing else is needed: no preflight rule and no extra allowed headers. Without that header, the page says that
the data could not be loaded.

## Updating the data

To add years, rerun step 1 with the new range, keeping the same store directory, and then upload. **Upload the `.bin`
files first and `catalog.json` last**, so that no visitor reads a listing with no file behind it. Do not delete old
`.bin` files, because a page already open may still ask for them.

If JPL's kernel ever changes, updating its pin in `data/kernels.lock.json` is a deliberate decision, so read why the
file changed before you do it. The worker then rebuilds every year, and replaces each catalog entry.

## Settings

Only `VITE_` settings reach the page, and they are read when you build. None is required. The
[README lists every setting](../../README.md#configuration).

The deployed page sends no telemetry unless you set `VITE_OTLP_BASE_URL` at build time. A strict
Content-Security-Policy is not in place yet, and is [in the debt tracker](../exec-plans/tech-debt-tracker.md) as work
to do before a public deployment.
