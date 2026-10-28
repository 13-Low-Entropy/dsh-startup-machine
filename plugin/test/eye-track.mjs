/**
 * eye-track.js 的可行性验证
 * ---------------------------------------------------------------------------
 * 用合成人脸（已知真值）测「能不能把眼睛找出来」：
 *   · 正面 / 歪头 / 暗光 / 偏视 / 远距离 —— 应当命中
 *   · 眼镜 / 单眼 / 无人脸 —— 应当干净地失败（宁可失败回落，也别乱框）
 *
 * 跑法：node test/eye-track.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

/* fileURLToPath 而不是 url.pathname：路径里有空格/中文时 pathname 会带 %20，直接读会 ENOENT */
const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const src = fs.readFileSync(path.join(ROOT, 'lib/eye-track.js'), 'utf8')
const sandbox = { module: { exports: {} } }
sandbox.globalThis = sandbox
vm.runInNewContext(src, sandbox)
const ET = sandbox.module.exports

/* ── 合成人脸 ──────────────────────────────────────────────────────────── */
const SKIN = [201, 162, 138]
const HAIR = [46, 38, 34]
const DARK = [38, 30, 28]

function makeFace(o) {
  o = o || {}
  const w = o.w || 120
  const h = o.h || 120
  const data = new Uint8ClampedArray(w * h * 4)
  const light = o.light == null ? 1 : o.light
  const rot = ((o.rot || 0) * Math.PI) / 180
  const cx = w * 0.5
  const cy = h * 0.5
  const rotPt = (x, y) => [
    cx + (x - cx) * Math.cos(rot) - (y - cy) * Math.sin(rot),
    cy + (x - cx) * Math.sin(rot) + (y - cy) * Math.cos(rot)
  ]

  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const i = (y * w + x) * 4
    data[i] = c[0] * light
    data[i + 1] = c[1] * light
    data[i + 2] = c[2] * light
    data[i + 3] = 255
  }
  const ellipse = (ex, ey, rx, ry, c) => {
    for (let y = Math.max(0, (ey - ry) | 0); y < Math.min(h, ey + ry + 1); y++) {
      for (let x = Math.max(0, (ex - rx) | 0); x < Math.min(w, ex + rx + 1); x++) {
        const dx = (x - ex) / rx
        const dy = (y - ey) / ry
        if (dx * dx + dy * dy <= 1) put(x, y, c)
      }
    }
  }

  /* 头发：上半部分 */
  if (o.hair !== false) {
    for (let y = 0; y < h * 0.26; y++) {
      for (let x = 0; x < w; x++) {
        const edge = Math.abs(x - cx) < w * (0.42 - 0.35 * (y / (h * 0.26)))
        if (edge) put(x, y, HAIR)
      }
    }
  }
  /* 脸 */
  ellipse(cx, cy + h * 0.04, w * 0.40, h * 0.46, SKIN)
  /* 鼻子阴影 */
  ellipse(cx, h * 0.585, w * 0.045, h * 0.035, [168, 132, 112])
  /* 嘴 */
  if (o.mouth !== false) ellipse(cx, h * 0.72, w * 0.13, h * 0.025, [150, 104, 96])

  const eyeDX = (o.eyeDX == null ? 0.13 : o.eyeDX) * w
  const eyeY = (o.eyeY == null ? 0.45 : o.eyeY) * h
  const rx = (o.eyeRX == null ? 0.058 : o.eyeRX) * w
  const ry = (o.eyeRY == null ? 0.030 : o.eyeRY) * h
  const shift = (o.shift || 0) * w

  /* 眉毛：又宽又扁，用来验证先验能把它排除 */
  if (o.brow !== false) {
    for (const s of [-1, 1]) {
      const [bx, by] = rotPt(cx + s * eyeDX + shift, eyeY - h * (o.browGap == null ? 0.075 : o.browGap))
      ellipse(bx, by, rx * (o.browW == null ? 1.7 : o.browW), ry * (o.browH == null ? 0.55 : o.browH), [86, 62, 54])
    }
  }
  /* 眼镜：镜框是暗的横条，会干扰 */
  if (o.glasses) {
    for (const s of [-1, 1]) {
      const [gx, gy] = rotPt(cx + s * eyeDX + shift, eyeY)
      ellipse(gx, gy, rx * 1.9, ry * 1.9, [30, 30, 34])
    }
  }
  /* 眼睛 */
  if (o.oneEye !== true) {
    for (const s of [-1, 1]) {
      const [ex, ey] = rotPt(cx + s * eyeDX + shift, eyeY)
      ellipse(ex, ey, rx, ry, DARK)
    }
  } else {
    const [ex, ey] = rotPt(cx - eyeDX + shift, eyeY)
    ellipse(ex, ey, rx, ry, DARK)
  }
  /* 胡茬：下半脸撒暗点 */
  if (o.stubble) {
    for (let y = Math.floor(h * 0.55); y < h * 0.9; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x - cx) / (w * 0.34), dy = (y - h * 0.72) / (h * 0.2)
        if (dx * dx + dy * dy <= 1 && Math.random() > 0.55) put(x, y, [110, 82, 70])
      }
    }
  }
  /* 暗角/阴影，增加干扰 */
  if (o.shadow) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w * 0.18; x++) {
        const i = (y * w + x) * 4
        data[i] *= 0.45; data[i + 1] *= 0.45; data[i + 2] *= 0.45
      }
    }
  }
  return { data: data, width: w, height: h }
}

