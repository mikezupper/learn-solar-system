# A layout that adds layers as the screen grows

## Goal

On an iPhone mini the page gave the planets 44% of the screen, and none at all while reading the numbers. A Pro Max got
even less, at 25%. The owner asked for a simpler phone layout, with planets that stay in view while scrolling, and a page
that adds layers as the screen grows. Done means tests hold a minimum share of sky at every size, in Chromium and WebKit.

## Progress

- [x] Tests for the share of sky, in both engines
- [x] Phone: the sky, a slim bar, a sheet of controls, a menu
- [x] The sky stays pinned while the numbers scroll beneath it
- [x] Tablet, phone landscape, laptop and large desktop layers
- [x] Documents and guides

## Decision log

**2026-11-01. The sky pins with a negative sticky offset, not by resizing.** The figure stays one screen tall and sticks
once only its lower part still shows. The browser does the movement, the canvas is never reallocated, and the camera re-centers
in whatever part remains visible. Resizing WebGL on every scroll frame could stutter on a phone.

**2026-11-01. The bar stays at the bottom of the screen.** It was proposed attached to the pinned sky. Staying put means
it never jumps from bottom to top, and it stays under the thumb.

**2026-11-01. One set of controls, placed differently.** Native `popover` makes the controls a sheet on a phone, and
`display: contents` hands the same elements to the dock on larger screens. Nothing is duplicated, no JavaScript opens the
sheet, and the radio buttons stay real.

**2026-11-01. The headline stays as one slim line on a phone.** It was proposed moving below the sky, but a first visit
should still say what this is. It costs no sky, since it floats over it. The intro paragraph goes, because "What this page
does" says the same thing further down.

**2026-11-01. Labels reserve their own width.** Every label used to claim the room of the longest name, which hid Saturn and
Neptune on a phone for want of a few pixels. Each is now measured, once per view size.

**2026-11-01. The ring's words stay away when no corner is clear.** The ring still marks the place and can still be tapped, and
words printed over a planet's label would help no one.

**2026-11-01. The sky pins through the numbers, not the long explanation.** Reading a long text under a pinned picture
leaves too little room, and the buttons in the text bring the picture back.
