// 银河。一个由二十万个点构成的旋涡星系，缓慢自转；
// 太阳系是其中一颗会闪的、几乎看不见的星。
// 点进去时不做黑场切页：镜头俯冲到那颗星，再拉回到与太阳系完全相同的机位，
// 同时把所有粒子从星系坐标插值到行星轨道坐标——于是粒子"重组"成了太阳系。
import * as THREE from '../assets/vendor/three.module.js'
import { BODIES } from './bodies.js'
import { SYSTEM_LAYOUT } from './system.js'

const TAU = Math.PI * 2
const K = SYSTEM_LAYOUT.scale
const clamp01 = (v) => Math.min(1, Math.max(0, v))
const smooth = (t) => t * t * (3 - 2 * t)

function gauss() {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v)
}

function glowTexture(inner, mid, size = 256) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grd.addColorStop(0, inner)
  grd.addColorStop(0.16, mid)
  grd.addColorStop(0.52, 'rgba(255,190,120,0.05)')
  grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

const VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute vec3 aTarget;
  attribute float aDelay;
  uniform float uScale;
  uniform float uProgress;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float p = clamp((uProgress - aDelay * 0.30) / 0.70, 0.0, 1.0);
    p = p * p * (3.0 - 2.0 * p);
    vec3 pos = mix(position, aTarget, p);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(0.7, aSize * mix(1.0, 1.3, p) * uScale / max(0.6, -mv.z));
    vec3 warm = mix(aColor, vec3(1.0, 0.955, 0.86), 0.75);
    vColor = mix(aColor, warm, p);
    vAlpha = aAlpha * mix(1.0, 1.9, p);
  }
`

const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = dot(d, d) * 4.0;
    if (r > 1.0) discard;
    float a = 1.0 - r;
    a = a * a * a;
    gl_FragColor = vec4(vColor, a * vAlpha);
  }
`

// 不参与重组、只是随进度淡出的层（尘埃带、背景星）
const FRAG_FADE = /* glsl */ `
  uniform float uProgress;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = dot(d, d) * 4.0;
    if (r > 1.0) discard;
    float a = 1.0 - r;
    a = a * a * a;
    gl_FragColor = vec4(vColor, a * vAlpha * (1.0 - uProgress));
  }
`

// 旋臂几何：对数螺线的简化写法
const ARMS = 4
const SWIRL = 4.35
const INNER = 0.055

function armPoint(r, armIndex, jitter = 1) {
  const spread = 0.055 + 0.185 * r
  const theta = (armIndex * TAU) / ARMS + SWIRL * Math.pow(r, 0.62) + gauss() * spread * jitter
  return { theta, r, y: gauss() * (0.016 + 0.014 * r) }
}

