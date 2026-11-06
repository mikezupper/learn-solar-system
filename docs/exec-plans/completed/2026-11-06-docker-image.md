# A production image

## Goal

The owner wants to run the page in production from a Docker image, published to their own registry, with cache headers
that let browsers and a CDN keep everything they safely can, and an update that reaches every visitor. Done means one
script builds the image, checks every cache rule against the running container, and pushes it, and CI holds the same
checks.

## Progress

- [x] Fonts named after their contents, like every other file that can change
- [x] A Dockerfile that builds the data and the page, and serves them from nginx
- [x] An nginx config with the cache rules and security headers, checked against a running container
- [x] A Content-Security-Policy, checked in a browser
- [x] `deploy/build-image.sh`, which builds, checks and pushes
- [x] A CI job that builds the image from the fixtures and runs the same checks
- [x] Documents and guides

## Decision log

**2026-11-06. The image builds its own data.** The owner chose this over committing the tiles or downloading a release
file. BuildKit cache mounts keep the kernel and the published tiles between builds on one machine, so a rebuild asks
Horizons only about years it has not published. The data stage runs once, on the build machine's platform, whatever
platforms the image targets. CI builds from `fixtures/tiles`, so CI never calls JPL.

**2026-11-06. Fixed names revalidate, and everything else is named after its contents.** Vite names scripts and styles
after their contents, and tiles carry their hash. The fonts sat in `public/`, under fixed names, so they move into `src`
and Vite names them too. Only the two pages and `catalog.json` keep fixed names, and they are served `no-cache`, so a
browser or CDN asks every time and usually gets a 304. A new release then needs no purge.

**2026-11-06. Errors are never cached.** A 404 is served `no-store`, so that no CDN keeps a missing file.

**2026-11-06. The image is static files and nginx.** There is no Node at runtime. It runs as an unprivileged user on port
8080, and expects TLS in front of it.

**2026-11-06. Tags follow the registry's retention rules.** `sha-<commit>` and `latest`, and `vX.Y.Z` when the commit has
that tag. The registry keeps those three families. The script refuses a tree with uncommitted changes, so every image
names a real commit.

**2026-11-06. The registry's address lives in `.env`.** Real hostnames stay out of the repository.

**2026-11-06. The 3D view styles itself with a constructed stylesheet.** The browser test of the policy found that the
stage put its styles in a `<style>` element inside its shadow root, which a strict policy blocks. A constructed sheet,
shared by every stage, needs no `'unsafe-inline'`. Gyral already styles its components this way.

**2026-11-06. With no script, a stylesheet hides the buttons that drive the picture.** They had been hidden by an inline
`<style>` inside `<noscript>`, which the policy would block. `@media (scripting: none)` does the same from a stylesheet.

**2026-11-06. One report from WebKit is ignored, and only that one.** WebKit blocks an inline style inside its own parts
for every `<select>` a script creates, even on an empty page under `style-src 'self'`. The select looked identical with
and without the policy, to the pixel, and still worked. So the policy stays strict, and the browser test skips exactly
that report. Every other report fails it.

**2026-11-06. The script picks its own free port.** Rootless Docker's choice of a random port collided once with a port
already in use, so the script picks a free one and tries up to three times.
