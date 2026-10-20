// 单颗天体：一颗真正在转的星球，背后是失焦的太阳系。
import * as THREE from '../assets/vendor/three.module.js'
import { BY_ID } from './bodies.js'

const DEG = Math.PI / 180

const ATMOS = {
  mercury: null,
  venus: [0xffe6b8, 1.1],
  earth: [0x6fa8ff, 1.5],
  moon: null,
  mars: [0xff9a6a, 0.5],
  jupiter: [0xffd9a0, 0.75],
  saturn: [0xffe3b0, 0.55],
  uranus: [0xa8f0ff, 0.95],
  neptune: [0x5b8cff, 1.1],
  pluto: [0x9fc4d8, 0.3],
  sun: null,
}

const FALLBACK = {
  mercury: 0x8c8279, venus: 0xe8d3a5, earth: 0x4a7fbf, mars: 0xc1552f,
  jupiter: 0xd8b48a, saturn: 0xe0cba0, uranus: 0x9fd8e0, neptune: 0x4a6fbf,
  pluto: 0xcbb8a8, moon: 0xb9b6b0, sun: 0xffcf80,
}

function coronaTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(256, 256, 0, 256, 256, 256)
  grd.addColorStop(0, 'rgba(255,250,235,1)')
  grd.addColorStop(0.20, 'rgba(255,226,170,0.55)')
  grd.addColorStop(0.34, 'rgba(255,180,100,0.22)')
  grd.addColorStop(0.55, 'rgba(255,150,80,0.07)')
  grd.addColorStop(1, 'rgba(255,140,80,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 512, 512)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const ATMO_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`
const ATMO_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uPower;
  uniform float uIntensity;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float f = pow(1.0 - clamp(dot(vN, vV), 0.0, 1.0), uPower);
    gl_FragColor = vec4(uColor, f * uIntensity);
  }
