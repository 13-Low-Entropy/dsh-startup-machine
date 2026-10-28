/* ============================================================================
 * dsh-startup-machine — 取景框绘制（HUD）
 * ----------------------------------------------------------------------------
 * 这不是「参考风格重画」，是把 rosehahah/the-machine 的 web/hud.js 逐行移植：
 * 几何比例、虚线节奏、线宽 clamp、四角括号、四边中点刻度、标签排版，全部照抄。
 * 上游：https://github.com/rosehahah/the-machine（MIT，致谢 POI）
 *
 * 上游那套的核心手法（照搬，别改）：
 *   · 边是虚线、角是实心粗括号 —— 两条线宽不一样（角 = 边 × 1.7），这是「锁定」
 *     和「正在采集」的视觉区分
 *   · 四边中点各有一根朝内的刻度，corner/cross 样式更长（0.16 vs 0.055）
 *   · 所有尺寸都以 s = min(w,h) 为基准，所以大框小框长得一样
 *   · 标签是实底块 + 反色字，永远贴在框外右侧；会出界就翻到左侧
 *
 * 动画部分来自 web/app.js 的 frame()（逐帧那段）：
 *   出生 1.5 倍缩到 1（280ms）→ 白框补闪一下（350ms）
 *   → 换样式时 75ms 交替闪 450ms → 标签 300ms 后淡入
 *   位置用每帧 lerp 贴近目标（原始是 0.55/帧，按 60fps 调的）
 *
 * 与上游的唯一偏离：lerp 系数改成按 dt 换算（`1-(1-0.55)^(dt*60)`），
 * 在 60Hz 上与原始逐帧完全等价，在 120/165Hz 屏上才不会「快到看不清」。
 *
 * 浏览器 <script> → window.MSHud；Node vm → sandbox.MSHud（测试用）。
 * ========================================================================== */
