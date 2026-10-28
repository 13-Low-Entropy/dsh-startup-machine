/* ============================================================================
 * dsh-startup-machine — MediaPipe FaceLandmarker 追踪后端（478 点人脸网格）
 * ----------------------------------------------------------------------------
 * 换掉原来的「肤色连通域」估算：那套在暖光/暗光/逆光下会直接丢检测，
 * 头肩连成一片时框还会跑到胸口上。这里改成真正的人脸网格模型，一次拿到：
 *
 *   · 脸的外接框（478 点里的轮廓点，亚像素精度，跟头走）
 *   · 两只眼睛的上下眼睑 + 虹膜中心（第三幕的黑条压在真眼上）
 *   · 头部姿态（roll 侧倾 / yaw 左右转 / pitch 俯仰），给 HUD 读数用
 *
 * 运行环境：DSH 桌面端渲染进程（Chromium）。模型与 wasm 由插件自己从
 * 本机路由下发（同一来源，不联网），路线见 lib/index.js 的 /machine-startup/mp/*。
 *
 * 分工（与 face-track.js 一样的两段式）：
 *   推理全部在 MediaPipe 内部（GPU delegate，拿不到就 CPU），本文件只做
 *   「结果 → 归一化坐标」的整理与异常兜底，所以不会成为瓶颈。
 *
 * 失败即返回 null：调用方（splash.js）会自动退回肤色追踪，绝不黑屏。
 * ========================================================================== */
