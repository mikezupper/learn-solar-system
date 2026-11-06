import { OUTPUT_EVENT } from "@gyral/core"
import { Option, Result } from "effect"
import { TdbSeconds } from "@solar/ephemeris/types"
import type { StageReport, StageView } from "../types/index.js"
import { COPY } from "./copy.js"
import { letThePageScroll, steerFromKeyboard } from "./stage-input.js"
import { SkyPainter } from "./stage-painter.js"
import { CameraRig, FRAMED_RADIUS_KM } from "./stage-rig.js"
import { buildScene, PLANET_COLORS, type Scene3D } from "./stage-scene.js"
import STAGE_STYLES from "./stage.css?inline"

/**
 * One sheet, shared by every stage. A constructed sheet, unlike a <style> element, is allowed by the
 * page's Content-Security-Policy without 'unsafe-inline'.
 */
const STAGE_SHEET = new CSSStyleSheet()
STAGE_SHEET.replaceSync(STAGE_STYLES)

const FRAMES_PER_REPORT = 30
const FRAMES_PER_MEASURE = 8
const SECONDS_PER_MILLI = 0.001
const CLICK_PIXELS = 6
const NARROW_PIXELS = 992
const LAPTOP_TOP_INSET = 40
/** A bar narrower than this share of the stage sits beside the sky, and not across it. */
const BESIDE_THE_SKY = 0.5
const LEAST_SHARE_OF_SKY = 0.2
const SMALLEST_RING_TARGET_PIXELS = 30
const FARTHEST_ZOOM_OUT = 8

/**
 * The WebGL stage: one input property, its own lifecycle, teardown when it leaves the page. It draws
 * only when something changed, because a classroom laptop should not spin its fan for a sky that
 * moves a pixel an hour. While time runs fast, it advances between the page's ticks by itself.
 */
export class SkyStage extends HTMLElement {
  #view: Option.Option<StageView> = Option.none()
  #viewArrivedAt = 0
  #stage: Option.Option<Scene3D> = Option.none()
  #rig: Option.Option<CameraRig> = Option.none()
  #painter: Option.Option<SkyPainter> = Option.none()
  #resize: Option.Option<ResizeObserver> = Option.none()
  #frame = 0
  #frameCount = 0
  #lastFrameAt = 0
  #dirty = true
  #coversChanged = true
  #frameMillis: ReadonlyArray<number> = []
  #pressedAt: readonly [number, number] | undefined = undefined
  #teardowns: ReadonlyArray<() => void> = []
  readonly #reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
  readonly #overlay = document.createElement("canvas")

  set view(view: StageView | undefined) {
    if (view === undefined) return
    this.#view = Option.some(view)
    this.#viewArrivedAt = performance.now()
    this.#dirty = true
    this.#coversChanged = true
  }

