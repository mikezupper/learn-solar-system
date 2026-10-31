import { OUTPUT_EVENT } from "@gyral/core"
import { Option, Result } from "effect"
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import {
  cameraRelative,
  fitDistance,
  labelSide,
  labelsWithRoom,
  skyPositionsAt,
  type BodyName,
} from "@solar/classroom/service"
import { KM_PER_AU } from "@solar/classroom/types"
import type { StageReport, StageView } from "../types/index.js"
import { COPY } from "./copy.js"

/** One scene unit, once positions are relative to the camera and small enough for 32-bit floats. */
const KM_PER_UNIT = 1e6
const VERTICAL_FOV_DEGREES = 45
/** Neptune's farthest point from the Sun, plus room for its label on a narrow screen. */
const FRAMED_RADIUS_KM = 30.4 * KM_PER_AU * 1.25
const NEAREST_ZOOM_KM = 0.15 * KM_PER_AU
/** The room a label needs. Labels sit to the right of their dots, so they are wider than tall. */
const LABEL_BOX_PIXELS = { width: 64, height: 18 }
const FRAMES_PER_REPORT = 120
/** Colors a learner would recognize. Uranus and Neptune are both pale, as Irwin et al. (2024) showed. */
const BODIES: ReadonlyArray<{ readonly name: BodyName; readonly color: string }> = [
  { name: "Sun", color: "#ffd86b" },
  { name: "Mercury", color: "#b5b0a8" },
  { name: "Venus", color: "#e8d3a2" },
  { name: "Earth", color: "#6fa8ff" },
  { name: "Mars", color: "#d9734a" },
  { name: "Jupiter", color: "#d8b98a" },
  { name: "Saturn", color: "#e6d7a8" },
  { name: "Uranus", color: "#b4dde0" },
  { name: "Neptune", color: "#a4cfe4" },
]
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

const STAGE_STYLES = `
  :host { display: block; position: relative; contain: content; background: oklch(14% 0.02 265); }
  canvas { display: block; inline-size: 100%; block-size: 100%; touch-action: none; }
  canvas:focus-visible { outline: 3px solid oklch(80% 0.14 240); outline-offset: -3px; }
  ol { position: absolute; inset: 0; margin: 0; padding: 0; list-style: none; pointer-events: none; overflow: clip; }
  li { position: absolute; inset-block-start: 0; inset-inline-start: 0; color: oklch(95% 0.01 265);
       font: 500 0.8125rem/1 system-ui, sans-serif; padding-inline: 0.625rem; white-space: nowrap; }
`

/** A soft round dot, so that points are not drawn as squares. */
const dotTexture = (): CanvasTexture => {
  const canvas = document.createElement("canvas")
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext("2d")
  if (context !== null) {
    context.fillStyle = "#fff"
    context.beginPath()
    context.arc(32, 32, 30, 0, Math.PI * 2)
    context.fill()
  }
  return new CanvasTexture(canvas)
}

interface Stage3D {
  readonly renderer: WebGLRenderer
  readonly controls: OrbitControls
  readonly scene: Scene
  /** Takes the input from OrbitControls, in kilometers. Never rendered through. */
  readonly controlCamera: PerspectiveCamera
  /** Sits at the origin with the same orientation, which is what keeps positions small. */
  readonly renderCamera: PerspectiveCamera
  readonly positions: BufferAttribute
  readonly dispose: () => void
}

const buildStage = (canvas: HTMLCanvasElement): Result.Result<Stage3D, unknown> =>
  Result.try(() => {
    const renderer = new WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    const controlCamera = new PerspectiveCamera(VERTICAL_FOV_DEGREES, 1, 1, 1e12)
    const renderCamera = new PerspectiveCamera(VERTICAL_FOV_DEGREES, 1, 1e-3, 1e6)
    const controls = new OrbitControls(controlCamera, canvas)
    controls.enablePan = false
    controls.minDistance = NEAREST_ZOOM_KM

    const geometry = new BufferGeometry()
    const positions = new BufferAttribute(new Float32Array(BODIES.length * 3), 3)
    const colors = new Float32Array(BODIES.flatMap(({ color }) => new Color(color).toArray()))
    geometry.setAttribute("position", positions)
    geometry.setAttribute("color", new BufferAttribute(colors, 3))
    const texture = dotTexture()
    const material = new PointsMaterial({
      size: 9,
      sizeAttenuation: false,
      vertexColors: true,
      map: texture,
      transparent: true,
      alphaTest: 0.4,
      blending: AdditiveBlending,
      depthWrite: false,
    })
    const dots = new Points(geometry, material)
    dots.frustumCulled = false
    const scene = new Scene()
    scene.add(dots)
    return {
      renderer,
      controls,
      scene,
      controlCamera,
      renderCamera,
      positions,
      dispose: () => {
        controls.dispose()
        geometry.dispose()
        material.dispose()
        texture.dispose()
        renderer.dispose()
      },
    }
  })

/**
 * The WebGL stage: one input property, its own lifecycle, teardown when it leaves the page. It draws
 * only when something changed, because a classroom laptop should not spin its fan for a sky that
 * moves a pixel an hour.
 */