(function (root, factory) {
  var api = factory()
  if (typeof module === 'object' && module && module.exports) module.exports = api
  if (root) root.MSFaceLandmark = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  /* MediaPipe 478 点拓扑里用得到的索引（官方 canonical face mesh） */
  var EYE = {
    /* 左眼（画面左侧那只）：外角 33、内角 133、上睑 159 / 158、下睑 145 / 153 */
    L: [33, 133, 159, 145, 158, 153, 160, 144, 161, 163],
    /* 右眼：外角 263、内角 362、上睑 386 / 387、下睑 374 / 373 */
    R: [362, 263, 386, 374, 387, 373, 380, 385, 390, 249],
    /* 虹膜中心（模型带 refine_landmarks 时才有，没有就退回眼睑中心） */
    IL: 468,
    IR: 473,
    /* 黑条要用到的「四点一眼」：内角、外角、上睑、下睑。
       上/下睑各取两个点求中位，眨眼和单帧抖动都不会让厚度忽厚忽薄。 */
    L_IN: 133, L_OUT: 33, L_TOP: [159, 158], L_BOT: [145, 153],
    R_IN: 362, R_OUT: 263, R_TOP: [386, 387], R_BOT: [374, 373]
  }
  var NOSE = 1

  /* 眼高要乘一点：眼睑开合高度只到眼球边缘，黑条得连睫毛一起盖住 */
  var EYE_OPEN_GAIN = 1.35

  /* 脸框外扩：478 点描的是「脸部剪影」，耳朵和头发在外面。乘一点让框看起来
     框的是「头」，也和老版肤色追踪的观感一致。 */
  var BOX_PAD = 1.10

  function ensureSlash(p) {
    p = String(p || '')
    if (!p) return ''
    return p.charAt(p.length - 1) === '/' ? p : p + '/'
  }

  function bboxOf(l, idx) {
    var minX = 1, maxX = 0, minY = 1, maxY = 0
    for (var i = 0; i < idx.length; i++) {
      var q = l[idx[i]]
      if (!q) continue
      if (q.x < minX) minX = q.x
      if (q.x > maxX) maxX = q.x
      if (q.y < minY) minY = q.y
      if (q.y > maxY) maxY = q.y
    }
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY, minX: minX, minY: minY }
  }

  /** 两个（或多个）关键点的中点：眼睑用双点求中位，比单点抗抖 */
  function midOf(l, idx) {
    var x = 0, y = 0, n = 0
    for (var i = 0; i < idx.length; i++) {
      var q = l[idx[i]]
      if (!q) continue
      x += q.x; y += q.y; n++
    }
    return n ? { x: x / n, y: y / n } : null
  }

  /** 整张脸的轮廓外接框（不额外分配索引数组 —— 这个函数每帧都跑） */
  function bboxAll(l) {
    var minX = 1, maxX = 0, minY = 1, maxY = 0
    for (var i = 0; i < l.length; i++) {
      var q = l[i]
      if (!q) continue
      if (q.x < minX) minX = q.x
      if (q.x > maxX) maxX = q.x
      if (q.y < minY) minY = q.y
      if (q.y > maxY) maxY = q.y
    }
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY, minX: minX, minY: minY }
  }

  /**
   * 一帧结果 → 归一化坐标。所有值都在「视频帧」坐标系里（0–1，未镜像）。
   * @param {{faceLandmarks?:Array}} res MediaPipe FaceLandmarkerResult
   */
  function normalize(res) {
    var l = res && res.faceLandmarks && res.faceLandmarks[0]
    if (!l || !l.length) return null

    /* 整张脸的轮廓外接框：478 点里含脸部剪影，比只看眼睛稳得多 */
    var face = bboxAll(l)
    if (!(face.w > 0) || !(face.h > 0)) return null

    var eL = bboxOf(l, EYE.L)
    var eR = bboxOf(l, EYE.R)
    var iL = l[EYE.IL]
    var iR = l[EYE.IR]

    /* 眼心优先用虹膜：转头时瞳位比眼睑轮廓稳定。
       没有虹膜点（模型没带 refine_landmarks）就用眼睑轮廓的外接框中心 ——
       比取某四个点的平均更稳，也不依赖具体挑哪四个点。 */
    var cL = iL ? { x: iL.x, y: iL.y } : { x: eL.x, y: eL.y }
    var cR = iR ? { x: iR.x, y: iR.y } : { x: eR.x, y: eR.y }
    if (!cL || !cR) return null

    var vx = (cL.x + cR.x) / 2
    var vy = (cL.y + cR.y) / 2
    var span = Math.abs(cR.x - cL.x)
    /* 眼高取两只眼里张得开的那只：单眼眯着/被头发挡时黑条不至于变薄 */
    var eh = Math.max(eL.h, eR.h) * EYE_OPEN_GAIN

    /* 黑条要的「四点一眼」：内角/外角/上睑/下睑。
       有了这四个点，上层才能把条按头部侧倾转过去、并且保证盖住眼角，
       而不是拿「眼距 × 系数 + 水平矩形」硬怼。 */
    var q = {
      lOuter: l[EYE.L_OUT] ? { x: l[EYE.L_OUT].x, y: l[EYE.L_OUT].y } : null,
      lInner: l[EYE.L_IN] ? { x: l[EYE.L_IN].x, y: l[EYE.L_IN].y } : null,
      lTop: midOf(l, EYE.L_TOP),
      lBot: midOf(l, EYE.L_BOT),
      rInner: l[EYE.R_IN] ? { x: l[EYE.R_IN].x, y: l[EYE.R_IN].y } : null,
      rOuter: l[EYE.R_OUT] ? { x: l[EYE.R_OUT].x, y: l[EYE.R_OUT].y } : null,
      rTop: midOf(l, EYE.R_TOP),
      rBot: midOf(l, EYE.R_BOT)
    }
    var quadOK = !!(q.lOuter && q.lInner && q.lTop && q.lBot && q.rInner && q.rOuter && q.rTop && q.rBot)

    /* 姿态：roll 用两眼连线；yaw/pitch 用鼻尖偏离脸心的比例（够 HUD 读数用，
       真正的欧拉角要解 4×4 变换矩阵，这里不值为那点精度多开一条输出） */
    var dx = cR.x - cL.x
    var dy = cR.y - cL.y
    var roll = Math.atan2(dy, dx) * 180 / Math.PI
    var nose = l[NOSE] || { x: face.x, y: face.y }
    var yaw = face.w > 0 ? ((nose.x - face.x) / face.w) * 2 * 55 : 0
    var pitch = face.h > 0 ? ((nose.y - (face.minY + face.h / 2)) / face.h) * 2 * 45 : 0

    return {
      box: { x: face.x, y: face.y, w: face.w * BOX_PAD, h: face.h * BOX_PAD },
      eyes: {
        vx: vx, vy: vy, span: span, eh: eh, openL: eL.h, openR: eR.h, l: cL, r: cR,
        /* 归一化到视频帧；null 表示这一帧的点不齐（上层退回「眼距 × 系数」老算法） */
        quad: quadOK ? q : null
      },
      pose: { roll: roll, yaw: yaw, pitch: pitch },
      points: l.length
    }
  }

  /**
   * 建立追踪器（异步）。
   * @param {{video:HTMLVideoElement, basePath?:string, delegate?:'GPU'|'CPU',
   *          minDetection?:number, minPresence?:number, minTracking?:number}} opts
   * @returns {Promise<{mode:string, backend:string, detect:Function, dispose:Function, stats:object}>}
   */
  function create(opts) {
    var o = opts || {}
    var base = ensureSlash(o.basePath || (typeof window !== 'undefined' && window.__DSH_MACHINE_ASSETS__) || '')
    if (!base) return Promise.reject(new Error('face-landmark: 缺少资源路径（basePath / __DSH_MACHINE_ASSETS__）'))

    var want = o.delegate === 'CPU' ? 'CPU' : 'GPU'
    var mod = null
    var fileset = null
    var landmarker = null
    var lastTs = -1
    var dead = false
    var stats = { calls: 0, fails: 0, ms: 0, lastMs: 0, backend: '' }

    function stamp() {
      var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
      var ts = Math.floor(now)
      /* VIDEO 模式要求时间戳严格递增；同一毫秒连调两次会直接抛错 */
      if (ts <= lastTs) ts = lastTs + 1
      lastTs = ts
      return ts
    }

    function build(delegate) {
      return mod.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: base + 'face_landmarker.task', delegate: delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
        minFaceDetectionConfidence: o.minDetection == null ? 0.4 : o.minDetection,
        minFacePresenceConfidence: o.minPresence == null ? 0.4 : o.minPresence,
        minTrackingConfidence: o.minTracking == null ? 0.4 : o.minTracking
      })
    }

    return (async function init() {
      mod = await import(base + 'vision_bundle.mjs')
      fileset = await mod.FilesetResolver.forVisionTasks(base + 'wasm')
      try {
        landmarker = await build(want)
        stats.backend = want
      } catch (err) {
        if (want === 'CPU') throw err
        /* GPU delegate 建不起来（显卡黑名单 / 无 WebGL2）→ 退回 CPU */
        landmarker = await build('CPU')
        stats.backend = 'CPU'
      }
      if (dead) {
        try { landmarker.close() } catch (e) { /* noop */ }
        throw new Error('face-landmark: 已取消')
      }

      function detect() {
        if (dead || !landmarker) return null
        var v = o.video
        if (!v) return null
        /* video / canvas / image 都收：videoWidth 只有 video 才有，canvas 用 width */
        if (!(v.videoWidth || v.width)) return null
        if (typeof v.readyState === 'number' && v.readyState < 2) return null
        var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
        var res = null
        try {
          res = landmarker.detectForVideo(v, stamp())
        } catch (err) {
          stats.fails++
          return null
        }
        var t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
        stats.calls++
        stats.lastMs = t1 - t0
        stats.ms = stats.ms ? stats.ms * 0.85 + stats.lastMs * 0.15 : stats.lastMs
        return normalize(res)
      }

      function dispose() {
        dead = true
        try { if (landmarker) landmarker.close() } catch (e) { /* noop */ }
        landmarker = null
      }

      return {
        mode: 'landmark',
        get backend() { return stats.backend },
        ready: true,
        detect: detect,
        dispose: dispose,
        stats: stats
      }
    })()
  }

  return {
    create: create,
    normalize: normalize,
    EYE: EYE,
    BOX_PAD: BOX_PAD,
    EYE_OPEN_GAIN: EYE_OPEN_GAIN
  }
})