export function createGalaxy(canvas, opts = {}) {
  const mobile = matchMedia('(max-width: 820px)').matches
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.setClearColor(0x04050a, 1)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 60)
  const baseCam = new THREE.Vector3(0, 1.20, 1.60)
  camera.position.copy(baseCam)
  camera.lookAt(0, 0, 0)

  const lookBase = new THREE.Vector3(-0.10, -0.055, 0)

  const world = new THREE.Group()
  world.rotation.z = 0.13
  scene.add(world)

  // ── 太阳系靶图：粒子最终要落到这些位置上 ────────────────────────────────
  const orbitRs = BODIES
    .filter((b) => b.visual.aAU > 0 && b.id !== 'moon')
    .map((b) => SYSTEM_LAYOUT.orbitRadius(b.visual.aAU) * K)
  const beltIn = SYSTEM_LAYOUT.orbitRadius(2.06) * K
  const beltOut = SYSTEM_LAYOUT.orbitRadius(3.32) * K
  const kupIn = SYSTEM_LAYOUT.orbitRadius(30) * K
  const kupOut = SYSTEM_LAYOUT.orbitRadius(48) * K
  const sunR = SYSTEM_LAYOUT.sunRadius * K

  function solarTarget() {
    const rr = Math.random()
    if (rr < 0.10) {
      // 太阳：一个扁球状的致密核心
      const u = Math.pow(Math.random(), 2.2) * sunR * 0.92
      const a = Math.random() * TAU
      const b = Math.acos(2 * Math.random() - 1)
      return [u * Math.sin(b) * Math.cos(a), u * Math.cos(b) * 0.34, u * Math.sin(b) * Math.sin(a)]
    }
    if (rr < 0.72) {
      const orb = orbitRs[(Math.random() * orbitRs.length) | 0]
      const a = Math.random() * TAU
      const rad = orb * (1 + gauss() * 0.004)
      return [Math.cos(a) * rad, gauss() * 0.0012, Math.sin(a) * rad]
    }
    if (rr < 0.93) {
      const rad = beltIn + Math.random() * (beltOut - beltIn)
      const a = Math.random() * TAU
      return [Math.cos(a) * rad, gauss() * 0.0035, Math.sin(a) * rad]
    }
    const rad = kupIn + Math.random() * (kupOut - kupIn)
    const a = Math.random() * TAU
    return [Math.cos(a) * rad, gauss() * 0.006, Math.sin(a) * rad]
  }

  // ── 星系粒子 ────────────────────────────────────────────────────────────
  const COUNT = mobile ? 70000 : 210000
  const pos = new Float32Array(COUNT * 3)
  const col = new Float32Array(COUNT * 3)
  const siz = new Float32Array(COUNT)
  const alp = new Float32Array(COUNT)
  const tgt = new Float32Array(COUNT * 3)
  const dly = new Float32Array(COUNT)

  const C_WARM = new THREE.Color(0xfff6e4)
  const C_GOLD = new THREE.Color(0xffeecb)
  const C_WHITE = new THREE.Color(0xeaf0ff)
  const C_BLUE = new THREE.Color(0xa7c6ff)
  const C_COOL = new THREE.Color(0x7ba4f2)
  const C_HII = new THREE.Color(0xffb0aa)
  const tmp = new THREE.Color()
  const tmp2 = new THREE.Color()

  for (let i = 0; i < COUNT; i++) {
    let x, y, z, c, size, alpha
    const rnd = Math.random()

    if (rnd < 0.10) {
      // 核球：扁球状，密集、偏暖
      const br = Math.pow(Math.random(), 2.1) * 0.17
      const t = Math.random() * TAU
      const ph = Math.acos(2 * Math.random() - 1)
      x = br * Math.sin(ph) * Math.cos(t)
      z = br * Math.sin(ph) * Math.sin(t)
      y = br * Math.cos(ph) * 0.58
      c = tmp.copy(C_WARM).lerp(C_GOLD, Math.random())
      size = 0.8 + Math.random() * 2.2
      alpha = 0.09 + Math.random() * 0.20
    } else if (rnd < 0.108) {
      // 电离氢区：旋臂上的淡粉色亮结
      const r = 0.20 + Math.pow(Math.random(), 0.7) * 0.78
      const p = armPoint(r, Math.floor(Math.random() * ARMS), 0.28)
      x = r * Math.cos(p.theta)
      z = r * Math.sin(p.theta)
      y = p.y * 1.8
      c = C_HII
      size = 1.0 + Math.random() * 2.0
      alpha = 0.09 + Math.random() * 0.14
    } else {
      const r = INNER + Math.pow(Math.random(), 0.48) * (1 - INNER)
      const stray = Math.random() < 0.075
      const arm = Math.floor(Math.random() * ARMS)
      const p = armPoint(r, arm, stray ? 3.4 : 1)
      const theta = stray ? Math.random() * TAU : p.theta
      x = r * Math.cos(theta)
      z = r * Math.sin(theta)
      y = p.y * (stray ? 1.8 : 1)

      const t = Math.min(1, Math.max(0, (r - 0.04) / 0.96))
      if (t < 0.22) c = tmp.copy(C_WARM).lerp(C_GOLD, t / 0.22)
      else if (t < 0.44) c = tmp.copy(C_GOLD).lerp(C_WHITE, (t - 0.22) / 0.22)
      else if (t < 0.74) c = tmp.copy(C_WHITE).lerp(C_BLUE, (t - 0.44) / 0.30)
      else c = tmp.copy(C_BLUE).lerp(C_COOL, (t - 0.74) / 0.26)
      c = tmp2.copy(c).offsetHSL((Math.random() - 0.5) * 0.012, 0, (Math.random() - 0.5) * 0.05)

      const ridge = !stray && Math.random() < 0.22
      if (ridge) {
        size = 0.6 + Math.random() * 1.6
        alpha = 0.30 + Math.random() * 0.35
      } else {
        const big = Math.random() < 0.075
        if (big) {
          size = 3.0 + Math.random() * 7.0
          alpha = 0.010 + Math.random() * 0.028
        } else {
          const fine = Math.random()
          size = 0.40 + fine * fine * 1.8
          alpha = 0.04 + Math.random() * 0.13 + (1 - t) * 0.05
        }
      }
      if (stray) alpha *= 0.45
      const edge = 1 - Math.pow(Math.min(1, Math.max(0, (r - 0.55) / 0.45)), 1.6) * 0.9
      alpha *= edge
    }

    pos[i * 3] = x
    pos[i * 3 + 1] = y
    pos[i * 3 + 2] = z
    col[i * 3] = c.r
    col[i * 3 + 1] = c.g
    col[i * 3 + 2] = c.b
    siz[i] = size
    alp[i] = alpha

    const t3 = solarTarget()
    tgt[i * 3] = t3[0]
    tgt[i * 3 + 1] = t3[1]
    tgt[i * 3 + 2] = t3[2]
    dly[i] = Math.random()
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3))
  geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1))
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1))
  geo.setAttribute('aTarget', new THREE.BufferAttribute(tgt, 3))
  geo.setAttribute('aDelay', new THREE.BufferAttribute(dly, 1))

  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 1 }, uProgress: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const galaxy = new THREE.Points(geo, mat)
  galaxy.renderOrder = 1
  world.add(galaxy)

  function fadeMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 1 }, uProgress: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: FRAG_FADE,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  }

  // ── 尘埃带：用正常混合画暗点，压在旋臂内侧，形成暗纹 ─────────────────────
  const dustMat = fadeMaterial()
  dustMat.blending = THREE.NormalBlending
  {
    const N = mobile ? 7000 : 22000
    const p = new Float32Array(N * 3)
    const s = new Float32Array(N)
    const a = new Float32Array(N)
    const c = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      const r = INNER + Math.pow(Math.random(), 0.6) * (1 - INNER)
      const arm = Math.floor(Math.random() * ARMS)
      const base = (arm * TAU) / ARMS + SWIRL * Math.pow(r, 0.62)
      const theta = base - 0.075 + gauss() * (0.035 + 0.10 * r)
      const rr = r * (1 + gauss() * 0.012)
      p[i * 3] = rr * Math.cos(theta)
      p[i * 3 + 1] = gauss() * (0.010 + 0.008 * r)
      p[i * 3 + 2] = rr * Math.sin(theta)
      s[i] = 2.5 + Math.random() * 7.5
      a[i] = (0.020 + Math.random() * 0.055) * (r > 0.14 ? 1 : 0.3)
      c[i * 3] = 0.015; c[i * 3 + 1] = 0.014; c[i * 3 + 2] = 0.020
    }
    const dg = new THREE.BufferGeometry()
    dg.setAttribute('position', new THREE.BufferAttribute(p, 3))
    dg.setAttribute('aColor', new THREE.BufferAttribute(c, 3))
    dg.setAttribute('aSize', new THREE.BufferAttribute(s, 1))
    dg.setAttribute('aAlpha', new THREE.BufferAttribute(a, 1))
    dg.setAttribute('aTarget', dg.getAttribute('position'))
    dg.setAttribute('aDelay', new THREE.BufferAttribute(new Float32Array(N), 1))
    const dust = new THREE.Points(dg, dustMat)
    dust.renderOrder = 2
    world.add(dust)
  }

  // ── 核球辉光 ────────────────────────────────────────────────────────────
  const coreTex = glowTexture('rgba(255,246,226,0.95)', 'rgba(255,206,140,0.42)')
  const coreSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: coreTex, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, opacity: 0.6 }),
  )
  coreSprite.scale.setScalar(0.72)
  coreSprite.renderOrder = 3
  world.add(coreSprite)

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: coreTex, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, opacity: 0.20 }),
  )
  halo.scale.setScalar(2.9)
  halo.renderOrder = 3
  world.add(halo)

  // 重组完成时点亮的太阳辉光
  const flare = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: coreTex, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, opacity: 0 }),
  )
  flare.scale.setScalar(sunR * 16)
  flare.renderOrder = 5
  world.add(flare)

  // ── 星云薄雾 ────────────────────────────────────────────────────────────
  const mistTex = glowTexture('rgba(190,215,255,0.22)', 'rgba(120,170,255,0.10)')
  const mists = []
  for (let i = 0; i < 7; i++) {
    const r = 0.34 + Math.random() * 0.6
    const p = armPoint(r, i % ARMS, 0.3)
    const baseOpacity = 0.05 + Math.random() * 0.05
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: mistTex, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, opacity: baseOpacity }),
    )
    s.position.set(r * Math.cos(p.theta), p.y * 2, r * Math.sin(p.theta))
    const sc = 0.35 + Math.random() * 0.55
    s.scale.set(sc, sc * 0.55, sc)
    s.renderOrder = 3
    world.add(s)
    mists.push({ sprite: s, baseOpacity })
  }

  // ── 背景恒星 ────────────────────────────────────────────────────────────
  const bgMat = fadeMaterial()
  let bgStars = null
  const BG = mobile ? 2600 : 7000
  {
    const bgPos = new Float32Array(BG * 3)
    const bgCol = new Float32Array(BG * 3)
    const bgSiz = new Float32Array(BG)
    const bgAlp = new Float32Array(BG)
    const starTint = [0xffffff, 0xcfe0ff, 0xffe9c9, 0xffd0b0, 0xaecbff]
    for (let i = 0; i < BG; i++) {
      const u = Math.random() * TAU
      const v = Math.acos(2 * Math.random() - 1)
      const rr = 3.4 + Math.random() * 5.2
      bgPos[i * 3] = rr * Math.sin(v) * Math.cos(u)
      bgPos[i * 3 + 1] = rr * Math.cos(v) * 0.72
      bgPos[i * 3 + 2] = rr * Math.sin(v) * Math.sin(u)
      const c = new THREE.Color(starTint[(Math.random() * starTint.length) | 0])
      bgCol[i * 3] = c.r; bgCol[i * 3 + 1] = c.g; bgCol[i * 3 + 2] = c.b
      bgSiz[i] = 0.5 + Math.pow(Math.random(), 3) * 2.4
      bgAlp[i] = 0.10 + Math.random() * 0.45
    }
    const bgGeo = new THREE.BufferGeometry()
    bgGeo.setAttribute('position', new THREE.BufferAttribute(bgPos, 3))
    bgGeo.setAttribute('aColor', new THREE.BufferAttribute(bgCol, 3))
    bgGeo.setAttribute('aSize', new THREE.BufferAttribute(bgSiz, 1))
    bgGeo.setAttribute('aAlpha', new THREE.BufferAttribute(bgAlp, 1))
    bgGeo.setAttribute('aTarget', bgGeo.getAttribute('position'))
    bgGeo.setAttribute('aDelay', new THREE.BufferAttribute(new Float32Array(BG), 1))
    bgStars = new THREE.Points(bgGeo, bgMat)
    scene.add(bgStars)
  }

  // ── 太阳系信标 ──────────────────────────────────────────────────────────
  const beaconR = 0.615
  const beaconTheta = 2 * (TAU / ARMS) + SWIRL * Math.pow(beaconR, 0.62) + 0.06
  const beaconPos = new THREE.Vector3(beaconR * Math.cos(beaconTheta), 0.004, beaconR * Math.sin(beaconTheta))

  const beaconCore = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture('rgba(255,255,255,1)', 'rgba(255,225,180,0.5)', 128), blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true }),
  )
  beaconCore.position.copy(beaconPos)
  beaconCore.scale.setScalar(0.052)
  beaconCore.renderOrder = 4
  world.add(beaconCore)

  const beaconGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: coreTex, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, opacity: 0.0 }),
  )
  beaconGlow.position.copy(beaconPos)
  beaconGlow.scale.setScalar(0.26)
  beaconGlow.renderOrder = 4
  world.add(beaconGlow)

  // ── 状态 ────────────────────────────────────────────────────────────────
  const state = {
    pointer: new THREE.Vector2(0, 0),
    pointerPx: { x: -9999, y: -9999 },
    signal: 0,
    hot: false,
    running: false,
    diving: false,
    warping: false,
    frozen: false,
    t: 0,
    rot: 0,
    progress: 0,
  }

  const beaconScreen = { x: 0, y: 0, visible: false }
  const v3 = new THREE.Vector3()

  function resize() {
    const w = canvas.clientWidth || window.innerWidth
    const h = canvas.clientHeight || window.innerHeight
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.75 : 2)
    renderer.setPixelRatio(dpr)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.fov = w / h < 0.85 ? 58 : 42
    camera.updateProjectionMatrix()
    const scale = (h * dpr) / 780
    mat.uniforms.uScale.value = 3.3 * scale
    bgMat.uniforms.uScale.value = 2.4 * scale
    dustMat.uniforms.uScale.value = 3.3 * scale
  }

  function update(dt) {
    state.t += dt

    if (!reduced) {
      state.rot += dt * 0.0072
      world.rotation.y = state.rot
      bgStars.rotation.y = -state.rot * 0.12
    }

    const px = state.pointer.x
    const py = state.pointer.y
    camera.position.set(baseCam.x + px * 0.16, baseCam.y + py * 0.10, baseCam.z)
    camera.lookAt(lookBase)
    camera.rotation.z = px * 0.02

    const pulse = 0.5 + 0.5 * Math.sin(state.t * 2.1)
    const pulse2 = Math.pow(pulse, 3)
    beaconCore.scale.setScalar(0.040 + 0.022 * pulse2 + state.signal * 0.05)
    beaconCore.material.opacity = 0.55 + 0.45 * pulse
    beaconGlow.material.opacity = 0.04 + 0.10 * pulse2 + state.signal * state.signal * 0.9
    beaconGlow.scale.setScalar(0.20 + state.signal * 0.45)

    coreSprite.material.opacity = 0.55 + 0.05 * Math.sin(state.t * 0.7)

    v3.copy(beaconPos).applyMatrix4(world.matrixWorld).project(camera)
    beaconScreen.x = (v3.x * 0.5 + 0.5) * canvas.clientWidth
    beaconScreen.y = (-v3.y * 0.5 + 0.5) * canvas.clientHeight
    beaconScreen.visible = v3.z < 1

    const dx = state.pointerPx.x - beaconScreen.x
    const dy = state.pointerPx.y - beaconScreen.y
    const dist = Math.hypot(dx, dy)
    const reach = mobile ? 240 : Math.min(520, window.innerWidth * 0.36)
    const raw = state.pointerPx.x < -999 ? 0 : Math.max(0, 1 - dist / reach)
    state.signal = Math.pow(raw, 1.9)
    state.hot = state.signal > 0.55

    opts.onSignal?.(state.signal, state.hot, beaconScreen, dist)
  }

  let last = 0
  let raf = 0
  function loop(now) {
    if (!state.running) return
    if (state.diving) { raf = requestAnimationFrame(loop); return }
    if (state.frozen) {
      // 重组完成的定格帧要持续渲染，否则 WebGL 缓冲会被回收，交叉淡入时看到黑屏
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
      return
    }
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016)
    last = now
    update(dt)
    renderer.render(scene, camera)
    raf = requestAnimationFrame(loop)
  }

  function start() {
    if (state.running) return
    state.running = true
    last = performance.now()
    resize()
    raf = requestAnimationFrame(loop)
  }

  function stop() {
    state.running = false
    cancelAnimationFrame(raf)
  }

  function setPointer(nx, ny, cx, cy) {
    state.pointer.set(nx, ny)
    state.pointerPx.x = cx
    state.pointerPx.y = cy
  }

  function setProgress(p) {
    state.progress = p
    mat.uniforms.uProgress.value = p
    bgMat.uniforms.uProgress.value = p
    dustMat.uniforms.uProgress.value = p
    coreSprite.material.opacity = 0.6 * (1 - p)
    halo.material.opacity = 0.20 * (1 - p)
    for (const m of mists) m.sprite.material.opacity = m.baseOpacity * (1 - p)
    beaconCore.material.opacity = 0.8 * (1 - p)
    beaconGlow.material.opacity = state.signal * state.signal * 0.9 * (1 - p)
    flare.material.opacity = Math.pow(p, 1.6)
    flare.scale.setScalar(sunR * (10 + 12 * p))
  }

  // 镜头俯冲 → 拉回系统机位，同时粒子重组
  function warpToSystem() {
    if (state.warping) return Promise.resolve()
    state.warping = true
    state.diving = true

    const dur = reduced ? 500 : 2600
    const t0 = performance.now()

    const W = canvas.clientWidth || 1440
    const H = canvas.clientHeight || 1000
    const aspect = W / H
    const dist = SYSTEM_LAYOUT.fit(aspect) * K
    const phi = SYSTEM_LAYOUT.phiFor(aspect)
    const th = SYSTEM_LAYOUT.theta

    const from = camera.position.clone()
    const fromFov = camera.fov
    const divePos = new THREE.Vector3(
      beaconPos.x * 0.5,
      beaconPos.y + 0.30,
      beaconPos.z * 0.5 + 0.5,
    )
    const endPos = new THREE.Vector3(
      Math.cos(phi) * Math.cos(th) * dist,
      Math.sin(phi) * dist,
      Math.cos(phi) * Math.sin(th) * dist,
    )
    const lookEnd = new THREE.Vector3(0, SYSTEM_LAYOUT.lookY(dist), 0)

    const rotY0 = world.rotation.y
    const rotZ0 = world.rotation.z

    const a = new THREE.Vector3()
    const b = new THREE.Vector3()

    return new Promise((resolve) => {
      const step = () => {
        const u = Math.min(1, (performance.now() - t0) / dur)

        // 相机：先俯冲到信标，再拉回到系统机位
        if (u < 0.34) {
          a.copy(from).lerp(divePos, smooth(u / 0.34))
        } else {
          a.copy(divePos).lerp(endPos, smooth((u - 0.34) / 0.66))
        }
        camera.position.copy(a)

        // 注视点：从银河中心过渡到系统机位的注视点
        b.copy(lookBase).lerp(lookEnd, smooth(clamp01((u - 0.16) / 0.76)))
        camera.lookAt(b)
        camera.fov = fromFov + (SYSTEM_LAYOUT.fov - fromFov) * smooth(clamp01((u - 0.30) / 0.45))
        camera.updateProjectionMatrix()
        camera.rotation.z = 0

        // 世界朝向归零，让重组终点的方位与系统场景一致
        const rz = smooth(clamp01((u - 0.26) / 0.58))
        world.rotation.z = rotZ0 * (1 - rz)
        world.rotation.y = rotY0 * (1 - rz)

        // 粒子重组
        const p = smooth(clamp01((u - 0.28) / 0.60))
        setProgress(p)

        renderer.render(scene, camera)
        if (u < 1) requestAnimationFrame(step)
        else {
          state.rot = 0
          state.warping = false
          state.diving = false
          state.frozen = true
          resolve()
        }
      }
      requestAnimationFrame(step)
    })
  }

  function rewind() {
    state.diving = false
    state.warping = false
    state.frozen = false
    state.rot = 0
    world.rotation.y = 0
    world.rotation.z = 0.13
    camera.position.copy(baseCam)
    camera.fov = camera.aspect < 0.85 ? 58 : 42
    camera.updateProjectionMatrix()
    camera.lookAt(lookBase)
    setProgress(0)
    beaconCore.scale.setScalar(0.052)
    coreSprite.material.opacity = 0.6
    halo.material.opacity = 0.20
    for (const m of mists) m.sprite.material.opacity = m.baseOpacity
  }

  window.addEventListener('resize', resize)

  return {
    start, stop, resize, setPointer, warpToSystem, rewind,
    get signal() { return state.signal },
    get hot() { return state.hot },
    beaconScreen,
    state,
  }
}
