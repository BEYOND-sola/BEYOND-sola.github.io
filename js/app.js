// 路由与场景切换。
import { createGalaxy } from './galaxy.js'
import { createSystem } from './system.js'
import { createPlanet } from './planet.js'
import { BODIES, BY_ID } from './bodies.js'
import { tonight, nextPhases, formatTime, compass } from './ephemeris.js'

const $ = (s) => document.querySelector(s)
const $$ = (s) => Array.from(document.querySelectorAll(s))

const el = {
  galaxy: $('#c-galaxy'),
  system: $('#c-system'),
  planet: $('#c-body'),
  stageBlur: $('#stage-blur'),
  lens: $('#lens'),
  veil: $('#veil'),
  labels: $('#labels'),
  frame: $('#frame'),
  pick: $('#pick'),
  pickName: $('#pick-name'),
  pickLatin: $('#pick-latin'),
  pickFacts: $('#pick-facts'),
  pickGo: $('#pick-go'),
  sysHint: $('#sys-hint'),
  scanPct: $('#scan-pct'),
  scanMeter: $('#scan-meter'),
  scanHint: $('#scan-hint'),
  scan: $('#scan'),
  bodydoc: $('#bodydoc'),
  bodystage: $('#bodystage'),
}

let galaxy = null
let system = null
let planet = null
let route = ''
let pendingJump = null
let reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

const HINT_IDLE = matchMedia('(pointer: coarse)').matches
  ? '点按行星锁定 · 点卡片进入'
  : '点击行星锁定 · 滚轮推进 · 拖动旋转视角'

window.__dbg = {
  get galaxy() { return galaxy },
  get system() { return system },
  get route() { return route },
}

/* ── 扫描仪：16 格信号表 ─────────────────────────────────────────────── */
const METER = 16
const meterBars = []
if (el.scanMeter) {
  for (let i = 0; i < METER; i++) {
    const b = document.createElement('i')
    el.scanMeter.appendChild(b)
    meterBars.push(b)
  }
}
let lastPct = -1
function paintSignal(sig, hot) {
  const pct = Math.round(sig * 100)
  if (pct !== lastPct) {
    lastPct = pct
    el.scanPct.textContent = String(pct).padStart(2, '0') // taste-skill-ignore：仪表读数
    const on = Math.round(sig * METER)
    meterBars.forEach((b, i) => b.classList.toggle('on', i < on))
  }
  el.scan.classList.toggle('is-hot', hot)
  el.scanHint.textContent = hot ? '已捕获 · 点击进入太阳系' : '移动光标，扫描旋臂'
}

/* ── 银河 ───────────────────────────────────────────────────────────── */
function ensureGalaxy() {
  if (galaxy) return galaxy
  galaxy = createGalaxy(el.galaxy, {
    onSignal(sig, hot, screen) {
      paintSignal(sig, hot)
      el.galaxy.style.cursor = hot ? 'pointer' : 'none'
    },
  })
  el.galaxy.style.cursor = 'none'

  window.addEventListener('pointermove', (e) => {
    if (!galaxy || route !== 'galaxy') return
    const nx = (e.clientX / window.innerWidth) * 2 - 1
    const ny = (e.clientY / window.innerHeight) * 2 - 1
    galaxy.setPointer(nx, ny, e.clientX, e.clientY)
    el.lens.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`
    el.lens.classList.add('is-on')
  }, { passive: true })

  // 监听 window 而不是画布本身：即使以后有新的浮层盖上来，也不会静默失效
  window.addEventListener('click', async (e) => {
    if (route !== 'galaxy' || !galaxy) return
    if (e.target.closest?.('a, button, .hero, .scan')) return
    if (galaxy.signal < 0.3) return
    await enterSolarSystem()
  })

  return galaxy
}

let transitioning = false
let galaxyStopTimer = 0
// 银河 → 太阳系：镜头俯冲 + 粒子重组 + 交叉淡入，不再用黑场
async function enterSolarSystem() {
  if (transitioning) return
  if (route !== 'galaxy') { location.hash = '#/system'; return }
  transitioning = true
  document.body.classList.add('is-warping')
  el.lens.classList.remove('is-on')
  el.scan.style.opacity = '0'
  try {
    await ensureGalaxy().warpToSystem()
  } catch { /* 动画失败也要能进去 */ }
  location.hash = '#/system'
  transitioning = false
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// 场景之间的黑场过渡，避免生硬切换
async function softNav(hash) {
  el.veil.classList.add('is-on')
  await wait(400)
  location.hash = hash
  await wait(120)
  el.veil.classList.remove('is-on')
}

/* ── 太阳系 ─────────────────────────────────────────────────────────── */
function ensureSystem() {
  if (system) return system
  system = createSystem(el.system, {
    labels: el.labels,
    frame: el.frame,
    pickCard: el.pick,
    pick: {
      name: el.pickName, latin: el.pickLatin, facts: el.pickFacts, go: el.pickGo,
    },
  }, {
    onSelect(id) {
      el.sysHint.textContent = id
        ? `${BY_ID[id]?.name || ''} 已锁定 · ${matchMedia('(pointer: coarse)').matches ? '点卡片进入' : '滚轮推进'} · 再次点击空白处取消`
        : HINT_IDLE
    },
    onProgress(p) {
      el.sysHint.textContent = p > 0.02 ? `推进中 ${Math.round(p * 100)}%` : el.sysHint.textContent
    },
    onEnter(id) {
      if (id) softNav(`#/body/${id}`)
    },
  })
  el.pick.addEventListener('click', () => system.enterNow())
  $('#sys-reset')?.addEventListener('click', () => {
    system.reset()
    el.sysHint.textContent = HINT_IDLE
  })
  return system
}

