import { Spherical, Vector3 } from "three"
import type { OrbitControls } from "three/addons/controls/OrbitControls.js"

const TURN_RADIANS = Math.PI / 36
const ZOOM_FACTOR = 1.18
const POLE_MARGIN = 0.02

/**
 * Keeps a full-screen stage from trapping the page. A plain wheel scrolls; Ctrl and wheel zooms, which
 * is also how a trackpad pinch arrives. A vertical swipe scrolls, and a pinch still reaches the
 * controls. OrbitControls claims all touches when it starts, so this runs after it.
 */
export const letThePageScroll = (canvas: HTMLCanvasElement): (() => void) => {
  canvas.style.touchAction = "pan-y"
  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey) event.stopImmediatePropagation()
  }
  canvas.addEventListener("wheel", onWheel, { capture: true })
  return () => {
    canvas.removeEventListener("wheel", onWheel, { capture: true })
  }
}

/** Arrow keys turn the view and plus and minus zoom, for anyone not using a mouse or a touch screen. */
export const steerFromKeyboard = (
  canvas: HTMLCanvasElement,
  camera: { readonly position: Vector3 },
  controls: OrbitControls,
  changed: () => void,
): (() => void) => {
  const onKey = (event: KeyboardEvent) => {
    const offset = new Vector3().subVectors(camera.position, controls.target)
    const sphere = new Spherical().setFromVector3(offset)
    const turns: Readonly<Record<string, () => void>> = {
      ArrowLeft: () => {
        sphere.theta -= TURN_RADIANS
      },
      ArrowRight: () => {
        sphere.theta += TURN_RADIANS
      },
      ArrowUp: () => {
        sphere.phi = Math.max(POLE_MARGIN, sphere.phi - TURN_RADIANS)
      },
      ArrowDown: () => {
        sphere.phi = Math.min(Math.PI - POLE_MARGIN, sphere.phi + TURN_RADIANS)
      },
      "+": () => {
        sphere.radius = Math.max(controls.minDistance, sphere.radius / ZOOM_FACTOR)
      },
      "=": () => {
        sphere.radius = Math.max(controls.minDistance, sphere.radius / ZOOM_FACTOR)
      },
      "-": () => {
        sphere.radius = Math.min(controls.maxDistance, sphere.radius * ZOOM_FACTOR)
      },
    }
    const turn = turns[event.key]
    if (turn === undefined) return
    event.preventDefault()
    turn()
    camera.position.copy(controls.target).add(offset.setFromSpherical(sphere))
    changed()
  }
  canvas.addEventListener("keydown", onKey)
  return () => {
    canvas.removeEventListener("keydown", onKey)
  }
}
