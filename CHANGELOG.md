# Changelog

This file records notable changes, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project
has no releases yet, so everything sits under Unreleased.

## [Unreleased]

### Added

- A page showing the Sun and eight planets at their true positions and true scale, in a 3D view and a table of
  distances and light travel times, calculated from NASA JPL's DE440 data.
- Mission Clock, a full redesign for a younger audience: a full-screen sky, a giant year, a clock in lit dots, and an accent
  color that heats up with speed. The page is now dark only.
- Time as a media player: a play button, a Right now button, a ramp of four speeds, and a timeline to drag to any date.
- A short replay of the year so far when the page opens on the present.
- Ride along, which keeps the camera beside a chosen planet.
- A labeled view with planets enlarged, so that their sizes can be compared, including Saturn's rings at their true tilt.
- Trails behind moving planets, a ring that flies in to the inner planets, and a drawn path for a planet's light.
- Keyboard control of the picture: arrow keys turn it, and plus and minus zoom.
- Buttons in the explanation that set up the view a sentence describes.
- Links that hold one moment for a whole class.
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
- The page no longer paints as bare HTML on the dev server. Its stylesheets were imported from JavaScript, so they arrived only
  after every module had loaded. They are now linked from the HTML, which holds the first paint.
- Two downloads of the kernel can now run at once. They had shared one partial file, so on an empty cache the second
  could fail.
