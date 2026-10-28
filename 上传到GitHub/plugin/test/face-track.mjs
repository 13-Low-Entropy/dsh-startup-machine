/* ============================================================================
 * 取景器算法测试：node test/face-track.mjs
 * ----------------------------------------------------------------------------
 * 用合成帧喂 lib/face-track.js —— 真摄像头没法在 CI/无头里跑，
 * 但「框会不会落在人脸上、会不会被墙和噪点骗走」这件事可以离线验。
 * ========================================================================== */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(ROOT, 'lib/face-track.js'), 'utf8')
const sandbox = {}
vm.runInNewContext(src, sandbox)
const FT = sandbox.MSFaceTrack
assert.ok(FT && typeof FT.detect === 'function', 'face-track.js 没导出 MSFaceTrack.detect')

let passed = 0
function check(label, fn) {
  fn()
  passed++
  console.log('  ok  ' + label)
}

/* ── 合成帧 ──────────────────────────────────────────────────────────────── */
function frame(w, h, bg, blobs) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = bg[0]
    data[i * 4 + 1] = bg[1]
    data[i * 4 + 2] = bg[2]
    data[i * 4 + 3] = 255
  }
  for (const b of blobs || []) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = (x + 0.5) / w
        const ny = (y + 0.5) / h
        const dx = (nx - b.cx) / b.rx
        const dy = (ny - b.cy) / b.ry
        if (dx * dx + dy * dy <= 1) {
          const i = (y * w + x) * 4
          data[i] = b.c[0]
          data[i + 1] = b.c[1]
          data[i + 2] = b.c[2]
        }
      }
    }
  }
  return { data, width: w, height: h }
}

const SKIN = [200, 160, 135]
const DARK_SKIN = [126, 88, 68]
const WALL = [120, 118, 112]        // 灰墙：不该被当肤色
const BG = [10, 14, 20]

console.log('\nface-track 算法\n')

console.log('[肤色判定]')
check('典型肤色判为肤色', () => {
  assert.equal(FT.isSkin(...SKIN), true)
  assert.equal(FT.isSkin(...DARK_SKIN), true)
})
check('灰墙 / 白衬衫 / 深蓝背景都判为不是肤色', () => {
  assert.equal(FT.isSkin(...WALL), false)
  assert.equal(FT.isSkin(230, 230, 232), false)
  assert.equal(FT.isSkin(...BG), false)
})

console.log('\n[定位]')
check('正中间的人脸：框落在脸上', () => {
  const r = FT.detect(frame(160, 120, BG, [{ cx: 0.5, cy: 0.5, rx: 0.12, ry: 0.16, c: SKIN }]))
  assert.ok(r, '应该检出')
  assert.ok(Math.abs(r.x - 0.5) < 0.03, 'x 偏了：' + r.x.toFixed(3))
  assert.ok(Math.abs(r.y - 0.5) < 0.03, 'y 偏了：' + r.y.toFixed(3))
  assert.ok(r.w > 0.18 && r.w < 0.40, '宽不合理：' + r.w.toFixed(3))
})

check('偏右下的人脸：框跟着走', () => {
  const r = FT.detect(frame(160, 120, BG, [{ cx: 0.68, cy: 0.38, rx: 0.11, ry: 0.14, c: SKIN }]))
  assert.ok(r)
  assert.ok(Math.abs(r.x - 0.68) < 0.03, 'x 没跟上：' + r.x.toFixed(3))
  assert.ok(Math.abs(r.y - 0.38) < 0.03, 'y 没跟上：' + r.y.toFixed(3))
})

check('暗光下的深肤色也能检出', () => {
  const r = FT.detect(frame(160, 120, BG, [{ cx: 0.42, cy: 0.55, rx: 0.13, ry: 0.16, c: DARK_SKIN }]))
  assert.ok(r, '深肤色漏检了')
  assert.ok(Math.abs(r.x - 0.42) < 0.035)
})

check('两个块：取面积大的那个', () => {
  const r = FT.detect(frame(160, 120, BG, [
    { cx: 0.2, cy: 0.3, rx: 0.05, ry: 0.05, c: SKIN },
    { cx: 0.72, cy: 0.6, rx: 0.14, ry: 0.17, c: SKIN }
  ]))
  assert.ok(r)
  assert.ok(r.x > 0.6, '选错了块：x=' + r.x.toFixed(3))
})

check('同一目标重复检测结果稳定（不会忽左忽右）', () => {
  const f = () => FT.detect(frame(160, 120, BG, [{ cx: 0.62, cy: 0.44, rx: 0.11, ry: 0.14, c: SKIN }]))
  const first = f()
  for (let i = 0; i < 5; i++) {
    const r = f()
    assert.ok(Math.abs(r.x - first.x) < 0.002, '重复检测抖动：' + r.x.toFixed(4) + ' vs ' + first.x.toFixed(4))
  }
})

console.log('\n[不能骗到框]')
check('纯背景：不返回框', () => {
  assert.equal(FT.detect(frame(160, 120, BG, [])), null)
})
check('灰墙 / 白衣服：不返回框', () => {
  assert.equal(FT.detect(frame(160, 120, BG, [{ cx: 0.5, cy: 0.5, rx: 0.3, ry: 0.3, c: WALL }])), null)
  assert.equal(FT.detect(frame(160, 120, BG, [{ cx: 0.5, cy: 0.7, rx: 0.35, ry: 0.3, c: [232, 232, 234] }])), null)
})
check('满屏肤色（贴着暖色墙站）：不返回框', () => {
  assert.equal(FT.detect(frame(160, 120, SKIN, [])), null)
})
check('极小噪点：不返回框', () => {
  assert.equal(FT.detect(frame(160, 120, BG, [{ cx: 0.5, cy: 0.5, rx: 0.012, ry: 0.012, c: SKIN }])), null)
})
check('空帧 / 非法输入不抛异常', () => {
  assert.equal(FT.detect(null), null)
  assert.equal(FT.detect({ data: null, width: 0, height: 0 }), null)
})

console.log('\n[头肩连片]')
check('脸 + 脖子 + 胸口连成一条时，框被收回头部比例', () => {
  const r = FT.detect(frame(160, 120, BG, [
    { cx: 0.5, cy: 0.32, rx: 0.10, ry: 0.12, c: SKIN },   // 头
    { cx: 0.5, cy: 0.52, rx: 0.055, ry: 0.10, c: SKIN },  // 脖子
    { cx: 0.5, cy: 0.78, rx: 0.20, ry: 0.16, c: SKIN }    // 胸口
  ]))
  assert.ok(r, '应该检出')
  assert.ok(r.h <= r.w * 1.85, '框还是太长（像上半身）：' + (r.h / r.w).toFixed(2))
  assert.ok(r.y < 0.55, '顶边没锚在头上：y=' + r.y.toFixed(3))
})

console.log('\n全部通过：' + passed + ' 项\n')
