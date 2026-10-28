/**
 * eye-track.js —— 眼部定位（可行性验证版，尚未接入运行时）
 * ---------------------------------------------------------------------------
 * 目标：在「脸部裁剪图」里找出两只眼睛的位置，让黑色马赛克条能压在眼睛上，
 * 而不是按头框的固定解剖学比例摆。
 *
 * 思路（零依赖、零模型、纯 CPU）：
 *   1. 灰度化
 *   2. 取阈值：相对整块裁剪图的亮度（眼睛比皮肤暗得多，所以用相对阈值，
 *      逆光/暗光下依然成立；绝对阈值会在暗光时全军覆没）
 *   3. 二值化成「暗区」，做四连通标记
 *   4. 用解剖学先验筛掉干扰：眼睛在裁剪图高度的 30%~62% 之间，
 *      宽高比不能太扁（眉毛是长条），面积不能太大（头发/阴影）
 *   5. 在剩下的连通域里挑「最对称的一对」：高低齐、面积接近、
 *      关于中线对称、间距在合理区间
 *
 * 全部坐标是「裁剪图归一化坐标」（0~1）。
 */
;(function (root, factory) {
  var api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  if (root) root.MSEyeTrack = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  /* 解剖学先验：眼睛在脸/头裁剪图里的高度带 */
  var BAND = { top: 0.30, bottom: 0.62 }
  /* 双眼间距的合理区间（占裁剪图宽） */
  var SEP = { min: 0.20, max: 0.74 }

  function toGray(data, w, h) {
    var g = new Float32Array(w * h)
    for (var i = 0, p = 0; i < g.length; i++, p += 4) {
      g[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
    }
    return g
  }

  function meanStd(g) {
    var n = g.length
    var sum = 0
    for (var i = 0; i < n; i++) sum += g[i]
    var mean = sum / n
    var vs = 0
    for (var j = 0; j < n; j++) { var d = g[j] - mean; vs += d * d }
    return { mean: mean, std: Math.sqrt(vs / n) }
  }

  /**
   * @param {{data:Uint8ClampedArray|number[], width:number, height:number}} img 脸部裁剪
   * @param {object} opts
   *   relThr   相对阈值（越小越严格），默认 0.74
   *   bandTop / bandBottom  眼睛高度带，默认 0.30 / 0.62
   * @returns {null|{cx,cy,span,ew,eh,conf,left,right}}  归一化坐标
   */
  function findEyes(img, opts) {
    if (!img || !img.data || !img.width || !img.height) return null
    var o = opts || {}
    var w = img.width, h = img.height
    if (w < 8 || h < 8) return null

    var bandTop = o.bandTop == null ? BAND.top : o.bandTop
    var bandBottom = o.bandBottom == null ? BAND.bottom : o.bandBottom

    var g = toGray(img.data, w, h)
    var ms = meanStd(g)
    /* 相对阈值：暗光/逆光下比绝对阈值稳得多 */
    var thr = Math.max(ms.mean * (o.relThr == null ? 0.74 : o.relThr), ms.mean - 1.7 * ms.std, 6)

    var n = w * h
    var dark = new Uint8Array(n)
    for (var i = 0; i < n; i++) dark[i] = g[i] <= thr ? 1 : 0

    /* 四连通标记 */
    var label = new Int32Array(n)
    var comps = []
    var stack = new Int32Array(n)
    var cur = 0
    for (var s = 0; s < n; s++) {
      if (!dark[s] || label[s]) continue
      cur++
      var sp = 0
      stack[sp++] = s
      label[s] = cur
      var area = 0, minX = w, maxX = -1, minY = h, maxY = -1, sumX = 0, sumY = 0
      while (sp > 0) {
        var p = stack[--sp]
        var cy = (p / w) | 0
        var cx = p - cy * w
        area++; sumX += cx; sumY += cy
        if (cx < minX) minX = cx
        if (cx > maxX) maxX = cx
        if (cy < minY) minY = cy
        if (cy > maxY) maxY = cy
        if (cx > 0 && dark[p - 1] && !label[p - 1]) { label[p - 1] = cur; stack[sp++] = p - 1 }
        if (cx < w - 1 && dark[p + 1] && !label[p + 1]) { label[p + 1] = cur; stack[sp++] = p + 1 }
        if (cy > 0 && dark[p - w] && !label[p - w]) { label[p - w] = cur; stack[sp++] = p - w }
        if (cy < h - 1 && dark[p + w] && !label[p + w]) { label[p + w] = cur; stack[sp++] = p + w }
      }
      comps.push({ area: area, minX: minX, maxX: maxX, minY: minY, maxY: maxY, cx: sumX / area, cy: sumY / area })
    }

    /* 筛掉不可能是眼睛的连通域 */
    var minArea = Math.max(3, w * h * 0.0009)
    var maxArea = w * h * 0.10
    var cand = []
    for (var c = 0; c < comps.length; c++) {
      var k = comps[c]
      var bw = k.maxX - k.minX + 1
      var bh = k.maxY - k.minY + 1
      if (k.area < minArea || k.area > maxArea) continue
      if (bw > w * 0.55) continue                  /* 头发/整条阴影 */
      var aspect = bw / bh
      if (aspect < 0.40 || aspect > 3.2) continue  /* 眉毛是长条，眼睛偏方 */
      var ny = k.cy / h
      if (ny < bandTop || ny > bandBottom) continue /* 高度带先验 */
      cand.push(k)
    }
    if (cand.length < 2) return null

    /* 挑最对称的一对 */
    var best = null
    for (var a = 0; a < cand.length; a++) {
      for (var b = a + 1; b < cand.length; b++) {
        var A = cand[a], B = cand[b]
        var dx = Math.abs(A.cx - B.cx) / w
        var dy = Math.abs(A.cy - B.cy) / h
        if (dx < SEP.min || dx > SEP.max) continue
        var midX = (A.cx + B.cx) / 2 / w
        if (Math.abs(midX - 0.5) > 0.20) continue
        var sizeRatio = Math.min(A.area, B.area) / Math.max(A.area, B.area)
        if (sizeRatio < 0.40) continue
        var areaSum = (A.area + B.area) / (w * h)
        var score = areaSum * 3.2
        score -= dy * 6.0
        score -= (1 - sizeRatio) * 1.4
        score -= Math.abs(midX - 0.5) * 2.0
        score -= Math.abs(dx - 0.42) * 0.8
        if (!best || score > best.score) {
          best = {
            score: score,
            a: A, b: B,
            left: A.cx <= B.cx ? A : B,
            right: A.cx <= B.cx ? B : A
          }
        }
      }
    }
    if (!best) return null

    var L = best.left, R = best.right
    var ew = Math.max(L.maxX - L.minX + 1, R.maxX - R.minX + 1)
    var eh = Math.max(L.maxY - L.minY + 1, R.maxY - R.minY + 1)
    return {
      cx: (L.cx + R.cx) / 2 / w,
      cy: (L.cy + R.cy) / 2 / h,
      span: Math.abs(R.cx - L.cx) / w,
      ew: ew / w,
      eh: eh / h,
      conf: Math.max(0, Math.min(1, best.score * 1.4)),
      left: { x: L.cx / w, y: L.cy / h },
      right: { x: R.cx / w, y: R.cy / h }
    }
  }

  return { findEyes: findEyes, BAND: BAND, SEP: SEP }
})