/* ── 行星详情 ───────────────────────────────────────────────────────── */
function ensurePlanet() {
  if (!planet) planet = createPlanet(el.planet)
  return planet
}

function renderBody(id) {
  const b = BY_ID[id]
  if (!b) { location.hash = '#/system'; return }
  const idx = BODIES.findIndex((x) => x.id === id)
  const prev = BODIES[(idx - 1 + BODIES.length) % BODIES.length]
  const next = BODIES[(idx + 1) % BODIES.length]

  const figs = b.figures
    .map(([k, v, note]) => `<div><dt>${k}</dt><dd>${v}${note ? `<span>${note}</span>` : ''}</dd></div>`)
    .join('')

  const paras = b.body.map((p) => `<p class="bodydoc__p">${p}</p>`).join('')

  el.bodydoc.innerHTML = `
    <a class="bodydoc__back" href="#/system">返回太阳系</a>
    <h1 class="bodydoc__h1">${b.name}</h1>
    <p class="bodydoc__latin">${b.latin}<span class="bodydoc__kind">${b.kind}</span></p>
    <p class="bodydoc__lede">${b.lede}</p>

    <h2 class="bodydoc__h2">数据</h2>
    <dl class="figs">${figs}</dl>

    <h2 class="bodydoc__h2">它是什么</h2>
    ${paras}

    <h2 class="bodydoc__h2">怎么找到它</h2>
    <p class="bodydoc__p bodydoc__obs">${b.observe}</p>

    <nav class="bodynav" aria-label="在太阳系中切换">
      <a class="prev" href="#/body/${prev.id}"><span>上一颗</span><b>${prev.name}</b></a>
      <a class="next" href="#/body/${next.id}"><span>下一颗</span><b>${next.name}</b></a>
    </nav>

    <div class="bodyindex">
      ${BODIES.map((x) => `<a href="#/body/${x.id}" class="${x.id === id ? 'is-on' : ''}">${x.name}</a>`).join('')}
    </div>
  `
  el.bodydoc.scrollTop = 0
  document.title = `${b.name} · 重邮天协`
}

