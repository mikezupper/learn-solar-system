/**
 * What the stage draws in 2D above the WebGL canvas, because WebGL lines are one pixel wide: trails,
 * the ring around the inner planets, the path of a planet's light, and the scale bar. All of it comes
 * from positions the stage already worked out from JPL's data.
 */
export type Point = readonly [x: number, y: number]

export interface Trail {
  readonly color: string
  /** Oldest first. `fade` runs from 0 at the tail to 1 at the planet. */
  readonly points: ReadonlyArray<{ readonly point: Point; readonly fade: number }>
}

export interface Ring {
  readonly outline: ReadonlyArray<Point>
  readonly opacity: number
  readonly words: string
  readonly action: string
  /** Where the ring's words may go, clear of the dock and the headline. */
  readonly floor: number
  readonly ceiling: number
  readonly bodies: ReadonlyArray<Point>
}

export interface Beam {
  readonly from: Point
  readonly to: Point
  readonly text: string
  readonly dashOffset: number
}

export interface ScaleBar {
  readonly x: number
  readonly y: number
  readonly pixels: number
  readonly text: string
}

export interface OverlayFrame {
  readonly width: number
  readonly height: number
  readonly ratio: number
  readonly accent: string
  readonly sun: Point | undefined
  readonly bloom: HTMLCanvasElement
  readonly bloomSize: number
  readonly trails: ReadonlyArray<Trail>
  readonly ring: Ring | undefined
  readonly beam: Beam | undefined
  readonly scale: ScaleBar | undefined
}

const DISPLAY_FONT = "Unbounded, system-ui, sans-serif"
const TEXT_FONT = "system-ui, sans-serif"
const OUTLINE_WIDTH = 3

/** The Sun's glow, painted once, so that each frame costs one image draw. */
export const paintBloom = (): HTMLCanvasElement => {
  const size = 512
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext("2d")
  if (context === null) return canvas
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  const stops: ReadonlyArray<readonly [number, string]> = [
    [0, "#ffffff"],
    [0.02, "#fff6d8"],
    [0.034, "#ffe49ad0"],
    [0.08, "#ffe9b850"],
    [0.2, "#ffe2a818"],
    [0.46, "#ffd8a006"],
    [1, "#ffd8a000"],
  ]
  stops.forEach(([at, color]) => {
    gradient.addColorStop(at, color)
  })
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  return canvas
}

const label = (c: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): void => {
  c.textBaseline = "middle"
  c.lineJoin = "round"
  c.lineWidth = OUTLINE_WIDTH
  c.strokeStyle = "rgba(0, 0, 0, 0.85)"
  c.strokeText(text, x, y)
  c.fillStyle = color
  c.fillText(text, x, y)
}

const polyline = (c: CanvasRenderingContext2D, points: ReadonlyArray<Point>): void => {
  c.beginPath()
  points.forEach(([x, y], index) => {
    if (index === 0) c.moveTo(x, y)
    else c.lineTo(x, y)
  })
  c.stroke()
}

const drawTrails = (c: CanvasRenderingContext2D, trails: ReadonlyArray<Trail>): void => {
  c.lineCap = "butt"
  trails.forEach(({ color, points }) => {
    c.strokeStyle = color
    points.forEach(({ point, fade }, index) => {
      const previous = points[index - 1]
      if (previous === undefined) return
      c.globalAlpha = fade ** 1.5 * 0.95
      c.lineWidth = 0.75 + fade * 3
      polyline(c, [previous.point, point])
    })
  })
  c.globalAlpha = 1
}

const drawBeam = (c: CanvasRenderingContext2D, beam: Beam, accent: string, width: number): void => {
  c.strokeStyle = accent
  c.lineWidth = 1.5
  c.setLineDash([2, 7])
  c.lineDashOffset = beam.dashOffset
  polyline(c, [beam.from, beam.to])
  c.setLineDash([])
  c.lineDashOffset = 0
  c.font = `600 11px ${DISPLAY_FONT}`
  const pill = c.measureText(beam.text).width + 16
  const x = Math.max(8, Math.min(width - pill - 8, (beam.from[0] + beam.to[0]) / 2 - pill / 2))
  const y = (beam.from[1] + beam.to[1]) / 2 - 30
  c.fillStyle = "rgba(8, 8, 18, 0.92)"
  c.beginPath()
  c.roundRect(x, y, pill, 22, 11)
  c.fill()
  c.textAlign = "left"
  c.textBaseline = "middle"
  c.fillStyle = accent
  c.fillText(beam.text, x + 8, y + 11)
}