  connectedCallback(): void {
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" })
    const canvas = document.createElement("canvas")
    canvas.dataset["sky"] = ""
    canvas.setAttribute("role", "img")
    canvas.setAttribute("aria-label", COPY.stageLabel)
    canvas.tabIndex = 0
    this.#overlay.dataset["overlay"] = ""
    this.#overlay.setAttribute("aria-hidden", "true")
    const year = document.createElement("p")
    year.dataset["year"] = ""
    year.setAttribute("aria-hidden", "true")
    const badge = document.createElement("p")
    badge.dataset["badge"] = ""
    badge.hidden = true
    const list = document.createElement("ol")
    list.setAttribute("aria-hidden", "true")
    const labels = ["Sun", ...PLANET_COLORS.map(([name]) => name)].map((name) => {
      const item = document.createElement("li")
      item.textContent = name
      item.hidden = true
      list.append(item)
      return [name, item] as const
    })
    root.adoptedStyleSheets = [STAGE_SHEET]
    root.replaceChildren(year, canvas, this.#overlay, list, badge)

    Result.match(buildScene(canvas), {
      onFailure: () => {
        this.#report({ _tag: "StageUnavailable" })
      },
      onSuccess: (stage) => {
        this.#stage = Option.some(stage)
        this.#rig = Option.some(new CameraRig(stage, this.#reduced))
        this.#painter = Option.some(
          new SkyPainter({ host: this, overlay: this.#overlay, year, badge, labels: new Map(labels) }, this.#reduced),
        )
        stage.controls.addEventListener("change", () => {
          this.#dirty = true
        })
        const onScroll = () => {
          this.#coversChanged = true
        }
        window.addEventListener("scroll", onScroll, { passive: true })
        this.#teardowns = [
          () => {
            window.removeEventListener("scroll", onScroll)
          },
          letThePageScroll(canvas),
          steerFromKeyboard(canvas, stage.controlCamera, stage.controls, () => {
            this.#dirty = true
          }),
          this.#listenForRing(canvas),
        ]
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
    this.#teardowns.forEach((teardown) => {
      teardown()
    })
    this.#teardowns = []
    Option.map(this.#stage, (stage) => {
      stage.dispose()
    })
    this.#resize = Option.none()
    this.#stage = Option.none()
    this.#rig = Option.none()
    this.#painter = Option.none()
  }

  #report(report: StageReport): void {
    this.dispatchEvent(new CustomEvent(OUTPUT_EVENT, { detail: report, bubbles: true }))
  }

  /** A press that barely moved, inside the ring, flies in. A drag turns the view as usual. */
  #listenForRing(canvas: HTMLCanvasElement): () => void {
    const inRing = (event: PointerEvent): boolean => {
      const painter = Option.getOrUndefined(this.#painter)
      const sun = painter?.sunOnScreen
      if (painter === undefined || sun === undefined || painter.ringPixels === 0) return false
      const box = canvas.getBoundingClientRect()
      const away = Math.hypot(event.clientX - box.left - sun[0], event.clientY - box.top - sun[1])
      return away < Math.max(SMALLEST_RING_TARGET_PIXELS, painter.ringPixels * 1.08)
    }
    const down = (event: PointerEvent) => {
      this.#pressedAt = [event.clientX, event.clientY]
    }
    const up = (event: PointerEvent) => {
      const [x, y] = this.#pressedAt ?? [Number.POSITIVE_INFINITY, 0]
      this.#pressedAt = undefined
      if (Math.hypot(event.clientX - x, event.clientY - y) < CLICK_PIXELS && inRing(event)) {
        this.#report({ _tag: "RingChosen" })
      }
    }
    const move = (event: PointerEvent) => {
      canvas.toggleAttribute("data-hit", inRing(event))
    }
    canvas.addEventListener("pointerdown", down)
    canvas.addEventListener("pointerup", up)
    canvas.addEventListener("pointermove", move)
    return () => {
      canvas.removeEventListener("pointerdown", down)
      canvas.removeEventListener("pointerup", up)
      canvas.removeEventListener("pointermove", move)
    }
  }

  #fit(stage: Scene3D): void {
    const box = this.getBoundingClientRect()
    const rig = Option.getOrUndefined(this.#rig)
    if (rig === undefined || box.width === 0 || box.height === 0) return
    rig.size = { inlineSize: box.width, blockSize: box.height }
    const ratio = Math.min(window.devicePixelRatio, 2)
    stage.renderer.setSize(box.width, box.height, false)
    this.#overlay.width = Math.round(box.width * ratio)
    this.#overlay.height = Math.round(box.height * ratio)
    stage.renderCamera.aspect = box.width / box.height
    stage.renderCamera.updateProjectionMatrix()
    stage.controlCamera.aspect = box.width / box.height
    stage.controlCamera.updateProjectionMatrix()
    stage.controls.maxDistance = FRAMED_RADIUS_KM.all * FARTHEST_ZOOM_OUT
    this.#measureCovers(rig)
    this.#dirty = true
  }

