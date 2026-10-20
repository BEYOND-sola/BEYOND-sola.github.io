// 今夜的天 —— 一个极小的天体力学内核。
// 行星位置用 JPL 近似轨道根数（Standish, 1800–2050），月球用 Meeus 截断级数。
// 精度：行星约 1–5 角分，月球约 0.3°，足够回答「今晚看不看得见」。

const DEG = Math.PI / 180
const RAD = 180 / Math.PI

export const CHONGQING = { lat: 29.563, lon: 106.551, tz: 8, name: '重庆' }

// 天文单位与光速，用于把距离换成光行时
const AU_KM = 149597870.7

function toJD(date) {
  return date.getTime() / 86400000 + 2440587.5
}

// 自 J2000.0 起的儒略世纪数
function century(jd) {
  return (jd - 2451545.0) / 36525
}

function norm360(x) {
  return ((x % 360) + 360) % 360
}

const ELEMENTS = {
  mercury: [
    [0.38709927, 0.00000037], [0.20563593, 0.00001906], [7.00497902, -0.00594749],
    [252.2503235, 149472.67411175], [77.45779628, 0.16047689], [48.33076593, -0.12534081],
  ],
  venus: [
    [0.72333566, 0.0000039], [0.00677672, -0.00004107], [3.39467605, -0.0007889],
    [181.9790995, 58517.81538729], [131.60246718, 0.00268329], [76.67984255, -0.27769418],
  ],
  earth: [
    [1.00000261, 0.00000562], [0.01671123, -0.00004392], [-0.00001531, -0.01294668],
    [100.46457166, 35999.37244981], [102.93768193, 0.32327364], [0.0, 0.0],
  ],
  mars: [
    [1.52371034, 0.00001847], [0.0933941, 0.00007882], [1.84969142, -0.00813131],
    [-4.55343205, 19140.30268499], [-23.94362959, 0.44441088], [49.55953891, -0.29257343],
  ],
  jupiter: [
    [5.202887, -0.00011607], [0.04838624, -0.00013253], [1.30439695, -0.00183714],
    [34.39644051, 3034.74612775], [14.72847983, 0.21252668], [100.47390909, 0.20469106],
  ],
  saturn: [
    [9.53667594, -0.0012506], [0.05386179, -0.00050991], [2.48599187, 0.00193609],
    [49.95424423, 1222.49362201], [92.59887831, -0.41897216], [113.66242448, -0.28867794],
  ],
  uranus: [
    [19.18916464, -0.00196176], [0.04725744, -0.00004397], [0.77263783, -0.00242939],
    [313.23810451, 428.48202785], [170.9542763, 0.40805281], [74.01692503, 0.04240589],
  ],
  neptune: [
    [30.06992276, 0.00026291], [0.00859048, 0.00005105], [1.77004347, 0.00035372],
    [-55.12002969, 218.45945325], [44.96476227, -0.32241464], [131.78422574, -0.00508664],
  ],
  pluto: [
    [39.48211675, -0.00031596], [0.2488273, 0.0000517], [17.14001206, 0.00004818],
    [238.92903833, 145.20780515], [224.06891629, -0.04062942], [110.30393684, -0.01183482],
  ],
}

