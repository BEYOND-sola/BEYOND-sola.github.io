// 太阳系。轨道与半径都做过对数压缩——真实比例下，水星只是一个点，海王星在屏幕外。
import * as THREE from '../assets/vendor/three.module.js'
import { BODIES, BY_ID } from './bodies.js'

const TAU = Math.PI * 2
const DEG = Math.PI / 180

const TINT = {
  mercury: 0x8c8279, venus: 0xe8d3a5, earth: 0x4a7fbf, mars: 0xc1552f,
  jupiter: 0xd8b48a, saturn: 0xe0cba0, uranus: 0x9fd8e0, neptune: 0x4a6fbf,
  pluto: 0xcbb8a8, moon: 0xb9b6b0, sun: 0xffcf80,
}

// 轨道半径：对数压缩
export function orbitRadius(aAU) {
  if (!aAU) return 0
  return 6 + 22 * Math.log10(1 + aAU * 3)
}
// 天体半径：幂压缩（不是真实比例，页面里注明了）
export function bodyRadius(km, boost = 1) {
  return 0.72 * Math.pow(km / 6371, 0.32) * boost
}

const SUN_R = 2.5
const OUTER = orbitRadius(39.48) + 1.5
const PHI_DEFAULT = 40 * DEG
const FOV = 42

const TEX = {
  mercury: 'mercury.jpg', venus: 'venus.jpg', earth: 'earth.jpg', mars: 'mars.jpg',
  jupiter: 'jupiter.jpg', saturn: 'saturn.jpg', uranus: 'uranus.jpg', neptune: 'neptune.jpg',
  pluto: 'pluto.jpg', moon: 'moon.jpg', sun: 'sun.jpg',
}