/** The ring's words take the first corner with room, clear of every body and of the controls. */
const drawRing = (c: CanvasRenderingContext2D, ring: Ring, accent: string, width: number): void => {
  const xs = ring.outline.map(([x]) => x)
  const ys = ring.outline.map(([, y]) => y)
  const center: Point = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
  const reachX = (Math.max(...xs) - Math.min(...xs)) / 2
  const reachY = (Math.max(...ys) - Math.min(...ys)) / 2
  c.globalAlpha = ring.opacity
  c.strokeStyle = accent
  c.lineWidth = 1.25
  c.setLineDash([3, 4])
  polyline(c, [...ring.outline, ring.outline[0] ?? center])
  c.setLineDash([])

  c.font = `600 11px ${DISPLAY_FONT}`
  const boxWidth = c.measureText(ring.words).width + 6
  const boxHeight = 28
  const out = 34
  const corners = ([[1, -1], [-1, -1], [1, 1], [-1, 1]] as const).map(([sideX, sideY]) => {
    const edge: Point = [center[0] + sideX * reachX * 0.74, center[1] + sideY * reachY * 0.74]
    return {
      edge,
      sideX,
      x: sideX > 0 ? edge[0] + out : edge[0] - out - boxWidth,
      y: sideY < 0 ? edge[1] - out - boxHeight : edge[1] + out,
    }
  })
  const chosen =
    corners.find(
      ({ x, y }) =>
        x > 8 &&
        x + boxWidth < width - 8 &&
        y > ring.floor &&
        y + boxHeight < ring.ceiling &&
        ring.bodies.every(([bx, by]) => bx < x - 12 || bx > x + boxWidth + 12 || by < y - 12 || by > y + boxHeight + 12),
    ) ?? corners[0]
  if (chosen !== undefined) {
    polyline(c, [chosen.edge, [chosen.sideX > 0 ? chosen.x - 3 : chosen.x + boxWidth + 3, chosen.y + boxHeight / 2]])
    c.textAlign = "left"
    label(c, ring.words, chosen.x, chosen.y + 6, accent)
    c.font = `500 11px ${TEXT_FONT}`
    label(c, ring.action, chosen.x, chosen.y + 20, "#ffffff")
  }
  c.globalAlpha = 1
}

const drawScale = (c: CanvasRenderingContext2D, scale: ScaleBar): void => {
  c.strokeStyle = "#ffffff"
  c.lineWidth = 1.5
  polyline(c, [
    [scale.x, scale.y - 4],
    [scale.x, scale.y],
    [scale.x + scale.pixels, scale.y],
    [scale.x + scale.pixels, scale.y - 4],
  ])
  c.font = `600 11px ${TEXT_FONT}`
  c.textAlign = "left"
  label(c, scale.text, scale.x + 1, scale.y - 11, "#ffffff")
}

export const drawOverlay = (c: CanvasRenderingContext2D, frame: OverlayFrame): void => {
  c.setTransform(frame.ratio, 0, 0, frame.ratio, 0, 0)
  c.clearRect(0, 0, frame.width, frame.height)
  c.globalCompositeOperation = "lighter"
  drawTrails(c, frame.trails)
  if (frame.sun !== undefined) {
    const half = frame.bloomSize / 2
    c.drawImage(frame.bloom, frame.sun[0] - half, frame.sun[1] - half, frame.bloomSize, frame.bloomSize)
  }
  c.globalCompositeOperation = "source-over"
  if (frame.ring !== undefined) drawRing(c, frame.ring, frame.accent, frame.width)
  if (frame.beam !== undefined) drawBeam(c, frame.beam, frame.accent, frame.width)
  if (frame.scale !== undefined) drawScale(c, frame.scale)
}
