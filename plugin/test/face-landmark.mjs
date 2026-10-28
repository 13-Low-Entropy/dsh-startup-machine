/**
 * face-landmark.js 的单元测试
 * ---------------------------------------------------------------------------
 * MediaPipe 已经替我们做完了检测，这里只守「结果 → 归一化坐标」这一层：
 *   · 空结果 / 退化结果必须干净地返回 null（调用方靠它回退，不许抛）
 *   · 脸框、双眼中心、眼距、眼高必须是「视频帧归一化坐标」，且口径稳定
 *   · 用到的关键点索引必须落在 478 点拓扑里（写错一个数字，框就飘到后脑勺）
 *   · 缺资源路径时 create() 必须 reject 而不是静默挂住
 *
 * 跑法：node test/face-landmark.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const src = fs.readFileSync(path.join(ROOT, 'lib/face-landmark.js'), 'utf8')
const sandbox = { module: { exports: {} } }
sandbox.globalThis = sandbox
vm.runInNewContext(src, sandbox)
const LM = sandbox.module.exports

let pass = 0
function check(name, fn) {
  try {
    fn()
    pass++
    console.log('  ok  ' + name)
  } catch (err) {
    console.log('  FAIL  ' + name + '\n        ' + (err && err.message))
    process.exitCode = 1
  }
}

/** 造一张「已知真值」的 478 点脸：脸框 0.3–0.5 × 0.2–0.6，两眼中心 0.35 / 0.45，眼高 0.03 */
function synthFace(opt) {
  const o = opt || {}
  const pts = new Array(478)
  const faceL = o.faceL == null ? 0.30 : o.faceL
  const faceR = o.faceR == null ? 0.50 : o.faceR
  const faceT = o.faceT == null ? 0.20 : o.faceT
  const faceB = o.faceB == null ? 0.60 : o.faceB
  for (let i = 0; i < 478; i++) pts[i] = { x: (faceL + faceR) / 2, y: (faceT + faceB) / 2, z: 0 }
  /* 轮廓点撑满整张脸（模拟 478 点里的剪影） */
  const outline = [10, 152, 234, 454, 127, 356, 132, 361, 58, 288, 172, 397]
  outline.forEach((i, k) => {
    const t = k / outline.length
    const a = t * Math.PI * 2
    pts[i] = {
      x: (faceL + faceR) / 2 + Math.cos(a) * (faceR - faceL) / 2,
      y: (faceT + faceB) / 2 + Math.sin(a) * (faceB - faceT) / 2,
      z: 0
    }
  })
  /* 左眼轮廓（外角 33 / 内角 133 / 上睑 159,158 / 下睑 145,153） */
  const eL = { cx: 0.35, cy: 0.345, hw: 0.020, hh: 0.015 }
  const eR = { cx: 0.45, cy: 0.345, hw: 0.020, hh: 0.015 }
  LM.EYE.L.forEach((i, k) => {
    pts[i] = { x: eL.cx - eL.hw + (k / (LM.EYE.L.length - 1)) * eL.hw * 2, y: eL.cy + (k % 2 ? eL.hh : -eL.hh), z: 0 }
  })
  LM.EYE.R.forEach((i, k) => {
    pts[i] = { x: eR.cx - eR.hw + (k / (LM.EYE.R.length - 1)) * eR.hw * 2, y: eR.cy + (k % 2 ? eR.hh : -eR.hh), z: 0 }
  })
  pts[LM.EYE.IL] = { x: eL.cx, y: eL.cy, z: 0 }
  pts[LM.EYE.IR] = { x: eR.cx, y: eR.cy, z: 0 }
  pts[1] = { x: (faceL + faceR) / 2, y: (faceT + faceB) / 2, z: 0 }
  return pts
}

console.log('\n[退化输入不许抛]')
check('null / 空对象 / 没有 faceLandmarks 都返回 null', () => {
  assert.equal(LM.normalize(null), null)
  assert.equal(LM.normalize({}), null)
  assert.equal(LM.normalize({ faceLandmarks: [] }), null)
  assert.equal(LM.normalize({ faceLandmarks: [[]] }), null)
})
check('所有点重合（宽高为 0）也返回 null，不产生 NaN 框', () => {
  const pts = new Array(478).fill({ x: 0.5, y: 0.5, z: 0 })
  assert.equal(LM.normalize({ faceLandmarks: [pts] }), null)
})