function radialTexture(stops, size = 256) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [p, col] of stops) grd.addColorStop(p, col)
  g.fillStyle = grd
  g.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createSystem(canvas, ui, opts = {}) {
  const mobile = matchMedia('(max-width: 820px)').matches
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const boost = mobile ? 1.9 : 1
  // 竖屏时把视角抬高，让椭圆更「圆」，否则整条轨道会缩成一条细带
  const PHI = (window.innerWidth / Math.max(1, window.innerHeight)) < 0.85 ? 62 * DEG : PHI_DEFAULT

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0x05060b, 0.0022)

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 900)

  scene.add(new THREE.AmbientLight(0x3a4762, 0.5))
  scene.add(new THREE.PointLight(0xfff0d8, 5.4, 0, 0))

  const loader = new THREE.TextureLoader()
  const texCache = new Map()
  function texture(name) {
    if (!texCache.has(name)) {
      const t = loader.load(`assets/textures/${name}`)
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 4
      texCache.set(name, t)
    }
    return texCache.get(name)
  }

  // ── 背景恒星 ────────────────────────────────────────────────────────────
  {
    const N = mobile ? 1400 : 3200
    const p = new Float32Array(N * 3)
    const s = new Float32Array(N)
    const c = new Float32Array(N * 3)
    const tints = [0xffffff, 0xcfe0ff, 0xffe9c9, 0xffd0b0]
    const col = new THREE.Color()
    for (let i = 0; i < N; i++) {
      const u = Math.random() * TAU
      const v = Math.acos(2 * Math.random() - 1)
      const r = 320
      p[i * 3] = r * Math.sin(v) * Math.cos(u)
      p[i * 3 + 1] = r * Math.cos(v)
      p[i * 3 + 2] = r * Math.sin(v) * Math.sin(u)
      s[i] = 0.9 + Math.pow(Math.random(), 3) * 2.6
      col.setHex(tints[(Math.random() * tints.length) | 0])
      c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(p, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(s, 1))
    g.setAttribute('aColor', new THREE.BufferAttribute(c, 3))
    const m = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 240 } },
      vertexShader: `
        attribute float aSize; attribute vec3 aColor; uniform float uScale;
        varying vec3 vC;
        void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_Position = projectionMatrix * mv; gl_PointSize = max(1.0, aSize * uScale / 420.0); }`,
      fragmentShader: `
        varying vec3 vC;
        void main(){ vec2 d = gl_PointCoord - vec2(0.5); float r = dot(d,d)*4.0;
          if (r > 1.0) discard; gl_FragColor = vec4(vC, (1.0-r)*(1.0-r)*0.75); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    const stars = new THREE.Points(g, m)
    stars.frustumCulled = false
    scene.add(stars)
  }

  // ── 太阳 ────────────────────────────────────────────────────────────────
  const sunMat = new THREE.MeshBasicMaterial({ map: texture(TEX.sun), color: 0xfff2d8 })
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 64, 44), sunMat)
  sunMesh.userData.id = 'sun'
  scene.add(sunMesh)

  const coronaTex = radialTexture([
    [0, 'rgba(255,252,240,1)'],
    [0.14, 'rgba(255,226,170,0.62)'],
    [0.30, 'rgba(255,180,100,0.20)'],
    [0.55, 'rgba(255,150,80,0.06)'],
    [1, 'rgba(255,140,80,0)'],
  ])
  const coronas = [3.9, 8.5, 17, 34].map((mult, i) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: coronaTex, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
      transparent: true, opacity: [0.85, 0.42, 0.16, 0.07][i],
    }))
    sp.scale.setScalar(SUN_R * mult)
    scene.add(sp)
    return sp
  })

  // ── 行星 ────────────────────────────────────────────────────────────────
  const bodies = []

  function makeOrbit(r) {
    const pts = []
    for (let i = 0; i < 320; i++) {
      const a = (i / 320) * TAU
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r))
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts)
    const m = new THREE.LineBasicMaterial({ color: 0x8ea9c9, transparent: true, opacity: 0.16, depthWrite: false })
    const line = new THREE.LineLoop(g, m)
    scene.add(line)
    return { line, m }
  }

  for (const data of BODIES) {
    if (data.id === 'sun' || data.id === 'moon') continue
    const v = data.visual
    const r = bodyRadius(v.radiusKm, boost)
    const orbR = orbitRadius(v.aAU)
    const orbit = makeOrbit(orbR)

    const holder = new THREE.Group()
    holder.rotation.y = Math.random() * TAU
    scene.add(holder)

    const tilt = new THREE.Group()
    tilt.position.x = orbR
    tilt.rotation.z = v.tiltDeg * DEG
    holder.add(tilt)

    const mat = new THREE.MeshStandardMaterial({
      color: TINT[data.id] || 0xaaaaaa,
      map: texture(TEX[data.id]),
      roughness: 1,
      metalness: 0,
    })
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 56, 36), mat)
    mesh.userData.id = data.id
    tilt.add(mesh)

    if (data.id === 'earth') {
      const clouds = new THREE.Mesh(
        new THREE.SphereGeometry(r * 1.012, 48, 32),
        new THREE.MeshStandardMaterial({
          color: 0xffffff, alphaMap: texture('earth-clouds.jpg'), transparent: true,
          opacity: 0.85, roughness: 1, depthWrite: false,
        }),
      )
      tilt.add(clouds)
      mesh.userData.clouds = clouds
    }

    if (v.ring) {
      const inner = (v.ring.inner || 1.3) * r
      const outer = (v.ring.outer || 2.3) * r
      const rg = new THREE.RingGeometry(inner, outer, 160, 1)
      const pos = rg.attributes.position
      const uv = rg.attributes.uv
      const p = new THREE.Vector3()
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i)
        uv.setXY(i, (p.length() - inner) / (outer - inner), 0.5)
      }
      const rmat = new THREE.MeshBasicMaterial({
        map: texture(v.ring.texture),
        transparent: true,
        opacity: v.ring.opacity ?? 0.92,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      const ring = new THREE.Mesh(rg, rmat)
      ring.rotation.x = -Math.PI / 2
      tilt.add(ring)
    }

    // 极小的外发光，让远日行星也能被看见
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: coronaTex, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
      transparent: true, opacity: 0.18, color: TINT[data.id] || 0xffffff,
    }))
    halo.scale.setScalar(r * 5.5)
    tilt.add(halo)

    const moonPivot = new THREE.Group()
    tilt.add(moonPivot)
    const moons = []
    const moonCount = v.moons || 0
    for (let i = 0; i < moonCount; i++) {
      const mr = Math.max(0.055, r * 0.10)
      const mm = new THREE.Mesh(
        new THREE.SphereGeometry(mr, 12, 8),
        new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 1 }),
      )
      moonPivot.add(mm)
      moons.push({ mesh: mm, r: r * (1.35 + i * 0.26), a: Math.random() * TAU, w: 0.5 + Math.random() * 0.7 })
    }

    bodies.push({
      data, r, orbR, orbit, holder, tilt, mesh, mat, moons, moonPivot,
      angle: holder.rotation.y,
      omega: 0.052 * Math.pow(365.256 / Math.max(1, v.periodDays), 0.42),
    })
  }

  // 月球
  const earth = bodies.find((b) => b.data.id === 'earth')
  const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.115 * boost, 24, 16),
    new THREE.MeshStandardMaterial({ map: texture(TEX.moon), color: 0xd8d4cc, roughness: 1 }),
  )
  moonMesh.userData.id = 'moon'
  const moonPivot = new THREE.Group()
  earth.tilt.add(moonPivot)
  moonPivot.add(moonMesh)
  const moonOrbit = { r: earth.r * 2.5, a: 0.8 }

  // ── 小行星带 / 柯伊伯带 ────────────────────────────────────────────────
  function belt(count, aMin, aMax, spread, color, size, alpha) {
    const g = new THREE.BufferGeometry()
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const a = aMin + Math.random() * (aMax - aMin)
      const rr = orbitRadius(a)
      const t = Math.random() * TAU
      arr[i * 3] = Math.cos(t) * rr
      arr[i * 3 + 1] = (Math.random() - 0.5) * spread
      arr[i * 3 + 2] = Math.sin(t) * rr
    }
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    const m = new THREE.PointsMaterial({
      color, size, sizeAttenuation: true, transparent: true, opacity: alpha,
      depthWrite: false, blending: THREE.AdditiveBlending,
    })
    scene.add(new THREE.Points(g, m))
  }
  belt(mobile ? 1800 : 4000, 2.06, 3.32, 0.45, 0xa89a86, 0.07, 0.42)
  belt(mobile ? 1400 : 3000, 30, 48, 1.6, 0x7d8ba3, 0.11, 0.30)

  // ── 状态 ────────────────────────────────────────────────────────────────
  const state = {
    hovered: null,
    selected: null,
    dive: 0,
    entered: false,
    running: false,
    pointer: { x: 0, y: 0 },
    dragging: false,
    lastX: 0,
    lastY: 0,
    fitR: 100,
    zoom: 1,
    theta: Math.PI * 0.34,
    phi: PHI,
    autoSpin: true,
  }

  // ── 标签 ────────────────────────────────────────────────────────────────
  const labelEls = new Map()
  const labelHost = ui.labels
  const pickEls = ui.pick
  const pickCard = ui.pickCard

  for (const it of [{ id: 'sun', name: '太阳' }]
    .concat(BODIES.filter((b) => b.id !== 'sun' && b.id !== 'moon').map((b) => ({ id: b.id, name: b.name })))
    .concat([{ id: 'moon', name: '月球' }])) {
    const el = document.createElement('button')
    el.className = 'lbl'
    el.type = 'button'
    el.innerHTML = `<span class="lbl__t">${it.name}</span>`
    el.addEventListener('click', (e) => { e.stopPropagation(); select(it.id) })
    labelHost.appendChild(el)
    labelEls.set(it.id, el)
  }

  const tmpV = new THREE.Vector3()
  const tmpV2 = new THREE.Vector3()

  function worldOf(id) {
    if (id === 'sun') return tmpV.set(0, 0, 0)
    if (id === 'moon') return moonMesh.getWorldPosition(tmpV)
    const b = bodies.find((x) => x.data.id === id)
    return b ? b.mesh.getWorldPosition(tmpV) : tmpV.set(0, 0, 0)
  }

  function radiusOf(id) {
    if (id === 'sun') return SUN_R
    if (id === 'moon') return 0.115 * boost
    const b = bodies.find((x) => x.data.id === id)
    return b ? b.r : 1
  }

  const proj = { x: 0, y: 0, behind: false }
  function project(v) {
    tmpV2.copy(v).project(camera)
    proj.x = (tmpV2.x * 0.5 + 0.5) * canvas.clientWidth
    proj.y = (-tmpV2.y * 0.5 + 0.5) * canvas.clientHeight
    proj.behind = tmpV2.z > 1
    return proj
  }

  function pxRadius(v, r) {
    const d = camera.position.distanceTo(v)
    const h = canvas.clientHeight || 900
    return (r * (h / 2)) / (d * Math.tan((camera.fov * DEG) / 2))
  }

  function hitTest(cx, cy) {
    let best = null
    let bestD = Infinity
    const consider = (id) => {
      const pos = worldOf(id)
      const s = project(pos)
      if (s.behind) return
      const pr = pxRadius(pos, radiusOf(id))
      const d = Math.hypot(cx - s.x, cy - s.y)
      const tol = Math.max(pr * 1.4, mobile ? 30 : 20)
      if (d < tol && d < bestD) { bestD = d; best = id }
    }
    consider('sun')
    for (const b of bodies) consider(b.data.id)
    consider('moon')
    return best
  }

  function select(id) {
    if (state.selected === id) { clear(); return }
    state.selected = id
    state.dive = 0
    state.entered = false
    for (const [k, el] of labelEls) el.classList.toggle('is-on', k === id)
    renderPick()
    pickCard.hidden = !id
    if (id) {
      ui.frame.hidden = false
      opts.onSelect?.(id)
    }
  }

  function clear() {
    state.selected = null
    state.dive = 0
    state.entered = false
    for (const el of labelEls.values()) el.classList.remove('is-on')
    ui.frame.hidden = true
    pickCard.hidden = true
    opts.onSelect?.(null)
  }

  function renderPick() {
    const id = state.selected
    if (!id) return
    const data = BY_ID[id]
    if (!data) return
    pickEls.name.textContent = data.name
    pickEls.latin.textContent = `${data.latin} · ${data.kind}`
    const v = data.visual
    let rows
    if (id === 'sun') rows = [['直径', '1,392,700 km'], ['表面温度', '5,772 K']]
    else if (id === 'moon') rows = [['直径', '3,474 km'], ['距地', '384,400 km']]
    else rows = [
      ['轨道半径', `${v.aAU.toFixed(2)} AU`],
      ['公转周期', v.periodDays > 900 ? `${(v.periodDays / 365.256).toFixed(1)} 年` : `${v.periodDays.toFixed(0)} 天`],
    ]
    pickEls.facts.innerHTML = rows.map(([k, val]) => `<div><dt>${k}</dt><dd>${val}</dd></div>`).join('')
    pickEls.go.textContent = mobile ? '点击进入 →' : '滚轮推进 →'
  }

  // ── 相机 ────────────────────────────────────────────────────────────────
  function computeFit() {
    const h = canvas.clientHeight || 900
    const w = canvas.clientWidth || 1440
    const aspect = Math.max(0.35, w / h)
    const tanH = Math.tan((FOV * DEG) / 2)
    const needH = OUTER / (tanH * aspect)
    const needV = (OUTER * Math.sin(PHI)) / tanH
    state.fitR = Math.max(needH, needV) * 1.16
  }

  function updateCamera() {
    const dist = state.fitR * state.zoom * (1 - state.dive * 0.88)
    const p = state.pointer
    // 指针视差放得很轻：这个页面是要瞄准的，镜头跟着鼠标大幅摆动会让行星从光标下逃开
    const phi = state.phi - p.y * 0.06
    const theta = state.theta + p.x * 0.05
    camera.position.set(
      Math.cos(phi) * Math.cos(theta) * dist,
      Math.sin(phi) * dist,
      Math.cos(phi) * Math.sin(theta) * dist,
    )
    // 视线略微下压，把整个盘面在画面里抬高，给底部的操作提示留位置
    const look = new THREE.Vector3(0, -state.fitR * 0.05, 0)
    if (state.selected) {
      const w = worldOf(state.selected).clone()
      look.lerp(w, Math.min(1, state.dive * 1.2))
    }
    camera.lookAt(look)
    camera.fov = FOV + state.dive * 8
    camera.updateProjectionMatrix()
  }

  // ── 每帧 ────────────────────────────────────────────────────────────────
  function step(dt) {
    const t = reduced ? 0 : dt
    for (const b of bodies) {
      b.angle += b.omega * t
      b.holder.rotation.y = b.angle
      const dir = b.data.visual.rotationHours < 0 ? -1 : 1
      b.mesh.rotation.y += t * dir * (0.18 + Math.min(0.8, 1.9 / Math.sqrt(Math.abs(b.data.visual.rotationHours) + 1)))
      if (b.mesh.userData.clouds) b.mesh.userData.clouds.rotation.y = b.mesh.rotation.y * 1.12
      for (const m of b.moons) {
        m.a += t * m.w
        m.mesh.position.set(Math.cos(m.a) * m.r, 0, Math.sin(m.a) * m.r)
      }
    }
    moonMesh.rotation.y += t * 0.1
    moonOrbit.a += t * 0.42
    moonMesh.position.set(Math.cos(moonOrbit.a) * moonOrbit.r, 0, Math.sin(moonOrbit.a) * moonOrbit.r)
    sunMesh.rotation.y += t * 0.016

    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.0011)
    coronas[0].material.opacity = 0.72 + pulse * 0.14
    coronas[1].material.opacity = 0.36 + pulse * 0.08
  }

  function updateDOM() {
    const W = canvas.clientWidth
    const H = canvas.clientHeight

    const sunS = project(tmpV.set(0, 0, 0))
    const sx = sunS.x
    const sy = sunS.y

    for (const b of bodies) {
      const el = labelEls.get(b.data.id)
      if (!el) continue
      const pos = b.mesh.getWorldPosition(tmpV)
      const s = project(pos)
      const pr = pxRadius(pos, b.r) * (b.data.visual.ring ? 2.1 : 1)
      // 标签沿「太阳 → 行星」方向外推，避免内行星的标签挤成一团
      const dx = s.x - sx
      const dy = s.y - sy
      const len = Math.hypot(dx, dy) || 1
      const off = pr + (mobile ? 13 : 17)
      const lx = s.x + (dx / len) * off
      const ly = s.y + (dy / len) * off
      if (s.behind || s.x < 0 || s.x > W || s.y < 0 || s.y > H) {
        el.style.opacity = '0'
        el.style.pointerEvents = 'none'
      } else {
        el.style.opacity = String(Math.max(0, 1 - state.dive * 0.95))
        el.style.pointerEvents = 'auto'
        el.style.transform = `translate(-50%, -50%) translate(${lx}px, ${ly}px)`
      }
    }
    {
      const el = labelEls.get('sun')
      if (el) el.style.transform = `translate(-50%, -50%) translate(${sx}px, ${sy + pxRadius(tmpV.set(0, 0, 0), SUN_R) + 14}px)`
    }
    {
      const el = labelEls.get('moon')
      const pos = moonMesh.getWorldPosition(tmpV)
      const s = project(pos)
      if (el) {
        const near = camera.position.distanceTo(pos) < state.fitR * 0.42
        el.style.opacity = near && !s.behind ? '0.9' : '0'
        el.style.pointerEvents = near ? 'auto' : 'none'
        el.style.transform = `translate(-50%, -50%) translate(${s.x}px, ${s.y + 18}px)`
      }
    }

    if (state.selected) {
      const pos = worldOf(state.selected)
      const s = project(pos)
      const pr = Math.max(20, pxRadius(pos, radiusOf(state.selected)))
      const pad = pr * 0.55 + 11
      const size = pr * 2 + pad * 2
      ui.frame.hidden = false
      ui.frame.style.transform = `translate(${s.x - size / 2}px, ${s.y - size / 2}px)`
      ui.frame.style.width = `${size}px`
      ui.frame.style.height = `${size}px`

      const cardX = Math.min(W - 236, s.x + size / 2 + 24)
      const cardY = Math.max(130, Math.min(H - 130, s.y))
      pickCard.style.transform = mobile
        ? ''
        : `translate(${cardX}px, ${cardY}px) translateY(-50%)`
      pickCard.style.opacity = String(Math.max(0, 1 - state.dive * 1.4))

      for (const b of bodies) {
        b.orbit.m.opacity = b.data.id === state.selected ? 0.5 : 0.10
        b.orbit.m.color.setHex(b.data.id === state.selected ? 0xe2a75c : 0x8ea9c9)
      }
    } else {
      for (const b of bodies) {
        b.orbit.m.opacity = 0.15
        b.orbit.m.color.setHex(0x8ea9c9)
      }
    }
  }

  let last = 0
  let raf = 0
  function loop(now) {
    if (!state.running) return
    const dt = Math.min(0.06, (now - last) / 1000 || 0.016)
    last = now
    if (!state.dragging && state.autoSpin && !reduced) state.theta += dt * 0.010
    step(dt)
    updateCamera()
    updateDOM()
    renderer.render(scene, camera)
    if (state.dive >= 0.995 && !state.entered) {
      state.entered = true
      opts.onEnter?.(state.selected)
    }
    raf = requestAnimationFrame(loop)
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth
    const h = canvas.clientHeight || window.innerHeight
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    computeFit()
  }

  function start() {
    if (state.running) return
    state.running = true
    resize()
    last = performance.now()
    raf = requestAnimationFrame(loop)
  }
  function stop() {
    state.running = false
    cancelAnimationFrame(raf)
  }

  function reset() {
    state.theta = Math.PI * 0.34
    state.phi = PHI
    state.zoom = 1
    state.pointer.x = 0
    state.pointer.y = 0
    clear()
  }

  // ── 输入 ────────────────────────────────────────────────────────────────
  function onMove(e) {
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    state.pointer.x = (x / rect.width) * 2 - 1
    state.pointer.y = (y / rect.height) * 2 - 1
    if (state.dragging) {
      state.theta -= (e.clientX - state.lastX) * 0.0042
      state.phi = Math.max(-4 * DEG, Math.min(78 * DEG, state.phi + (e.clientY - state.lastY) * 0.0032))
      state.lastX = e.clientX
      state.lastY = e.clientY
      return
    }
    if (state.dive > 0.02) return
    const hit = hitTest(x, y)
    if (hit !== state.hovered) {
      state.hovered = hit
      canvas.style.cursor = hit ? 'pointer' : 'grab'
    }
  }

  function onDown(e) {
    if (e.button !== 0) return
    state.dragging = true
    state.lastX = e.clientX
    state.lastY = e.clientY
    canvas.style.cursor = 'grabbing'
  }

  function onUp(e) {
    if (!state.dragging) return
    state.dragging = false
    canvas.style.cursor = state.hovered ? 'pointer' : 'grab'
    if (e.target !== canvas) return
    const rect = canvas.getBoundingClientRect()
    const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top)
    if (hit) select(hit)
    else clear()
  }

  function onWheel(e) {
    if (!state.running) return
    e.preventDefault()
    const dir = Math.sign(e.deltaY)
    if (state.selected) {
      state.dive = Math.max(0, Math.min(1, state.dive + dir * 0.07))
      opts.onProgress?.(state.dive)
    } else {
      state.zoom = Math.max(0.30, Math.min(1.45, state.zoom * (1 + dir * 0.07)))
    }
  }

  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerdown', onDown)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('resize', resize)

  return {
    start, stop, resize, reset, select, clear,
    state, scene, camera, renderer, bodies,
    get selected() { return state.selected },
    get dive() { return state.dive },
    enterNow() { if (state.selected) opts.onEnter?.(state.selected) },
    setDive(v) { state.dive = Math.max(0, Math.min(1, v)); opts.onProgress?.(state.dive) },
  }
}
