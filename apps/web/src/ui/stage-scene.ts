import { Result } from "effect"
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  LineBasicMaterial,
  LineLoop,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  WebGLRenderer,
  type Texture,
} from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import type { PlanetName } from "@solar/classroom/types"
import type { Vector3Km } from "@solar/ephemeris/types"

/** One scene unit, once positions are relative to the camera and small enough for 32-bit floats. */
export const KM_PER_UNIT = 1e6
export const VERTICAL_FOV_DEGREES = 45
export const ORBIT_POINTS = 360

const PLANET_DOT_PIXELS = 11
const SUN_DOT_PIXELS = 16
const SUN_GLOW_PIXELS = 36

/** Colors a learner would recognize. Uranus and Neptune are both pale, as Irwin et al. (2024) showed. */
export const PLANET_COLORS: ReadonlyArray<readonly [PlanetName, string]> = [
  ["Mercury", "#c9c4bb"],
  ["Venus", "#efdcae"],
  ["Earth", "#6fa8ff"],
  ["Mars", "#e8805a"],
  ["Jupiter", "#e3c594"],
  ["Saturn", "#ecdcae"],
  ["Uranus", "#b4e2e4"],
  ["Neptune", "#a9d6ea"],
]
const SUN_COLOR = "#ffd86b"

/** Ecliptic north points up the screen. Three.js axes are x right, y up, z toward the viewer. */
export const toScreenAxes = ([x, y, z]: Vector3Km): Vector3Km => [x, z, -y]

const dotTexture = (paint: (context: CanvasRenderingContext2D) => void): CanvasTexture => {
  const canvas = document.createElement("canvas")
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext("2d")
  if (context !== null) paint(context)
  return new CanvasTexture(canvas)
}

const solidDot = (context: CanvasRenderingContext2D) => {
  context.fillStyle = "#fff"
  context.beginPath()
  context.arc(32, 32, 30, 0, Math.PI * 2)
  context.fill()
}

const softGlow = (context: CanvasRenderingContext2D) => {
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, "rgba(255, 216, 107, 0.55)")
  gradient.addColorStop(1, "rgba(255, 216, 107, 0)")
  context.fillStyle = gradient
  context.fillRect(0, 0, 64, 64)
}

export interface OrbitLine {
  readonly planet: PlanetName
  readonly line: LineLoop
  readonly positions: BufferAttribute
  readonly material: LineBasicMaterial
}

export interface Scene3D {
  readonly renderer: WebGLRenderer
  readonly controls: OrbitControls
  readonly scene: Scene
  /** Takes the input from OrbitControls, in kilometers. Never rendered through. */
  readonly controlCamera: PerspectiveCamera
  /** Sits at the origin with the same orientation, which is what keeps positions small. */
  readonly renderCamera: PerspectiveCamera
  readonly planetPositions: BufferAttribute
  readonly sunPosition: BufferAttribute
  readonly orbitLines: ReadonlyArray<OrbitLine>
  readonly dispose: () => void
}

const pointsOf = (
  count: number,
  material: PointsMaterial,
  order: number,
): { readonly points: Points; readonly positions: BufferAttribute; readonly geometry: BufferGeometry } => {
  const geometry = new BufferGeometry()
  const positions = new BufferAttribute(new Float32Array(count * 3), 3)
  geometry.setAttribute("position", positions)
  const points = new Points(geometry, material)
  points.frustumCulled = false
  points.renderOrder = order
  return { points, positions, geometry }
}

const dotMaterial = (texture: Texture, size: number, color: string | undefined) =>
  new PointsMaterial({
    size,
    sizeAttenuation: false,
    map: texture,
    transparent: true,
    alphaTest: 0.01,
    depthTest: false,
    depthWrite: false,
    vertexColors: color === undefined,
    ...(color === undefined ? {} : { color: new Color(color) }),
  })

/** Builds the scene. WebGL can refuse to start on old machines, and the page handles that answer. */
export const buildScene = (canvas: HTMLCanvasElement): Result.Result<Scene3D, unknown> =>
  Result.try(() => {
    const renderer = new WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    const controlCamera = new PerspectiveCamera(VERTICAL_FOV_DEGREES, 1, 1, 1e12)
    const renderCamera = new PerspectiveCamera(VERTICAL_FOV_DEGREES, 1, 1e-3, 1e6)
    const controls = new OrbitControls(controlCamera, canvas)
    controls.enablePan = false

    const dotMap = dotTexture(solidDot)
    const glowMap = dotTexture(softGlow)
    const planetMaterial = dotMaterial(dotMap, PLANET_DOT_PIXELS, undefined)
    const sunMaterial = dotMaterial(dotMap, SUN_DOT_PIXELS, SUN_COLOR)
    const glowMaterial = dotMaterial(glowMap, SUN_GLOW_PIXELS, "#ffffff")
    glowMaterial.blending = AdditiveBlending

    const planets = pointsOf(PLANET_COLORS.length, planetMaterial, 3)
    planets.geometry.setAttribute(
      "color",
      new BufferAttribute(new Float32Array(PLANET_COLORS.flatMap(([, color]) => new Color(color).toArray())), 3),
    )
    const sun = pointsOf(1, sunMaterial, 2)
    const glow = new Points(sun.geometry, glowMaterial)
    glow.frustumCulled = false
    glow.renderOrder = 1

    const orbitLines = PLANET_COLORS.map(([planet, color]): OrbitLine => {
      const geometry = new BufferGeometry()
      const positions = new BufferAttribute(new Float32Array(ORBIT_POINTS * 3), 3)
      geometry.setAttribute("position", positions)
      const material = new LineBasicMaterial({
        color: new Color(color),
        transparent: true,
        opacity: 0.8,
        depthTest: false,
        depthWrite: false,
      })
      const line = new LineLoop(geometry, material)
      line.frustumCulled = false
      line.renderOrder = 0
      return { planet, line, positions, material }
    })

    const scene = new Scene()
    orbitLines.forEach(({ line }) => {
      scene.add(line)
    })
    scene.add(glow, sun.points, planets.points)

    return {
      renderer,
      controls,
      scene,
      controlCamera,
      renderCamera,
      planetPositions: planets.positions,
      sunPosition: sun.positions,
      orbitLines,
      dispose: () => {
        controls.dispose()
        planets.geometry.dispose()
        sun.geometry.dispose()
        orbitLines.forEach(({ line, material }) => {
          line.geometry.dispose()
          material.dispose()
        })
        planetMaterial.dispose()
        sunMaterial.dispose()
        glowMaterial.dispose()
        dotMap.dispose()
        glowMap.dispose()
        renderer.dispose()
      },
    }
  })