/* ── 断言 ─────────────────────────────────────────────────────────────── */
let passed = 0
const failures = []
function check(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name) }
  catch (e) { failures.push(name); console.log('  FAIL ' + name + '\n         ' + e.message) }
}
function assert(c, m) { if (!c) throw new Error(m || '断言失败') }
function near(a, b, tol, m) {
  if (Math.abs(a - b) > tol) throw new Error((m || '偏差过大') + '：' + a.toFixed(3) + ' vs 真值 ' + b.toFixed(3) + '（容差 ' + tol + '）')
}

/* ── 用例 ─────────────────────────────────────────────────────────────── */
console.log('\n[应当命中]')

check('正面标准脸：位置、间距都准', () => {
  const r = ET.findEyes(makeFace())
  assert(r, '没检到眼睛')
  near(r.cx, 0.5, 0.05, '中心 x 偏了')
  near(r.cy, 0.45, 0.05, '中心 y 偏了')
  near(r.span, 0.26, 0.08, '眼距偏了')
})

check('歪头 12°：仍能命中，纵向允许更大偏差', () => {
  const r = ET.findEyes(makeFace({ rot: 12 }))
  assert(r, '没检到眼睛')
  near(r.cx, 0.5, 0.09, '中心 x 偏了')
  near(r.cy, 0.45, 0.11, '中心 y 偏了')
})

check('暗光 40%：相对阈值扛得住', () => {
  const r = ET.findEyes(makeFace({ light: 0.4 }))
  assert(r, '没检到眼睛')
  near(r.cx, 0.5, 0.06, '中心 x 偏了')
})

check('侧偏视线（双眼一起往左移）：中心跟着走', () => {
  const r = ET.findEyes(makeFace({ shift: -0.07 }))
  assert(r, '没检到眼睛')
  near(r.cx, 0.43, 0.06, '中心 x 没跟着走')
})

check('人坐远（眼睛缩到 60%）：仍能命中', () => {
  const r = ET.findEyes(makeFace({ eyeRX: 0.035, eyeRY: 0.018 }))
  assert(r, '没检到眼睛')
  near(r.cx, 0.5, 0.07, '中心 x 偏了')
})

check('左边有阴影：不受干扰', () => {
  const r = ET.findEyes(makeFace({ shadow: true }))
  assert(r, '没检到眼睛')
  near(r.cx, 0.5, 0.07, '中心 x 偏了')
})

check('没有眉毛干扰时也一样准', () => {
  const r = ET.findEyes(makeFace({ brow: false }))
  assert(r, '没检到眼睛')
  near(r.cx, 0.5, 0.05, '中心 x 偏了')
})

console.log('\n[应当干净地失败]')

check('无人脸（纯色）：返回 null 而不是乱框', () => {
  const w = 120, h = 120
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < data.length; i += 4) { data[i] = 200; data[i + 1] = 160; data[i + 2] = 140; data[i + 3] = 255 }
  assert(ET.findEyes({ data, width: w, height: h }) === null, '不该检出眼睛')
})

