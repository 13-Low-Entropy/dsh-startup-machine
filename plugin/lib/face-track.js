/* ============================================================================
 * dsh-startup-machine — 轻量人脸取景器（零依赖、无模型、可离线）
 * ----------------------------------------------------------------------------
 * 拆成两段，中间用「每格肤色占比」这张小表衔接 —— 因为这两段的执行位置可以不同：
 *
 *   ①  像素统计（重）：video 帧 → 每格肤色占比     ← 默认 CPU(2D canvas)，
 *                                                    有 WebGL 时交给 GPU（face-track-gl.js）
 *   ②  连通域判定（轻）：每格占比 → 取景框           ← 永远在 CPU，20×15 格子而已
 *
 * 为什么要这么拆：① 要处理 128×96=12288 个像素，用 getImageData 会把整帧
 * 从 GPU 拷回内存（每次约 49 KB，还得等带宽）；② 只有 300 个格子，
 * 在 JS 里跑四连通连 0.1ms 都用不到。所以只把 ① 搬到 GPU，读回一张 300 格的
 * 小表（不到 1 KB），性价比最高。
 *
 * 算法本身：
 *   1) 逐像素肤色判定（RGB 规则 ∩ YCbCr 区间）
 *   2) 每格算肤色占比，≥阈值算「肤色格」
 *   3) 格子图四连通，取权重最大的块 → 外接框给尺寸、肤色质心给中心
 *   4) 头肩连成一片时按长宽比收回头部
 *
 * 输出归一化坐标（0–1，相对视频帧），镜像/裁切映射与时间平滑由调用侧负责。
 * 注意：这是视觉效果用的近似，不是人脸识别，不区分人，也不做任何比对。
 *
 * 兼容两种加载：浏览器 <script> → window.MSFaceTrack；Node vm → sandbox.MSFaceTrack。
 * ========================================================================== */