console.log('\n[归一化口径]')
check('脸框按 BOX_PAD 外扩，中心不变', () => {
  const r = LM.normalize({ faceLandmarks: [synthFace()] })
  assert.ok(r && r.box, '没有 box')
  assert.ok(Math.abs(r.box.x - 0.40) < 1e-9, 'x 应保持 0.40，实际 ' + r.box.x)
  assert.ok(Math.abs(r.box.y - 0.40) < 1e-9, 'y 应保持 0.40，实际 ' + r.box.y)
  assert.ok(Math.abs(r.box.w - 0.20 * LM.BOX_PAD) < 1e-9, 'w 应为 0.20×BOX_PAD，实际 ' + r.box.w)
  assert.ok(Math.abs(r.box.h - 0.40 * LM.BOX_PAD) < 1e-9, 'h 应为 0.40×BOX_PAD，实际 ' + r.box.h)
})
check('眼心取虹膜，眼距是两眼横向距离', () => {
  const r = LM.normalize({ faceLandmarks: [synthFace()] })
  assert.ok(Math.abs(r.eyes.vx - 0.40) < 1e-9, 'vx 应为 0.40，实际 ' + r.eyes.vx)
  assert.ok(Math.abs(r.eyes.vy - 0.345) < 1e-9, 'vy 应为 0.345，实际 ' + r.eyes.vy)
  assert.ok(Math.abs(r.eyes.span - 0.10) < 1e-9, 'span 应为 0.10，实际 ' + r.eyes.span)
})
check('眼高取张得开的那只，并乘以 EYE_OPEN_GAIN', () => {
  const pts = synthFace()
  /* 把右眼压扁：左眼（0.030）应当被选中，而不是取平均 */
  LM.EYE.R.forEach((i) => { pts[i] = { x: pts[i].x, y: 0.345 + 0.004, z: 0 } })
  const r = LM.normalize({ faceLandmarks: [pts] })
  assert.ok(Math.abs(r.eyes.eh - 0.030 * LM.EYE_OPEN_GAIN) < 1e-9, 'eh 实际 ' + r.eyes.eh)
})
check('没有虹膜点时退回眼睑中心（模型不带 refine_landmarks 的情况）', () => {
  const pts = synthFace()
  delete pts[LM.EYE.IL]
  delete pts[LM.EYE.IR]
  pts.length = 478
  const r = LM.normalize({ faceLandmarks: [pts] })
  assert.ok(r, '应当仍然给结果')
  assert.ok(Math.abs(r.eyes.vx - 0.40) < 0.01, 'vx 实际 ' + r.eyes.vx)
})
check('头部姿态是有限数（歪头时 roll 明显不为 0）', () => {
  const pts = synthFace()
  /* 右眼整体抬高 = 头往左歪 */
  LM.EYE.R.forEach((i) => { pts[i] = { x: pts[i].x, y: pts[i].y - 0.06, z: 0 } })
  pts[LM.EYE.IR] = { x: 0.45, y: 0.345 - 0.06, z: 0 }
  const r = LM.normalize({ faceLandmarks: [pts] })
  for (const k of ['roll', 'yaw', 'pitch']) {
    assert.ok(Number.isFinite(r.pose[k]), k + ' 不是有限数：' + r.pose[k])
  }
  assert.ok(r.pose.roll < -8, '右眼抬高时 roll 应为负角，实际 ' + r.pose.roll)
})
check('点数原样回传（HUD 上要显示 478 PTS）', () => {
  const r = LM.normalize({ faceLandmarks: [synthFace()] })
  assert.equal(r.points, 478)
})

console.log('\n[黑条用的四点一眼]')
check('quad 八个点齐全，坐标就是归一化视频坐标', () => {
  const r = LM.normalize({ faceLandmarks: [synthFace()] })
  const q = r.eyes.quad
  assert.ok(q, '没有 quad')
  for (const k of ['lOuter', 'lInner', 'lTop', 'lBot', 'rInner', 'rOuter', 'rTop', 'rBot']) {
    assert.ok(q[k] && Number.isFinite(q[k].x) && Number.isFinite(q[k].y), '缺 ' + k)
  }
  /* 左眼在画面左侧、右眼在右侧 */
  assert.ok(q.lOuter.x < q.lInner.x, '左眼外角应在外侧')
  assert.ok(q.rInner.x < q.rOuter.x, '右眼外角应在外侧')
  assert.ok(q.lInner.x < q.rInner.x, '左眼整体应在右眼左侧')
  /* 上睑在眼睛中线上方、下睑在下方 */
  assert.ok(q.lTop.y < q.lBot.y && q.rTop.y < q.rBot.y, '上下睑反了')
})
check('上/下睑取双点中点（单点抖动不会让厚度跳）', () => {
  const base = synthFace()
  const r1 = LM.normalize({ faceLandmarks: [base] })
  const jitter = synthFace()
  /* 把 158 往上挪一点：取中点后厚度只变一半 */
  jitter[158] = { x: jitter[158].x, y: jitter[158].y - 0.01, z: 0 }
  const r2 = LM.normalize({ faceLandmarks: [jitter] })
  const d1 = r1.eyes.quad.lTop.y
  const d2 = r2.eyes.quad.lTop.y
  assert.ok(Math.abs(d2 - d1) < 0.006, '单点挪 0.01，中点最多动 0.005，实际 ' + Math.abs(d2 - d1))
})
check('缺眼角点时 quad 为 null（上层退回「眼距 × 倍数」）', () => {
  const pts = synthFace()
  delete pts[LM.EYE.L_OUT]
  const r = LM.normalize({ faceLandmarks: [pts] })
  assert.equal(r.eyes.quad, null)
  assert.ok(r.eyes.span > 0, '即便没有 quad，基础眼位仍要给')
})

console.log('\n[拓扑索引]')
check('所有用到的关键点都在 478 点范围内', () => {
  const idx = [].concat(LM.EYE.L, LM.EYE.R, [LM.EYE.IL, LM.EYE.IR])
  for (const i of idx) {
    assert.ok(Number.isInteger(i) && i >= 0 && i < 478, '越界索引 ' + i)
  }
})
check('左右眼索引不重叠（写错会算出 span=0）', () => {
  const l = new Set(LM.EYE.L)
  for (const i of LM.EYE.R) {
    assert.ok(!l.has(i), '索引 ' + i + ' 同时出现在左右眼')
  }
})

console.log('\n[装载失败要 reject]')
/* 这条是异步的，单独跑（不能塞进同步的 check 里） */
let rejected = false
try {
  const p = LM.create({ video: null })
  assert.ok(p && typeof p.then === 'function', 'create() 应当返回 Promise')
  await p
} catch (err) {
  rejected = true
  assert.ok(/basePath|资源路径/.test(String(err && err.message)), 'reject 理由要说人话：' + err.message)
}
check('没有 basePath 时 create() 直接 reject', () => assert.ok(rejected, '缺少 basePath 应当 reject'))

if (process.exitCode) {
  console.log('\n有失败项')
} else {
  console.log('\n全部通过：' + pass + ' 项')
}