`

export function createPlanet(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)

  const key = new THREE.DirectionalLight(0xfff3e2, 3.4)
  key.position.set(-2.4, 1.5, 2.0)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x6f8fc4, 1.15)
  rim.position.set(2.6, -0.6, -1.4)
  scene.add(rim)
  scene.add(new THREE.AmbientLight(0x1a2438, 2.2))

  const loader = new THREE.TextureLoader()
  const cache = new Map()
  function texture(name) {
    if (!cache.has(name)) {
      const t = loader.load(`assets/textures/${name}`, opts.onTexture)
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
      cache.set(name, t)
    }
    return cache.get(name)
  }

  let root = null
  let body = null
  let spin = 0
  let dragOffset = 0
  let dragging = false
  let lastX = 0
  let running = false
  let raf = 0
  let lastT = 0

  function disposeRoot() {
    if (!root) return
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) {
        if (o.material.map && o.material.map.isCanvasTexture) o.material.map.dispose()
        o.material.dispose()
      }
    })
    scene.remove(root)
    root = null
  }

  function build(id) {
    disposeRoot()
    const data = BY_ID[id]
    if (!data) return
    body = data
    const v = data.visual
    root = new THREE.Group()
    scene.add(root)

    const isSun = id === 'sun'
    const hasRing = !!v.ring

    const geo = new THREE.SphereGeometry(1, 96, 64)
    const mat = isSun
      ? new THREE.MeshBasicMaterial({ color: 0xfff0cf, map: texture(v.texture) })
      : new THREE.MeshStandardMaterial({
          color: FALLBACK[id] || 0xffffff,
          map: texture(v.texture),
          roughness: 0.92,
          metalness: 0.0,
        })
    const sphere = new THREE.Mesh(geo, mat)
    sphere.rotation.z = (v.tiltDeg || 0) * DEG
    root.add(sphere)

    if (isSun) {
      mat.color.setHex(0xffffff)
      const g1 = new THREE.Sprite(new THREE.SpriteMaterial({
        map: coronaTexture(), blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
        transparent: true, opacity: 1.0,
      }))
      g1.scale.setScalar(2.9)
      root.add(g1)
      const g2 = g1.clone()
      g2.material = g1.material.clone()
      g2.material.opacity = 0.5
      g2.scale.setScalar(5.0)
      root.add(g2)
      const g3 = g1.clone()
      g3.material = g1.material.clone()
      g3.material.opacity = 0.22
      g3.scale.setScalar(8.4)
      root.add(g3)
    }

    if (id === 'earth') {
      const cloudTex = texture('earth-clouds.jpg')
      const clouds = new THREE.Mesh(
        new THREE.SphereGeometry(1.008, 72, 48),
        new THREE.MeshStandardMaterial({
          color: 0xffffff, alphaMap: cloudTex, transparent: true,
          opacity: 0.92, roughness: 1, metalness: 0, depthWrite: false,
        }),
      )
      sphere.userData.clouds = clouds
      root.add(clouds)
    }

    if (hasRing) {
      const inner = (v.ring.inner || 1.3)
      const outer = (v.ring.outer || 2.3)
      const rg = new THREE.RingGeometry(inner, outer, 200, 1)
      const pos = rg.attributes.position
      const uv = rg.attributes.uv
      const p = new THREE.Vector3()
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i)
        uv.setXY(i, (p.length() - inner) / (outer - inner), 0.5)
      }
      const rmat = new THREE.MeshStandardMaterial({
        map: texture(v.ring.texture),
        transparent: true,
        opacity: v.ring.opacity ?? 0.96,
        side: THREE.DoubleSide,
        roughness: 1,
        metalness: 0,
        depthWrite: false,
      })
      const ring = new THREE.Mesh(rg, rmat)
      ring.rotation.x = -Math.PI / 2
      root.add(ring)
    }

    const atmo = ATMOS[id]
    if (atmo) {
      const am = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(atmo[0]) },
          uPower: { value: 2.6 },
          uIntensity: { value: atmo[1] * 0.55 },
        },
        vertexShader: ATMO_VERT,
        fragmentShader: ATMO_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const shell = new THREE.Mesh(new THREE.SphereGeometry(1.035, 64, 48), am)
      root.add(shell)
    }

    root.rotation.z = 0
    spin = 0
    dragOffset = 0
    frame(hasRing, isSun)
  }

  function frame(hasRing, isSun) {
    const w = canvas.clientWidth || 600
    const h = canvas.clientHeight || 600
    const min = Math.min(w, h)
    let target = min * (hasRing ? 0.17 : 0.40)
    if (isSun) target = min * 0.28
    const d = (h / 2) / (target * Math.tan((camera.fov * DEG) / 2))
    camera.position.set(0, 0.34, d)
    camera.lookAt(0, 0, 0)
  }

  function resize() {
    const w = canvas.clientWidth || 600
    const h = canvas.clientHeight || 600
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    if (body) frame(!!body.visual.ring, body.id === 'sun')
  }

  function loop(now) {
    if (!running) return
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016)
    lastT = now
    if (root) {
      if (!dragging) spin += dt * 0.055
      root.rotation.y = spin + dragOffset
      const scale = 1 + Math.sin(now * 0.00035) * 0.004
      root.scale.setScalar(scale)
      if (body && body.id === 'earth') {
        const sphere = root.children[0]
        const clouds = sphere.userData.clouds
        if (clouds) clouds.rotation.y = (spin + dragOffset) * 0.12 + 0.4
      }
    }
    renderer.render(scene, camera)
    raf = requestAnimationFrame(loop)
  }

  function start() {
    if (running) return
    running = true
    resize()
    lastT = performance.now()
    raf = requestAnimationFrame(loop)
  }
  function stop() {
    running = false
    cancelAnimationFrame(raf)
  }

  function onDown(e) {
    dragging = true
    lastX = e.clientX
    canvas.setPointerCapture?.(e.pointerId)
  }
  function onMove(e) {
    if (!dragging) return
    dragOffset += (e.clientX - lastX) * 0.006
    lastX = e.clientX
  }
  function onUp() { dragging = false }

  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('resize', resize)

  return {
    show(id) { build(id); },
    start, stop, resize,
    get id() { return body ? body.id : null },
  }
}