(function (root, factory) {
  var api = factory()
  if (typeof module === 'object' && module && module.exports) module.exports = api
  if (root) root.MSFaceTrack = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  var COLS = 20
  var ROWS = 15

  /* 肤色判定：两条规则取交集。阈值放得偏松 —— HUD 只需要「大概是人脸那块」，
     宁可多判一点也别在暖光/暗光下直接丢检测。
     ⚠️ 这份规则在 face-track-gl.js 的片元着色器里有一份逐字对应的实现，
        两边必须同步改（test/face-track.mjs 会比对 CPU 与 GPU 的结果）。 */
  function isSkin(r, g, b) {
    var mx = Math.max(r, g, b)
    var mn = Math.min(r, g, b)
    if (mx < 48) return false            // 太暗，无法判断
    if (mx - mn < 10) return false        // 灰阶（墙、白衬衫）
    if (r <= g || r <= b) return false    // 肤色必须红通道占优
    if (r - g < 10) return false
    if (r < 72) return false
    var y = 0.299 * r + 0.587 * g + 0.114 * b
    var cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
    var cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
    return y > 46 && cb >= 72 && cb <= 132 && cr >= 128 && cr <= 180
  }

  /**
   * 第二段：每格肤色占比 → 取景框。CPU / GPU 两条路共用。
   * @param {ArrayLike<number>} frac 长度 cols*rows，每格肤色占比 0–1（行优先，从上到下）
   * @param {number} cols
   * @param {number} rows
   * @param {{cellThreshold?:number, minCells?:number}} [opts]
   * @returns {{x:number,y:number,w:number,h:number,score:number}|null}
   */
  function analyze(frac, cols, rows, opts) {
    if (!frac || !cols || !rows) return null
    var o = opts || {}
    var cellThreshold = o.cellThreshold == null ? 0.45 : o.cellThreshold
    var minCells = o.minCells == null ? 3 : o.minCells
    var total = cols * rows
    if (frac.length < total) return null

    /* 肤色格 */
    var grid = new Uint8Array(total)
    for (var c = 0; c < total; c++) if (frac[c] >= cellThreshold) grid[c] = 1

    /* 四连通找最大块 */
    var seen = new Uint8Array(total)
    var best = null
    var stack = []
    for (var s = 0; s < total; s++) {
      if (!grid[s] || seen[s]) continue
      var weight = 0
      var cells = 0
      var minX = cols, maxX = -1, minY = rows, maxY = -1
      /* 质心用肤色占比加权 —— 格子外接框的量化误差有半格，直接拿框中心会
         稳定偏半格；质心是亚格精度的，框跟着人走时才不会「总差一点」。 */
      var sumX = 0, sumY = 0
      stack.length = 0
      stack.push(s)
      seen[s] = 1
      while (stack.length) {
        var cur = stack.pop()
        var cy = (cur / cols) | 0
        var cx = cur - cy * cols
        var wgt = frac[cur]
        weight += wgt
        sumX += wgt * (cx + 0.5) / cols
        sumY += wgt * (cy + 0.5) / rows
        cells++
        if (cx < minX) minX = cx
        if (cx > maxX) maxX = cx
        if (cy < minY) minY = cy
        if (cy > maxY) maxY = cy
        if (cx > 0 && grid[cur - 1] && !seen[cur - 1]) { seen[cur - 1] = 1; stack.push(cur - 1) }
        if (cx < cols - 1 && grid[cur + 1] && !seen[cur + 1]) { seen[cur + 1] = 1; stack.push(cur + 1) }
        if (cy > 0 && grid[cur - cols] && !seen[cur - cols]) { seen[cur - cols] = 1; stack.push(cur - cols) }
        if (cy < rows - 1 && grid[cur + cols] && !seen[cur + cols]) { seen[cur + cols] = 1; stack.push(cur + cols) }
      }
      if (cells < minCells) continue
      if (!best || weight > best.weight) {
        best = {
          weight: weight, cells: cells,
          minX: minX, maxX: maxX, minY: minY, maxY: maxY,
          cx: weight > 0 ? sumX / weight : (minX + maxX + 1) / 2 / cols,
          cy: weight > 0 ? sumY / weight : (minY + maxY + 1) / 2 / rows
        }
      }
    }
    if (!best) return null

    /* 权重太小 = 噪点，不算（等价于「肤色像素不足全画面的 0.6%」） */
    if (best.weight < total * 0.006) return null

    var spanW = (best.maxX - best.minX + 1) / cols
    var spanH = (best.maxY - best.minY + 1) / rows

    /* 头肩连成一片时，框要锚在头顶而不是块中心 —— 否则框会跑到胸口上。
       横向中心一律用质心（亚格精度），纵向在「头肩」情形下才改用顶边锚定。 */
    var isTorso = spanH > spanW * 1.75
    var bw = spanW
    var bh = isTorso ? spanW * 1.65 : spanH
    var ccx = best.cx
    var ccy = isTorso ? (best.minY / rows + bh / 2) : best.cy

    /* 外扩一点，让括号不要贴着脸皮 */
    bw *= 1.20
    bh *= 1.20

    /* 满屏肤色（贴着墙站、或者整片暖光）不当作人脸 */
    if (bw > 0.86 && bh > 0.86) return null

    /* 太小的一律不要 */
    if (bw < 0.07 || bh < 0.07) return null

    /* 夹回画面内 */
    bw = Math.min(bw, 1)
    bh = Math.min(bh, 1)
    var x0 = Math.max(0, Math.min(1 - bw, ccx - bw / 2))
    var y0 = Math.max(0, Math.min(1 - bh, ccy - bh / 2))

    return {
      x: x0 + bw / 2,
      y: y0 + bh / 2,
      w: bw,
      h: bh,
      score: best.weight / total
    }
  }

  /**
   * 第一段（CPU 版）：{data,width,height} 的 RGBA 帧 → 取景框。
   * GPU 不可用时走这条；也是所有单元测试的基准。
   * @param {{data:Uint8ClampedArray|number[], width:number, height:number}} img
   */
  function detect(img, opts) {
    if (!img || !img.data || !img.width || !img.height) return null
    var o = opts || {}
    var cols = o.cols || COLS
    var rows = o.rows || ROWS
    var w = img.width
    var h = img.height
    var data = img.data
    var cw = w / cols
    var ch = h / rows

    var skinCount = new Float32Array(cols * rows)
    var totalCount = new Float32Array(cols * rows)
    for (var y = 0; y < h; y++) {
      var row = (y / ch) | 0
      if (row >= rows) row = rows - 1
      for (var x = 0; x < w; x++) {
        var col = (x / cw) | 0
        if (col >= cols) col = cols - 1
        var i = (y * w + x) * 4
        var k = row * cols + col
        totalCount[k]++
        if (isSkin(data[i], data[i + 1], data[i + 2])) skinCount[k]++
      }
    }

    var frac = new Float32Array(cols * rows)
    for (var c = 0; c < cols * rows; c++) {
      frac[c] = totalCount[c] > 0 ? skinCount[c] / totalCount[c] : 0
    }
    return analyze(frac, cols, rows, o)
  }

  return {
    detect: detect,
    analyze: analyze,
    isSkin: isSkin,
    COLS: COLS,
    ROWS: ROWS
  }
})