check('只有一只眼（侧脸）：返回 null', () => {
  assert(ET.findEyes(makeFace({ oneEye: true })) === null, '不该检出双眼')
})

check('戴眼镜：要么命中、要么干净失败（不返回离谱结果）', () => {
  const r = ET.findEyes(makeFace({ glasses: true }))
  if (r) {
    assert(r.cx > 0.25 && r.cx < 0.75, '中心离谱：' + r.cx)
    assert(r.span > 0.1 && r.span < 0.85, '眼距离谱：' + r.span)
  }
})

check('空输入不抛异常', () => {
  assert(ET.findEyes(null) === null)
  assert(ET.findEyes({ data: [], width: 0, height: 0 }) === null)
})

/* ── 命中率统计（可行性核心指标）───────────────────────────────────────── */

console.log('\n[真实世界的高风险场景]')
check('浓眉（又宽又厚，容易被当成眼）：仍要命中的眼睛', () => {
  const r = ET.findEyes(makeFace({ browW: 2.6, browH: 1.7, browGap: 0.085 }))
  assert(r, '没检到眼睛')
  near(r.cx, 0.5, 0.07, '中心 x 偏了')
  near(r.cy, 0.45, 0.09, '中心 y 偏了（可能选到了眉毛）')
})

check('眉毛紧贴眼睛上方：仍要命中的眼睛', () => {
  const r = ET.findEyes(makeFace({ browW: 2.2, browH: 1.2, browGap: 0.055 }))
  assert(r, '没检到眼睛')
  near(r.cy, 0.45, 0.09, '中心 y 偏了（可能选到了眉毛）')
})

check('胡茬（下半脸有暗斑）：不受干扰', () => {
  const r = ET.findEyes(makeFace({ stubble: true }))
  assert(r, '没检到眼睛')
  near(r.cx, 0.5, 0.07, '中心 x 偏了')
})

console.log('\n[命中率统计]')
const scenarios = [
  ['正面', {}],
  ['歪头 8°', { rot: 8 }],
  ['歪头 16°', { rot: 16 }],
  ['暗光 50%', { light: 0.5 }],
  ['暗光 35%', { light: 0.35 }],
  ['偏视 -8%', { shift: -0.08 }],
  ['偏视 +8%', { shift: 0.08 }],
  ['远距离', { eyeRX: 0.035, eyeRY: 0.018 }],
  ['近距离', { eyeRX: 0.075, eyeRY: 0.038 }],
  ['有阴影', { shadow: true }],
  ['无眉毛', { brow: false }],
  ['眼镜', { glasses: true }],
  ['侧脸(单眼)', { oneEye: true }],
  ['大角度 25°', { rot: 25 }]
]
let hit = 0
let errSum = 0
let errN = 0
const rows = []
for (const [name, opt] of scenarios) {
  const r = ET.findEyes(makeFace(opt))
  let err = null
  if (r) {
    hit++
    const truth = 0.5 + (opt.shift || 0)
    err = Math.abs(r.cx - truth)
    errSum += err
    errN++
  }
  rows.push([name, r ? '命中' : '失败', r ? (r.cx).toFixed(3) : '-', r ? (r.cy).toFixed(3) : '-', r ? (r.span).toFixed(3) : '-', err == null ? '-' : err.toFixed(3)])
}
for (const r of rows) {
  console.log('  ' + r[0].padEnd(12) + ' ' + r[1] + '   cx=' + String(r[2]).padEnd(6) + ' cy=' + String(r[3]).padEnd(6) + ' span=' + String(r[4]).padEnd(6) + ' err=' + r[5])
}
const expectHit = 11   /* 前 11 个场景应当命中 */
console.log('  命中 ' + hit + '/' + scenarios.length + '（应命中 ' + expectHit + '，单眼场景本就应失败）')
console.log('  命中时横向平均误差 ' + (errN ? (errSum / errN).toFixed(4) : '-') + '（裁剪图宽度占比）')
if (hit < expectHit) {
  failures.push('命中率不足')
  console.log('  ! 命中率不达预期')
}

console.log('')
if (failures.length) {
  console.log('失败项：' + failures.join('、'))
  process.exit(1)
}
console.log('全部通过：' + passed + ' 项\n')
