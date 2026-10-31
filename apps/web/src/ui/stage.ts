import { OUTPUT_EVENT } from "@gyral/core"
import { Option, Result } from "effect"
import { Vector3 } from "three"
import {
  cameraRelative,
  fitDistance,
  orbitsAt,
  placeLabels,
  skyPositionsAt,
} from "@solar/classroom/service"
import { KM_PER_AU, type Sky } from "@solar/classroom/types"
import { TdbSeconds, type Vector3Km } from "@solar/ephemeris/types"
import type { Framing, StageReport, StageView } from "../types/index.js"
import { COPY } from "./copy.js"
import {
  buildScene,
  KM_PER_UNIT,
  ORBIT_POINTS,
  PLANET_COLORS,
  toScreenAxes,
  VERTICAL_FOV_DEGREES,
  type Scene3D,
} from "./stage-scene.js"
import STAGE_STYLES from "./stage.css?inline"

/** How much of the solar system each view frames, in km from the Sun, with room for labels. */
const FRAMED_RADIUS_KM: Readonly<Record<Framing, number>> = {
  all: 30.4 * KM_PER_AU * 1.08,
  inner: 1.67 * KM_PER_AU * 1.08,
}
const NEAREST_ZOOM_KM = 0.15 * KM_PER_AU
/** The room a label needs. Labels sit beside their dots, so they are wider than tall. */
const LABEL_BOX_PIXELS = { width: 64, height: 14 }
const FRAMES_PER_REPORT = 30
/** Below this, motion is too slow to see, so the stage draws only when something changes. */
const VISIBLE_RATE = 1000
/** A line changes very little in this time, and redrawing it less often saves work. */
const ORBIT_REFRESH_SECONDS = 30 * 86_400
const SECONDS_PER_MILLI = 0.001

/** When labels collide, these win: the Sun, then Earth, then the giants. */
const LABEL_PRIORITY: ReadonlyArray<string> = [
  "Sun",
  "Earth",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Mars",
  "Venus",
  "Mercury",
]

/**
 * The WebGL stage: one input property, its own lifecycle, teardown when it leaves the page. It draws
 * only when something changed, because a classroom laptop should not spin its fan for a sky that
 * moves a pixel an hour. While time runs fast, it advances between the page's ticks by itself.
 */
export class SkyStage extends HTMLElement {
  #view: Option.Option<StageView> = Option.none()
  #viewArrivedAt = 0
  #stage: Option.Option<Scene3D> = Option.none()
  #labels: ReadonlyMap<string, HTMLLIElement> = new Map()
  #resize: Option.Option<ResizeObserver> = Option.none()
  #frame = 0
  #dirty = false
  #framedAs: Framing | undefined = undefined
  #orbitsFor: { readonly sky: Sky; readonly at: number } | undefined = undefined
  #frameMillis: ReadonlyArray<number> = []

