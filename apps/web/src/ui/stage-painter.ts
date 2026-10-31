import { Option } from "effect"
import { Vector3 } from "three"
import {
  cameraRelative,
  kmPerPixel,
  orbitsAt,
  placeLabels,
  scaleBarAu,
  sizeScales,
  skyPositionsAt,
} from "@solar/classroom/service"
import { KM_PER_AU, LIGHT_MINUTES_PER_KM, type BodyName, type Sky } from "@solar/classroom/types"
import type { TdbSeconds, Vector3Km } from "@solar/ephemeris/types"
import type { StageView } from "../types/index.js"
import { COPY } from "./copy.js"
import { drawOverlay, paintBloom, type Point, type Ring, type Trail } from "./stage-overlay.js"
import type { CameraRig } from "./stage-rig.js"
import {
  KM_PER_UNIT,
  ORBIT_POINTS,
  PLANET_COLORS,
  toScreenAxes,
  VERTICAL_FOV_DEGREES,
  type Scene3D,
} from "./stage-scene.js"

/** The room a label needs, in the display font. Labels sit beside their dots, so they are wider than tall. */
const LABEL_BOX_PIXELS = { width: 92, height: 14 }
const ORBIT_REFRESH_SECONDS = 30 * 86_400
const TRAIL_MILLIS = 1500
const TRAIL_SAMPLE_MILLIS = 16
const RING_RADIUS_AU = 2.4
const RING_POINTS = 48
const RING_GONE_PIXELS = 90
const RING_FADE_PIXELS = 20
const NARROW_PIXELS = 992
const OPTIONAL_LABELS: ReadonlySet<string> = new Set(["Mars", "Venus", "Mercury"])
const COLORS: ReadonlyMap<string, string> = new Map(PLANET_COLORS)

/** When labels collide, these win: the Sun, then Earth, then the giants. */
const LABEL_PRIORITY: ReadonlyArray<BodyName> = [
  "Sun", "Earth", "Jupiter", "Saturn", "Uranus", "Neptune", "Mars", "Venus", "Mercury",
]

interface Sample {
  readonly km: Vector3Km
  readonly bornAt: number
}

interface Placed {
  readonly name: BodyName
  readonly km: Vector3Km
  readonly unit: Vector3Km
}

export interface StageParts {
  readonly host: HTMLElement
  readonly overlay: HTMLCanvasElement
  readonly year: HTMLElement
  readonly badge: HTMLElement
  readonly labels: ReadonlyMap<string, HTMLElement>
}

/** Draws one frame: WebGL for the true positions, and the overlay for what needs thick lines. */
export class SkyPainter {
  sunOnScreen: Point | undefined = undefined
  ringPixels = 0
  #trails: ReadonlyMap<string, ReadonlyArray<Sample>> = new Map()
  #lastSampleAt = 0
  #orbitsFor: { readonly sky: Sky; readonly at: number } | undefined = undefined
  #labelWidths: ReadonlyMap<string, number> = new Map()
  #widthsFor = 0
  readonly #bloom = paintBloom()
  readonly #parts: StageParts
  readonly #reduced: boolean

  constructor(parts: StageParts, reduced: boolean) {
    this.#parts = parts
    this.#reduced = reduced
  }

  get hasTrails(): boolean {
    return this.#trails.size > 0
  }

  draw(stage: Scene3D, rig: CameraRig, view: StageView, at: TdbSeconds, now: number, elapsed: number): void {
    const { controlCamera, renderCamera, renderer, scene } = stage
    const camera: Vector3Km = [controlCamera.position.x, controlCamera.position.y, controlCamera.position.z]
    renderCamera.quaternion.copy(controlCamera.quaternion)
    renderCamera.updateMatrixWorld()
    const inView = (km: Vector3Km): Vector3Km => {
      const [x, y, z] = cameraRelative(km, camera)
      return [x / KM_PER_UNIT, y / KM_PER_UNIT, z / KM_PER_UNIT]
    }
    const placed = skyPositionsAt(view.sky, at).map(({ name, eclipticKm }): Placed => {
      const km = toScreenAxes(eclipticKm)
      return { name, km, unit: inView(km) }
    })
    const sun = placed.find((body) => body.name === "Sun")
    if (sun === undefined) return
    stage.bodies.visible = true
    stage.sunPosition.setXYZ(0, sun.unit[0], sun.unit[1], sun.unit[2])
    stage.sunPosition.needsUpdate = true
    PLANET_COLORS.forEach(([name], index) => {
      const body = placed.find((candidate) => candidate.name === name)
      if (body !== undefined) stage.planetPositions.setXYZ(index, body.unit[0], body.unit[1], body.unit[2])
    })
    stage.planetPositions.needsUpdate = true

    const distance = controlCamera.position.distanceTo(stage.controls.target)
    const pixel = kmPerPixel(distance, VERTICAL_FOV_DEGREES, rig.size.blockSize)
    this.#showSizes(stage, view, placed, pixel)
    this.#refreshOrbits(stage, view.sky, at)
    const lit = Option.getOrUndefined(view.highlight)
    stage.orbitLines.forEach(({ line, planet, material }) => {
      line.position.set(sun.unit[0], sun.unit[1], sun.unit[2])
      material.opacity = lit === undefined ? 0.6 : planet === lit ? 1 : 0.3
    })
    renderer.render(scene, renderCamera)
    this.#placeLabels(rig, view, renderCamera, placed, pixel)
    this.#recordTrails(view, placed, now)
    const onScreen = (km: Vector3Km): Point | undefined => {
      const ndc = new Vector3(...inView(km)).project(renderCamera)
      return ndc.z < 1 ? [((ndc.x + 1) / 2) * rig.size.inlineSize, ((1 - ndc.y) / 2) * rig.size.blockSize] : undefined
    }
    this.#paintOverlay(rig, view, at, now, onScreen, sun.km, placed, pixel)
    this.#placeYear(rig, view, elapsed)
  }

