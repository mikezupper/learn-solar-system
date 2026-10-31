import { Vector3 } from "three"
import { fitDistanceInto, rideRadiusKm } from "@solar/classroom/service"
import { KM_PER_AU } from "@solar/classroom/types"
import type { TdbSeconds, Vector3Km } from "@solar/ephemeris/types"
import type { StageView } from "../types/index.js"
import { toScreenAxes, VERTICAL_FOV_DEGREES, type Scene3D } from "./stage-scene.js"

/** How much of the solar system each view frames, in km from the Sun, with room for labels. */
export const FRAMED_RADIUS_KM = { all: 30.4 * KM_PER_AU * 1.08, inner: 1.67 * KM_PER_AU * 1.08 }
const NEAREST_ZOOM_KM = 0.15 * KM_PER_AU
const NEAREST_RIDE_ZOOM_KM = 0.02 * KM_PER_AU
const FLIGHT_SECONDS = 0.34
const COLD_OPEN_FLIGHT_SECONDS = 0.85
const COLD_OPEN_CLOSENESS = 18
const FOCUS_MOVE_MILLIS = 900
const ORIGIN: Vector3Km = [0, 0, 0]

/** The part of the stage that nothing covers, in pixels from its corner. */
export interface FreeArea {
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
}

/**
 * Where the camera is and where it is going. Every change of view is a flight, and a move of the
 * point it circles. Neither touches a position, because only the viewpoint ever moves.
 */
export class CameraRig {
  size = { inlineSize: 0, blockSize: 0 }
  free: FreeArea = { left: 0, right: 0, top: 0, bottom: 0 }
  #shift = { x: 0, y: 0 }
  #framedAs: string | undefined = undefined
  #fittedDistance = 0
  #flight: { readonly distance: number; readonly seconds: number } | undefined = undefined
  #focusFrom: Vector3Km = ORIGIN
  #focusMoveStart: number | undefined = undefined
  readonly #stage: Scene3D
  readonly #reduced: boolean

  constructor(stage: Scene3D, reduced: boolean) {
    this.#stage = stage
    this.#reduced = reduced
  }

  get moving(): boolean {
    return this.#flight !== undefined || this.#focusMoveStart !== undefined
  }

