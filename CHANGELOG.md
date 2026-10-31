# Changelog

This file records notable changes, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project
has no releases yet, so everything sits under Unreleased.

## [Unreleased]

### Added

- A page showing the Sun and eight planets at their true positions and true scale, in a 3D view and a table of
  distances and light travel times, calculated from NASA JPL's DE440 data.
- Time running at four speeds, a framing for the inner planets, and links that hold one moment for a whole class.
- A line for each planet showing the path it is following around the Sun.
- A full explanation on the main page: what it does, how to use it, how it works and the science behind it, which
  reads without JavaScript and survives a failure to load the data. Tests hold its numbers against JPL's data.
- A worker that compiles one year of data at a time, checks it against JPL Horizons, and publishes it. Planet data
  covers 2000 through 2050.
- The harness: custom lints, generated documents, a per-worktree dev environment, and a telemetry stack.
- `pnpm dev:quick`, which runs the page on real data with no Docker or downloads.
- An MIT license, contributor and teacher guides, a deployment guide, issue and pull-request templates, and CI.

### Fixed

- Tiles can now load from a host on another origin. Trace headers on those requests had triggered a CORS preflight
  that an ordinary static host refuses.
- Two downloads of the kernel can now run at once. They had shared one partial file, so on an empty cache the second
  could fail.
