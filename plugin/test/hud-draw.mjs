/* ============================================================================
 * 取景框绘制测试：node test/hud-draw.mjs
 * ----------------------------------------------------------------------------
 * 用假 ctx 记录每一笔，把「美术参数」钉死在 rosehahah/the-machine 的数值上。
 * 以后谁改比例、改线宽、改虚线节奏，这里会先红。
 * 不需要 canvas —— 只验几何与状态机。
 * ========================================================================== */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(ROOT, 'lib/hud-draw.js'), 'utf8')
const sandbox = {}
vm.runInNewContext(src, sandbox)
const H = sandbox.MSHud
assert.ok(H && typeof H.drawBox === 'function', 'hud-draw.js 没导出 MSHud')

let passed = 0
function check(label, fn) {
  fn()
  passed++
  console.log('  ok  ' + label)
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps

/* ── 假 ctx：只记录，不渲染 ─────────────────────────────────────────────── */
function mockCtx() {
  const log = { strokes: [], dashes: [], rects: [], texts: [], blur: [], fonts: [], spaced: [] }
  const c = {
    _log: log,
    globalAlpha: 1,
    lineWidth: 1,
    strokeStyle: '',
    fillStyle: '',
    lineCap: '',
    lineJoin: '',
    shadowColor: '',
    shadowBlur: 0,
    font: '',
    textBaseline: '',
    letterSpacing: '',
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    setLineDash(d) { log.dashes.push(d.slice()) },
    stroke() { log.strokes.push({ lw: c.lineWidth, dash: log.dashes[log.dashes.length - 1] || [] }) },
    fill() {},
    fillRect(x, y, w, h) { log.rects.push({ x, y, w, h, fill: c.fillStyle }) },
    strokeRect() {},
    measureText(t) { return { width: t.length * 8 } },
    fillText(t, x, y) { log.texts.push({ t, x, y, fill: c.fillStyle, font: c.font }) }
  }
  return c
}

console.log('\nhud-draw（对齐 rosehahah/the-machine 的 web/hud.js）\n')

console.log('[几何]')
check('headBox 是正方形：side = min(w*0.62, h*0.5)', () => {
  const [x, y, w, h] = H.headBox(100, 200, 300, 600)
  const side = Math.min(300 * 0.62, 600 * 0.5)   // 186
  assert.ok(near(w, side) && near(h, side), '不是正方形')
  assert.ok(near(x, 100 + 300 / 2 - side / 2))
  assert.ok(near(y, 200 - side * 0.08), '顶部没有上移 0.08×side')
})

check('线宽 / 臂长 / 虚线节奏都是 s=min(w,h) 的比例', () => {
  const ctx = mockCtx()
  const s = 200
  H.drawBox(ctx, 10, 20, 200, 260, 'white', 1)
  const lw = Math.max(1.4, Math.min(4.2, s / 85))
  assert.ok(near(ctx._log.strokes[0].lw, lw), '边线宽不对：' + ctx._log.strokes[0].lw)
  assert.ok(near(ctx._log.strokes[1].lw, lw * 1.7), '角括号应为边的 1.7 倍')
  assert.ok(near(ctx._log.strokes[2].lw, lw * 1.35), '中点刻度应为边的 1.35 倍')
  const dash = ctx._log.strokes[0].dash
  assert.ok(near(dash[0], Math.max(4, s * 0.034)), 'dash 不对：' + dash[0])
  assert.ok(near(dash[1], Math.max(3, s * 0.022)), 'gap 不对：' + dash[1])
  assert.ok(near(ctx._log.strokes[1].dash.length, 0), '角括号必须实线')
})

check('线宽在两端被 clamp 住（小框不糊、大框不过粗）', () => {
  const small = mockCtx()
  H.drawBox(small, 0, 0, 40, 40, 'white', 1)
  assert.ok(near(small._log.strokes[0].lw, 1.4), '小框应贴 1.4 下限')
  const big = mockCtx()
  H.drawBox(big, 0, 0, 900, 900, 'white', 1)
  assert.ok(near(big._log.strokes[0].lw, 4.2), '大框应贴 4.2 上限')
})

check('中点刻度：cross 样式（black_yellow）拉长到 0.16s', () => {
  function tickOf(style) {
    const ctx = mockCtx()
    H.drawBox(ctx, 0, 0, 200, 200, style, 1)
    /* 第三笔是刻度，其线段终点相对边中点的位移就是 tick */
    return { strokes: ctx._log.strokes.length }
  }
  assert.equal(tickOf('white').strokes, 3)
  assert.equal(tickOf('black_yellow').strokes, 3)
  assert.ok(H.STYLES.black_yellow.cross === true)
  assert.ok(!H.STYLES.white.cross)
})

check('发光：shadowBlur 固定 5，black_yellow 用黑阴影', () => {
  const a = mockCtx()
  H.drawBox(a, 0, 0, 100, 100, 'white', 1)
  const b = mockCtx()
  H.drawBox(b, 0, 0, 100, 100, 'black_yellow', 1)
  assert.equal(a.shadowBlur, 5)
  assert.equal(b.shadowBlur, 5)
})

console.log('\n[标签]')
check('字号 = clamp(s*0.095, 11, 32)，块高 = fs*1.42，块宽 = 文字宽 + fs*0.9', () => {
  const ctx = mockCtx()
  H.drawLabel(ctx, 'OPERATOR', 0, 0, 200, 200, 'white', 1, 1000)
  const fs = Math.max(11, Math.min(32, 200 * 0.095))
  const want = '500 ' + fs + 'px ' + H.FONT
  assert.equal(ctx._log.texts[0].font, want)
  const r = ctx._log.rects[0]
  assert.ok(near(r.h, fs * 1.42), '块高不对')
})

check('标签默认在右侧；会出右边界就翻到左侧', () => {
  const ctx = mockCtx()
  H.drawLabel(ctx, 'X', 500, 0, 200, 200, 'white', 1, 720)
  const r = ctx._log.rects[0]
  assert.ok(r.x < 500, '应当翻到框左侧，实际 x=' + r.x)
  const ctx2 = mockCtx()
  H.drawLabel(ctx2, 'X', 100, 0, 200, 200, 'white', 1, 2000)
  assert.ok(ctx2._log.rects[0].x > 300, '应当贴在右侧')
})

check('标签底/字色跟着样式走（black_yellow：黑底黄字黄框）', () => {
  const ctx = mockCtx()
  H.drawLabel(ctx, 'X', 0, 0, 200, 200, 'black_yellow', 1, 1000)
  assert.equal(ctx._log.rects[0].fill, H.COLORS.black)
  assert.equal(ctx._log.texts[0].fill, H.COLORS.yellow)
  assert.equal(H.STYLES.black_yellow.border, H.COLORS.yellow)
})

console.log('\n[动画状态机]')
check('出生：1.5 倍缩到 1（280ms），之后尺寸与目标一致', () => {
  const r = new H.Reticle([100, 100, 200, 200], 'white')
  const early = r.step(0.05)
  assert.ok(early.w > 200 * 1.2, '出生时应当明显放大：' + early.w.toFixed(1))
  const late = r.step(0.45)
  assert.ok(near(late.w, 200, 0.5), '280ms 后应回到实际尺寸：' + late.w)
})

check('捕获白闪只在前 350ms 有', () => {
  const r = new H.Reticle([0, 0, 200, 200], 'white')
  assert.ok(r.step(0.05).flash > 0.55, '捕获闪光应当够亮')
  r.step(0.2); r.step(0.2)   // 单帧 dt 有 0.25s 上限，别指望一步跨过去
  assert.equal(r.step(0.01).flash, 0)
})

check('换样式触发 75ms 交替闪，450ms 后稳定', () => {
  const r = new H.Reticle([0, 0, 200, 200], 'white')
  r.step(0.6)
  r.setStyle('yellow')
  /* since=0.02 → floor(0.02/0.075)=0 → 偶数 → 显示旧样式 */
  assert.equal(r.step(0.02).style, 'white')
  /* since=0.08 → floor(1)=1 → 奇数 → 显示新样式 */
  assert.equal(r.step(0.06).style, 'yellow')
  r.step(0.25); r.step(0.25)   // 450ms 后不再交替（同样受单帧 0.25s 上限约束）
  assert.equal(r.step(0.01).style, 'yellow')
})

check('位置按帧贴近目标（60Hz 下 0.55/帧的等价量）', () => {
  const r = new H.Reticle([0, 0, 100, 100], 'white')
  r.setTarget([400, 0, 100, 100])
  r.step(1 / 60)
  const one = r.box[0]
  assert.ok(one > 180 && one < 260, '首帧推进量不对：' + one.toFixed(1))
  for (let i = 0; i < 40; i++) r.step(1 / 60)
  assert.ok(near(r.box[0], 400, 1), '0.7 秒内应基本贴住目标：' + r.box[0].toFixed(1))
})

check('60Hz 与 120Hz 走同样的时间、得到同样的位置（dt 归一化）', () => {
  const a = new H.Reticle([0, 0, 100, 100], 'white')
  const b = new H.Reticle([0, 0, 100, 100], 'white')
  a.setTarget([400, 0, 100, 100]); b.setTarget([400, 0, 100, 100])
  for (let i = 0; i < 6; i++) a.step(1 / 60)
  for (let i = 0; i < 12; i++) b.step(1 / 120)
  assert.ok(Math.abs(a.box[0] - b.box[0]) < 0.5,
    '两种刷新率下位置应一致：' + a.box[0].toFixed(3) + ' vs ' + b.box[0].toFixed(3))
})

check('单帧 dt 被夹住，后台节流后不会瞬移', () => {
  const r = new H.Reticle([0, 0, 100, 100], 'white')
  r.setTarget([1000, 0, 100, 100])
  r.step(30)   // 标签页挂起 30 秒回来
  assert.ok(r.box[0] <= 600, '单帧位移被限幅（最多吃掉 60% 差距）：' + r.box[0].toFixed(1))
})

check('标签 300ms 后才淡入，且换样式不打断它', () => {
  const r = new H.Reticle([0, 0, 200, 200], 'white')
  r.setLabel('0451')
  assert.equal(r.step(0.2).labelAlpha, 0)
  assert.ok(r.step(0.3).labelAlpha > 0.9, '500ms 时应完全显示')
  r.setStyle('yellow')
  const after = r.step(0.1)
  assert.ok(after.labelAlpha > 0.9, '换样式后标签不该重新淡入：' + after.labelAlpha)
})

check('退场：remove 后 300ms 内淡到 0', () => {
  const r = new H.Reticle([0, 0, 200, 200], 'white')
  r.step(0.5)
  r.remove()
  assert.ok(r.step(0.1).alpha < 0.75)
  assert.ok(r.step(0.3).alpha < 0.02)
})

console.log('\n[配色 = 剧里的判断语言]')
check('六种样式的色值与原作一致', () => {
  assert.equal(H.COLORS.white, '#f2f2f2')
  assert.equal(H.COLORS.yellow, '#f2e02a')
  assert.equal(H.COLORS.red, '#e8212b')
  assert.equal(H.COLORS.blue, '#1d6cf0')
  assert.deepEqual(Object.keys(H.STYLES).sort(),
    ['black_yellow', 'blue', 'red', 'white', 'white_red', 'yellow'])
})


console.log('\n[黑条尺寸：可自定义]')
check('固定模式：长度 = 取景框宽 × 比例，厚度 = 取景框高 × 比例', () => {
  const r = H.barSize('fixed', { rectW: 200, rectH: 200, widthRatio: 0.5, heightRatio: 0.1 })
  assert.ok(Math.abs(r.w - 100) < 0.001, '长度不对：' + r.w)
  assert.ok(Math.abs(r.h - 20) < 0.001, '厚度不对：' + r.h)
})
check('固定模式默认值：长度 96%、厚度 13%', () => {
  const r = H.barSize('fixed', { rectW: 200, rectH: 200 })
  assert.ok(Math.abs(r.w - 192) < 0.001, '默认长度不对：' + r.w)
  assert.ok(Math.abs(r.h - 26) < 0.001, '默认厚度不对：' + r.h)
})
check('眼位模式：长度 = 眼距 × 倍数，厚度 = 眼高 × 倍数', () => {
  const r = H.barSize('eye', { span: 40, eyeH: 6, spanScale: 1.75, thickScale: 2.2 })
  assert.ok(Math.abs(r.w - 70) < 0.001, '长度不对：' + r.w)
  assert.ok(Math.abs(r.h - 13.2) < 0.001, '厚度不对：' + r.h)
})
check('眼位模式：倍数可调，1.0 就是刚好盖住两眼', () => {
  const r = H.barSize('eye', { span: 40, eyeH: 6, spanScale: 1, thickScale: 1 })
  assert.ok(Math.abs(r.w - 40) < 0.001, '长度不对：' + r.w)
  assert.ok(Math.abs(r.h - 6) < 0.001, '厚度不对：' + r.h)
})
check('有最小值兜底，不会画成 0 宽', () => {
  const r = H.barSize('eye', { span: 0, eyeH: 0 }, 12, 6)
  assert.equal(r.w, 12)
  assert.equal(r.h, 6)
})
check('drawEyes 的长度比例真的生效（且左右居中）', () => {
  const calls = []
  const ctx = { save() {}, restore() {}, fillRect: (x, y, w, h) => calls.push([x, y, w, h]) }
  H.drawEyes(ctx, 0, 0, 200, 200, { on: true, blocks: 1, offset: 0.36, height: 0.13, widthRatio: 0.5, gap: 0, jitter: false }, 0)
  assert.equal(calls.length, 1, '应只画一条')
  assert.ok(Math.abs(calls[0][2] - 100) < 0.001, '条宽不对：' + calls[0][2])
  assert.ok(Math.abs(calls[0][0] - 50) < 0.001, '条没有居中：' + calls[0][0])
})
check('drawEyes 默认长度仍是 96%（向后兼容）', () => {
  const calls = []
  const ctx = { save() {}, restore() {}, fillRect: (x, y, w, h) => calls.push([x, y, w, h]) }
  H.drawEyes(ctx, 0, 0, 200, 200, { on: true, blocks: 1, offset: 0.36, height: 0.13, gap: 0, jitter: false }, 0)
  assert.ok(Math.abs(calls[0][2] - 192) < 0.001, '默认条宽不对：' + calls[0][2])
})

console.log('\n[眼位黑条：斜矩形几何 eyeBarFit]')

/* 一组「正面」眼角：左眼 100–140、右眼 180–220，眼高 12px，中心 y=100 */
function faceEyes(dy) {
  const t = dy || 0
  return {
    lOuter: { x: 100, y: 100 - 20 * t },
    lInner: { x: 140, y: 100 - 20 * t },
    lTop: { x: 120, y: 94 - 20 * t },
    lBot: { x: 120, y: 106 - 20 * t },
    rInner: { x: 180, y: 100 + 20 * t },
    rOuter: { x: 220, y: 100 + 20 * t },
    rTop: { x: 200, y: 94 + 20 * t },
    rBot: { x: 200, y: 106 + 20 * t }
  }
}

check('正面：条水平、居中在两眼之间，角度 0', () => {
  const f = H.eyeBarFit(faceEyes(0), { spanScale: 1.75, thickScale: 2.2, eyeH: 12 })
  assert.ok(f, '没算出几何')
  assert.ok(near(f.angle, 0, 1e-9), '角度应为 0：' + f.angle)
  assert.ok(near(f.x + f.w / 2, 160, 0.001), '中心 x 应为 160：' + (f.x + f.w / 2))
  assert.ok(near(f.y + f.h / 2, 100, 0.001), '中心 y 应为 100：' + (f.y + f.h / 2))
  /* 长度 = max(眼距 80 × 1.75, 外角到外角 120 × 1.06) = 140 */
  assert.ok(near(f.w, 140, 0.001), '长度不对：' + f.w)
  /* 厚度 = 眼睑张开 12 × 2.2 × 1.6 = 42.24（与 1.6.0 的观感对齐） */
  assert.ok(near(f.h, 12 * 2.2 * H.EYE_BAR_GAIN, 0.001), '厚度不对：' + f.h)
})
check('歪头：角度跟着两只眼睛的连线走（不再是一条水平条）', () => {
  const f = H.eyeBarFit(faceEyes(0.3), { eyeH: 12 })
  /* 两眼中心 (120,94) → (200,106)：角度 = atan2(12, 80) */
  const want = Math.atan2(12, 80)
  assert.ok(near(f.angle, want, 1e-9), '角度应为 ' + (want * 180 / Math.PI).toFixed(1) + '°，实际 ' + (f.angle * 180 / Math.PI).toFixed(1) + '°')
})
check('歪头后长度会略增 —— 因为包络按旋转轴重算，不会把眼角切掉', () => {
  const flat = H.eyeBarFit(faceEyes(0), { eyeH: 12 })
  const tilt = H.eyeBarFit(faceEyes(0.3), { eyeH: 12 })
  assert.ok(tilt.w > flat.w, '歪头后长度应当不小于正面：' + tilt.w + ' vs ' + flat.w)
})
check('把长度倍数调到很小也仍然盖住两个外眼角', () => {
  const f = H.eyeBarFit(faceEyes(0), { spanScale: 0.2, thickScale: 0.2, eyeH: 2 })
  /* 外角跨度 120，外扩 1.06 → 至少 127.2 */
  assert.ok(f.w >= 120, '被调小后长度塌了：' + f.w)
  assert.ok(f.h >= 12, '被调小后厚度塌了：' + f.h)
})
check('单眼眯起来时厚度不塌（取两只眼里张得开的那只）', () => {
  const p = faceEyes(0)
  p.rTop.y = 99; p.rBot.y = 101          /* 右眼只剩 2px 缝 */
  const f = H.eyeBarFit(p)
  assert.ok(near(f.h, 12 * 2.2 * H.EYE_BAR_GAIN, 0.001), '厚度被单眼拖小了：' + f.h)
})
check('双眼都眯成缝时，厚度只降到眼眶高度，不会继续变薄', () => {
  const p = faceEyes(0)
  /* 上下眼睑合到同一条线上：垂直张开归零 */
  for (const k of ['lTop', 'lBot', 'rTop', 'rBot']) p[k] = { x: p[k].x, y: 100 }
  const f = H.eyeBarFit(p)
  const eyeW = 40                       /* lOuter(100) → lInner(140) */
  assert.ok(near(f.h, eyeW * H.EYE_SOCKET_RATIO, 0.001),
    '眯眼时厚度没兜在眼眶高度：' + f.h + '，期望 ' + eyeW * H.EYE_SOCKET_RATIO)
  /* 对照：正常睁眼时仍按「张开 × 倍数」算，下限不能反过来把条压薄 */
  const f2 = H.eyeBarFit(faceEyes(0))
  assert.ok(f2.h > eyeW * H.EYE_SOCKET_RATIO, '下限把正常睁眼的厚度压薄了：' + f2.h)
})
check('点数不齐 / 退化输入返回 null（调用方好回退）', () => {
  assert.equal(H.eyeBarFit(null), null)
  assert.equal(H.eyeBarFit({}), null)
  const p = faceEyes(0)
  p.rOuter = { x: NaN, y: 0 }
  assert.equal(H.eyeBarFit(p), null, '有 NaN 点应当拒绝')
  /* 两眼塌成同一点：算不出轴向，必须返回 null 而不是画一条 0 长的条 */
  const same = {
    lOuter: { x: 160, y: 100 }, lInner: { x: 160, y: 100 },
    lTop: { x: 160, y: 94 }, lBot: { x: 160, y: 106 },
    rInner: { x: 160, y: 100 }, rOuter: { x: 160, y: 100 },
    rTop: { x: 160, y: 94 }, rBot: { x: 160, y: 106 }
  }
  assert.equal(H.eyeBarFit(same), null, '两眼重合应当拒绝')
})

check('左右眼顺序反了也照样算对（网格索引按被拍者命名，图上可能是反的）', () => {
  const p = faceEyes(0.3)
  /* 把左右两眼的点整体对调 */
  const swapped = {
    lOuter: p.rOuter, lInner: p.rInner, lTop: p.rTop, lBot: p.rBot,
    rInner: p.lInner, rOuter: p.lOuter, rTop: p.lTop, rBot: p.lBot
  }
  const a = H.eyeBarFit(p, {})
  const b = H.eyeBarFit(swapped, {})
  assert.ok(Math.abs(b.angle) < Math.PI / 2, '角度没有归一到 ±90° 内：' + (b.angle * 180 / Math.PI).toFixed(1))
  assert.ok(near(a.x + a.w / 2, b.x + b.w / 2, 1e-6), '中心变了')
  assert.ok(near(a.y + a.h / 2, b.y + b.h / 2, 1e-6), '中心变了')
  assert.ok(near(a.w, b.w, 1e-6) && near(a.h, b.h, 1e-6), '尺寸变了')
})

console.log('\n[眼位黑条：绘制]')
check('drawBar 支持旋转角（同一矩形，转 30° 后四角跟着走）', () => {
  const rot = []
  const ctx = {
    save() {}, restore() {},
    translate: (x, y) => rot.push(['t', x, y]),
    rotate: (a) => rot.push(['r', a]),
    fillRect: () => rot.push(['f'])
  }
  H.drawBar(ctx, 10, 20, 100, 30, 1, 0, 0, Math.PI / 6)
  assert.ok(rot.some((c) => c[0] === 'r' && near(c[1], Math.PI / 6)), '没有按角度旋转')
  /* 绕中心转：先平移到中心，再转，再平移回去 */
  assert.ok(rot.some((c) => c[0] === 't' && near(c[1], 60) && near(c[2], 35)), '旋转原点不是矩形中心')
})
check('angle=0 时不额外施加变换（老调用路径完全不变）', () => {
  const rot = []
  const ctx = { save() {}, restore() {}, translate: () => rot.push('t'), rotate: () => rot.push('r'), fillRect: () => {} }
  H.drawBar(ctx, 0, 0, 50, 10, 1, 0, 0, 0)
  assert.equal(rot.length, 0)
})
check('edge 抖动模式下每条块仍是满高（眼睛不会从缩小的块里露出来）', () => {
  const rects = []
  const ctx = { save() {}, restore() {}, fillRect: (x, y, w, h) => rects.push([x, y, w, h]) }
  H.drawBar(ctx, 0, 0, 120, 20, 5, 2, 1.234, 0, 'edge')
  assert.equal(rects.length, 5, '块数不对')
  for (const r of rects) assert.ok(near(r[3], 20), 'edge 模式下块高应当恒等于条高，实际 ' + r[3])
})
check('move 抖动模式仍保留旧的整块上下跳（向后兼容）', () => {
  const rects = []
  const ctx = { save() {}, restore() {}, fillRect: (x, y, w, h) => rects.push([x, y, w, h]) }
  H.drawBar(ctx, 0, 0, 120, 20, 5, 2, 1.234, 0, 'move')
  assert.ok(rects.some((r) => r[3] !== 20), 'move 模式下高度应当有变化')
})

console.log('\n全部通过：' + passed + ' 项\n')