  #radiusFor(view: StageView): number {
    if (view.framing !== "ride") return FRAMED_RADIUS_KM[view.framing]
    const rider = view.sky.planets.find(({ name }) => name === view.rider)
    if (rider === undefined) return FRAMED_RADIUS_KM.inner
    const [x, y, z] = rider.track(view.at)
    const [sx, sy, sz] = view.sky.sun(view.at)
    return rideRadiusKm(Math.hypot(x - sx, y - sy, z - sz))
  }

  #fitDistance(view: StageView): number {
    return fitDistanceInto({
      radius: this.#radiusFor(view),
      verticalFovDegrees: VERTICAL_FOV_DEGREES,
      viewWidth: this.size.inlineSize,
      viewHeight: this.size.blockSize,
      freeWidth: this.free.right - this.free.left,
      freeHeight: this.free.bottom - this.free.top,
    })
  }

  /** Follows a change in what covers the stage, unless the learner has zoomed somewhere of their own. */
  cover(free: FreeArea, view: StageView | undefined): void {
    const changed = free.right !== this.free.right || free.top !== this.free.top || free.bottom !== this.free.bottom
    this.free = free
    if (!changed || view === undefined || this.#framedAs === undefined) return
    const { controlCamera, controls } = this.#stage
    const current = controlCamera.position.distanceTo(controls.target)
    if (Math.abs(current / this.#fittedDistance - 1) >= 0.02 && this.#flight === undefined) return
    this.#fittedDistance = this.#fitDistance(view)
    this.#flight = { distance: this.#fittedDistance, seconds: FLIGHT_SECONDS }
  }

  /** Moves the camera only when the view changes, so that a learner's own zoom and turn survive. */
  frameTo(view: StageView): boolean {
    const key = view.framing === "ride" ? `ride:${view.rider}` : view.framing
    if (this.#framedAs === key || this.size.inlineSize === 0) return false
    const { controlCamera, controls } = this.#stage
    const first = this.#framedAs === undefined
    this.#fittedDistance = this.#fitDistance(view)
    controls.minDistance = view.framing === "ride" ? NEAREST_RIDE_ZOOM_KM : NEAREST_ZOOM_KM
    if (first) {
      // Look down on the plane of the orbits from 30 degrees off the pole, so depth still reads.
      const coldOpen = view.arriving && !this.#reduced
      const start = coldOpen ? this.#fittedDistance / COLD_OPEN_CLOSENESS : this.#fittedDistance
      const tilt = Math.PI / 6
      controlCamera.position.set(0, start * Math.cos(tilt), start * Math.sin(tilt))
      this.#flight = coldOpen ? { distance: this.#fittedDistance, seconds: COLD_OPEN_FLIGHT_SECONDS } : undefined
    } else {
      this.#flight = { distance: this.#fittedDistance, seconds: FLIGHT_SECONDS }
      this.#focusFrom = [controls.target.x, controls.target.y, controls.target.z]
      this.#focusMoveStart = this.#reduced ? undefined : performance.now()
    }
    this.#framedAs = key
    return true
  }

  /** The point the camera circles: the solar system's center of mass, or the planet being ridden. */
  #focusAt(view: StageView, at: TdbSeconds, now: number): Vector3Km {
    const rider = view.framing === "ride" ? view.sky.planets.find(({ name }) => name === view.rider) : undefined
    const wanted = rider === undefined ? ORIGIN : toScreenAxes(rider.track(at))
    if (this.#focusMoveStart === undefined) return wanted
    const u = Math.max(0, Math.min(1, (now - this.#focusMoveStart) / FOCUS_MOVE_MILLIS))
    if (u >= 1) this.#focusMoveStart = undefined
    const eased = 1 - (1 - u) ** 3
    return [
      this.#focusFrom[0] + (wanted[0] - this.#focusFrom[0]) * eased,
      this.#focusFrom[1] + (wanted[1] - this.#focusFrom[1]) * eased,
      this.#focusFrom[2] + (wanted[2] - this.#focusFrom[2]) * eased,
    ]
  }

  /** Answers whether the view changed in a way that needs a redraw. */
  advance(view: StageView, at: TdbSeconds, now: number, dt: number): boolean {
    const { controls, controlCamera, renderCamera } = this.#stage
    const [fx, fy, fz] = this.#focusAt(view, at, now)
    const delta = new Vector3(fx - controls.target.x, fy - controls.target.y, fz - controls.target.z)
    controls.target.add(delta)
    controlCamera.position.add(delta)
    const flight = this.#flight
    if (flight !== undefined) {
      const offset = controlCamera.position.clone().sub(controls.target)
      const current = Math.log(offset.length())
      const wanted = Math.log(flight.distance)
      const blend = this.#reduced ? 1 : 1 - Math.exp(-dt / flight.seconds)
      controlCamera.position.copy(controls.target).add(offset.setLength(Math.exp(current + (wanted - current) * blend)))
      if (Math.abs(wanted - current) < 0.002) this.#flight = undefined
    }
    const { inlineSize, blockSize } = this.size
    const centerX = (this.free.left + this.free.right) / 2 - inlineSize / 2
    const centerY = (this.free.top + this.free.bottom) / 2 - blockSize / 2
    const ease = this.#reduced ? 1 : 1 - Math.exp(-dt / FLIGHT_SECONDS)
    const shift = { x: this.#shift.x + (centerX - this.#shift.x) * ease, y: this.#shift.y + (centerY - this.#shift.y) * ease }
    const shifted = Math.abs(shift.x - this.#shift.x) > 0.01 || Math.abs(shift.y - this.#shift.y) > 0.01
    this.#shift = shift
    renderCamera.setViewOffset(inlineSize, blockSize, -shift.x, -shift.y, inlineSize, blockSize)
    controls.update()
    return shifted
  }
}
