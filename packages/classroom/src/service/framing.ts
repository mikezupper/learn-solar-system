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

/**
 * Keeps the labels that have room, in priority order. Four inner planets share a few pixels when the
 * whole system is in view; a learner zooms in to separate them, and their labels return.
 */
export const labelsWithRoom = (
  labels: ReadonlyArray<ProjectedLabel>,
  box: { readonly width: number; readonly height: number },
): ReadonlyArray<ProjectedLabel> =>
  labels.reduce<ReadonlyArray<ProjectedLabel>>(
    (kept, label) =>
      kept.some(
        (other) =>
          Math.abs(other.x - label.x) < box.width && Math.abs(other.y - label.y) < box.height,
      )
        ? kept
        : [...kept, label],
    [],
  )