(function (root, factory) {
  var api = factory()
  if (typeof module === 'object' && module && module.exports) module.exports = api
  if (root) root.MSHud = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  /* ↓↓↓ 以下到 drawLabel 结束，与上游 web/hud.js 保持一致 ↓↓↓ */

  var COLORS = {
    white: '#f2f2f2',
    yellow: '#f2e02a',
    red: '#e8212b',
    blue: '#1d6cf0',
    black: '#0a0a0a',
    ink: '#111'
  }

  /* edge = 边（虚线段）/ corner = 角括号 / bg+fg = 标签底与字色
     cross: true 的那两种，四边中点的刻度会拉长成十字 */
  var STYLES = {
    white: { edge: COLORS.white, corner: COLORS.white, bg: COLORS.white, fg: COLORS.ink },
    yellow: { edge: COLORS.yellow, corner: COLORS.yellow, bg: COLORS.yellow, fg: COLORS.ink },
    black_yellow: {
      edge: COLORS.black, corner: COLORS.yellow, bg: COLORS.black,
      fg: COLORS.yellow, border: COLORS.yellow, cross: true
    },
    red: { edge: COLORS.red, corner: COLORS.red, bg: COLORS.red, fg: '#fff' },
    white_red: { edge: COLORS.white, corner: COLORS.red, bg: COLORS.red, fg: '#fff', cross: true },
    blue: { edge: COLORS.blue, corner: COLORS.blue, bg: COLORS.blue, fg: '#fff' }
  }

  /* 画布上的框标签：跟着全片换成分辨率字（鸿蒙 Sans），拿不到再回落 */
  var FONT = '"HarmonyOS Sans SC", "HarmonyOS Sans", Futura, "Century Gothic", sans-serif'

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)) }

  /* 剧里框的是「头」不是「身体」：从头发上方一点到衣领，是个正方形。
     与上游 backend/vision.py 的 head_from_person() 同一套规则。 */
  function headBox(x, y, w, h) {
    var side = Math.min(w * 0.62, h * 0.5)
    return [x + w / 2 - side / 2, y - side * 0.08, side, side]
  }

  function drawBox(ctx, x, y, w, h, styleName, alpha) {
    var st = STYLES[styleName] || STYLES.white
    var s = Math.min(w, h)
    var lw = clamp(s / 85, 1.4, 4.2)
    var arm = s * 0.11
    var tick = s * (st.cross ? 0.16 : 0.055)
    var dash = Math.max(4, s * 0.034)
    var gap = Math.max(3, s * 0.022)
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.shadowColor = styleName === 'black_yellow' ? 'rgba(0,0,0,.6)' : st.edge
    ctx.shadowBlur = 5
    /* 四边：角括号之间的那段用虚线 */
    ctx.strokeStyle = st.edge
    ctx.lineWidth = lw
    ctx.setLineDash([dash, gap])
    ctx.lineCap = 'butt'
    ctx.beginPath()
    var g = gap * 0.8
    ctx.moveTo(x + arm + g, y); ctx.lineTo(x + w - arm - g, y)
    ctx.moveTo(x + arm + g, y + h); ctx.lineTo(x + w - arm - g, y + h)
    ctx.moveTo(x, y + arm + g); ctx.lineTo(x, y + h - arm - g)
    ctx.moveTo(x + w, y + arm + g); ctx.lineTo(x + w, y + h - arm - g)
    ctx.stroke()
    /* 四角：实心括号，比边粗 1.7 倍 */
    ctx.setLineDash([])
    ctx.strokeStyle = st.corner
    ctx.lineWidth = lw * 1.7
    ctx.lineJoin = 'round'
    ctx.shadowColor = st.corner
    ctx.beginPath()
    ctx.moveTo(x, y + arm); ctx.lineTo(x, y); ctx.lineTo(x + arm, y)
    ctx.moveTo(x + w - arm, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + arm)
    ctx.moveTo(x + w, y + h - arm); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - arm, y + h)
    ctx.moveTo(x + arm, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - arm)
    ctx.stroke()
    /* 四边中点：朝内的刻度 */
    ctx.lineWidth = lw * 1.35
    ctx.beginPath()
    ctx.moveTo(x + w / 2, y - lw * 0.6); ctx.lineTo(x + w / 2, y + tick)
    ctx.moveTo(x + w / 2, y + h + lw * 0.6); ctx.lineTo(x + w / 2, y + h - tick)
    ctx.moveTo(x - lw * 0.6, y + h / 2); ctx.lineTo(x + tick, y + h / 2)
    ctx.moveTo(x + w + lw * 0.6, y + h / 2); ctx.lineTo(x + w - tick, y + h / 2)
    ctx.stroke()
    ctx.restore()
  }

  /* 标签贴在框右侧（会出右边界就翻到左侧），实底 + 反色字 */
  function drawLabel(ctx, text, x, y, w, h, styleName, alpha, right, minFs) {
    var st = STYLES[styleName] || STYLES.white
    var s = Math.min(w, h)
    var fs = clamp(s * 0.095, minFs == null ? 11 : minFs, 32)
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.font = '500 ' + fs + 'px ' + FONT
    var tw = ctx.measureText(text).width + fs * 0.12 * text.length * 0.5
    var pw = tw + fs * 0.9
    var ph = fs * 1.42
    var lx = x + w + s * 0.12
    if (lx + pw > right - 4) lx = x - s * 0.12 - pw
    var ly = y + h * 0.5 - ph / 2
    ctx.shadowColor = 'rgba(0,0,0,.5)'
    ctx.shadowBlur = 6
    ctx.fillStyle = st.bg
    ctx.fillRect(lx, ly, pw, ph)
    ctx.shadowBlur = 0
    if (st.border) {
      ctx.strokeStyle = st.border
      ctx.lineWidth = 1.2
      ctx.strokeRect(lx + 0.6, ly + 0.6, pw - 1.2, ph - 1.2)
    }
    ctx.fillStyle = st.fg
    ctx.textBaseline = 'middle'
    /* Chrome 99+ 才有 ctx.letterSpacing；没有就退化成默认字距，不报错 */
    try { ctx.letterSpacing = (fs * 0.06) + 'px' } catch (e) { /* noop */ }
    ctx.fillText(text, lx + fs * 0.45, ly + ph / 2 + fs * 0.05)
    ctx.restore()
  }

  /* ↑↑↑ 上游 hud.js 到此结束 ↑↑↑ */

  function ease(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 3) }

  /**
   * 眼部黑条：一条被切成 N 块的墨条，压在取景框上部。
   * 和取景框画在同一张 canvas 上 —— 共用一套坐标，永远不会错位。
   * 抖动是时间函数（不依赖 CSS 动画），所以录屏/截图也稳定可复现。
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x y w h 取景框像素矩形
   * @param {{on:boolean, blocks:number, offset:number, height:number, gap:number, jitter:boolean}} cfg
   *        offset/height 是占框高的比例（0–1）
   * @param {number} t 秒，用于抖动
   */
  function drawEyes(ctx, x, y, w, h, cfg, t) {
    if (!cfg || cfg.on === false) return
    var n = Math.max(1, Math.min(25, Math.round(cfg.blocks || 1)))
    var top = y + h * (cfg.offset == null ? 0.36 : cfg.offset)
    var eh = h * (cfg.height == null ? 0.13 : cfg.height)
    if (eh < 2) return
    var gap = Math.max(0, cfg.gap || 0)
    /* 长度可调：占取景框宽的百分比，默认 96%。左右居中，
       这样改长度时条不会往右跑。 */
    var ratio = cfg.widthRatio == null ? 0.96 : Math.max(0.05, Math.min(1.2, cfg.widthRatio))
    var span = w * ratio
    var left = x + (w - span) / 2
    /* 权重：中段略宽、两端略窄 —— 与 CSS 版（flex-grow 1.25 / 0.62）一致 */
    var weights = []
    var sum = 0
    for (var i = 0; i < n; i++) {
      var mid = Math.abs(i - (n - 1) / 2) / Math.max(0.0001, (n - 1) / 2)
      var wgt = mid < 0.28 ? 1.25 : (mid > 0.86 ? 0.62 : 1)
      weights.push(wgt)
      sum += wgt
    }
    var avail = span - gap * (n - 1)
    if (avail <= 0) { gap = 0; avail = span }
    ctx.save()
    ctx.fillStyle = '#000'
    var cursor = left
    for (var k = 0; k < n; k++) {
      var bw = avail * (weights[k] / sum)
      var dy = 0
      var sy = 1
      if (cfg.jitter) {
        var ph = (t * 1.7 + k * 0.37) % 1
        dy = (Math.floor(ph * 6) % 3 - 1) * eh * 0.09
        sy = Math.floor(ph * 5) % 2 ? 1.05 : 0.96
      }
      ctx.fillRect(cursor, top + dy + (eh * (1 - sy)) / 2, bw, eh * sy)
      cursor += bw + gap
    }
    ctx.restore()
  }

  /**
   * 在指定矩形上画一条黑条（眼位模式用）。
   * 样式与 drawEyes 一致：整条 / 分块，块之间留缝。
   *
   * @param {number} [angle] 绕矩形中心旋转的弧度（跟头部侧倾）
   * @param {string} [jitterMode] 'move' 整块上下抖（旧行为）| 'edge' 只让接缝抖、覆盖面不缩
   */
  function drawBar(ctx, x, y, w, h, blocks, gap, t, angle, jitterMode) {
    var n = Math.max(1, Math.min(25, Math.round(blocks || 1)))
    ctx.save()
    if (angle) {
      var acx = x + w / 2
      var acy = y + h / 2
      ctx.translate(acx, acy)
      ctx.rotate(angle)
      ctx.translate(-acx, -acy)
    }
    ctx.fillStyle = '#000'
    if (n === 1) {
      ctx.fillRect(x, y, w, h)
      ctx.restore()
      return
    }
    var weights = blockWeights(n)
    var sum = 0
    for (var i = 0; i < n; i++) sum += weights[i]
    var g = Math.max(0, gap || 0)
    var edgeMode = jitterMode === 'edge'

    /* edge 模式：缝本身在动，块永远是满高 —— 眼睛不会从缩小的块上下露出来 */
    var gaps = []
    var gapSum = 0
    for (var j = 0; j < n - 1; j++) {
      var gk = g
      if (edgeMode && t != null) {
        var ph2 = (t * 1.7 + j * 0.53) % 1
        gk = g * (0.55 + (Math.floor(ph2 * 4) % 3) * 0.45)
      }
      gaps.push(gk)
      gapSum += gk
    }
    var avail = w - gapSum
    if (avail <= 0) { gaps = []; gapSum = 0; avail = w; for (var k2 = 0; k2 < n - 1; k2++) gaps.push(0) }

    var cursor = x
    for (var k = 0; k < n; k++) {
      var bw = avail * (weights[k] / sum)
      var dy = 0
      var sy = 1
      if (t != null && !edgeMode) {
        var ph = (t * 1.7 + k * 0.37) % 1
        dy = (Math.floor(ph * 6) % 3 - 1) * h * 0.09
        sy = Math.floor(ph * 5) % 2 ? 1.05 : 0.96
      }
      ctx.fillRect(cursor, y + dy + (h * (1 - sy)) / 2, bw, h * sy)
      cursor += bw + (gaps[k] || 0)
    }
    ctx.restore()
  }

  /**
   * 眼位黑条的几何（纯函数，像素坐标，可单测）。
   *
   * 为什么不用「眼距 × 系数 + 水平矩形」：那样在歪头时条是横的、眼睛是斜的，
   * 必然一边露眼角一边压到鼻梁；侧脸时两眼横向距离被压缩，条还会变短盖不住。
   *
   * 这里改成沿「两眼连线」建一个斜矩形（OBB）：
   *   1) 轴向 u = 左眼心 → 右眼心，角度就是头部侧倾；
   *   2) 四个眼角 + 上下眼睑全部投影到 u / v 两个轴上取包络 —— 天然含眼角，
   *      侧脸时随透视一起收缩，不会突然露眼；
   *   3) 长度/厚度先按用户的倍数算，但**不小于实际包络**，所以调小了也不会露。
   *
   * @param {object} p 八个点 {lOuter,lInner,lTop,lBot,rInner,rOuter,rTop,rBot}（像素）
   * @param {{spanScale?:number, thickScale?:number, minW?:number, minH?:number}} [opt]
   * @returns {{x:number,y:number,w:number,h:number,angle:number}|null}
   */
  /* 厚度系数：1.6.0 的厚度是「眼轮廓 bbox 高 × 1.35 × 倍数」，而 bbox 高约为
     眼睑垂直张开的 1.2 倍 —— 折过来约等于 ×1.6。这里显式写出这个 1.6，
     于是默认倍数（2.2）的观感和 1.6.0 一致，但厚度不再随歪头变大。 */
  var EYE_BAR_GAIN = 1.6

  /* 眼眶高度下限（相对「单眼宽度」的倍数）。眯眼/眨眼时垂直张开趋近 0，
     只按张开算的话黑条会跟着缩成一条缝、眼睛就从上下露出来了；
     而眼宽（内角到外角）在眯眼时几乎不变，正好当稳定尺度。
     人体比例上眼眶高约为眼宽的 0.35~0.45，这里取 0.40。 */
  var EYE_SOCKET_RATIO = 0.40

  function eyeBarFit(p, opt) {
    if (!p) return null
    var o = opt || {}
    var need = ['lOuter', 'lInner', 'lTop', 'lBot', 'rInner', 'rOuter', 'rTop', 'rBot']
    for (var i = 0; i < need.length; i++) {
      var q = p[need[i]]
      if (!q || !isFinite(q.x) || !isFinite(q.y)) return null
    }
    var L = { x: (p.lOuter.x + p.lInner.x) / 2, y: (p.lOuter.y + p.lInner.y) / 2 }
    var R = { x: (p.rOuter.x + p.rInner.x) / 2, y: (p.rOuter.y + p.rInner.y) / 2 }
    var dx = R.x - L.x
    var dy = R.y - L.y
    var d = Math.sqrt(dx * dx + dy * dy)
    if (!(d > 1)) return null
    var ux = dx / d, uy = dy / d
    /* 媒体网格的左右眼索引是按「被拍的人」命名的，正脸时图上可能正好相反。
       统一把轴掰成「指向画面右侧」：角度稳定落在 ±90° 内，块序也不会左右颠倒。
       矩形本身是中心对称的，掰一下不改变任何视觉结果。 */
    if (ux < 0) { ux = -ux; uy = -uy }
    var vx = -uy, vy = ux

    function pu(pt) { return (pt.x - L.x) * ux + (pt.y - L.y) * uy }
    function pv(pt) { return (pt.x - L.x) * vx + (pt.y - L.y) * vy }

    var us = [pu(p.lOuter), pu(p.lInner), pu(p.rInner), pu(p.rOuter)]
    var vs = [pv(p.lTop), pv(p.lBot), pv(p.rTop), pv(p.rBot)]
    var u0 = Math.min(us[0], us[1], us[2], us[3])
    var u1 = Math.max(us[0], us[1], us[2], us[3])
    var v0 = Math.min(vs[0], vs[1], vs[2], vs[3])
    var v1 = Math.max(vs[0], vs[1], vs[2], vs[3])

    var spanScale = o.spanScale == null ? 1.75 : o.spanScale
    var thickScale = o.thickScale == null ? 2.2 : o.thickScale

    /* 用户的倍数 vs 实际包络：取大的那个，保证「永远盖得住」 */
    var w = Math.max(d * spanScale, (u1 - u0) * 1.06)
    /* 厚度只看「眼睑沿垂直方向的张开」× 倍数。不吃 bbox 眼高：那样一歪头
       bbox 就变大、条跟着变厚，看起来像在呼吸。倍数被调得太小时留 1.35 倍兜底。 */
    var vSpan = Math.max(0.5, v1 - v0)
    /* 单眼宽度（沿眼轴投影，眯眼几乎不变）→ 换算成「眼眶高度」当下限：
       眯起来的时候条不许跟着变薄，否则上下眼白会露出来。 */
    var eyeW = Math.max(
      Math.abs(pu(p.lOuter) - pu(p.lInner)),
      Math.abs(pu(p.rOuter) - pu(p.rInner))
    )
    var h = Math.max(vSpan * thickScale * EYE_BAR_GAIN, vSpan * 1.35, eyeW * EYE_SOCKET_RATIO)
    w = Math.max(o.minW == null ? 10 : o.minW, w)
    h = Math.max(o.minH == null ? 6 : o.minH, h)

    var um = (u0 + u1) / 2
    var vm = (v0 + v1) / 2
    var cx = L.x + ux * um + vx * vm
    var cy = L.y + uy * um + vy * vm

    return {
      x: cx - w / 2,
      y: cy - h / 2,
      w: w,
      h: h,
      /* 用归一化后的轴算角度：raw atan2(dy,dx) 在左右眼对调时会绕到 ±180° */
      angle: Math.atan2(uy, ux)
    }
  }

  /** 分块权重：中段略宽、两端略窄 */
  function blockWeights(n) {
    var out = []
    for (var i = 0; i < n; i++) {
      var mid = Math.abs(i - (n - 1) / 2) / Math.max(0.0001, (n - 1) / 2)
      out.push(mid < 0.28 ? 1.25 : (mid > 0.86 ? 0.62 : 1))
    }
    return out
  }

  /**
   * 黑条尺寸（纯函数，便于单测）
   *
   * @param {string} mode 'fixed' 不跟眼（相对取景框） | 'eye' 跟眼（相对实测眼距）
   * @param {object} a
   *   fixed: rectW/rectH 取景框像素；widthRatio/heightRatio 为 0–1 比例
   *   eye  : span 眼距（像素）；eyeH 眼高（像素）；spanScale/thickScale 倍数
   * @param {number} minW 最小长度
   * @param {number} minH 最小厚度
   * @returns {{w:number,h:number}}
   */
  function barSize(mode, a, minW, minH) {
    a = a || {}
    var w, h
    if (mode === 'eye') {
      w = (a.span || 0) * (a.spanScale == null ? 1.75 : a.spanScale)
      h = (a.eyeH || 0) * (a.thickScale == null ? 2.2 : a.thickScale)
    } else {
      w = (a.rectW || 0) * (a.widthRatio == null ? 0.96 : a.widthRatio)
      h = (a.rectH || 0) * (a.heightRatio == null ? 0.13 : a.heightRatio)
    }
    w = Math.max(minW == null ? 6 : minW, w)
    h = Math.max(minH == null ? 4 : minH, h)
    return { w: w, h: h }
  }

  /**
   * 归一化的人脸框 → 「头」的正方形像素框。与 headBox() 同一套规矩：
   * 正方形、上移 0.08×side。W/H 是画面元素尺寸（CSS px）。
   */
  function squareFromBox(box, W, H) {
    var side = ((box.w * W) + (box.h * H)) / 2 * 1.05
    if (!isFinite(side) || side < 12) side = Math.min(W, H) * 0.3
    var cx = box.x * W
    var cy = box.y * H
    return [cx - side / 2, cy - side / 2 - side * 0.08, side, side]
  }

  /** 每帧 lerp 系数：0.55 是按 60fps 调的，换算成 dt 才不会在 165Hz 屏上飞过去 */
  function lerpAlpha(dt) {
    return 1 - Math.pow(1 - 0.55, Math.max(0, Math.min(0.25, dt)) * 60)
  }

  /**
   * 一个取景框的完整状态机（对应上游 app.js frame() 里每个 track 的那段）。
   *
   * 与上游的一处结构性改动：所有计时都靠 step(dt) 累加，不再读绝对时间。
   * 原因是调用方可能混用 performance.now() 和 rAF 时间戳，两个基点一旦错开，
   * 「出生时长」算成负数，框就永远不亮。累加 dt 只依赖帧间隔，没有这个问题，
   * 顺带也免疫后台标签页被节流后一次跳几十秒的情况。
   *
   * @param {Array|{x,y,w,h}} box 屏幕像素坐标
   * @param {string} style 初始样式名
   */
  function Reticle(box, style) {
    this.box = box.slice ? box.slice(0, 4) : [box.x, box.y, box.w, box.h]
    this.target = null
    this.style = STYLES[style] ? style : 'white'
    this.prev = this.style
    this.age = 0
    this.sinceChange = 999
    this.sinceLabel = 999
    this.gone = -1
    this.label = ''
  }

  Reticle.prototype.setTarget = function (box) {
    this.target = box.slice ? box.slice(0, 4) : [box.x, box.y, box.w, box.h]
  }

  /** 换样式：会触发 450ms 的 75ms 交替闪（上游就是这个节奏） */
  Reticle.prototype.setStyle = function (style) {
    if (!STYLES[style] || style === this.style) return
    this.prev = this.style
    this.style = style
    this.sinceChange = 0
  }

  /* 标签单独计时：上游把它的淡入挂在换样式上，我们幕短、中途要换两次样式，
     那样标签几乎没时间出现，所以这里与样式解耦。 */
  Reticle.prototype.setLabel = function (text) {
    this.label = text || ''
    this.sinceLabel = 0
  }

  Reticle.prototype.remove = function () { if (this.gone < 0) this.gone = 0 }

  /** 推进一帧（dt 单位秒）并返回本帧要画的量（不碰 canvas，方便单测） */
  Reticle.prototype.step = function (dtSec) {
    var dt = Math.max(0, Math.min(0.25, dtSec || 0))
    this.age += dt
    this.sinceChange += dt
    this.sinceLabel += dt
    if (this.gone >= 0) this.gone += dt

    if (this.target) {
      /* 单帧最多吃掉 60% 的差距：dt 归一化保证了不同刷新率一致，
         但这个上限是为了「标签页被挂起 30 秒后回来」不会让框瞬移过去。 */
      var a = Math.min(0.6, lerpAlpha(dt))
      for (var i = 0; i < 4; i++) this.box[i] += (this.target[i] - this.box[i]) * a
    }

    var k = ease(this.age / 0.28)
    var scale = 1 + 0.5 * (1 - k)
    var alpha = Math.min(1, this.age / 0.18)
    if (this.gone >= 0) alpha *= 1 - clamp(this.gone / 0.3, 0, 1)

    var x = this.box[0], y = this.box[1], w = this.box[2], h = this.box[3]
    var cx = x + w / 2, cy = y + h / 2
    w *= scale; h *= scale
    x = cx - w / 2; y = cy - h / 2

    var style = this.style
    if (this.sinceChange < 0.45) {
      style = Math.floor(this.sinceChange / 0.075) % 2 ? this.style : this.prev
    }

    return {
      x: x, y: y, w: w, h: h,
      style: style,
      alpha: Math.max(0, Math.min(1, alpha)),
      age: this.age,
      since: this.sinceChange,
      flash: this.age < 0.35 ? Math.max(0, 1 - this.age / 0.35) * 0.7 : 0,
      labelAlpha: this.sinceLabel >= 0.3 ? Math.min(1, (this.sinceLabel - 0.3) / 0.15) : 0
    }
  }

  /** 用已经算好的状态落笔（便于在框和画布之间插别的图层，比如眼部黑条） */
  Reticle.prototype.paint = function (ctx, s, right) {
    if (!s || s.alpha <= 0.01) return s
    drawBox(ctx, s.x, s.y, s.w, s.h, s.style, s.alpha)
    /* 捕获瞬间补一层白框，闪 350ms —— 上游的 acquisition flash */
    if (s.flash > 0) drawBox(ctx, s.x, s.y, s.w, s.h, 'white', s.alpha * s.flash)
    if (this.label && s.labelAlpha > 0.01) {
      drawLabel(ctx, this.label, s.x, s.y, s.w, s.h, this.style, s.alpha * s.labelAlpha,
        right == null ? 1e6 : right, 11)
    }
    return s
  }

  Reticle.prototype.draw = function (ctx, dtSec, right) {
    var s = this.step(dtSec)
    this.paint(ctx, s, right)
    return s
  }

  return {
    COLORS: COLORS,
    STYLES: STYLES,
    FONT: FONT,
    clamp: clamp,
    headBox: headBox,
    drawBox: drawBox,
    drawLabel: drawLabel,
    ease: ease,
    lerpAlpha: lerpAlpha,
    squareFromBox: squareFromBox,
    drawEyes: drawEyes,
    drawBar: drawBar,
    eyeBarFit: eyeBarFit,
    EYE_BAR_GAIN: EYE_BAR_GAIN,
    EYE_SOCKET_RATIO: EYE_SOCKET_RATIO,
    barSize: barSize,
    blockWeights: blockWeights,
    Reticle: Reticle
  }
})