  set view(view: StageView) {
    this.#view = Option.some(view)
    this.#viewArrivedAt = performance.now()
    this.#dirty = true
    Option.map(this.#stage, (stage) => {
      this.#frameTo(stage, view.framing)
    })
  }

  connectedCallback(): void {
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" })
    const canvas = document.createElement("canvas")
    canvas.setAttribute("role", "img")
    canvas.setAttribute("aria-label", COPY.stageLabel)
    canvas.tabIndex = 0
    const list = document.createElement("ol")
    list.setAttribute("aria-hidden", "true")
    const labels = ["Sun", ...PLANET_COLORS.map(([name]) => name)].map((name) => {
      const item = document.createElement("li")
      item.textContent = name
      item.hidden = true
      list.append(item)
      return [name, item] as const
    })
    this.#labels = new Map(labels)
    const style = document.createElement("style")
    style.textContent = STAGE_STYLES
    root.replaceChildren(style, canvas, list)

    Result.match(buildScene(canvas), {
      onFailure: () => {
        this.#report({ _tag: "StageUnavailable" })
      },
      onSuccess: (stage) => {
        this.#stage = Option.some(stage)
        stage.controls.minDistance = NEAREST_ZOOM_KM
        stage.controls.addEventListener("change", () => {
          this.#dirty = true
        })
        const observer = new ResizeObserver(() => {
          this.#fit(stage)
        })
        observer.observe(this)
        this.#resize = Option.some(observer)
        this.#fit(stage)
        this.#schedule()
      },
    })
  }

  disconnectedCallback(): void {
    cancelAnimationFrame(this.#frame)
    Option.map(this.#resize, (observer) => {
      observer.disconnect()
    })
    Option.map(this.#stage, (stage) => {
      stage.dispose()
    })
    this.#resize = Option.none()
    this.#stage = Option.none()
    this.#framedAs = undefined
    this.#orbitsFor = undefined
  }

  #report(report: StageReport): void {
    this.dispatchEvent(new CustomEvent(OUTPUT_EVENT, { detail: report, bubbles: true }))
  }

  #size(): { readonly inlineSize: number; readonly blockSize: number } {
    const box = this.getBoundingClientRect()
    return { inlineSize: box.width, blockSize: box.height }
  }

  #fit(stage: Scene3D): void {
    const { inlineSize, blockSize } = this.#size()
    if (inlineSize === 0 || blockSize === 0) return
    const aspect = inlineSize / blockSize
    stage.renderer.setSize(inlineSize, blockSize, false)
    stage.renderCamera.aspect = aspect
    stage.renderCamera.updateProjectionMatrix()
    stage.controlCamera.aspect = aspect
    stage.controlCamera.updateProjectionMatrix()
    stage.controls.maxDistance = fitDistance(FRAMED_RADIUS_KM.all, VERTICAL_FOV_DEGREES, aspect) * 3
    const framing = Option.match(this.#view, { onNone: () => "all" as const, onSome: (view) => view.framing })
    this.#frameTo(stage, framing)
    this.#dirty = true
  }

  /** Moves the camera only when the view changes, so that a learner's own zoom and turn survive. */
  #frameTo(stage: Scene3D, framing: Framing): void {
    if (this.#framedAs === framing) return
    const { inlineSize, blockSize } = this.#size()
    if (inlineSize === 0 || blockSize === 0) return
    const distance = fitDistance(FRAMED_RADIUS_KM[framing], VERTICAL_FOV_DEGREES, inlineSize / blockSize)
    if (this.#framedAs === undefined) {
      // Look down on the plane of the orbits from 30 degrees off the pole, so depth still reads.
      const tilt = Math.PI / 6
      stage.controlCamera.position.set(0, distance * Math.cos(tilt), distance * Math.sin(tilt))
    } else {
      stage.controlCamera.position.setLength(distance)
    }
    stage.controls.update()
    this.#framedAs = framing
    this.#dirty = true
  }

  #schedule(): void {
    this.#frame = requestAnimationFrame(() => {
      this.#tick()
      this.#schedule()
    })
  }

  #tick(): void {
    const stage = Option.getOrUndefined(this.#stage)
    const view = Option.getOrUndefined(this.#view)
    if (stage === undefined || view === undefined) return
    stage.controls.update()
    if (!this.#dirty && view.rate < VISIBLE_RATE) return
    this.#dirty = false
    const started = performance.now()
    const elapsed = (started - this.#viewArrivedAt) * SECONDS_PER_MILLI
    this.#draw(stage, view.sky, TdbSeconds(Math.min(view.at + view.rate * elapsed, view.endSeconds)))
    this.#measure(performance.now() - started)
  }

  #draw(stage: Scene3D, sky: Sky, at: TdbSeconds): void {
    const { controlCamera, renderCamera, renderer, scene } = stage
    const camera: Vector3Km = [
      controlCamera.position.x,
      controlCamera.position.y,
      controlCamera.position.z,
    ]
    renderCamera.quaternion.copy(controlCamera.quaternion)
    renderCamera.updateMatrixWorld()

    const inView = (eclipticKm: Vector3Km): Vector3Km => {
      const [x, y, z] = cameraRelative(toScreenAxes(eclipticKm), camera)
      return [x / KM_PER_UNIT, y / KM_PER_UNIT, z / KM_PER_UNIT]
    }
    const placed = skyPositionsAt(sky, at).map(({ name, eclipticKm }) => ({
      name,
      eclipticKm,
      unit: inView(eclipticKm),
    }))
    const sun = placed.find((body) => body.name === "Sun")
    if (sun === undefined) return
    stage.sunPosition.setXYZ(0, sun.unit[0], sun.unit[1], sun.unit[2])
    stage.sunPosition.needsUpdate = true
    PLANET_COLORS.forEach(([name], index) => {
      const body = placed.find((candidate) => candidate.name === name)
      if (body !== undefined) stage.planetPositions.setXYZ(index, body.unit[0], body.unit[1], body.unit[2])
    })
    stage.planetPositions.needsUpdate = true

    this.#refreshOrbits(stage, sky, at)
    stage.orbitLines.forEach(({ line }) => {
      line.position.set(sun.unit[0], sun.unit[1], sun.unit[2])
    })
    renderer.render(scene, renderCamera)
    this.#placeLabels(renderCamera, placed)
  }

  #refreshOrbits(stage: Scene3D, sky: Sky, at: TdbSeconds): void {
    const last = this.#orbitsFor
    if (last?.sky === sky && Math.abs(at - last.at) < ORBIT_REFRESH_SECONDS) return
    this.#orbitsFor = { sky, at }
    const orbits = orbitsAt(sky, at, ORBIT_POINTS)
    stage.orbitLines.forEach(({ planet, positions }) => {
      const orbit = orbits.find((candidate) => candidate.planet === planet)
      if (orbit === undefined) return
      orbit.pointsEcliptic.forEach((point, index) => {
        const [x, y, z] = toScreenAxes(point)
        positions.setXYZ(index, x / KM_PER_UNIT, y / KM_PER_UNIT, z / KM_PER_UNIT)
      })
      positions.needsUpdate = true
    })
  }

  #placeLabels(
    camera: Scene3D["renderCamera"],
    placed: ReadonlyArray<{ readonly name: string; readonly unit: Vector3Km }>,
  ): void {
    const { inlineSize, blockSize } = this.#size()
    const projected = LABEL_PRIORITY.flatMap((name) => {
      const body = placed.find((candidate) => candidate.name === name)
      if (body === undefined) return []
      const ndc = new Vector3(...body.unit).project(camera)
      const x = ((ndc.x + 1) / 2) * inlineSize
      const y = ((1 - ndc.y) / 2) * blockSize
      const onScreen = ndc.z < 1 && x >= 0 && x <= inlineSize && y >= 0 && y <= blockSize
      return onScreen ? [{ name, x, y }] : []
    })
    const kept = placeLabels(projected, inlineSize, LABEL_BOX_PIXELS)
    this.#labels.forEach((item, name) => {
      const label = kept.find((candidate) => candidate.name === name)
      item.hidden = label === undefined
      if (label === undefined) return
      const shift = label.side === "before" ? "-100%" : "0"
      item.style.transform = `translate(${String(label.x)}px, ${String(label.y - 8)}px) translateX(${shift})`
    })
  }

  #measure(millis: number): void {
    this.#frameMillis = [...this.#frameMillis, millis]
    if (this.#frameMillis.length < FRAMES_PER_REPORT) return
    const count = this.#frameMillis.length
    this.#report({
      _tag: "FramesMeasured",
      count,
      meanMs: this.#frameMillis.reduce((sum, value) => sum + value, 0) / count,
      worstMs: Math.max(...this.#frameMillis),
    })
    this.#frameMillis = []
  }
}

customElements.define("sky-stage", SkyStage)