// 日心黄道直角坐标（AU）
function heliocentric(key, T) {
  const [a, e, I, L, w, O] = ELEMENTS[key].map(([base, rate]) => base + rate * T)
  const M = norm360(L - w) * DEG
  const omega = (w - O) * DEG
  const Omega = O * DEG
  const inc = I * DEG

  let E = M
  for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))

  const xp = a * (Math.cos(E) - e)
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E)

  const cO = Math.cos(Omega), sO = Math.sin(Omega)
  const cw = Math.cos(omega), sw = Math.sin(omega)
  const ci = Math.cos(inc), si = Math.sin(inc)

  return {
    x: (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp,
    y: (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp,
    z: sw * si * xp + cw * si * yp,
  }
}

// 月球黄经、黄纬（度）—— Meeus 47 章主项截断
function lunarEcliptic(T) {
  const Lp = 218.3165 + 481267.8813 * T
  const D = 297.8502 + 445267.1115 * T
  const M = 357.5291 + 35999.0503 * T
  const Mp = 134.9634 + 477198.8676 * T
  const F = 93.2721 + 483202.0175 * T
  const d = DEG
  const lon =
    Lp +
    6.289 * Math.sin(Mp * d) +
    1.274 * Math.sin((2 * D - Mp) * d) +
    0.658 * Math.sin(2 * D * d) +
    0.214 * Math.sin(2 * Mp * d) -
    0.186 * Math.sin(M * d) -
    0.114 * Math.sin(2 * F * d)
  const lat = 5.128 * Math.sin(F * d) + 0.281 * Math.sin((Mp + F) * d)
  const dist = 385001 - 20905 * Math.cos(Mp * d) // km
  return { lon: norm360(lon), lat, dist }
}

function obliquity(T) {
  return (23.4392911 - 0.0130042 * T) * DEG
}

function eclipticToEquatorial(lonDeg, latDeg, eps) {
  const l = lonDeg * DEG, b = latDeg * DEG
  const ra = Math.atan2(Math.sin(l) * Math.cos(eps) - Math.tan(b) * Math.sin(eps), Math.cos(l))
  const dec = Math.asin(Math.sin(b) * Math.cos(eps) + Math.cos(b) * Math.sin(eps) * Math.sin(l))
  return { ra: norm360(ra * RAD), dec: dec * RAD }
}

function gmstDeg(jd) {
  const T = century(jd)
  return norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T)
}

function horizon(ra, dec, jd, lat, lon) {
  const lst = norm360(gmstDeg(jd) + lon)
  const H = norm360(lst - ra) * DEG
  const d = dec * DEG
  const p = lat * DEG
  const east = -Math.cos(d) * Math.sin(H)
  const north = Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.cos(H) * Math.sin(p)
  const up = Math.sin(d) * Math.sin(p) + Math.cos(d) * Math.cos(H) * Math.cos(p)
  const alt = Math.asin(Math.max(-1, Math.min(1, up))) * RAD
  const az = norm360(Math.atan2(east, north) * RAD)
  return { alt, az }
}

// 某时刻所有行星的地平坐标
function positionsAt(date, lat, lon) {
  const jd = toJD(date)
  const T = century(jd)
  const eps = obliquity(T)
  const earth = heliocentric('earth', T)
  const out = {}

  for (const key of Object.keys(ELEMENTS)) {
    if (key === 'earth') continue
    const p = heliocentric(key, T)
    const gx = p.x - earth.x
    const gy = p.y - earth.y
    const gz = p.z - earth.z
    const lonE = norm360(Math.atan2(gy, gx) * RAD)
    const latE = Math.atan2(gz, Math.hypot(gx, gy)) * RAD
    const { ra, dec } = eclipticToEquatorial(lonE, latE, eps)
    const h = horizon(ra, dec, jd, lat, lon)
    out[key] = {
      ...h,
      ra,
      dec,
      distAU: Math.hypot(gx, gy, gz),
      lightMinutes: (Math.hypot(gx, gy, gz) * AU_KM) / 299792.458 / 60,
    }
  }

  // 太阳：地球日心位置的反向
  const sunLon = norm360(Math.atan2(-earth.y, -earth.x) * RAD)
  const sunEq = eclipticToEquatorial(sunLon, 0, eps)
  out.sun = { ...horizon(sunEq.ra, sunEq.dec, jd, lat, lon), ra: sunEq.ra, dec: sunEq.dec }

  const moon = lunarEcliptic(T)
  const moonEq = eclipticToEquatorial(moon.lon, moon.lat, eps)
  const moonAlt = horizon(moonEq.ra, moonEq.dec, jd, lat, lon)
  const elong = norm360(moon.lon - sunLon)
  out.moon = {
    ...moonAlt,
    ra: moonEq.ra,
    dec: moonEq.dec,
    distanceKm: moon.dist,
    elongation: elong,
    illum: (1 - Math.cos(elong * DEG)) / 2,
  }

  return out
}