/* ── 协会页：今晚的天 ───────────────────────────────────────────────── */
function phasePath(k, waxing, r = 46, cx = 54, cy = 54) {
  const a = r * Math.abs(2 * k - 1)
  const sweepSide = waxing ? 1 : 0
  const sweepTerm = waxing ? (k > 0.5 ? 1 : 0) : (k > 0.5 ? 0 : 1)
  if (k < 0.015) return ''
  if (k > 0.985) return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`
  return `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${sweepSide} ${cx} ${cy + r} A ${a} ${r} 0 0 ${sweepTerm} ${cx} ${cy - r} Z`
}

function renderSky() {
  const host = $('#sky')
  if (!host) return
  let t
  try {
    t = tonight(new Date())
  } catch (e) {
    host.innerHTML = '<p class="sky__load">计算失败，请刷新页面。</p>'
    return
  }
  const ph = nextPhases(new Date())
  const moon = t.moon
  const k = moon.illum

  const rows = t.planets
    .map((p) => {
      const b = BY_ID[p.key]
      if (p.visible) {
        return `<li class="sky__row">
          <span class="n">${b.name}</span>
          <span class="t">${formatTime(p.from)} – ${formatTime(p.to)}</span>
          <span class="a">${compass(p.az)} ${p.maxAlt.toFixed(0)}°</span>
        </li>`
      }
      return `<li class="sky__row is-off">
        <span class="n">${b.name}</span>
        <span class="t">今夜不可见</span>
        <span class="a">最高 ${p.maxAlt.toFixed(0)}°</span>
      </li>`
    })
    .join('')

  host.innerHTML = `
    <div class="sky__moon">
      <svg class="sky__disc" viewBox="0 0 108 108" role="img" aria-label="月相示意：${moon.name}">
        <circle cx="54" cy="54" r="46" fill="rgba(236,231,220,0.06)"/>
        <circle cx="54" cy="54" r="46" fill="none" stroke="rgba(236,231,220,0.12)" stroke-width="1"/>
        <path d="${phasePath(k, moon.waxing)}" fill="rgba(240,235,225,0.88)"/>
      </svg>
      <div>
        <p class="sky__moonName">${moon.name}</p>
        <div class="sky__meta">
          <span>受照面积<b>${(k * 100).toFixed(0)}%</b></span>
          <span>距地<b>${(moon.distanceKm / 10000).toFixed(1)} 万 km</b></span>
          <span>${moon.visible ? `可见<b>${formatTime(moon.from)} – ${formatTime(moon.to)}</b>` : '今夜在地平线下'}</span>
          <span>下次满月<b>${ph.nextFull.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}</b></span>
        </div>
      </div>
    </div>

    <ul class="sky__list">${rows}</ul>

    <div class="sky__dark">
      <span>天文昏影结束<b>${formatTime(t.darkStart)}</b></span>
      <span>天文晨光开始<b>${formatTime(t.darkEnd)}</b></span>
      <span>子夜太阳高度<b>${t.sunMinAlt.toFixed(0)}°</b></span>
      <span>计算日期<b>${t.at.toLocaleDateString('zh-CN')}</b></span>
    </div>
  `
}

/* ── 进场动画 ───────────────────────────────────────────────────────── */
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) {
      e.target.classList.add('is-in')
      io.unobserve(e.target)
    }
  }
}, { rootMargin: '-8% 0px -12% 0px' })

function armReveals() {
  if (reduced) return
  $$('.doc__sec h2, .doc__sec .cols > *, .doc__sec .doc__secLead, .act, .gal__i, .sites li, .join__kv > div, .join__cta > *')
    .forEach((node, i) => {
      if (node.dataset.reveal) return
      node.dataset.reveal = ''
      node.style.transitionDelay = `${(i % 4) * 70}ms`
      if (!node.classList.contains('is-in')) io.observe(node)
    })
}

/* ── 路由 ───────────────────────────────────────────────────────────── */
function parse() {
  const h = location.hash.replace(/^#/, '') || '/'
  if (h.startsWith('/body/')) return { name: 'body', id: h.slice(6) }
  if (h.startsWith('/system')) return { name: 'system' }
  if (h.startsWith('/society')) return { name: 'society' }
  return { name: 'galaxy' }
}

function setView(name) {
  $$('.view').forEach((v) => v.classList.toggle('is-active', v.dataset.view === name))
  document.body.classList.remove('is-warping')
  document.body.dataset.route = name
  document.body.classList.toggle('is-locked', name === 'galaxy' || name === 'system')
  if (name !== 'galaxy') el.lens.classList.remove('is-on')

  el.galaxy.classList.toggle('is-on', name === 'galaxy')
  el.stageBlur.classList.toggle('is-on', name === 'system' || name === 'body' || name === 'society')
  el.stageBlur.classList.toggle('is-backdrop', name === 'body' || name === 'society')

  // 只有真正的导航项才标记「当前页」；「加入」是一条页内跳转，不该跟着亮
  const currentHref = '#/' + (name === 'body' ? 'system' : name)
  $$('.nav a').forEach((a) => {
    const isJump = a.hasAttribute('data-scroll')
    a.classList.toggle('is-current', !isJump && a.getAttribute('href') === currentHref)
    if (isJump) a.setAttribute('aria-current', 'false')
  })
}

function render() {
  const r = parse()
  if (r.name === 'body' && !BY_ID[r.id]) { location.hash = '#/system'; return }
  const same = route === r.name + (r.id || '')
  route = r.name + (r.id || '')
  setView(r.name)

  if (r.name === 'galaxy') {
    clearTimeout(galaxyStopTimer)
    const g = ensureGalaxy()
    g.rewind?.()
    g.start()
    system?.stop()
    planet?.stop()
    el.scan.style.opacity = ''
    requestAnimationFrame(() => el.galaxy.classList.add('is-on'))
    document.title = '重邮天协 · 雾都之上，我们收听星光'
  } else if (r.name === 'system') {
    // 银河的定格帧要留在下面陪跑完交叉淡入（1.2s），再停掉
    clearTimeout(galaxyStopTimer)
    galaxyStopTimer = setTimeout(() => galaxy?.stop(), 1500)
    const s = ensureSystem()
    s.setBackdrop(false)
    s.setDive(0)
    s.start()
    planet?.stop()
    window.scrollTo(0, 0)
    el.sysHint.textContent = HINT_IDLE
    document.title = '太阳系 · 重邮天协'
  } else if (r.name === 'body') {
    galaxy?.stop()
    const s = ensureSystem()
    s.setBackdrop(true)
    s.start()
    const p = ensurePlanet()
    p.show(r.id)
    p.start()
    renderBody(r.id)
    window.scrollTo(0, 0)
  } else if (r.name === 'society') {
    galaxy?.stop()
    planet?.stop()
    // 整页背景是当前状态的太阳系，失焦后当底图；只当底图时降一半帧率
    const s = ensureSystem()
    s.setBackdrop(true)
    s.start()
    window.scrollTo(0, 0)
    renderSky()
    armReveals()
    document.title = '重庆邮电大学天文爱好者协会 · 在雾都等一个晴夜'
    if (pendingJump) {
      const id = pendingJump
      pendingJump = null
      requestAnimationFrame(() => requestAnimationFrame(() => jumpTo(id)))
    }
  }
  if (!same) el.frame.hidden = true
}

window.addEventListener('hashchange', render)

let started = false
function boot() {
  if (started) return
  started = true
  if (!location.hash) history.replaceState(null, '', '#/')
  render()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true })
} else {
  boot()
}

// 键盘：Esc 取消锁定，←/→ 切换天体
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && route.startsWith('system') && system) system.clear()
  if (route.startsWith('body') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    const id = route.slice(4)
    const i = BODIES.findIndex((x) => x.id === id)
    if (i < 0) return
    const n = e.key === 'ArrowLeft' ? (i - 1 + BODIES.length) % BODIES.length : (i + 1) % BODIES.length
    softNav(`#/body/${BODIES[n].id}`)
  }
})

