import { Result } from "effect"
import {
  AdditiveBlending,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineLoop,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  RingGeometry,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
  type Texture,
} from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { eclipticFromIcrf } from "@solar/classroom/service"
import { PLANETS, SUN_DIAMETER_KM, type BodyName, type PlanetName } from "@solar/classroom/types"
import type { Vector3Km } from "@solar/ephemeris/types"
import { starField } from "./stage-stars.js"

/** One scene unit, once positions are relative to the camera and small enough for 32-bit floats. */
export const KM_PER_UNIT = 1e6
export const VERTICAL_FOV_DEGREES = 45
export const ORBIT_POINTS = 360

const PLANET_DOT_PIXELS = 11
const SUN_DOT_PIXELS = 16
const SUN_GLOW_PIXELS = 36
/** Far enough that stars never shift as the camera turns: the render camera sits at the origin. */
const STAR_RADIUS_UNITS = 5e5
const FAINT_STARS = 3200
const BRIGHT_STARS = 260

/** Saturn's rings, from NASA's fact sheets: the C ring's inner edge to the A ring's outer edge. */
const SATURN_EQUATOR_KM = 60_268
const RING_INNER_KM = 74_658
const RING_OUTER_KM = 136_780
/** Saturn's north pole at J2000, from NASA's Saturn fact sheet. */
const SATURN_POLE_RA_DEGREES = 40.589
const SATURN_POLE_DEC_DEGREES = 83.537

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

const dotTexture = (paint: (context: CanvasRenderingContext2D, color: string) => void, color = "#ffffff"): CanvasTexture => {
  const canvas = document.createElement("canvas")
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext("2d")
  if (context !== null) paint(context, color)
  return new CanvasTexture(canvas)
}

const solidDot = (context: CanvasRenderingContext2D) => {
  context.fillStyle = "#fff"
  context.beginPath()
  context.arc(32, 32, 30, 0, Math.PI * 2)
  context.fill()
}

const softGlow = (context: CanvasRenderingContext2D, color: string) => {
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, color === "#ffffff" ? "rgba(255, 255, 255, 1)" : "rgba(255, 216, 107, 0.55)")
  gradient.addColorStop(1, color === "#ffffff" ? "rgba(255, 255, 255, 0)" : "rgba(255, 216, 107, 0)")
  context.fillStyle = gradient
  context.fillRect(0, 0, 64, 64)
}

export interface SizedBody {
  readonly name: BodyName
  readonly mesh: Mesh
  readonly radiusKm: number
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
  /** The lines and dots, hidden until the first answer arrives. Only the stars show before then. */
  readonly bodies: Group
  /** Dots mark true positions. The sized bodies replace them only in the labeled view. */
  readonly dots: Group
  readonly sized: ReadonlyArray<SizedBody>
  readonly sizedGroup: Group
  readonly sunlight: PointLight
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

/** Saturn's rings, in units of the sphere's radius, tilted by its pole, which real rings follow. */
const saturnRings = (): Mesh => {
  const geometry = new RingGeometry(RING_INNER_KM / SATURN_EQUATOR_KM, RING_OUTER_KM / SATURN_EQUATOR_KM, 96)
  const material = new MeshBasicMaterial({
    color: new Color("#d8c9a0"),
    transparent: true,
    opacity: 0.6,
    side: DoubleSide,
    depthWrite: false,
  })
  const rings = new Mesh(geometry, material)
  const ra = (SATURN_POLE_RA_DEGREES * Math.PI) / 180
  const dec = (SATURN_POLE_DEC_DEGREES * Math.PI) / 180
  const [x, y, z] = toScreenAxes(
    eclipticFromIcrf([Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)]),
  )
  rings.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(x, y, z))
  return rings
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
    // Clear, so that the giant year shows through from behind.
    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, logarithmicDepthBuffer: true })
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    const controlCamera = new PerspectiveCamera(VERTICAL_FOV_DEGREES, 1, 1, 1e12)
    const renderCamera = new PerspectiveCamera(VERTICAL_FOV_DEGREES, 1, 1e-3, 1e6)
    const controls = new OrbitControls(controlCamera, canvas)
    controls.enablePan = false

    const dotMap = dotTexture(solidDot)
    const glowMap = dotTexture(softGlow, SUN_COLOR)
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

    const starMap = dotTexture(softGlow, "#ffffff")
    const stars = [
      { count: FAINT_STARS, size: 3, faintest: 0.18 },
      { count: BRIGHT_STARS, size: 6, faintest: 0.55 },
    ].map(({ count, size, faintest }) => {
      const field = starField(count, STAR_RADIUS_UNITS, faintest)
      const geometry = new BufferGeometry()
      geometry.setAttribute("position", new BufferAttribute(field.positions, 3))
      geometry.setAttribute("color", new BufferAttribute(field.colors, 3))
      const material = new PointsMaterial({
        size,
        sizeAttenuation: false,
        map: starMap,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        vertexColors: true,
        blending: AdditiveBlending,
      })
      const points = new Points(geometry, material)
      points.frustumCulled = false
      points.renderOrder = -1
      return { points, geometry, material }
    })

    const sphere = new SphereGeometry(1, 40, 28)
    const planetBodies = PLANET_COLORS.map(([name, color]): SizedBody => {
      const material = new MeshLambertMaterial({ color: new Color(color) })
      const mesh = new Mesh(sphere, material)
      mesh.frustumCulled = false
      const diameterKm = PLANETS.find((planet) => planet.name === name)?.diameterKm ?? 0
      return { name, mesh, radiusKm: diameterKm / 2 }
    })
    const rings = saturnRings()
    planetBodies.find(({ name }) => name === "Saturn")?.mesh.add(rings)
    const sunBody: SizedBody = {
      name: "Sun",
      mesh: new Mesh(sphere, new MeshBasicMaterial({ color: new Color(SUN_COLOR) })),
      radiusKm: SUN_DIAMETER_KM / 2,
    }
    sunBody.mesh.frustumCulled = false
    const sunlight = new PointLight("#ffffff", 3.2, 0, 0)
    const sizedGroup = new Group()
    sizedGroup.add(...planetBodies.map(({ mesh }) => mesh), sunBody.mesh, sunlight, new AmbientLight("#ffffff", 0.22))
    sizedGroup.visible = false

    const dots = new Group()
    dots.add(glow, sun.points, planets.points)
    const bodies = new Group()
    orbitLines.forEach(({ line }) => {
      bodies.add(line)
    })
    bodies.add(dots, sizedGroup)
    bodies.visible = false
    const scene = new Scene()
    scene.add(...stars.map(({ points }) => points), bodies)

    return {
      renderer,
      controls,
      scene,
      controlCamera,
      renderCamera,
      planetPositions: planets.positions,
      sunPosition: sun.positions,
      orbitLines,
      bodies,
      dots,
      sized: [...planetBodies, sunBody],
      sizedGroup,
      sunlight,
      dispose: () => {
        controls.dispose()
        stars.forEach(({ geometry, material }) => {
          geometry.dispose()
          material.dispose()
        })
        starMap.dispose()
        sphere.dispose()
        rings.geometry.dispose()
        planetBodies.forEach(({ mesh }) => {
          if (mesh.material instanceof Material) mesh.material.dispose()
        })
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
