# Deploying your own copy

- **Status:** accepted · **Verified:** 2026-11-06

This project has no public deployment yet, so this guide is how a copy gets online. The site is static: some HTML,
CSS and JavaScript, plus a folder of data files. It needs no server code, database, account or secret.

There are two ways to run it. [The Docker image](#the-docker-image) holds the page, the data and every rule below, and
is checked against a running container before it is pushed. [Any static host](#on-a-static-host) works too, with the
same rules set by hand. The image was rehearsed on this machine and in CI, and has run behind Cloudflare. The static
steps were rehearsed on a plain static file server, over `localhost`. No static hosting company has been tried.

## What a host must provide

| Requirement | Why |
|---|---|
| **The site at the root of its domain** | Links such as `/about-the-data.html` and `/?at=...` start from the root, so a subfolder such as `example.github.io/learn-solar-system/` does not work yet |
| **HTTPS** | The page checks its data with SHA-256, which browsers offer only on `https` and `localhost`. Over plain `http`, the page asks for `https` and shows no numbers |
| **Modern browsers for your visitors** | The build targets ES2022 and the view needs WebGL. Without WebGL the table still works |

## The Docker image

[`deploy/build-image.sh`](../../deploy/build-image.sh) builds an nginx image that holds the page and the data. It runs
as an unprivileged user on port 8080, with no Node at runtime, and expects HTTPS to end in front of it: at a reverse
proxy, a load balancer or a CDN.

```sh
cp .env.example .env             # then set IMAGE_REGISTRY and IMAGE_NAMESPACE
deploy/build-image.sh            # build for this machine, run it, and check every rule
deploy/build-image.sh --push     # then build linux/amd64 and linux/arm64, and push them
```

The script needs Docker with buildx, and a working tree with nothing uncommitted, because each image names its
commit. It pushes three kinds of tags: `sha-<commit>`, `latest`, and `vX.Y.Z` when the commit carries that git tag.
Before anything is pushed, [`deploy/check-image.sh`](../../deploy/check-image.sh) checks every cache rule in the table
below against the running container. It also checks the security headers, that a year of data arrives with the
SHA-256 its catalog states, and that the pages and the catalog revalidate: a copy still current costs a 304, and a copy
from any other release, even a later one after a rollback, gets the file again. `/healthz` answers the container's
health check.

**The data is built inside the image.** The first build downloads JPL's 33 MB kernel and asks Horizons 459 questions,
as in [step 1](#1-publish-the-data). The script's builder, `learn-solar-system`, keeps both in its cache, so a later
build asks only about years it has not published. Pruning that builder's cache, or building on a new machine, starts
again from nothing. CI builds the image from the two years in `fixtures/tiles` instead, so CI never calls JPL.

### Releasing an update

1. Commit, then run `deploy/build-image.sh --push`.
2. Replace the running container with the new `sha-<commit>` tag.
3. There is nothing to purge. Pages and the catalog are checked on every request, so the next load gets the new page,
   which names the new files.

A page that is loading at the moment of the swap can fail once, and a reload fixes it. For the same reason, do not run
two releases side by side behind one load balancer: a page from one could ask the other for a file it does not have.
To roll back, run the previous `sha-` tag.

### In front of the image

- **A CDN** should follow the `Cache-Control` the image sends. A rule that caches pages with a lifetime of its own, such as
  a "cache everything" rule, would keep serving an old page after a release.
- **A rate limit** must allow for a classroom. A whole class usually shares one public address, and running time at a
  year per second costs each student about two small requests a second.
- **HSTS** is already sent, without `includeSubDomains`, because other names on the same domain are not this site's to
  decide for.

### With Docker Compose

[`deploy/compose.yaml`](../../deploy/compose.yaml) runs the image on one server, read-only and with no Linux
capabilities. It runs the site only: HTTPS, and any CDN, stay with whatever is in front of it, such as a reverse proxy
or a Cloudflare Tunnel run separately. The site answers plain HTTP on `127.0.0.1:8080`, so nothing else on the network
reaches it. `SITE_ADDRESS` and `SITE_PORT` in `.env` change that.

1. On the server, put `compose.yaml` and `.env.example` in one folder, and copy `.env.example` to `.env`.
2. In `.env`, fill in the image's pull address and the tag, and a port if `8080` is taken.
3. Run `docker compose up -d`. Then `curl -I http://127.0.0.1:8080/` should answer `200 OK`.
4. Send the proxy's or tunnel's traffic for the site's name to `http://127.0.0.1:8080`. For a Cloudflare Tunnel, that
   is a public hostname with the service type `HTTP` and the URL `127.0.0.1:8080`. A `cloudflared` or proxy that runs in
   a container needs `network_mode: host` to reach it, since a container's own `127.0.0.1` is not the server's.
5. From any machine, run `deploy/check-image.sh https://<the site's name>`. It runs every check through what is in
   front, so it also catches a setting there that rewrites the site's headers.

To release, set `IMAGE_TAG` in `.env` to the new `sha-` tag, or leave it at `latest`, and run
`docker compose pull && docker compose up -d`. A rollback is the previous tag. While the container is replaced, for a
second or two, whatever is in front answers with an error page.

Behind Cloudflare, set these for the site's hostname:

- **Always Use HTTPS** on, because the page shows no numbers over plain HTTP.
- **Browser Cache TTL** at "Respect Existing Headers", so that Cloudflare passes the site's `Cache-Control` on unchanged.
- **No Cache Rule for pages.** By default Cloudflare caches the year-long files and passes pages and the catalog through,
  which is what this site wants. A "cache everything" rule would keep serving an old page after a release.
- **Rocket Loader off, and Web Analytics' automatic setup off.** Both add scripts that the page's Content-Security-Policy
  blocks: Rocket Loader would break the page, and the analytics would never load.

Cloudflare may drop the ETag from the two pages, though not from the catalog. It does that while a feature that rewrites
HTML is on, even one that finds nothing to change, such as Email Address Obfuscation or Automatic HTTPS Rewrites. The
pages then revalidate with `Last-Modified` alone, which costs the same 304, and `check-image.sh` reports the missing
ETag as a note rather than a failure. The site has no email addresses or `http://` links for either feature to change.

The compose file was tested on this machine, where the site starts read-only and healthy and passes every check on
`127.0.0.1`. It has also run behind a Cloudflare Tunnel, where every check passed through Cloudflare's edge.

## On a static host

### 1. Publish the data

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

### 2. Build the page

```sh
pnpm build
```

The result is in `apps/web/dist`: `index.html`, `about-the-data.html`, `assets/`, and the fonts' licenses in `fonts/`.

### 3. Put them together

The page looks for its data at `/tiles`, so the simplest arrangement puts the folder beside the page:

```sh
mkdir -p apps/web/dist/tiles
cp .harness/tiles/* apps/web/dist/tiles/
```

To rehearse before uploading, serve the folder locally:

```sh
python3 -m http.server 8000 --directory apps/web/dist
```

### 4. Check it

Open `/?at=2026-08-12T17:46:00Z`, on `localhost` or your own domain. Mars's row should read **1.495** AU from the
Sun, **1.947** AU from Earth, and **16.2** minutes of light travel. If those numbers appear, the page found the data
and its hash matched. Then open the page with no `?at=` and see that it follows the clock.

### 5. Set cache headers

The Docker image sends these already, from [`deploy/nginx.conf`](../../deploy/nginx.conf). On another host the page
works without them, but they make it faster and keep it correct when you publish something new.

| Files | `Cache-Control` | Why |
|---|---|---|
| `*.html`, `tiles/catalog.json` | `no-cache` | The only files with fixed names that change. A browser or CDN asks every time, and an unchanged file costs a 304 |
| `assets/*`, `tiles/*.bin` | `public, max-age=31536000, immutable` | Each name contains a hash of the contents: Vite's for scripts, styles and fonts, the worker's for data. A changed file gets a new name |
| Anything else, such as `fonts/OFL-*.txt` | `public, max-age=3600` | They rarely change |
| Errors | `no-store` | So that no cache keeps a file that was missing only for a moment |

Every file that can change between releases is named after its contents, except the two pages and the catalog. So a
release needs no purge: the next request for a page gets the new one, and it names the new files.

## Keeping the data on another host

To serve the data from a CDN or bucket, name its address when you build:

```sh
VITE_TILE_BASE_URL=https://tiles.example.com pnpm build
```

That address must allow the site's origin, by sending `Access-Control-Allow-Origin`. The page sends plain requests,
so nothing else is needed: no preflight rule and no extra allowed headers. Without that header, the page says that
the data could not be loaded. The image's Content-Security-Policy allows data from its own origin only, so this
arrangement also needs that address in `connect-src`.

## Updating the data

To add years, rerun step 1 with the new range, keeping the same store directory, and then upload. **Upload the `.bin`
files first and `catalog.json` last**, so that no visitor reads a listing with no file behind it. Do not delete old
`.bin` files, because a page already open may still ask for them. The Docker image does this for you: set `TILE_YEARS`
and run the script again.

If JPL's kernel ever changes, updating its pin in `data/kernels.lock.json` is a deliberate decision, so read why the
file changed before you do it. The worker then rebuilds every year, and replaces each catalog entry.

## Settings

Only `VITE_` settings reach the page, and they are read when you build. None is required. The
[README lists every setting](../../README.md#configuration).

The deployed page sends no telemetry unless you set `VITE_OTLP_BASE_URL` at build time. The image sends a strict
Content-Security-Policy, which allows scripts, styles, fonts and data from the site's own origin only. A browser test
in CI fails if the page breaks it. On another host, copy the headers from `deploy/nginx.conf`.