// 行星页内部的跳转也走黑场
document.addEventListener('click', (e) => {
  const a = e.target.closest?.('.bodyindex a, .bodynav a, .bodydoc__back')
  if (!a) return
  const href = a.getAttribute('href')
  if (!href || !href.startsWith('#/')) return
  e.preventDefault()
  softNav(href)
})

// 「直接进入太阳系」按钮走和点光点一样的动画
document.addEventListener('click', (e) => {
  const a = e.target.closest?.('[data-warp]')
  if (!a) return
  e.preventDefault()
  enterSolarSystem()
})

// 导航里的页内跳转（加入 → #join）
// 跨页面跳转时不能靠定时器赌渲染时机，记一个待办，等协会页真正渲染完再滚
let scrollRaf = 0

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3) }

// 先快后慢地滚到某个元素顶部（顶栏留 96px）
function animateScrollToEl(el, duration) {
  cancelAnimationFrame(scrollRaf)
  const startY = window.scrollY
  const goalY = Math.max(0, startY + el.getBoundingClientRect().top - 96)
  const dist = goalY - startY
  if (Math.abs(dist) < 2) return
  const t0 = performance.now()
  const step = (now) => {
    const k = Math.min(1, (now - t0) / duration)
    window.scrollTo(0, startY + dist * easeOutCubic(k))
    if (k < 1) {
      scrollRaf = requestAnimationFrame(step)
    } else {
      // 动画期间页面高度可能变（图片懒加载、面板重算），最后按元素的当前位置再校一次
      window.scrollTo(0, Math.max(0, window.scrollY + el.getBoundingClientRect().top - 96))
    }
  }
  scrollRaf = requestAnimationFrame(step)
}

function jumpTo(id) {
  const target = document.getElementById(id)
  if (!target) return
  if (reduced) {
    window.scrollTo(0, Math.max(0, window.scrollY + target.getBoundingClientRect().top - 96))
    return
  }
  const distance = Math.abs(target.getBoundingClientRect().top - 96)
  animateScrollToEl(target, Math.min(1700, 620 + distance * 0.16))
}

// 用户自己滚了就不要再跟它抢
for (const ev of ['wheel', 'touchstart', 'pointerdown']) {
  window.addEventListener(ev, () => cancelAnimationFrame(scrollRaf), { passive: true })
}

document.addEventListener('click', (e) => {
  const a = e.target.closest?.('[data-scroll]')
  if (!a) return
  e.preventDefault()
  const id = a.dataset.scroll
  if (!document.getElementById(id)) return
  if (parse().name === 'society') {
    jumpTo(id)
  } else {
    pendingJump = id
    location.hash = '#/society'
  }
})