// 按日月黄经差（elongation）划分月相，与天文年鉴的八分法一致
export function moonPhaseName(elongation) {
  const e = norm360(elongation)
  if (e < 7 || e >= 353) return '新月'
  if (e < 83) return '蛾眉月'
  if (e < 97) return '上弦月'
  if (e < 173) return '盈凸月'
  if (e < 187) return '满月'
  if (e < 263) return '亏凸月'
  if (e < 277) return '下弦月'
  return '残月'
}

export function tonight(date = new Date(), lat = CHONGQING.lat, lon = CHONGQING.lon) {
  const midnight = new Date(date)
  midnight.setHours(0, 0, 0, 0)
  const samples = []
  // 17:00 到次日 08:00，每 6 分钟一个采样点（当地时间）
  for (let m = 17 * 60; m <= 32 * 60; m += 6) {
    const t = new Date(midnight.getTime() + m * 60000)
    samples.push({ t, p: positionsAt(t, lat, lon) })
  }

  const sunBelow = samples.map((s) => s.p.sun.alt < -18)

  // 天文昏影结束：太阳第一次降到 −18° 以下
  let darkStart = null
  for (let i = 1; i < samples.length; i++) {
    if (sunBelow[i] && !sunBelow[i - 1]) { darkStart = samples[i].t; break }
  }
  // 天文晨光开始：太阳最后一次从 −18° 以下升回来
  let darkEnd = null
  for (let i = samples.length - 2; i >= 0; i--) {
    if (sunBelow[i] && !sunBelow[i + 1]) { darkEnd = samples[i].t; break }
  }

  const dark = samples.filter((s) => s.p.sun.alt < -18)
  const peak = samples.reduce((a, b) => (b.p.sun.alt < a.p.sun.alt ? b : a), samples[0])

  const targets = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']
  const planets = targets.map((key) => {
    const usable = dark.filter((s) => s.p[key].alt > 10)
    const best = samples.reduce((a, b) => (b.p[key].alt > a.p[key].alt ? b : a), samples[0])
    return {
      key,
      visible: usable.length > 0,
      from: usable.length ? usable[0].t : null,
      to: usable.length ? usable[usable.length - 1].t : null,
      maxAlt: best.p[key].alt,
      maxAt: best.t,
      az: best.p[key].az,
      distAU: best.p[key].distAU,
      lightMinutes: best.p[key].lightMinutes,
    }
  })

  const m0 = samples[20].p.moon
  const moonUsable = dark.filter((s) => s.p.moon.alt > 10)

  return {
    at: date,
    darkStart,
    darkEnd,
    sunMinAlt: peak.p.sun.alt,
    moon: {
      illum: m0.illum,
      elongation: m0.elongation,
      waxing: m0.elongation < 180,
      name: moonPhaseName(m0.elongation),
      distanceKm: m0.distanceKm,
      maxAlt: Math.max(...samples.map((s) => s.p.moon.alt)),
      visible: moonUsable.length > 0,
      from: moonUsable.length ? moonUsable[0].t : null,
      to: moonUsable.length ? moonUsable[moonUsable.length - 1].t : null,
    },
    planets,
  }
}

export function nextPhases(date = new Date()) {
  const synodic = 29.530588853
  const refNew = Date.UTC(2000, 0, 6, 18, 14) // 2000-01-06 18:14 UTC 新月
  const days = (date.getTime() - refNew) / 86400000
  const age = ((days % synodic) + synodic) % synodic
  const toNew = synodic - age
  const fullAge = synodic / 2
  const toFull = age < fullAge ? fullAge - age : synodic - age + fullAge
  return {
    age,
    toNew,
    toFull,
    nextNew: new Date(date.getTime() + toNew * 86400000),
    nextFull: new Date(date.getTime() + toFull * 86400000),
  }
}

export function formatTime(d) {
  if (!d) return '—'
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function compass(az) {
  const dirs = ['北', '东北偏北', '东北', '东北偏东', '东', '东南偏东', '东南', '东南偏南', '南', '西南偏南', '西南', '西南偏西', '西', '西北偏西', '西北', '西北偏北']
  return dirs[Math.round(norm360(az) / 22.5) % 16]
}