export class SkyStage extends HTMLElement {
  #view: Option.Option<StageView> = Option.none()
  #stage: Option.Option<Stage3D> = Option.none()
  #labels: ReadonlyMap<string, HTMLLIElement> = new Map()
  #resize: Option.Option<ResizeObserver> = Option.none()
  #frame = 0
  #dirty = false
  #framed = false
  #frameMillis: ReadonlyArray<number> = []

  set view(view: StageView) {
    this.#view = Option.some(view)
    this.#dirty = true
  }

  connectedCallback(): void {
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" })
    const canvas = document.createElement("canvas")
    canvas.setAttribute("role", "img")
    canvas.setAttribute("aria-label", COPY.stageLabel)
    canvas.tabIndex = 0
    const list = document.createElement("ol")
    list.setAttribute("aria-hidden", "true")
    const labels = BODIES.map(({ name }) => {
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

    Result.match(buildStage(canvas), {
      onFailure: () => {
        this.#report({ _tag: "StageUnavailable" })
      },
      onSuccess: (stage) => {
        this.#stage = Option.some(stage)
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
    this.#framed = false
  }

  #report(report: StageReport): void {
    this.dispatchEvent(new CustomEvent(OUTPUT_EVENT, { detail: report, bubbles: true }))
  }

  #fit(stage: Stage3D): void {
    const { inlineSize, blockSize } = this.#size()
    if (inlineSize === 0 || blockSize === 0) return
    const aspect = inlineSize / blockSize
    stage.renderer.setSize(inlineSize, blockSize, false)
    stage.renderCamera.aspect = aspect
    stage.renderCamera.updateProjectionMatrix()
    stage.controlCamera.aspect = aspect
    stage.controlCamera.updateProjectionMatrix()
    const distance = fitDistance(FRAMED_RADIUS_KM, VERTICAL_FOV_DEGREES, aspect)
    stage.controls.maxDistance = distance * 3
    if (!this.#framed) {
      // Look down on the plane of the orbits from 30 degrees off the pole, so depth still reads.
      const tilt = Math.PI / 6
      stage.controlCamera.position.set(0, distance * Math.cos(tilt), distance * Math.sin(tilt))
      stage.controls.update()
      this.#framed = true
    }
    this.#dirty = true
  }

  #size(): { readonly inlineSize: number; readonly blockSize: number } {
    const box = this.getBoundingClientRect()
    return { inlineSize: box.width, blockSize: box.height }
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
    if (!this.#dirty) return
    this.#dirty = false
    const started = performance.now()
    this.#draw(stage, view)
    this.#measure(performance.now() - started)
  }

  #draw(stage: Stage3D, view: StageView): void {
    const { controlCamera, renderCamera, positions, renderer, scene } = stage
    const camera = [
      controlCamera.position.x,
      controlCamera.position.y,
      controlCamera.position.z,
    ] as const
    renderCamera.quaternion.copy(controlCamera.quaternion)
    renderCamera.updateMatrixWorld()

    // Ecliptic north is +y on screen. Three.js axes are x right, y up, z toward the viewer.
    const placed = skyPositionsAt(view.sky, view.at).map(({ name, eclipticKm }) => {
      const [x, y, z] = cameraRelative(
        [eclipticKm[0], eclipticKm[2], -eclipticKm[1]],
        camera,
      )
      return { name, unit: [x / KM_PER_UNIT, y / KM_PER_UNIT, z / KM_PER_UNIT] as const }
    })
    BODIES.forEach(({ name }, index) => {
      const body = placed.find((candidate) => candidate.name === name)
      if (body !== undefined) positions.setXYZ(index, body.unit[0], body.unit[1], body.unit[2])
    })
    positions.needsUpdate = true
    renderer.render(scene, renderCamera)
    this.#placeLabels(renderCamera, placed)
  }

  #placeLabels(
    camera: PerspectiveCamera,
    placed: ReadonlyArray<{ readonly name: string; readonly unit: readonly [number, number, number] }>,
  ): void {
    const { inlineSize, blockSize } = this.#size()
    const projected = LABEL_PRIORITY.flatMap((name) => {
      const body = placed.find((candidate) => candidate.name === name)
      if (body === undefined) return []
      const ndc = new Vector3(...body.unit).project(camera)
      return ndc.z >= 1
        ? []
        : [{ name, x: ((ndc.x + 1) / 2) * inlineSize, y: ((1 - ndc.y) / 2) * blockSize }]
    })
    const kept = labelsWithRoom(projected, LABEL_BOX_PIXELS)
    this.#labels.forEach((item, name) => {
      const label = kept.find((candidate) => candidate.name === name)
      item.hidden = label === undefined
      if (label === undefined) return
      const shift = labelSide(label.x, inlineSize, LABEL_BOX_PIXELS.width) === "before" ? "-100%" : "0"
      item.style.transform = `translate(${String(label.x)}px, ${String(label.y - 6)}px) translateX(${shift})`
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
