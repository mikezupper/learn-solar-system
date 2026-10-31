# Fits every screen

- **Status:** accepted · **Verified:** 2026-11-01

## Scope and assumptions

On an iPhone mini the owner found too much on the screen, and the planets vanished while scrolling. Measured, the sky had 44%
of the screen at the top of the page and none while reading the numbers. A Pro Max had less than a mini, at 25%, because the
compact layout depended on height alone and the Pro Max missed it by 3 pixels.

Nothing here changes stored state or any number. Assumed, not yet tested on a real phone: that the slim bar is enough to
start with, and that a sheet one tap away is easy to find.

## The layers

Each screen adds to the one before it, and nothing is ever taken away, only moved behind a tap.

| Screen | Always in view | One tap away | While reading the numbers |
|---|---|---|---|
| Phone, under 600 px wide | The sky, a slim line with the headline, and a slim bar with play, the date, Right now and the timeline | Speeds, what to show, sizes, the list of contents | The sky stays pinned above, at 40% of the screen |
| Tablet, up to 992 px wide | Adds the speeds, the views and the caption | | The sky stays pinned above, at 45% |
| Phone on its side, under 512 px tall | The sky, with the bar beside it | Speeds, what to show, sizes, the list of contents | The numbers take one side of the sky |
| Laptop | Adds the full headline | | The numbers slide over one side of the sky |
| Large desktop, at least 1600 × 800 px | Adds the numbers, beside the sky | | They were already there |

## How it works

- **The pinned sky** is one screen tall and sticks once only its lower part shows, using a negative sticky offset. The canvas is
  never resized, and the camera re-centers in whatever part is visible.
- **The controls** exist once. `popover` makes them a sheet on a phone, with no script, and `display: contents` hands the same
  elements to the bar on anything larger.
- **The status line** is hidden from sight on a phone unless it matters right now, and a screen reader always hears it.

## Acceptance

These run in `apps/web/e2e/layered-ui.spec.ts`, in Chromium and in WebKit.

| Screen | Sky at the top of the page | Sky while reading, with the Sun in view |
|---|---|---|
| iPhone mini | At least 70% | At least 30% |
| iPhone 16, iPhone Pro Max | At least 70% | At least 30% |
| iPad mini, in portrait | At least 55% | At least 30% |
| Laptop | At least 50% | At least 35% |
| Large desktop | At least 55% | At least 55% |

- A bigger phone never gets less sky than a smaller one.
- The sheet closes with its button, with Escape, and with a tap outside, and it leaves the sky showing while open.
- A status that matters still shows on a phone, and a stopped moment can still be shared.
- The list of contents gets out of the way after a link is chosen.

## Open questions

- ⚠ Does this feel right on a real iPhone? These tests use WebKit on Linux at the same viewport, which is close but not the same.
- ⚠ Should the sky stay pinned through the long explanation as well? It does not, because that leaves too little room to read.
