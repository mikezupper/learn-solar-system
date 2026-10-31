import type { Vector3Km } from "@solar/ephemeris/types"

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
