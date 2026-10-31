import type { Vector3Km } from "@solar/ephemeris/types"
import { KM_PER_AU, SUN_DIAMETER_KM } from "../types/index.js"

/**
 * Subtracts the camera while the numbers are still 64-bit. The GPU's 32-bit floats resolve only
 * 512 km near Neptune's orbit, but they resolve centimeters for anything close to the camera.
 */
export const cameraRelative = (position: Vector3Km, camera: Vector3Km): Vector3Km => [
  position[0] - camera[0],
  position[1] - camera[1],
  position[2] - camera[2],
]

/** How far back a camera must stand for a radius to fit its narrower field of view. */
export const fitDistance = (radius: number, verticalFovDegrees: number, aspect: number): number => {
  const halfVertical = (verticalFovDegrees * Math.PI) / 360
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect)
  return radius / Math.sin(Math.min(halfVertical, halfHorizontal))
}

/**
 * How far back a camera must stand for a radius to fit the part of the view that nothing covers. A
 * dock across the bottom or a panel down one side leaves less of the field of view to fit into.
 */
export const fitDistanceInto = (input: {
  readonly radius: number
  readonly verticalFovDegrees: number
  readonly viewWidth: number
  readonly viewHeight: number
  readonly freeWidth: number
  readonly freeHeight: number
}): number => {
  const tangent = Math.tan((input.verticalFovDegrees * Math.PI) / 360)
  const halfVertical = Math.atan((tangent * input.freeHeight) / input.viewHeight)
  const halfHorizontal = Math.atan((tangent * input.freeWidth) / input.viewHeight)
  return input.radius / Math.sin(Math.min(halfVertical, halfHorizontal))
}

/** How many kilometers one pixel covers at a distance from the camera. */
export const kmPerPixel = (distanceKm: number, verticalFovDegrees: number, viewHeight: number): number =>
  (2 * distanceKm * Math.tan((verticalFovDegrees * Math.PI) / 360)) / viewHeight

const NEAREST_RIDE_RADIUS_KM = 0.3 * KM_PER_AU
const RIDE_MARGIN = 1.15

/** How much to frame while riding with a planet: enough that the Sun stays in the picture. */
export const rideRadiusKm = (sunDistanceKm: number): number =>
  Math.max(NEAREST_RIDE_RADIUS_KM, sunDistanceKm * RIDE_MARGIN)

const SCALE_BAR_LENGTHS_AU = [100, 10, 1, 0.1, 0.01] as const
const SCALE_BAR_SHARE_OF_VIEW = 0.3

/** The longest round length, in AU, that a scale bar can show without crowding the view. */
export const scaleBarAu = (pixelsPerAu: number, viewWidth: number): number =>
  SCALE_BAR_LENGTHS_AU.find((au) => au * pixelsPerAu < viewWidth * SCALE_BAR_SHARE_OF_VIEW) ?? 0.01

/** Two significant figures, so that a label can be read while it changes. Never below life size. */
export const niceFactor = (raw: number): number => {
  if (raw <= 1) return 1
  const magnitude = 10 ** (Math.floor(Math.log10(raw)) - 1)
  return Math.round(raw / magnitude) * magnitude
}

const EARTH_DIAMETER_KM = 12_756
const EARTH_ON_SCREEN_PIXELS = 6
const SUN_ON_SCREEN_PIXELS = 28

/**
 * How much to enlarge bodies so that they can be seen, for a labeled view that is never the default.
 * Planets share one factor, which keeps them true to one another. The Sun gets its own: at the
 * planets' factor it would be wider than the orbits of the inner planets.
 */
export const sizeScales = (kilometersPerPixel: number): { readonly planets: number; readonly sun: number } => ({
  planets: niceFactor((EARTH_ON_SCREEN_PIXELS * kilometersPerPixel) / EARTH_DIAMETER_KM),
  sun: niceFactor((SUN_ON_SCREEN_PIXELS * kilometersPerPixel) / SUN_DIAMETER_KM),
})

export interface ProjectedLabel {
  readonly name: string
  readonly x: number
  readonly y: number
}

export type LabelSide = "after" | "before"

export interface PlacedLabel extends ProjectedLabel {
  readonly side: LabelSide
}

interface LabelBox {
  readonly width: number
  readonly height: number
}

const left = ({ x, side }: PlacedLabel, box: LabelBox): number => (side === "after" ? x : x - box.width)

const overlaps = (a: PlacedLabel, b: PlacedLabel, box: LabelBox): boolean =>
  Math.abs(left(a, box) - left(b, box)) < box.width && Math.abs(a.y - b.y) < box.height

/** True when a label sits on a neighbor's dot, or close enough to block that neighbor's own label. */
const crowds = (label: PlacedLabel, dot: ProjectedLabel, box: LabelBox): boolean => {
  const start = left(label, box)
  return dot.x > start && dot.x < start + box.width && Math.abs(dot.y - label.y) < box.height
}

/**
 * Decides where each label goes, in priority order. A label sits beside its dot, preferring a side
 * that crowds no other planet, and takes the first side clear of other labels if none is. If both
 * sides are taken it stays hidden: four inner planets share a few pixels with the whole system in
 * view, and a learner zooms in or switches view to separate them.
 */
export const placeLabels = (
  labels: ReadonlyArray<ProjectedLabel>,
  viewWidth: number,
  box: LabelBox,
): ReadonlyArray<PlacedLabel> =>
  labels.reduce<ReadonlyArray<PlacedLabel>>((kept, label) => {
    const candidates = (["after", "before"] as const)
      .map((side): PlacedLabel => ({ ...label, side }))
      .filter((candidate) => {
        const start = left(candidate, box)
        return start >= 0 && start + box.width <= viewWidth
      })
      .filter((candidate) => kept.every((other) => !overlaps(candidate, other, box)))
    const uncrowded = candidates.find((candidate) =>
      labels.every((dot) => dot.name === label.name || !crowds(candidate, dot, box)),
    )
    const chosen = uncrowded ?? candidates[0]
    return chosen === undefined ? kept : [...kept, chosen]
  }, [])