  /**
   * Finds the part of the sky that can be seen, and tells the page's layout how tall the controls are. On a
   * phone the figure scrolls up until only its lower part shows, so this runs on every scroll as well.
   */
  #measureCovers(rig: CameraRig): void {
    const box = this.getBoundingClientRect()
    if (box.width === 0) return
    const dock = document.querySelector("[data-dock]")?.getBoundingClientRect()
    const header = document.querySelector("body > header")?.getBoundingClientRect()
    const tilesElement = document.querySelector("[data-view]")
    const panel = document.querySelector("[data-numbers]")?.getBoundingClientRect()
    // In the sheet the views cover nothing for long, and closed they have no box at all.
    const inSheet = tilesElement?.matches("[data-controls]:popover-open *") === true
    const tilesBox = tilesElement?.getBoundingClientRect()
    const tiles = tilesBox === undefined || tilesBox.height === 0 || inSheet ? undefined : tilesBox
    const classroom = this.closest<HTMLElement>("solar-classroom")
    if (dock !== undefined) classroom?.style.setProperty("--dock-h", `${String(dock.height + 16)}px`)
    classroom?.style.setProperty("--tiles-h", `${String(tiles === undefined ? 0 : tiles.height + 8)}px`)
    const shown = Math.max(0, -box.top)
    const beside = dock !== undefined && dock.width < box.width * BESIDE_THE_SKY
    const sidePanel = panel !== undefined && panel.width < box.width * BESIDE_THE_SKY * 1.5
    const panelOpen = sidePanel && panel.top < box.height * 0.62 && panel.bottom > box.height * 0.3
    const panelOnLeft = panelOpen && panel.left - box.left < box.width / 4
    const headerFloats = window.innerWidth < NARROW_PIXELS && header !== undefined
    const coveredFrom = Math.min(dock?.top ?? Number.POSITIVE_INFINITY, tiles?.top ?? Number.POSITIVE_INFINITY)
    const top = Math.max(shown, headerFloats ? header.bottom - box.top : shown + LAPTOP_TOP_INSET)
    rig.cover(
      {
        left: panelOnLeft ? panel.right - box.left : 0,
        right: beside ? dock.left - box.left : panelOpen && !panelOnLeft ? panel.left - box.left : box.width,
        top,
        bottom: beside ? box.height : Math.max(top + box.height * LEAST_SHARE_OF_SKY, Math.min(box.height, coveredFrom - box.top)),
      },
      Option.getOrUndefined(this.#view),
    )
  }

  #schedule(): void {
    this.#frame = requestAnimationFrame((now) => {
      this.#tick(now)
      this.#schedule()
    })
  }

  #tick(now: number): void {
    const stage = Option.getOrUndefined(this.#stage)
    const rig = Option.getOrUndefined(this.#rig)
    const painter = Option.getOrUndefined(this.#painter)
    if (stage === undefined || rig === undefined || painter === undefined) return
    const dt = Math.min(0.1, (now - this.#lastFrameAt) * SECONDS_PER_MILLI)
    this.#lastFrameAt = now
    this.#frameCount += 1
    if (this.#coversChanged || this.#frameCount % FRAMES_PER_MEASURE === 0) {
      this.#coversChanged = false
      this.#measureCovers(rig)
    }
    const view = Option.getOrUndefined(this.#view)
    if (view === undefined) {
      if (this.#dirty) stage.renderer.render(stage.scene, stage.renderCamera)
      this.#dirty = false
      return
    }
    if (rig.frameTo(view)) this.#dirty = true
    const elapsed = Math.max(0, (performance.now() - this.#viewArrivedAt) * SECONDS_PER_MILLI)
    const at = TdbSeconds(Math.max(view.startSeconds, Math.min(view.at + view.rate * elapsed, view.endSeconds)))
    const moving =
      view.rate !== 0 ||
      rig.moving ||
      painter.hasTrails ||
      (Option.isSome(view.lightFrom) && !this.#reduced)
    if (rig.advance(view, at, now, dt)) this.#dirty = true
    if (!this.#dirty && !moving) return
    this.#dirty = false
    const started = performance.now()
    painter.draw(stage, rig, view, at, now, elapsed)
    this.#timeFrame(performance.now() - started)
  }

  #timeFrame(millis: number): void {
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