  #placeYear(rig: CameraRig, view: StageView, elapsed: number): void {
    const { year } = this.#parts
    const text = String(new Date(view.moment + view.rate * elapsed * 1000).getUTCFullYear())
    if (year.textContent !== text) year.textContent = text
    const box = year.getBoundingClientRect()
    year.style.transform = `translate(${String((rig.free.left + rig.free.right - box.width) / 2)}px, ${String((rig.free.top + rig.free.bottom - box.height) / 2)}px)`
  }

  /** Keeps what each planet just did, as drawn. A trail is a record of real positions, never a guess. */
  #recordTrails(view: StageView, placed: ReadonlyArray<Placed>, now: number): void {
    const sampling = view.rate !== 0 && !this.#reduced && now - this.#lastSampleAt >= TRAIL_SAMPLE_MILLIS
    if (sampling) this.#lastSampleAt = now
    this.#trails = new Map(
      placed.flatMap(({ name, km }) => {
        if (name === "Sun") return []
        const kept = (this.#trails.get(name) ?? []).filter(({ bornAt }) => now - bornAt < TRAIL_MILLIS)
        const samples = sampling ? [...kept, { km, bornAt: now }] : kept
        return samples.length === 0 ? [] : [[name, samples] as const]
      }),
    )
  }

  /** The labeled view: true relative sizes among planets, and a badge stating each enlargement. */
  #showSizes(stage: Scene3D, view: StageView, placed: ReadonlyArray<Placed>, pixel: number): void {
    const { badge } = this.#parts
    stage.dots.visible = !view.showSizes
    stage.sizedGroup.visible = view.showSizes
    badge.hidden = !view.showSizes
    if (!view.showSizes) return
    const scales = sizeScales(pixel)
    stage.sized.forEach(({ name, mesh, radiusKm }) => {
      const body = placed.find((candidate) => candidate.name === name)
      if (body === undefined) return
      mesh.position.set(body.unit[0], body.unit[1], body.unit[2])
      mesh.scale.setScalar((radiusKm * (name === "Sun" ? scales.sun : scales.planets)) / KM_PER_UNIT)
      if (name === "Sun") stage.sunlight.position.copy(mesh.position)
    })
    const format = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
    const text = COPY.sizesBadge(format.format(scales.planets), format.format(scales.sun))
    if (badge.textContent !== text) badge.textContent = text
  }

  #paintOverlay(
    rig: CameraRig,
    view: StageView,
    at: TdbSeconds,
    now: number,
    onScreen: (km: Vector3Km) => Point | undefined,
    sunKm: Vector3Km,
    placed: ReadonlyArray<Placed>,
    pixel: number,
  ): void {
    const { host, overlay } = this.#parts
    const context = overlay.getContext("2d")
    if (context === null) return
    const { inlineSize, blockSize } = rig.size
    const hue = getComputedStyle(host).getPropertyValue("--warp-hue").trim() || "205"
    const trails = [...this.#trails].flatMap(([name, samples]): ReadonlyArray<Trail> => [{
      color: COLORS.get(name) ?? "#ffffff",
      points: samples.flatMap(({ km, bornAt }) => {
        const point = onScreen(km)
        return point === undefined ? [] : [{ point, fade: 1 - (now - bornAt) / TRAIL_MILLIS }]
      }),
    }])
    const sun = onScreen(sunKm)
    this.sunOnScreen = sun
    const pixelsPerAu = KM_PER_AU / pixel
    const au = scaleBarAu(pixelsPerAu, inlineSize)
    const caption = host.parentElement?.querySelector("figcaption")?.getBoundingClientRect()
    const captionTop = caption === undefined || caption.height === 0 ? undefined : caption.top
    drawOverlay(context, {
      width: inlineSize,
      height: blockSize,
      ratio: overlay.width / Math.max(1, inlineSize),
      accent: `oklch(80% 0.15 ${hue})`,
      sun,
      bloom: this.#bloom,
      bloomSize: Math.min(inlineSize, blockSize) * (view.showSizes ? 0.35 : 0.85),
      trails,
      ring: this.#ringFor(rig, view, onScreen, sunKm, placed, pixelsPerAu),
      beam: this.#beamFor(view, at, now, onScreen, placed),
      scale: {
        x: window.innerWidth < NARROW_PIXELS ? 16 : 32,
        y: captionTop === undefined ? rig.free.bottom - 24 : captionTop - host.getBoundingClientRect().top - 6,
        pixels: au * pixelsPerAu,
        text: COPY.scaleBar(au),
      },
    })
  }

  /** The straight path a planet's light takes to Earth, marked with how long it takes. */
  #beamFor(
    view: StageView,
    at: TdbSeconds,
    now: number,
    onScreen: (km: Vector3Km) => Point | undefined,
    placed: ReadonlyArray<Placed>,
  ) {
    const name = Option.getOrUndefined(view.lightFrom)
    const body = placed.find((candidate) => candidate.name === name)
    const earth = placed.find((candidate) => candidate.name === "Earth")
    const planet = view.sky.planets.find((candidate) => candidate.name === name)
    if (body === undefined || earth === undefined || planet === undefined) return undefined
    const from = onScreen(body.km)
    const to = onScreen(earth.km)
    if (from === undefined || to === undefined) return undefined
    const [x, y, z] = planet.track(at)
    const [ex, ey, ez] = view.sky.earth(at)
    return {
      from,
      to,
      dashOffset: this.#reduced ? 0 : -now / 45,
      text: COPY.ofLight(Math.hypot(x - ex, y - ey, z - ez) * LIGHT_MINUTES_PER_KM),
    }
  }

  /** The dashed ring that says the inner planets are in here. It fades once they can be told apart. */
  #ringFor(
    rig: CameraRig,
    view: StageView,
    onScreen: (km: Vector3Km) => Point | undefined,
    sunKm: Vector3Km,
    placed: ReadonlyArray<Placed>,
    pixelsPerAu: number,
  ): Ring | undefined {
    const pixels = RING_RADIUS_AU * pixelsPerAu
    const opacity = Math.max(0, Math.min(1, (RING_GONE_PIXELS - pixels) / RING_FADE_PIXELS))
    this.ringPixels = view.framing === "all" && opacity > 0 ? pixels : 0
    if (this.ringPixels === 0) return undefined
    const outline = Array.from({ length: RING_POINTS }, (_, index): Point | undefined => {
      const angle = (index / RING_POINTS) * Math.PI * 2
      return onScreen([
        sunKm[0] + Math.cos(angle) * RING_RADIUS_AU * KM_PER_AU,
        sunKm[1],
        sunKm[2] + Math.sin(angle) * RING_RADIUS_AU * KM_PER_AU,
      ])
    }).filter((point) => point !== undefined)
    return {
      outline,
      opacity,
      words: COPY.ringWords,
      action: COPY.ringAction,
      floor: rig.free.top,
      ceiling: rig.free.bottom,
      leftEdge: rig.free.left,
      rightEdge: rig.free.right,
      bodies: placed.flatMap(({ km }) => {
        const point = onScreen(km)
        return point === undefined ? [] : [point]
      }),
    }
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

  /** Labels change width only with the view and the font, so each is measured once, not on every frame. */
  #labelWidth(name: string, viewWidth: number): number | undefined {
    if (viewWidth !== this.#widthsFor) {
      this.#widthsFor = viewWidth
      this.#labelWidths = new Map()
    }
    const known = this.#labelWidths.get(name)
    if (known !== undefined) return known
    const measured = this.#parts.labels.get(name)?.offsetWidth ?? 0
    if (measured === 0) return undefined
    this.#labelWidths = new Map([...this.#labelWidths, [name, measured]])
    return measured
  }

  #placeLabels(rig: CameraRig, view: StageView, camera: Scene3D["renderCamera"], placed: ReadonlyArray<Placed>, pixel: number): void {
    const { inlineSize, blockSize } = rig.size
    // With everything in view, the ring speaks for the planets too close to the Sun to name one by one.
    const crowded = view.framing === "all" && (RING_RADIUS_AU * KM_PER_AU) / pixel < RING_GONE_PIXELS - RING_FADE_PIXELS
    const projected = LABEL_PRIORITY.flatMap((name) => {
      if (crowded && OPTIONAL_LABELS.has(name)) return []
      const body = placed.find((candidate) => candidate.name === name)
      if (body === undefined) return []
      const ndc = new Vector3(...body.unit).project(camera)
      const x = ((ndc.x + 1) / 2) * inlineSize
      const y = ((1 - ndc.y) / 2) * blockSize
      const visible = ndc.z < 1 && x >= 0 && x <= inlineSize && y >= 0 && y <= blockSize
      return visible ? [{ name, x, y, width: this.#labelWidth(name, inlineSize) }] : []
    })
    const kept = placeLabels(projected, inlineSize, LABEL_BOX_PIXELS)
    this.#parts.labels.forEach((item, name) => {
      const label = kept.find((candidate) => candidate.name === name)
      item.hidden = label === undefined
      if (label === undefined) return
      const shift = label.side === "before" ? "-100%" : "0"
      item.style.transform = `translate(${String(label.x)}px, ${String(label.y - 8)}px) translateX(${shift})`
    })
  }
}
