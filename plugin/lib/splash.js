/* ============================================================================
 * dsh-startup-machine — 启动动画运行时（浏览器端，零依赖）
 * ----------------------------------------------------------------------------
 * 五幕开机序列，默认 7.5 秒：
 *
 *   01 BOOT    系统唤醒   厂牌 + 启动自检日志
 *   02 SCAN    身份扫描   摄像头画面 + 四角锁定框 + 眼部黑块马赛克 + 识别状态机
 *   03 MATCH   识别完成   档案卡（用画面当前帧做「档案照」，眼部照样打码）
 *   04 ACCESS  权限授予   授权条 + ACCESS GRANTED
 *   05 HANDOFF 揭幕       欢迎 <身份名称>，淡出露出主界面
 *
 * 每幕时长、字幕、摄像头清晰度、马赛克开关与块数全部来自配置
 * （window.__DSH_MACHINE_STARTUP__，由 Host 半侧注入 / 设置页读写）。
 *
 * 对外：window.__DSH_MACHINE_API__ = { replay, skip, finish, state, config }
 * ========================================================================== */
(function () {
  'use strict'

  if (window.__DSH_MACHINE_LOADED__) return
  window.__DSH_MACHINE_LOADED__ = true

  var ROOT_ID = 'machine-startup-root'

  /* ── 默认配置（与 Host 侧 lib/index.js 的 DEFAULTS 逐字段对应）────────── */
  var DEFAULTS = {
    /* 播放 */
    enabled: true,
    mode: 'session',              // always | session | daily
    speed: 1,                     // 全局倍速：0.4 慢放 · 1 原速 · 2.5 快放
    allowSkip: true,
    /* 每幕时长（毫秒）—— 五幕默认加起来 7500ms */
    actBoot: 1200,
    actScan: 3000,
    actMatch: 1400,
    actAccess: 1200,
    actHandoff: 700,

    /* 音效（WebAudio 当场合成）。1.2.4 起没有 TTS 人声播报了 */
    sound: true,
    soundVolume: 0.5,

    /* 字幕 */
    typewriter: true,             // 字幕逐字输入（关掉就整行直接出现）
    typeActs: 'match,access,handoff', // 哪几幕逐字输入（幕 id 逗号分隔；留空=全部）
    typeSpeed: 34,                // 每字毫秒（基准；幕太短会自动加快，不会溢出这一幕）
    typeCursor: true,             // 打完留一个闪烁的块状光标

    /* 强制跳过：0 = 跟随各幕合计（合计 + 9 秒余量）；>0 = 固定毫秒，但不会短于合计 */
    hardStopMs: 0,


    /* 摄像头 */
    camera: true,
    camWidth: 640,                // 320 | 640 | 1280（请求的理想宽度）
    camMirror: true,
    camSat: 22,                   // 饱和度 %
    camCon: 130,                  // 对比度 %
    camBright: 82,                // 亮度 %
    faceTrack: true,              // 取景框跟着人脸走
    faceEngine: 'auto',           // auto = 先肤色、网格模型就位后接管 | landmark = 只用 478 点网格 | skin = 只用肤色（最省）
    trackGpu: true,               // 追踪的像素统计交给 GPU（WebGL）；关掉走 2D 兜底
    trackAgility: 5,              // 跟随灵敏度 1–10：小了稳但迟钝，大了跟得紧但会抖
    boxStyle: 'auto',             // 锁定后的框样式：auto=按 status 定，或 white/yellow/red/blue/black_yellow/white_red
    boxLabel: true,               // 锁定后在框右侧打一块反色标签（写身份名称）
    faceDetect: false,            // 额外试一下浏览器的 FaceDetector（桌面版基本不支持）
    /* 没有摄像头时的模拟头像：'' = 包内 assets/avatar/default.jpg */
    avatarOnNoCam: true,
    avatar: '',
    avatarBox: '49,44,36,34',     // 头像里「人脸」的位置：x,y,w,h（百分比）
    faceX: 50,                    // 追踪丢目标时回落的固定取景框中心 X %
    faceY: 44,                    // 取景框中心 Y %
    faceW: 34,                    // 取景框宽 %
    faceH: 46,                    // 取景框高 %

    /* 眼部马赛克 */
    mosaic: true,
    mosaicBlocks: 1,              // 黑条切几块：1 = 一整条长方形（默认），往上切成方块 1–25
    mosaicWidth: 96,              // 黑条长度（不跟眼时）占取景框宽的百分比
    eyeTrack: true,               // 黑条跟随实测眼位（关掉就按取景框固定比例摆）
    mosaicEyeScale: 1.75,         // 跟眼时：黑条长度 = 眼距 × 此倍数
    mosaicEyeThick: 2.2,          // 跟眼时：黑条厚度 = 眼高 × 此倍数
    eyeSmooth: 6,                 // 眼位平滑强度 1–10（越大越跟手）
    mosaicHeight: 16,             // 黑条高度（占取景框高 %）4–34
    mosaicOffset: 33,             // 黑条顶端在取景框内的位置 % 0–86
    mosaicGap: 3,                 // 块间缝隙 px 0–8
    mosaicJitter: true,           // 锁定时轻微抖动

    /* 身份 */
    identity: 'Low_Entropy',
    identityId: '114514',
    status: 'ASSET',              // ASSET | ADMIN | THREAT | IRRELEVANT | CONTINGENCY
    prob: 93,                     // 匹配置信度 %
    accessLevel: 'D',
    camId: 'CAM_017',
    brand: 'THE MACHINE',
    brandSub: 'DEEPSEEK HARNESS',
    footer: 'THE MACHINE WATCHES · DEEPSEEK HARNESS',

    /* 字幕（{name} {id} {status} 会被替换） */
    bootZh: '你正被监视着。',
    bootEn: 'YOU ARE BEING WATCHED.',
    /* 第一幕第二张卡（留空就只播一张） */
    bootZh2: '我知道，因为它是被我做出来的。',
    bootEn2: 'I KNOW, BECAUSE I BUILT IT.',
    /* 左上角那列很暗的系统名（每行一个，\n 分隔） */
    bootList: ['SYSTEM_STARTUP', 'LOADING:', 'CORE ANALYTICS', 'NEURAL NETWORKS', 'HEURISTIC ENGINES', 'RECOGNITION PROCESSORS', 'EVOLUTIONARY GENERATORS', 'INVASION NETWORKS', 'CODE SYNTHESIS', 'CRYPTOGRAPHIC ALGORITHMS', 'DOCUMENT PROCESSORS', 'COMPUTATIONAL LINGUISTICS', 'VOICEPRINT IDENTIFICATION'].join(String.fromCharCode(10)),
    scanZh: '身份扫描中',
    scanEn: 'SCANNING BIOMETRIC SIGNATURE',
    matchZh: '识别完成',
    matchEn: 'MATCH CONFIRMED',
    accessZh: '权限已授予',
    accessEn: 'ACCESS GRANTED',
    handoffZh: '欢迎 {name}',
    handoffEn: 'WELCOME, {name}',

    /* 配色 */
    accent: '#f2f2f2',
    warn: '#d9a406',
    alert: '#e5484d'
  }

  /* ── 读配置 ────────────────────────────────────────────────────────────── */
  function readCfg(over) {
    /* over 存在时优先用它（设置面板点「预览」会把未保存的草稿传进来），
       否则退回到 Host 注入的那份启动配置。 */
    var raw = (over && typeof over === 'object') ? over
      : ((window.__DSH_MACHINE_STARTUP__ && typeof window.__DSH_MACHINE_STARTUP__ === 'object')
        ? window.__DSH_MACHINE_STARTUP__ : {})
    var out = {}
    for (var k in DEFAULTS) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) out[k] = DEFAULTS[k]
    for (var k2 in raw) {
      if (Object.prototype.hasOwnProperty.call(raw, k2) && raw[k2] !== undefined && raw[k2] !== null) {
        out[k2] = raw[k2]
      }
    }
    out.speed = Math.min(2.5, Math.max(0.4, Number(out.speed) || 1))
    var clampMs = function (v, lo, hi) {
      var n = Number(v)
      return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo
    }
    out.actBoot = clampMs(out.actBoot, 300, 12000)
    out.actScan = clampMs(out.actScan, 600, 20000)
    out.actMatch = clampMs(out.actMatch, 300, 12000)
    out.actAccess = clampMs(out.actAccess, 300, 12000)
    out.actHandoff = clampMs(out.actHandoff, 200, 8000)
    out.mosaicBlocks = Math.min(25, Math.max(1, Math.round(Number(out.mosaicBlocks) || 1)))
    out.mosaicHeight = Math.min(34, Math.max(4, Number(out.mosaicHeight) || 14))
    out.mosaicOffset = Math.min(86, Math.max(0, Number(out.mosaicOffset)))
    out.mosaicGap = Math.min(8, Math.max(0, Number(out.mosaicGap)))
    out.camWidth = [320, 640, 1280].indexOf(Number(out.camWidth)) >= 0 ? Number(out.camWidth) : 640
    out.faceX = Math.min(92, Math.max(8, Number(out.faceX) || 50))
    out.faceY = Math.min(92, Math.max(8, Number(out.faceY) || 44))
    out.faceW = Math.min(92, Math.max(10, Number(out.faceW) || 34))
    out.faceH = Math.min(92, Math.max(10, Number(out.faceH) || 46))
    out.trackAgility = Math.min(10, Math.max(1, Number(out.trackAgility) || 5))
    out.faceEngine = ['auto', 'landmark', 'skin'].indexOf(out.faceEngine) >= 0 ? out.faceEngine : 'auto'
    out.hardStopMs = Math.max(0, Math.min(120000, Number(out.hardStopMs) || 0))
    out.prob = Math.min(100, Math.max(50, Number(out.prob) || 93))
    return out
  }

  var C = readCfg()

  /* 替换台词里的 {name} / {id} / {status} */
  function fill(text) {
    return String(text == null ? '' : text)
      .replace(/\{name\}/gi, C.identity)
      .replace(/\{id\}/gi, C.identityId)
      .replace(/\{status\}/gi, C.status)
  }

  /* ── 小工具 ────────────────────────────────────────────────────────────── */
  var reduceMotion = false
  try {
    reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  } catch (e) { reduceMotion = false }

  function el(tag, cls, text) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    return n
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n }
  function rnd(a, b) { return a + Math.random() * (b - a) }
  function hex(n) {
    var s = ''
    var chars = '0123456789ABCDEF'
    for (var i = 0; i < n; i++) s += chars.charAt(Math.floor(Math.random() * 16))
    return s
  }

  /* ── 音效（WebAudio 现场合成，不带任何音频文件）──────────────────────── */
  var sfx = (function () {
    var ac = null
    function ctx() {
      if (!C.sound) return null
      try {
        if (!ac) {
          var AC = window.AudioContext || window.webkitAudioContext
          if (!AC) return null
          ac = new AC()
        }
        if (ac.state === 'suspended' && ac.resume) ac.resume()
        return ac
      } catch (e) { return null }
    }
    function tone(freq, dur, type, gain, delay, slideTo) {
      var a = ctx()
      if (!a) return
      try {
        var t0 = a.currentTime + (delay || 0)
        var o = a.createOscillator()
        var g = a.createGain()
        o.type = type || 'sine'
        o.frequency.setValueAtTime(freq, t0)
        if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur)
        var peak = Math.max(0.0001, (gain == null ? 0.12 : gain) * (Number(C.soundVolume) || 0.5))
        g.gain.setValueAtTime(0.0001, t0)
        g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012)
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
        o.connect(g).connect(a.destination)
        o.start(t0)
        o.stop(t0 + dur + 0.02)
      } catch (e) { /* 音频失败不打断动画 */ }
    }
    return {
      tick: function () { tone(1450, 0.035, 'square', 0.045) },
      sweep: function () { tone(220, 0.28, 'sawtooth', 0.045, 0, 1300) },
      lock: function () { tone(520, 0.09, 'square', 0.1); tone(780, 0.14, 'square', 0.09, 0.06) },
      grant: function () { tone(392, 0.18, 'sine', 0.1); tone(587, 0.22, 'sine', 0.09, 0.1); tone(784, 0.3, 'sine', 0.08, 0.2) },
      open: function () { ctx() }
    }
  })()

  /* ── 幕表 ──────────────────────────────────────────────────────────────── */
  var ACTS = [
    /* 第一幕自己有整屏标题卡，底部字幕不再重复 */
    { id: 'boot', dur: 'actBoot', zh: 'bootZh', en: 'bootEn', sub: false },
    { id: 'scan', dur: 'actScan', zh: 'scanZh', en: 'scanEn' },
    { id: 'match', dur: 'actMatch', zh: 'matchZh', en: 'matchEn' },
    { id: 'access', dur: 'actAccess', zh: 'accessZh', en: 'accessEn' },
    /* 终幕自己有整屏欢迎语，底部字幕不再重复一遍 */
    { id: 'handoff', dur: 'actHandoff', zh: 'handoffZh', en: 'handoffEn', sub: false }
  ]

  /* ── 状态 ──────────────────────────────────────────────────────────────── */
  var S = {
    root: null,
    ui: {},
    act: -1,
    timers: [],
    rafs: [],
    stream: null,
    video: null,
    noiseTimer: 0,
    probTimer: 0,
    faceTimer: 0,
    trackTimer: 0,
    tracker: null,
    reticle: null,
    hud: null,
    hudCtx: null,
    hudListening: false,
    hudDpr: 1,
    hudLast: 0,
    hudT: 0,
    camW: 0,
    camH: 0,
    trackMode: '',
    gpuRenderer: '',
    chkCanvas: null,
    chkCtx: null,
    camReq: null,
    camError: null,
    eyeCanvas: null,
    eyeCtx: null,
    eye: null,
    eyeAt: 0,
    /* 打字机的世代号：换幕时 +1，旧的那条输入链会自己停 */
    typeSeq: 0,
    /* 每幕看门狗的 timer id（换幕时重置） */
    watchdog: 0,
    trackHitAt: 0,
    faceDetHitAt: 0,
    /* 取景框的当前值（归一化，相对画面元素），追踪时被平滑地推进 */
    face: { x: 0.5, y: 0.44, w: 0.34, h: 0.46 },
    frameCb: null,
    fps: { n: 0, t: 0 },
    total: 0,
    startedAt: 0,
    done: false,
    snapOK: false,
    keyHandler: null,
    clickHandler: null
  }

  function after(ms, fn) {
    var t = setTimeout(function () {
      if (S.done) return
      fn()
    }, Math.max(0, ms))
    S.timers.push(t)
    return t
  }
  function every(ms, fn) {
    var t = setInterval(function () {
      if (S.done) return
      fn()
    }, Math.max(16, ms))
    S.timers.push(t)
    return t
  }
  function clearTimers() {
    for (var i = 0; i < S.timers.length; i++) {
      clearTimeout(S.timers[i])
      clearInterval(S.timers[i])
    }
    S.timers.length = 0
  }

  function dur(key) {
    return Math.max(120, Number(C[key]) / C.speed)
  }
  function totalMs() {
    var t = 0
    for (var i = 0; i < ACTS.length; i++) t += dur(ACTS[i].dur)
    return t
  }

  /* 兜底看门狗：多久之后无论如何收场。
     hardStopMs = 0  → 跟着各幕合计走（合计 + 9 秒余量），改任何一幕都自动跟着变；
     hardStopMs > 0  → 就按这个时间收场，**比合计短就是硬切**（强制跳过），
                       留 1.2 秒下限，免得填个 0.5 秒什么都看不到。 */
  function hardStopMs() {
    var v = Number(C.hardStopMs) || 0
    return v > 0 ? Math.max(1200, v) : totalMs() + 9000
  }

  /* 每幕自己的看门狗：这一幕该结束却没结束（链断了 / 某个 after 丢了），
     再过一段余量就收场。**不再用「开场时算一次总时长」的全局定时器** ——
     那种写法只要总时长算偏（幕改长、倍速、时长为字符串），就会在后面几幕
     播到一半把整屏拿掉，表现就是「后面几幕消失」。 */
  function armWatchdog(ms) {
    if (S.watchdog) { try { clearTimeout(S.watchdog) } catch (e) { /* noop */ } }
    S.watchdog = after(Math.max(4000, ms), function () { finish(true) })
    return S.watchdog
  }

  /* 这一幕要不要逐字输入：typeActs 留空 = 全部；否则按幕 id 命中 */
  function typingOn() {
    if (!C.typewriter || reduceMotion) return false
    var list = String(C.typeActs == null ? '' : C.typeActs).trim()
    if (!list) return true
    return list.toLowerCase().split(/[,\s]+/).indexOf(String(S.actId || '')) >= 0
  }

  /* ── 骨架 ──────────────────────────────────────────────────────────────── */
  var SKELETON = [
    '<div class="ms-atmos">',
    '  <div class="ms-grid"></div>',
    '  <div class="ms-grain"></div>',
    '  <div class="ms-scanlines"></div>',
    '  <div class="ms-sweep"></div>',
    '  <div class="ms-vignette"></div>',
    '</div>',
    '<div class="ms-frame">',
    '  <span class="ms-tick ms-tick-tl"></span><span class="ms-tick ms-tick-tr"></span>',
    '  <span class="ms-tick ms-tick-bl"></span><span class="ms-tick ms-tick-br"></span>',
    '</div>',
    '<div class="ms-rail ms-rail-l" data-rail="l"></div>',
    '<div class="ms-rail ms-rail-r" data-rail="r"></div>',

    '<div class="ms-top">',
    '  <div class="ms-brand">',
    '    <span class="ms-brand-dot"></span>',
    '    <span class="ms-brand-name" data-t="brand"></span>',
    '    <span class="ms-brand-sep"></span>',
    '    <span class="ms-brand-sub" data-t="brandSub"></span>',
    '  </div>',
    '  <div class="ms-topright">',
    '    <span class="ms-clock" data-t="clock">00:00:00</span>',
    '    <button type="button" class="ms-skip" data-t="skip"><span>SKIP</span><kbd>ESC</kbd></button>',
    '  </div>',
    '</div>',

    '<div class="ms-stage">',

    /* 01 BOOT —— 标题卡：左上角一列很暗的系统名 + 中间一句大字 */
    '  <section class="ms-act" data-act="boot">',
    '    <pre class="ms-bootlist" data-t="bootlist"></pre>',
    '    <div class="ms-bootlog" data-t="bootlog"></div>',
    '    <div class="ms-statement">',
    '      <div class="ms-statement-en" data-t="bootLineEn"></div>',
    '      <div class="ms-statement-zh" data-t="bootLineZh"></div>',
    '    </div>',
    '  </section>',

    /* 02 SCAN */
    '  <section class="ms-act" data-act="scan">',
    '    <div class="ms-scanwrap">',
    '      <div class="ms-card ms-camcard">',
    '        <div class="ms-cardhead">',
    '          <span class="ms-recdot"></span>',
    '          <span class="ms-cardlabel" data-t="camId">CAM_017</span>',
    '          <span class="ms-cardmeta" data-t="camMeta">LIVE</span>',
    '        </div>',
    '        <div class="ms-camview ms-nocam" data-t="camview">',
    '          <video data-t="video" playsinline muted autoplay></video>',
    '          <canvas class="ms-noise" data-t="noise" width="180" height="135"></canvas>',
    '          <canvas class="ms-avatar" data-t="avatar"></canvas>',
    '          <div class="ms-camfx"></div>',
    '          <canvas class="ms-hud" data-t="hud"></canvas>',
    '          <div class="ms-camfoot">',
    '            <span data-t="camstate">ACQUIRING SIGNAL</span>',
    '            <span data-t="camfps">-- FPS</span>',
    '          </div>',
    '        </div>',
    '      </div>',
    '      <aside class="ms-card ms-telcard">',
    '        <div class="ms-cardhead"><span class="ms-cardlabel">SUBJECT ANALYSIS</span>',
    '          <span class="ms-cardmeta" data-t="telstate">SCANNING</span></div>',
    '        <div class="ms-kv"><span>SUBJECT</span><b data-t="kvId">—</b></div>',
    '        <div class="ms-kv"><span>STATUS</span><b data-t="kvStatus">PENDING</b></div>',
    '        <div class="ms-kv"><span>PROB</span><b data-t="kvProb">0.000</b></div>',
    '        <div class="ms-kv"><span>GEO</span><b data-t="kvGeo">—</b></div>',
    '        <div class="ms-kv"><span>SOURCE</span><b data-t="kvSrc">—</b></div>',
    '        <div class="ms-prob"><i data-t="probbar"></i></div>',
    '        <div class="ms-telog" data-t="telog"></div>',
    '      </aside>',
    '    </div>',
    '  </section>',

    /* 03 MATCH */
    '  <section class="ms-act" data-act="match">',
    '    <div class="ms-dossier">',
    '      <div class="ms-dossier-photo">',
    '        <canvas data-t="snap" width="240" height="274"></canvas>',
    '        <div class="ms-eyes" data-t="eyes2"></div>',
    '      </div>',
    '      <div class="ms-dossier-info">',
    '        <div class="ms-dossier-tag">MATCH CONFIRMED</div>',
    '        <h2 class="ms-dossier-name" data-t="dossierName"></h2>',
    '        <div class="ms-kv"><span>ID</span><b data-t="dId">—</b></div>',
    '        <div class="ms-kv"><span>STATUS</span><b data-t="dStatus">—</b></div>',
    '        <div class="ms-kv"><span>PROB</span><b data-t="dProb">—</b></div>',
    '        <div class="ms-kv"><span>ACCESS</span><b data-t="dAccess">—</b></div>',
    '        <div class="ms-kv"><span>SOURCE</span><b data-t="dSrc">—</b></div>',
    '      </div>',
    '    </div>',
    '  </section>',

    /* 04 ACCESS */
    '  <section class="ms-act" data-act="access">',
    '    <div class="ms-grant">',
    '      <div class="ms-grant-bar"></div>',
    '      <div class="ms-grant-text" data-t="grantText">ACCESS GRANTED</div>',
    '      <div class="ms-grant-zh" data-t="grantZh"></div>',
    '    </div>',
    '  </section>',

    /* 05 HANDOFF */
    '  <section class="ms-act" data-act="handoff">',
    '    <div class="ms-welcome" data-t="welcome"></div>',
    '  </section>',

    '</div>',

    '<div class="ms-sub">',
    '  <div class="ms-sub-zh" data-t="subZh"></div>',
    '  <div class="ms-sub-en" data-t="subEn"></div>',
    '</div>',

    '<div class="ms-bottom">',
    '  <div class="ms-progress"><i data-t="progressbar"></i></div>',
    '  <div class="ms-bottomrow">',
    '    <span data-t="footer"></span>',
    '    <span data-t="step">01 / 05</span>',
    '  </div>',
    '</div>'
  ].join('')

  function $(sel) { return S.root ? S.root.querySelector(sel) : null }
  function T(key) {
    return S.root ? S.root.querySelector('[data-t="' + key + '"]') : null
  }

  /* ── 建树 ──────────────────────────────────────────────────────────────── */
  function build() {
    var root = document.getElementById(ROOT_ID)
    if (!root) {
      root = document.createElement('div')
      root.id = ROOT_ID
      document.body.appendChild(root)
    }
    root.className = 'ms-root ms-boot'
    /* 兜底：万一 splash.css 还在路上（或被拦），这一层也必须已经是铺满的黑屏，
       否则用户先看到的就是 DSH 本体。逐条赋值，不影响下面的 CSS 变量。 */
    if (!root.style.position) {
      root.style.position = 'fixed'
      root.style.left = '0'
      root.style.top = '0'
      root.style.width = '100%'
      root.style.height = '100%'
      root.style.background = '#000'
      root.style.zIndex = '2147483000'
      root.style.overflow = 'hidden'
    }
    root.style.setProperty('--ms-accent', C.accent)
    root.style.setProperty('--ms-warn', C.warn)
    root.style.setProperty('--ms-alert', C.alert)
    S.face = { x: C.faceX / 100, y: C.faceY / 100, w: C.faceW / 100, h: C.faceH / 100 }
    root.style.setProperty('--ms-eye-h', C.mosaicHeight + '%')
    root.style.setProperty('--ms-eye-top', C.mosaicOffset + '%')
    root.style.setProperty('--ms-eye-gap', C.mosaicGap + 'px')
    if (C.mosaic) root.classList.add('ms-mosaic')
    if (C.mosaicJitter) root.classList.add('ms-jitter')
    root.innerHTML = SKELETON
    S.root = root

    /* 静态文案 */
    T('brand').textContent = C.brand
    T('brandSub').textContent = C.brandSub
    T('footer').textContent = C.footer
    T('bootlist').textContent = String(C.bootList == null ? '' : C.bootList)
    T('camId').textContent = C.camId
    T('camMeta').textContent = 'LIVE · ' + C.camWidth + 'P'
    T('grantText').textContent = C.accessEn
    T('grantZh').textContent = C.accessZh
    T('dossierName').textContent = fill(C.identity)
    T('dId').textContent = fill(C.identityId)
    T('dStatus').textContent = fill(C.status)
    T('dProb').textContent = (C.prob / 100).toFixed(3)
    T('dAccess').textContent = 'LEVEL ' + fill(C.accessLevel)
    T('dSrc').textContent = C.camId
    T('kvId').textContent = fill(C.identityId)
    T('kvSrc').textContent = C.camId
    T('welcome').innerHTML = ''
    /* 用户在 handoffEn 里写 {name} 才高亮替换；没写就原样显示，不硬塞名字 */
    var wtpl = String(C.handoffEn == null ? '' : C.handoffEn)
    if (wtpl.indexOf('{name}') >= 0) {
      var parts = wtpl.split('{name}')
      T('welcome').appendChild(document.createTextNode(parts[0] || ''))
      T('welcome').appendChild(el('em', null, fill('{name}')))
      T('welcome').appendChild(document.createTextNode(parts.slice(1).join('{name}') || ''))
    } else {
      T('welcome').textContent = fill(wtpl)
    }

    if (!C.allowSkip) T('skip').classList.add('ms-hidden')

    /* 摄像头 */
    S.video = T('video')
    S.ui.camview = T('camview')
    startHud()
    applyCamFilter()
    /* 直播视图的黑条由 canvas 画（见 drawHud）；这里只给第三幕的档案照铺 DOM 版 */
    buildEyes(T('eyes2'), C.mosaicBlocks)

    /* 侧边数据流 */
    buildRails()

    /* 时钟 */
    tickClock()
    every(1000, tickClock)

    /* 启动层已经真正跑起来了：900ms 后摘掉首屏兜底的 ms-boot 标记。
       Host 的 hs 兜底和 client 自举那支 18 秒兜底都只该在「splash 根本没起来」时收场；
       这个类一直留着的话，比 18 秒长的序列会被它们提前整屏拿掉 —— 表现就是后面几幕消失。 */
    after(900, function () {
      try { if (root && root.classList) root.classList.remove('ms-boot') } catch (e) { /* noop */ }
    })
  }

  /* 档案照（第三幕）里的黑条：按检测到的眼位摆。
     照片是整帧的 cover 竖切，所以要把视频归一化坐标换算到照片里；
     脸不在可见切片内时就不动，保持原来的默认位置。
     1.6.1 起和直播视图同一套几何：用眼角四点建斜矩形，歪头的档案照也照样压准。 */
  function applyDossierEyes() {
    var host = T('eyes2')
    if (!host) return
    /* 注意：这里不能再 `if (!C.eyeTrack) return`。
       「黑条跟随眼睛」是开关眼位追踪，不是开关黑条本身 —— 关了它，
       直播视图仍会按取景框摆固定比例条，档案照却整条消失，换幕时就成了
       「黑条在换幕时消失」。现在只在算眼位时判断 C.eyeTrack，兜底照常。 */
    var cv = T('snap')
    if (!cv) return
    /* 照片的来源可能是真实视频，也可能是模拟头像那块画布 —— 两者的
       宽高取法不同，但 cover 换算完全一样。 */
    var srcKind = S.sim ? 'sim' : (S.video && S.video.videoWidth ? 'video' : '')
    var src = srcKind === 'sim' ? T('avatar') : (srcKind === 'video' ? S.video : null)
    if (!src) return
    var vw = src.videoWidth || src.width || 0
    var vh = src.videoHeight || src.height || 0
    if (!vw || !vh) return
    var W = cv.width, H = cv.height
    if (!W || !H) return
    var scale = Math.max(W / vw, H / vh)
    var sw = vw * scale, sh = vh * scale
    var offX = (W - sw) / 2, offY = (H - sh) / 2
    /* 源归一化 → 照片像素。**只有真实视频才镜像** —— snapshot 里就是
       `if (C.camMirror && src === S.video)`，模拟头像照原样画。
       以前这里无条件按 camMirror 翻，模拟态下黑条会被翻到画面外。 */
    var mirrored = C.camMirror && srcKind === 'video'
    var toPhoto = function (nx, ny) {
      return {
        x: mirrored ? (W - offX - nx * sw) : (offX + nx * sw),
        y: offY + ny * sh
      }
    }

    var H2 = window.MSHud
    var fit = null

    if (C.eyeTrack && S.eye) {
      if (S.eye.quad && H2 && typeof H2.eyeBarFit === 'function') {
        var pts = {}
        var ok = true
        for (var i = 0; i < EYE_QUAD_KEYS.length; i++) {
          var k = EYE_QUAD_KEYS[i]
          var q = S.eye.quad[k]
          if (!q) { ok = false; break }
          pts[k] = toPhoto(q.x, q.y)
        }
        if (ok) {
          fit = H2.eyeBarFit(pts, {
            spanScale: C.mosaicEyeScale,
            thickScale: C.mosaicEyeThick,
            minW: 8,
            minH: Math.max(4, S.eye.eh * vh * scale * 1.1)
          })
        }
      }
      if (!fit && H2 && typeof H2.barSize === 'function') {
        var p2 = toPhoto(S.eye.vx, S.eye.vy)
        var visW = W / sw
        var visH = H / sh
        var size = H2.barSize('eye', {
          span: (S.eye.span / visW) * W,
          eyeH: (S.eye.eh / visH) * H,
          spanScale: C.mosaicEyeScale,
          thickScale: C.mosaicEyeThick
        }, 8, 4)
        fit = { x: p2.x - size.w / 2, y: p2.y - size.h / 2, w: size.w, h: size.h, angle: 0 }
      }
    }

    /* 没有眼位（模拟头像 / 皮肤法跟丢 / 网格没跑起来 / 数据过期）：
       按取景框的固定比例摆一条。以前这里直接 return，档案照上就一条黑条
       都没有 —— 看起来正是「第二幕结束那一下黑条被抹掉了」。 */
    if (!fit && H2 && typeof H2.barSize === 'function' && S.face) {
      var f = S.face
      var a = toPhoto(f.x - f.w / 2, f.y - f.h / 2)
      var b = toPhoto(f.x + f.w / 2, f.y + f.h / 2)
      var rx = Math.min(a.x, b.x), ry = Math.min(a.y, b.y)
      var rw = Math.abs(b.x - a.x), rh = Math.abs(b.y - a.y)
      if (rw > 2 && rh > 2) {
        var size2 = H2.barSize('box', {
          rectW: rw, rectH: rh,
          widthRatio: (C.mosaicWidth == null ? 96 : C.mosaicWidth) / 100,
          heightRatio: C.mosaicHeight / 100
        }, 8, 4)
        fit = {
          x: rx + (rw - size2.w) / 2,
          y: ry + rh * (C.mosaicOffset / 100),
          w: size2.w,
          h: size2.h,
          angle: 0
        }
      }
    }
    if (!fit) return

    var cx = fit.x + fit.w / 2
    var cy = fit.y + fit.h / 2
    if (cx < -0.2 * W || cx > 1.2 * W || cy < -0.2 * H || cy > 1.2 * H) return

    host.style.left = (fit.x / W * 100).toFixed(2) + '%'
    host.style.right = 'auto'
    host.style.top = (fit.y / H * 100).toFixed(2) + '%'
    host.style.width = Math.max(6, Math.min(100, fit.w / W * 100)).toFixed(2) + '%'
    host.style.height = Math.max(2, Math.min(40, fit.h / H * 100)).toFixed(2) + '%'
    host.style.transform = fit.angle ? 'rotate(' + (fit.angle * 180 / Math.PI).toFixed(2) + 'deg)' : ''
  }

  function buildEyes(host, n) {
    if (!host) return
    host.innerHTML = ''
    for (var i = 0; i < n; i++) {
      var b = document.createElement('i')
      /* 中段略宽、两端略窄 —— 像被切成块的墨条，不是整齐的栅栏 */
      var mid = Math.abs(i - (n - 1) / 2) / Math.max(1, (n - 1) / 2)
      if (mid < 0.28) b.className = 'mid'
      else if (mid > 0.86) b.className = 'thin'
      b.style.animationDelay = (-i * 0.11).toFixed(2) + 's'
      b.style.setProperty('--jit', (1.3 + (i % 5) * 0.17).toFixed(2) + 's')
      host.appendChild(b)
    }
  }

  function applyCamFilter() {
    if (!S.root) return
    /* 写 -base 而不是直接写 --ms-sat：内联变量优先级最高，状态层（锁定后提亮）
       就再也盖不掉了 */
    S.root.style.setProperty('--ms-sat-base', C.camSat + '%')
    S.root.style.setProperty('--ms-con-base', C.camCon + '%')
    S.root.style.setProperty('--ms-bri-base', C.camBright + '%')
  }

  function buildRails() {
    var lines = []
    for (var i = 0; i < 26; i++) {
      lines.push('NODE ' + hex(6) + ' · ' + (Math.random() * 99).toFixed(2))
      lines.push('LAT ' + (rnd(40.4, 40.9)).toFixed(4) + ' LON ' + (rnd(-74.1, -73.7)).toFixed(4))
      lines.push('PKT ' + hex(4) + ' ' + hex(4) + ' ' + hex(4))
    }
    var block = lines.join('<br>')
    var l = $('[data-rail="l"]')
    var r = $('[data-rail="r"]')
    if (l) l.innerHTML = '<div>' + block + '<br>' + block + '</div>'
    if (r) {
      var rev = lines.slice().reverse().join('<br>')
      r.innerHTML = '<div style="animation-duration:34s">' + rev + '<br>' + rev + '</div>'
    }
  }

  function tickClock() {
    var d = new Date()
    var t = T('clock')
    if (t) t.textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds())
  }

  /* ── 摄像头 ────────────────────────────────────────────────────────────── */

  /* 浏览器的错误名直接翻成 HUD 上的一句话。
     之前这里只写死一句 CAMERA BLOCKED 然后铺噪点 —— 出了问题没人能看出是
     没设备、被拒、还是被别的程序占着。现在把原因摆到画面上。 */
  var CAM_ERR = {
    NotAllowedError: 'PERMISSION DENIED',
    PermissionDeniedError: 'PERMISSION DENIED',
    SecurityError: 'INSECURE CONTEXT',
    NotFoundError: 'NO CAMERA DEVICE',
    DevicesNotFoundError: 'NO CAMERA DEVICE',
    OverconstrainedError: 'RESOLUTION UNSUPPORTED',
    ConstraintNotSatisfiedError: 'RESOLUTION UNSUPPORTED',
    NotReadableError: 'DEVICE BUSY',
    TrackStartError: 'DEVICE BUSY',
    AbortError: 'DEVICE ABORTED',
    TypeError: 'INSECURE CONTEXT'
  }

  function camErrText(e) {
    var name = (e && (e.name || e.code)) || 'UNKNOWN'
    return CAM_ERR[name] || ('CAMERA ERROR · ' + name)
  }

  function camFail(e) {
    S.camError = {
      name: (e && (e.name || e.code)) || 'UNKNOWN',
      message: String((e && e.message) || ''),
      secure: secureContext(),
      protocol: pageProtocol(),
      hasApi: hasCamApi()
    }
    var text = camErrText(e)
    /* Electron 壳里被拒，八成是系统层的相机隐私开关，或者桌面端没放行。
       把这句塞进分析栏的 SOURCE，比在 HUD 上硬挤一行字更好读。 */
    if (/NotAllowed|Permission/i.test(S.camError.name)) {
      var src = T('kvSrc')
      var ua = ''
      try { ua = String(navigator.userAgent || '') } catch (err) { ua = '' }
      if (src) {
        src.textContent = /Electron/i.test(ua) ? 'BLOCKED · SEE SETTINGS' : 'BLOCKED · GRANT CAMERA'
      }
    }
    setCamState(text)
    var meta = T('camMeta')
    if (meta) meta.textContent = text
    /* 有模拟头像就用头像，没有才铺噪点 */
    startAvatar(S.camError.name)
    if (C.sound) { try { sfx.tick() } catch (err) { /* noop */ } }
  }

  function pageProtocol() {
    try { return String(location.protocol || '') } catch (e) { return '' }
  }

  function secureContext() {
    try { return window.isSecureContext === true } catch (e) { return false }
  }

  function hasCamApi() {
    try { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) } catch (e) { return false }
  }

  /* 真正发请求。失败会记进 S.camError，供设置页诊断用。
     分辨率被拒（Overconstrained / NotReadable）时退一步用「任意分辨率」再试一次 ——
     很多虚拟摄像头 / 老摄像头不接受 ideal 之外的尺寸。 */
  function requestCamera() {
    if (S.camReq) return S.camReq
    if (!hasCamApi()) {
      var e0 = new Error('navigator.mediaDevices 不可用：protocol=' + pageProtocol()
        + '，secureContext=' + secureContext())
      e0.name = secureContext() ? 'AbortError' : 'SecurityError'
      S.camError = {
        name: e0.name, message: e0.message,
        secure: secureContext(), protocol: pageProtocol(), hasApi: false
      }
      return null
    }
    var md = navigator.mediaDevices
    var constraints = {
      audio: false,
      video: {
        width: { ideal: C.camWidth },
        height: { ideal: Math.round(C.camWidth * 0.75) },
        facingMode: 'user'
      }
    }
    var pending = null
    try {
      pending = md.getUserMedia(constraints)
    } catch (e) {
      S.camError = { name: e && e.name, message: String(e && e.message), secure: secureContext(), protocol: pageProtocol(), hasApi: true }
      return null
    }
    if (!pending || !pending.then) return null
    S.camReq = pending.catch(function (e) {
      var name = (e && e.name) || ''
      if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError' || name === 'NotReadableError') {
        return md.getUserMedia({ audio: false, video: true })
      }
      throw e
    })
    return S.camReq
  }

  function startCamera() {
    var cv = S.ui.camview
    if (!C.camera) {
      /* 用户在设置里关掉了摄像头：直接用模拟头像顶上 */
      setCamState('NO INPUT · SIMULATED FEED')
      startAvatar('CAMERA OFF')
      return
    }
    setCamState('ACQUIRING SIGNAL')
    var pending = requestCamera()
    if (!pending) { camFail(S.camError || { name: 'UNKNOWN' }); return }

    /* 权限请求挂起是这个功能最常见的失败形态：不报错、不 reject，就是永远不返回。
       桌面端（Electron）如果宿主没应答授权，或者授权框被启动层挡住没点，
       观众看到的就只有噪点，状态一直停在 ACQUIRING —— 看不出发生了什么。
       所以这里挂两个计时器，把「还在等」和「等太久」分开说清楚。 */
    after(2200, function () {
      if (S.stream || S.camError || S.done) return
      setCamState('WAITING FOR CAMERA')
      var m0 = T('camMeta')
      if (m0) m0.textContent = 'AWAITING SIGNAL'
    })
    after(6000, function () {
      if (S.stream || S.camError || S.done) return
      S.camError = {
        name: 'TimeoutError',
        message: 'getUserMedia 6 秒没有返回：授权框没弹出来，或者宿主没有应答（Electron 里很常见）',
        secure: secureContext(),
        protocol: pageProtocol(),
        hasApi: true
      }
      setCamState('NO CAMERA · CHECK PERMISSION')
      var m1 = T('camMeta')
      if (m1) m1.textContent = 'NO PERMISSION'
      var src = T('kvSrc')
      if (src) src.textContent = 'NO SIGNAL · SEE SETTINGS'
      startAvatar('TIMEOUT')
    })
    /* 拒绝授权 / 没有摄像头 / 非安全上下文 → 降级为纯 HUD，但把原因写在画面上 */
    pending.then(function (stream) {
      if (S.done) {
        try { stream.getTracks().forEach(function (t) { t.stop() }) } catch (e) { /* noop */ }
        return
      }
      S.stream = stream
      S.camError = null
      if (S.sim) {
        S.sim = false
        if (S.root) S.root.classList.remove('ms-sim')
      }
      try {
        S.video.srcObject = stream
        S.video.muted = true
        var p = S.video.play()
        if (p && p.catch) p.catch(function () { /* 自动播放被拦，画面仍在 */ })
      } catch (e) { /* noop */ }
      if (cv) {
        cv.classList.remove('ms-nocam')
        if (C.camMirror) cv.classList.add('ms-mirror')
      }
      if (S.noiseTimer) { clearInterval(S.noiseTimer); S.noiseTimer = 0 }
      var track = null
      try { track = stream.getVideoTracks()[0] } catch (e) { track = null }
      var st = track && track.getSettings ? track.getSettings() : {}
      var w = st.width || C.camWidth
      var h = st.height || Math.round(C.camWidth * 0.75)
      setCamState('SIGNAL LOCK · ' + w + '×' + h)
      var meta = T('camMeta')
      if (meta) meta.textContent = 'LIVE · ' + w + '×' + h
      startFpsCounter()
      /* 取景框追踪：肤色法先跑，网格模型加载好之后自动接管 */
      if (C.faceTrack) startTrack()
    }).catch(function (e) {
      if (S.done) return
      camFail(e)
    })
  }

  function setCamState(text) {
    var n = T('camstate')
    if (n) n.textContent = text
  }

  function startFpsCounter() {
    var n = T('camfps')
    if (!n) return
    S.fps = { n: 0, t: Date.now() }
    var tick = function () {
      if (S.done || !S.video) return
      S.fps.n++
      var now = Date.now()
      if (now - S.fps.t >= 1000) {
        n.textContent = Math.round((S.fps.n * 1000) / (now - S.fps.t)) + ' FPS'
        S.fps = { n: 0, t: now }
      }
      try {
        if (S.video.requestVideoFrameCallback) {
          S.frameCb = S.video.requestVideoFrameCallback(tick)
          return
        }
      } catch (e) { /* noop */ }
      S.rafs.push(requestAnimationFrame(tick))
    }
    try {
      if (S.video.requestVideoFrameCallback) S.frameCb = S.video.requestVideoFrameCallback(tick)
      else S.rafs.push(requestAnimationFrame(tick))
    } catch (e) { /* noop */ }
  }

  /* 无摄像头兜底：低分辨率噪点，被 CSS 放大成「信号丢失」的雪点 */
  function startNoise() {
    var cv = T('noise')
    if (!cv || !cv.getContext) return
    var g = cv.getContext('2d')
    var w = cv.width, h = cv.height
    var img = g.createImageData(w, h)
    var data = img.data
    setCamState('NO SIGNAL · SIMULATED FEED')
    var paint = function () {
      if (S.done) return
      for (var i = 0; i < data.length; i += 4) {
        var v = 12 + Math.random() * 46
        data[i] = v
        data[i + 1] = v * 1.02
        data[i + 2] = v * 1.12
        data[i + 3] = 255
      }
      /* 一条横向滚动亮带，让它像在「找信号」 */
      var band = Math.floor((Date.now() / 14) % h)
      for (var x = 0; x < w; x++) {
        for (var y = band; y < band + 3 && y < h; y++) {
          var p = (y * w + x) * 4
          data[p] += 26; data[p + 1] += 28; data[p + 2] += 30
        }
      }
      g.putImageData(img, 0, 0)
    }
    paint()
    S.noiseTimer = every(70, paint)
  }

  /* ── 模拟头像：没有摄像头时冒充一路「档案画面」 ─────────────────────────
     很多机器根本没摄像头、或者不想在启动时开摄像头。以前这种情况只能铺噪点，
     第二幕就变成「黑屏 + 取景框」，一点戏都没有。
     现在分三层，**任何一层失败都不会掉回噪点**：
       1) Host 把默认头像内联成 data URI 下发（避开 CSP 的 img-src，不经过网络）
       2) 用户自己填的图片地址（http/https 或本地 data URI）
       3) 都取不到 → 画一个「档案剪影」（暗底 + 头肩 + 噪点），保证有脸可锁
     画面画进一块和取景框同尺寸的 canvas，所以「脸」的百分比坐标和取景框同一套，
     取景框/黑条都不用额外换算。 */
  /* 内置默认头像：构建时把 assets/avatar/default.jpg 内嵌成 base64。
     splash.js 能加载，这张图就一定在 —— 不走 Host 路由、不等 window 全局、
     也不经过 <img> 的 img-src 限制（用 createImageBitmap 直接解码）。 */
  var AVATAR_B64 = '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'
  var AVATAR_FALLBACK = { x: 49, y: 44, w: 36, h: 34 }

  function avatarBox() {
    var p = String(C.avatarBox == null ? '' : C.avatarBox).split(',')
    var v = []
    for (var i = 0; i < p.length; i++) v.push(Number(p[i]))
    if (v.length < 4) return AVATAR_FALLBACK
    for (var j = 0; j < 4; j++) if (!isFinite(v[j])) return AVATAR_FALLBACK
    return { x: v[0], y: v[1], w: Math.max(8, v[2]), h: Math.max(8, v[3]) }
  }

  function avatarSrc() {
    /* 只认真正能取到的绝对地址：data: / http(s): / blob:。
       桌面端页面在 dsh-app:// 下，相对路径（比如面板里手填的
       assets/avatar/default.jpg）根本取不到 —— 以前会拿它反复重试，
       结果永远只剩剪影。取不到就一律用构建时内嵌的默认图。 */
    var u = String(C.avatar == null ? '' : C.avatar).trim()
    if (u && /^(data:|https?:|blob:)/i.test(u)) return u
    return 'builtin'
  }

  /* base64 → Blob：不联网、不经过 <img>，img-src 一类的 CSP 影响不到它 */
  function avatarBlob(b64) {
    var bin = window.atob(b64)
    var n = bin.length
    var arr = new Uint8Array(n)
    for (var i = 0; i < n; i++) arr[i] = bin.charCodeAt(i)
    return new Blob([arr], { type: 'image/jpeg' })
  }

  function builtinAvatarUri() { return 'data:image/jpeg;base64,' + AVATAR_B64 }

  /* 一张图 → 可直接 drawImage 的对象：优先 createImageBitmap，老环境退回 <img> */
  function decodeAvatar(src, cb) {
    var str = String(src)
    var b64 = ''
    if (str === 'builtin') b64 = AVATAR_B64
    else if (str.indexOf('data:') === 0 && str.indexOf('base64,') > 0) b64 = str.slice(str.indexOf('base64,') + 7)
    if (b64 && window.Blob && typeof window.createImageBitmap === 'function') {
      try {
        window.createImageBitmap(avatarBlob(b64)).then(function (bmp) { cb(bmp) }).catch(function () { decodeAvatarImg(src, cb) })
        return
      } catch (e) { /* 退回 <img> */ }
    }
    decodeAvatarImg(src, cb)
  }
  function decodeAvatarImg(src, cb) {
    var img = new Image()
    img.onload = function () { cb(img) }
    img.onerror = function () { cb(null) }
    img.src = String(src) === 'builtin' ? builtinAvatarUri() : String(src)
  }

  /* 冷调 + 细噪点：别一眼看出是贴图 */
  function gradeFrame(g, W, H, quiet) {
    try {
      var d = g.getImageData(0, 0, W, H)
      var px = d.data
      var amp = quiet ? 5 : 9
      for (var i = 0; i < px.length; i += 4) {
        var l = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114
        var n = (Math.random() - 0.5) * amp
        px[i] = l * 0.88 + n
        px[i + 1] = l * 0.95 + n
        px[i + 2] = l * 1.0 + n
      }
      g.putImageData(d, 0, 0)
    } catch (e) { /* noop */ }
  }

  /* 档案剪影：暗底 + 头 + 脖子 + 肩，头的位置就是 avatarBox，
     于是取景框天然套在头上。只是「有画面」，不假装是真人。 */
  function drawSilhouette(g, W, H) {
    var b = avatarBox()
    var cx = W * b.x / 100
    var cy = H * b.y / 100
    var fw = W * b.w / 100
    var fh = H * b.h / 100
    /* 头别画太扁：半径按「不小于宽度的 0.58」兜一下 */
    var rh = Math.max(fh * 0.5, fw * 0.58)
    var rw = Math.max(fw * 0.5, rh * 0.80)

    var bg = g.createRadialGradient(W * 0.5, H * 0.42, Math.min(W, H) * 0.08,
      W * 0.5, H * 0.55, Math.max(W, H) * 0.8)
    bg.addColorStop(0, '#1c1c1c')
    bg.addColorStop(1, '#050505')
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)

    /* 肩 */
    g.fillStyle = '#101010'
    g.beginPath()
    g.ellipse(cx, cy + rh * 1.95, rw * 1.95, rh * 1.0, 0, 0, Math.PI * 2)
    g.fill()
    /* 脖子 */
    g.fillStyle = '#161616'
    g.fillRect(cx - rw * 0.34, cy + rh * 0.5, rw * 0.68, rh * 0.9)
    /* 头 */
    g.fillStyle = '#202020'
    g.beginPath()
    g.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2)
    g.fill()
    /* 一侧的边光，让它有点立体感 */
    g.strokeStyle = 'rgba(255, 255, 255, .09)'
    g.lineWidth = Math.max(1, W * 0.0016)
    g.beginPath()
    g.ellipse(cx, cy, rw, rh, 0, Math.PI * 1.05, Math.PI * 1.75)
    g.stroke()
    gradeFrame(g, W, H, true)
  }

  function startAvatar(reason) {
    if (C.avatarOnNoCam === false) { startNoise(); return }
    var url = avatarSrc()
    /* 地址变了（或换成了空）就别复用上一次那张图 */
    if (S.simSrc !== url) {
      S.simImg = null
      S.simSrc = url
    }
    /* 先把模拟画面立起来（图还没解码好时先显示剪影），第二幕不至于空着 */
    S.sim = true
    if (S.root) S.root.classList.add('ms-sim')
    drawAvatarFrame()
    setCamState('SIMULATED FEED · NO CAMERA')
    var meta = T('camMeta')
    if (meta) meta.textContent = 'SIMULATED · ' + C.camWidth + 'P'
    var kvSrc = T('kvSrc')
    if (kvSrc) kvSrc.textContent = 'MOCK · ' + String(reason || 'NO CAMERA')
    var dSrc = T('dSrc')
    if (dSrc) dSrc.textContent = 'MOCK · AVATAR'
    fakeFace()

    if (S.simBusy) return
    S.simBusy = true
    decodeAvatar(url, function (obj) {
      S.simBusy = false
      if (S.done) return
      if (!obj) {
        /* 自定义地址加载失败 → 用内嵌的默认图兜底；再失败就留剪影，绝不掉回噪点 */
        S.simError = String(url).slice(0, 120)
        if (url !== 'builtin') {
          decodeAvatar('builtin', function (o2) {
            if (S.done || !o2) return
            S.simImg = o2
            S.simSrc = 'builtin'
            drawAvatarFrame()
            fakeFace()
          })
        }
        return
      }
      S.simImg = obj
      S.simSrc = url
      S.simError = ''
      drawAvatarFrame()
      fakeFace()
    })
  }

  function drawAvatarFrame() {
    var cv = T('avatar')
    if (!cv || !cv.getContext) return
    var r = null
    try { r = S.ui.camview.getBoundingClientRect() } catch (e) { r = null }
    var W = Math.max(160, Math.round(r && r.width ? r.width : 640))
    var H = Math.max(120, Math.round(r && r.height ? r.height : 480))
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H }
    var g = cv.getContext('2d')
    var img = S.simImg
    if (img && img.width) {
      var s = Math.max(W / img.width, H / img.height)
      var dw = img.width * s
      var dh = img.height * s
      g.fillStyle = '#000'
      g.fillRect(0, 0, W, H)
      g.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
      gradeFrame(g, W, H, false)
    } else {
      drawSilhouette(g, W, H)
    }
  }

  /* 头像上的「脸」是配置给的，不需要追踪；直接把取景框按过去 */
  function fakeFace() {
    var b = avatarBox()
    S.face = { x: b.x / 100, y: b.y / 100, w: b.w / 100, h: b.h / 100 }
    updateReticleTarget()
  }

  /* ── 取景框追踪 ──────────────────────────────────────────────────────────
     两条来源，写同一组 CSS 变量：
       1) 内置肤色追踪（lib/face-track.js）—— 零依赖、无模型，默认就用它
       2) 浏览器 FaceDetector —— 有就用（桌面版基本没有），比肤色准
     坐标一律先归一化到「视频帧」，再映射到「画面元素」：
       视频 object-fit:cover 会裁掉一部分，不换算的话 16:9 摄像头会把框怼到左边；
       镜像开着时画面左右翻转，x 也要跟着翻。之后做 EMA 平滑，最后才落成百分比。 */

  /* ── 取景框渲染（canvas，照抄 rosehahah/the-machine 的 hud.js）──────────
     CSS 的 border-style:dashed 控制不了 dash 长度，也做不出 1.7 倍粗的角括号，
     所以框改由 canvas 逐笔绘制。眼部黑条仍留在 DOM 里（配置项多，DOM 好改），
     每帧用同一个矩形同步过去，保证跟框严丝合缝。 */

  /* 剧里的「颜色即判断」：这些映射来自上游 backend/vision.py 的 ROLES 表 */
  var STATUS_STYLE = {
    ASSET: 'yellow',
    ADMIN: 'yellow',
    CONTINGENCY: 'yellow',
    THREAT: 'red',
    IRRELEVANT: 'white'
  }

  function measureCam() {
    if (!S.ui.camview) return
    var r = null
    try { r = S.ui.camview.getBoundingClientRect() } catch (e) { r = null }
    if (!r || !r.width) return
    S.camW = Math.round(r.width)
    S.camH = Math.round(r.height)
    updateReticleTarget()
  }

  /* 归一化的人脸框 → 屏幕像素的正方形框（剧里框的是「头」，是正方形） */
  function faceRectPx() {
    var W = S.camW || 1
    var H = S.camH || 1
    if (window.MSHud && window.MSHud.squareFromBox) {
      return window.MSHud.squareFromBox(S.face, W, H)
    }
    var side = (((S.face.w * W) + (S.face.h * H)) / 2) * 1.05
    return [S.face.x * W - side / 2, S.face.y * H - side / 2 - side * 0.08, side, side]
  }

  function updateReticleTarget() {
    if (S.reticle && S.camW) S.reticle.setTarget(faceRectPx())
  }

  function startHud() {
    var cv = T('hud')
    if (!cv || !cv.getContext) return
    var g = null
    try { g = cv.getContext('2d') } catch (e) { g = null }
    if (!g) return
    S.hud = cv
    S.hudCtx = g
    S.hudDpr = Math.min(2, window.devicePixelRatio || 1)
    measureCam()
    if (!S.hudListening) {
      S.hudListening = true
      try {
        window.addEventListener('resize', function () {
          measureCam()
          if (S.sim) drawAvatarFrame()
        })
      } catch (e) { /* noop */ }
    }
    var loop = function (tms) {
      if (S.done) return
      drawHud(tms)
      try { S.rafs.push(requestAnimationFrame(loop)) } catch (e) { /* noop */ }
    }
    try { S.rafs.push(requestAnimationFrame(loop)) } catch (e) { /* noop */ }
  }

  /* 眼位 → 黑条矩形（画布像素，含旋转角）。
     优先用眼角四点建斜矩形（歪头时条跟着斜，侧脸时不至于变短露眼）；
     没有四点（肤色引擎）就退回「眼距 × 倍数」的老算法，角度 0。 */
  function eyeBar() {
    var H = window.MSHud
    if (!S.eye) return null
    var cm = camMapper()
    if (cm && S.eye.quad && typeof H.eyeBarFit === 'function') {
      var pts = {}
      var ok = true
      for (var i = 0; i < EYE_QUAD_KEYS.length; i++) {
        var k = EYE_QUAD_KEYS[i]
        var q = S.eye.quad[k]
        if (!q) { ok = false; break }
        pts[k] = cm.map(q.x, q.y)
      }
      if (ok) {
        /* 眨眼兜底：闭眼瞬间上下眼睑会并到一起，vSpan 掉到接近 0，条会跟着变细。
           眼轮廓高度（eh）在眨眼时几乎不变，用它做一个下限。 */
        var ehPx = S.eye.eh * cm.h / cm.fy
        var f = H.eyeBarFit(pts, {
          spanScale: C.mosaicEyeScale,
          thickScale: C.mosaicEyeThick,
          minW: 12,
          minH: Math.max(6, ehPx * 1.1)
        })
        if (f) return f
      }
    }
    if (typeof H.barSize !== 'function') return null
    var mp = mapPointToCanvas(S.eye.vx, S.eye.vy)
    var vw = (S.video && S.video.videoWidth) || 1
    var vh = (S.video && S.video.videoHeight) || 1
    var size = H.barSize('eye', {
      span: S.eye.span * vw * mp.sx,
      eyeH: S.eye.eh * vh * mp.sy,
      spanScale: C.mosaicEyeScale,
      thickScale: C.mosaicEyeThick
    }, 12, 6)
    return { x: mp.x - size.w / 2, y: mp.y - size.h / 2, w: size.w, h: size.h, angle: 0 }
  }

  function drawHud(tms) {
    var cv = S.hud
    var g = S.hudCtx
    if (!cv || !g || !S.root) return
    /* 只吃帧间隔：不和 performance.now() 混用，避免两个时间基点错开把 age 算成负数 */
    var dt = S.hudLast ? (tms - S.hudLast) / 1000 : 1 / 60
    S.hudLast = tms
    if (!(dt > 0) || dt > 0.25) dt = 1 / 60
    if (!S.camW) measureCam()
    var W = S.camW || 1
    var H = S.camH || 1
    var dpr = S.hudDpr
    var pw = Math.max(1, Math.round(W * dpr))
    var ph = Math.max(1, Math.round(H * dpr))
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph }
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, W, H)
    if (!S.reticle) return
    var st = S.reticle.step(dt)
    if (st && st.alpha > 0.01) {
      /* 先黑条、后框线：同一张画布、同一套坐标，既不会错位，框线也不会被盖掉。
         抖动用累加时间，保证可复现。 */
      S.hudT += dt
      var HUD = window.MSHud
      var fit = null
      /* 黑条要跟取景框一起淡出：drawBar 是纯色填充，不会自己吃 alpha。
         换幕时第二幕还有 0.34s 淡出，这里显式把整条链套进 st.alpha，
         否则框在淡、条先没，看起来就是「换幕时黑条消失」。 */
      try { g.globalAlpha = st.alpha } catch (e) { /* noop */ }
      if (C.eyeTrack && S.eye && HUD && HUD.drawBar) {
        /* 眼位还在（哪怕刚过期一点）：按实测眼位摆 */
        fit = eyeBar()
      }
      if (fit && HUD && HUD.drawBar) {
        S.eyeBar = { x: fit.x, y: fit.y, w: fit.w, h: fit.h, angle: fit.angle }
        /* edge 抖动：只让块间缝隙动，条本身不再上下缩 —— 否则眼睛会从缝里露出来 */
        HUD.drawBar(g, fit.x, fit.y, fit.w, fit.h,
          C.mosaicBlocks, C.mosaicGap, S.hudT, fit.angle, 'edge')
      } else if (C.eyeTrack && S.eyeBar && HUD && HUD.drawBar) {
        /* 眼位这一帧没拿到（眨眼 / 转头 / 模型掉帧 / 数据过期）：
           冻结在最后一次锁到的位置重画。
           以前这里会掉到「固定比例」分支，条会突然跳到别处或干脆消失，
           看起来就是「最后那一瞬间黑条没了」。 */
        HUD.drawBar(g, S.eyeBar.x, S.eyeBar.y, S.eyeBar.w, S.eyeBar.h,
          C.mosaicBlocks, C.mosaicGap, S.hudT, S.eyeBar.angle || 0, 'edge')
      } else if (HUD && HUD.drawEyes) {
        S.eyeBar = null
        /* 固定比例模式：按取景框摆，长度/厚度可调 */
        HUD.drawEyes(g, st.x, st.y, st.w, st.h, {
          on: !!C.mosaic,
          blocks: C.mosaicBlocks,
          offset: C.mosaicOffset / 100,
          height: C.mosaicHeight / 100,
          widthRatio: (C.mosaicWidth == null ? 96 : C.mosaicWidth) / 100,
          gap: C.mosaicGap,
          jitter: !!C.mosaicJitter
        }, S.hudT)
      }
      try { g.globalAlpha = 1 } catch (e) { /* noop */ }
      S.reticle.paint(g, st, W)
    }
  }

  function spawnReticle() {
    if (!window.MSHud || !window.MSHud.Reticle) return
    if (!S.camW) measureCam()
    if (S.sim) fakeFace()
    S.reticle = new window.MSHud.Reticle(faceRectPx(), 'white')
    /* 框一出生就带编号标签（0.3 秒后淡入），锁定后不再改 —— 名字留给第三幕的档案卡 */
    if (C.boxLabel) S.reticle.setLabel(String(C.identityId || ''))
    updateReticleTarget()
  }

  /* 锁定后用哪种框：auto 按 status 走（同上游 ROLES 表），也可以强制指定 */
  function lockStyle() {
    if (C.boxStyle && C.boxStyle !== 'auto') return C.boxStyle
    return STATUS_STYLE[String(C.status || '').toUpperCase()] || 'white'
  }

  /* 视频帧归一化坐标 → 画面元素归一化坐标（cover 裁切 + 镜像） */
  function mapToBox(nx, ny, nw, nh) {
    var vw = (S.video && S.video.videoWidth) || 4
    var vh = (S.video && S.video.videoHeight) || 3
    var rect = null
    try { rect = S.ui.camview.getBoundingClientRect() } catch (e) { rect = null }
    if (!rect || !rect.width || !rect.height) return { x: nx, y: ny, w: nw, h: nh }
    var boxAspect = rect.width / rect.height
    var vidAspect = vw / vh
    var fx = 1, fy = 1
    if (vidAspect > boxAspect) fx = boxAspect / vidAspect   // 左右被裁
    else fy = vidAspect / boxAspect                          // 上下被裁
    var x = (nx - (1 - fx) / 2) / fx
    var y = (ny - (1 - fy) / 2) / fy
    var w = nw / fx
    var h = nh / fy
    if (C.camMirror) x = 1 - x
    return { x: x, y: y, w: w, h: h }
  }

  /* ── 眼位检测 ───────────────────────────────────────────────────────────
     把脸框裁成一小块，找出两只眼睛的位置，让黑条真正压在眼睛上。
     裁剪用「肤色连通域」而不是头框：连通域顶边就是发际线，
     眼部大致落在裁剪高度的 35%~50%，正好在 eye-track 的先验带里。
     检测失败（侧脸、没戴对、纯色背景）就返回 null，调用方自动回落到固定比例。 */
  function detectEyesInVideo(hit) {
    var ET = window.MSEyeTrack
    if (!ET || typeof ET.findEyes !== 'function') return null
    var v = S.video
    if (!v || !v.videoWidth) return null
    var vw = v.videoWidth, vh = v.videoHeight

    if (!S.eyeCanvas) {
      S.eyeCanvas = document.createElement('canvas')
      S.eyeCanvas.width = 96
      S.eyeCanvas.height = 96
      try { S.eyeCtx = S.eyeCanvas.getContext('2d', { willReadFrequently: true }) }
      catch (e) { S.eyeCtx = S.eyeCanvas.getContext('2d') }
    }
    var g = S.eyeCtx
    if (!g) return null

    var fw = hit.w * vw, fh = hit.h * vh
    var fx = hit.x * vw, fy = hit.y * vh
    var ch = Math.max(24, fh * 0.85)
    var cw = Math.max(24, Math.max(fw * 1.10, ch * 0.80))
    var sx = fx - cw / 2
    var sy = fy - fh / 2 - fh * 0.05
    /* 裁剪框允许超出画面：不能直接把 sx/cw 夹回画面内，
       那样会改变缩放比例，脸在画面边缘时眼睛会被放大/截断，
       眼高估偏 → 黑条盖不全。正确做法是：把「实际可见的那部分」
       按原比例画到裁剪图里它该在的位置，空出来的地方留空。 */
    var ex2 = Math.min(vw, sx + cw)
    var ey2 = Math.min(vh, sy + ch)
    var sx2 = Math.max(0, sx)
    var sy2 = Math.max(0, sy)
    var sw = ex2 - sx2
    var sh = ey2 - sy2
    if (sw < 8 || sh < 8) return null
    var kx = S.eyeCanvas.width / cw
    var ky = S.eyeCanvas.height / ch
    try {
      g.clearRect(0, 0, S.eyeCanvas.width, S.eyeCanvas.height)
      g.drawImage(v, sx2, sy2, sw, sh, (sx2 - sx) * kx, (sy2 - sy) * ky, sw * kx, sh * ky)
    } catch (e) { return null }
    var img = null
    try { img = g.getImageData(0, 0, S.eyeCanvas.width, S.eyeCanvas.height) }
    catch (e) { return null }
    var r = ET.findEyes(img)
    if (!r) return null

    return {
      vx: (sx + r.cx * cw) / vw,
      vy: (sy + r.cy * ch) / vh,
      span: r.span * cw / vw,
      eh: r.eh * ch / vh,
      conf: r.conf
    }
  }

  /** 视频归一化的一个点 → HUD 画布像素（带 cover 裁切与镜像换算） */
  function mapPointToCanvas(nx, ny) {
    var cm = camMapper()
    if (!cm) return { x: nx, y: ny, sx: 1, sy: 1 }
    var p = cm.map(nx, ny)
    return { x: p.x, y: p.y, sx: cm.sx, sy: cm.sy }
  }

  /* 一次取 rect 就够：黑条一帧要换 8 个点，每个点各调一次 getBoundingClientRect
     会强制 8 次布局查询，白白多花时间。 */
  function camMapper() {
    var vw = (S.video && S.video.videoWidth) || 0
    var vh = (S.video && S.video.videoHeight) || 0
    var rect = null
    try { rect = S.ui.camview.getBoundingClientRect() } catch (e) { rect = null }
    if (!vw || !vh || !rect || !rect.width || !rect.height) return null
    var boxAspect = rect.width / rect.height
    var vidAspect = vw / vh
    var fx = 1, fy = 1
    if (vidAspect > boxAspect) fx = boxAspect / vidAspect
    else fy = vidAspect / boxAspect
    return {
      w: rect.width, h: rect.height, fx: fx, fy: fy, vw: vw, vh: vh,
      sx: rect.width / (vw * fx),
      sy: rect.height / (vh * fy),
      map: function (nx, ny) {
        var x = (nx - (1 - fx) / 2) / fx
        var y = (ny - (1 - fy) / 2) / fy
        if (C.camMirror) x = 1 - x
        return { x: x * rect.width, y: y * rect.height }
      }
    }
  }

  /* 眼位平滑：EMA，避免 8~15Hz 的检测结果让条一跳一跳。
     加入「距离自适应」：目标跳得远（转头、点头）就把系数拉高，跟手；
     目标几乎不动时系数回到用户设定，静止时不抖。
     1.6.1 起眼角四点也一起平滑 —— 否则条的长度和角度会在两帧之间抽一下。 */
  var EYE_QUAD_KEYS = ['lOuter', 'lInner', 'lTop', 'lBot', 'rInner', 'rOuter', 'rTop', 'rBot']

  function cloneQuad(q) {
    if (!q) return null
    var out = {}
    for (var i = 0; i < EYE_QUAD_KEYS.length; i++) {
      var k = EYE_QUAD_KEYS[i]
      out[k] = q[k] ? { x: q[k].x, y: q[k].y } : null
    }
    return out
  }

  function pushEye(e) {
    if (!e) return
    var base = 0.15 + ((C.eyeSmooth == null ? 6 : C.eyeSmooth) - 1) / 9 * 0.60
    if (!S.eye) {
      S.eye = {
        vx: e.vx, vy: e.vy, span: e.span, eh: e.eh, conf: e.conf,
        quad: cloneQuad(e.quad)
      }
      S.eyeAt = Date.now()
      return
    }
    var jx = e.vx - S.eye.vx
    var jy = e.vy - S.eye.vy
    var jump = Math.sqrt(jx * jx + jy * jy)
    var a = Math.min(0.92, base + Math.min(0.42, jump * 8))
    S.eye.vx += jx * a
    S.eye.vy += jy * a
    S.eye.span += (e.span - S.eye.span) * a
    S.eye.eh += (e.eh - S.eye.eh) * a
    S.eye.conf = e.conf
    if (e.quad) {
      if (!S.eye.quad) {
        S.eye.quad = cloneQuad(e.quad)
      } else {
        for (var i = 0; i < EYE_QUAD_KEYS.length; i++) {
          var k = EYE_QUAD_KEYS[i]
          var src = e.quad[k]
          var dst = S.eye.quad[k]
          if (!src) continue
          if (!dst) { S.eye.quad[k] = { x: src.x, y: src.y }; continue }
          dst.x += (src.x - dst.x) * a
          dst.y += (src.y - dst.y) * a
        }
      }
    } else {
      /* 这一路没有眼角信息（肤色引擎），留着旧的会让条停在上一张脸上 */
      S.eye.quad = null
    }
    S.eyeAt = Date.now()
  }

  function clampFace(m) {
    return {
      x: Math.min(1.1, Math.max(-0.1, m.x)),
      y: Math.min(1.1, Math.max(-0.1, m.y)),
      w: Math.min(0.95, Math.max(0.10, m.w)),
      h: Math.min(0.95, Math.max(0.12, m.h))
    }
  }

  /** 把一次检测结果平滑推进到当前取景框。alpha 越小越稳、越大越跟手。 */
  function pushFace(m, alpha) {
    var t = clampFace(m)
    var a = Math.min(0.85, Math.max(0.04, alpha))
    var f = S.face
    f.x += (t.x - f.x) * a
    f.y += (t.y - f.y) * a
    f.w += (t.w - f.w) * a
    f.h += (t.h - f.h) * a
    updateReticleTarget()
  }

  /** 丢目标时慢慢退回配置里那个固定框，别一帧跳回去 */
  function relaxFace(alpha) {
    pushFace({
      x: C.faceX / 100, y: C.faceY / 100,
      w: C.faceW / 100, h: C.faceH / 100
    }, alpha == null ? 0.05 : alpha)
  }

  function agilityAlpha() {
    /* 1 → 0.10（很稳） 10 → 0.55（很跟手） */
    return 0.10 + ((C.trackAgility - 1) / 9) * 0.45
  }

  /* 取景框追踪：有 WebGL 就把像素统计丢给 GPU（face-track-gl.js），
     没有就退回 2D canvas。两条路的连通域判定都在 CPU，结果完全一致。
     这是「兜底」引擎：MediaPipe 网格不可用时全靠它，逻辑保持 1.5.0 原样。 */
  function startSkinTrack() {
    var FT = window.MSFaceTrack
    if (!FT || typeof FT.detect !== 'function' || !S.video) return

    /* 重复进入（网格失败回退、或重播）时先拆掉上一任，别让 WebGL 上下文越攒越多 */
    if (S.trackTimer) { clearInterval(S.trackTimer); S.trackTimer = 0 }
    if (S.tracker && S.tracker.dispose) {
      try { S.tracker.dispose() } catch (e) { /* noop */ }
      S.tracker = null
    }

    var tracker = null
    if (window.MSFaceTrackGL && typeof window.MSFaceTrackGL.createTracker === 'function') {
      tracker = window.MSFaceTrackGL.createTracker({ gpu: C.trackGpu !== false })
    } else {
      /* face-track-gl.js 没加载到：内联一个最小 CPU 后端。功能不缺，只是慢一点。
         （一个 128×96 的 getImageData + 逐像素判定，8Hz 下也就百分之几毫秒。） */
      var cv = document.createElement('canvas')
      cv.width = 128
      cv.height = 96
      var g2 = null
      try { g2 = cv.getContext('2d', { willReadFrequently: true }) } catch (e) { g2 = cv.getContext('2d') }
      tracker = {
        mode: 'cpu',
        renderer: '',
        box: function (src) {
          if (!g2) return null
          try { g2.drawImage(src, 0, 0, 128, 96) } catch (e) { return null }
          var img = null
          try { img = g2.getImageData(0, 0, 128, 96) } catch (e) { return null }
          return FT.detect(img)
        },
        dispose: function () {}
      }
    }
    S.tracker = tracker
    S.trackMode = tracker.mode
    S.gpuRenderer = tracker.renderer
    if (tracker.mode === 'webgl') {
      var meta = T('camMeta')
      if (meta) meta.textContent = meta.textContent + ' · GPU'
    }

    var run = function () {
      if (S.done || !S.video) return
      /* 只要拿到尺寸就试：某些环境 readyState 迟迟不到 2，但帧其实已经有了。
         drawImage / texImage2D 失败都会被后端吞掉，不必靠 readyState 预判。 */
      if (!S.video.videoWidth) return
      /* FaceDetector 刚刚给过结果就不要抢方向盘 */
      if (S.faceDetHitAt && Date.now() - S.faceDetHitAt < 1500) return
      var hit = tracker.box(S.video)
      var geo = T('kvGeo')
      if (hit) {
        S.trackHitAt = Date.now()
        if (C.eyeTrack) pushEye(detectEyesInVideo(hit))
        pushFace(mapToBox(hit.x, hit.y, hit.w, hit.h), agilityAlpha())
        if (geo) geo.textContent = 'X ' + (S.face.x * 100).toFixed(0) + ' · Y ' + (S.face.y * 100).toFixed(0)
      } else if (S.trackHitAt && Date.now() - S.trackHitAt > 800) {
        /* 跟丢了：慢慢回中，并把提示写清楚，免得以为是坏了 */
        relaxFace(0.05)
        if (geo) geo.textContent = 'NO LOCK · FIXED'
      }
    }
    run()
    /* GPU 后端每帧成本极低，把采样提到 ~15Hz 跟得更跟手；
       CPU 后端保持 8Hz，避免主线程被 getImageData 拖住。中间的插值由 HUD 的
       每帧 lerp 负责，所以肉眼看是连续的。 */
    S.trackTimer = every(C.trackGpu !== false && tracker.mode === 'webgl' ? 66 : 120, run)
  }

  /* ── MediaPipe 人脸网格追踪（478 点）──────────────────────────────────────
     为什么换：肤色连通域那套在暖光/暗光/逆光下会整段丢检测，头肩或手臂连成
     一片时框还会跑到胸口上；第二幕要连着扫十几秒，丢一次就从「锁定」掉回
     「NO LOCK」，戏就断了。
     FaceLandmarker 给的是真·人脸几何：轮廓 478 点 → 亚像素稳定的脸框，
     上下眼睑 + 虹膜 → 第三幕的黑条压在真眼上，还能顺手读出头部姿态。
     加载策略是「渐进接管」，全程不黑屏：
       t=0ms    肤色法先跑，画面立刻有框
       t≈0.4s   网格模型就位（wasm + 模型都从本机路由读，不走网络）→ 换成它
       失败/连丢  自动退回肤色法，最差也只到 1.5.0 的水平，不会更糟 */
  function startTrack() {
    startSkinTrack()
    if (C.faceEngine === 'skin' || !C.faceTrack) {
      if (C.faceDetect) startFaceDetect()
      return
    }
    mountLandmark(C.trackGpu === false ? 'CPU' : 'GPU')
  }

  /** 装载网格追踪器。delegate 可以换：GPU 太慢会先试 CPU，再不行退回肤色法 */
  function mountLandmark(delegate) {
    var LM = window.MSFaceLandmark
    var base = window.__DSH_MACHINE_ASSETS__
    if (!LM || typeof LM.create !== 'function' || !base || !S.video) {
      if (C.faceDetect) startFaceDetect()
      return
    }
    if (delegate === 'CPU') S.lmTriedCpu = true

    S.lmState = 'loading'
    if (!S.trackEngine) S.trackEngine = 'skin'
    LM.create({
      video: S.video,
      basePath: base,
      delegate: delegate
    }).then(function (tr) {
      if (S.done || !S.video) { try { tr.dispose() } catch (e) { /* noop */ } return }
      S.lmTracker = tr
      S.lmState = 'ready'
      S.trackEngine = 'landmark'
      /* 交接：掐掉肤色法的定时器，之后的坐标全由网格模型给 */
      if (S.trackTimer) { clearInterval(S.trackTimer); S.trackTimer = 0 }
      if (S.faceTimer) { clearInterval(S.faceTimer); S.faceTimer = 0 }
      var meta = T('camMeta')
      if (meta && meta.textContent.indexOf('MESH') < 0) meta.textContent += ' · MESH'
      startLandmarkLoop(tr)
    }).catch(function (e) {
      /* 模型加载失败（路由没起、wasm 被 CSP 拦、内存不足）→ 留在肤色法 */
      S.lmState = 'fallback'
      S.lmError = String((e && e.message) || e)
      S.trackEngine = 'skin'
      if (C.faceDetect) startFaceDetect()
    })
  }

  /* 性能看门狗：网格模型跑不动就降级，绝不让动画陪着它卡。
     实测单帧耗时（跳过前两帧的预热）连续偏高时的处置顺序：
       1) GPU delegate 慢（虚拟显卡/软件渲染/老驱动）→ 换 CPU delegate 再试
       2) CPU 也慢（很老的机器）→ 退回肤色法，至少动画是流畅的 */
  var LM_SLOW_MS = 220

  function landmarkTooSlow(tr) {
    if (!tr || !tr.stats || tr.stats.calls < 5) return false
    return tr.stats.ms > LM_SLOW_MS
  }

  /* 采样间隔跟着实测耗时走：GPU delegate 下 90ms（~11Hz），
     CPU 兜底时放宽到 400ms（~2.5Hz），主线程占用始终压在 ~20% 以内。
     中间的空档由 HUD 每帧的 lerp 补，肉眼是连续的。 */
  function landmarkInterval(tr) {
    var ms = (tr.stats && tr.stats.ms) || 0
    return Math.max(90, Math.min(400, Math.round(ms * 6) || 120))
  }

  function startLandmarkLoop(tr) {
    if (S.lmTimer) { clearTimeout(S.lmTimer); S.lmTimer = 0 }
    var run = function () {
      if (S.done || !S.video || S.lmTracker !== tr) return
      S.lmTimer = setTimeout(run, landmarkInterval(tr))
      if (document.hidden) return
      var hit = null
      try { hit = tr.detect() } catch (e) { hit = null }
      var geo = T('kvGeo')
      if (hit) {
        S.trackHitAt = Date.now()
        S.lmMiss = 0
        /* 眼位直接来自眼睑/虹膜，不再靠裁图里找暗块 —— 第三幕的黑条因此能压在真眼上 */
        if (C.eyeTrack) {
          pushEye({
            vx: hit.eyes.vx, vy: hit.eyes.vy,
            span: hit.eyes.span, eh: hit.eyes.eh, conf: 1,
            /* 眼角四点：黑条靠它跟着歪头一起斜 */
            quad: hit.eyes.quad
          })
        }
        pushFace(mapToBox(hit.box.x, hit.box.y, hit.box.w, hit.box.h), agilityAlpha())
        if (geo) geo.textContent = 'X ' + (S.face.x * 100).toFixed(0) + ' · Y ' + (S.face.y * 100).toFixed(0)
        /* 第一次锁上时把「现在用的是哪套」写进遥测，排查时一眼能看出来 */
        if (!S.lmLogged) {
          S.lmLogged = true
          var telog = T('telog')
          if (telog) pushLog(telog, 'MESH', hit.points + ' PTS · ' + tr.backend, true)
        }
      } else if (S.trackHitAt && Date.now() - S.trackHitAt > 1200) {
        /* 1.2 秒没结果才回中：网格模型偶尔漏一两帧是正常的，别一惊一乍 */
        relaxFace(0.05)
        if (geo) geo.textContent = 'NO LOCK · FIXED'
        S.lmMiss = (S.lmMiss || 0) + 1
        /* 连续十几次都空 = 这个环境模型压根跑不动（畸变镜头、虚拟摄像头黑帧），
           别硬撑，退回肤色法并记下原因 */
        if (S.lmMiss >= 12) fallbackToSkin(tr)
      }
      if (landmarkTooSlow(tr)) degradeLandmark(tr)
    }
    run()
  }

  /* 太慢就降档：GPU → CPU → 肤色法。每次降档都先把肤色法接回来，
     这样中间那段「重新装载模型」的空窗里画面照样有框。 */
  function degradeLandmark(tr) {
    if (S.lmTracker !== tr) return
    var backend = tr && tr.backend
    var ms = tr && tr.stats ? Math.round(tr.stats.ms) : 0
    S.lmStats = { backend: backend, ms: ms }
    if (tr && tr.dispose) { try { tr.dispose() } catch (e) { /* noop */ } }
    S.lmTracker = null
    if (S.lmTimer) { clearTimeout(S.lmTimer); S.lmTimer = 0 }
    startSkinTrack()
    if (backend !== 'CPU' && !S.lmTriedCpu) {
      S.lmState = 'retry-cpu'
      S.lmLogged = false
      mountLandmark('CPU')
      return
    }
    S.lmState = 'slow'
    S.trackEngine = 'skin'
    var meta = T('camMeta')
    if (meta) meta.textContent = meta.textContent.replace(' · MESH', '')
  }

  function fallbackToSkin(tr) {
    if (tr && S.lmTracker !== tr) return
    if (S.lmTracker && S.lmTracker.dispose) {
      try { S.lmTracker.dispose() } catch (e) { /* noop */ }
    }
    S.lmTracker = null
    if (S.lmTimer) { clearTimeout(S.lmTimer); S.lmTimer = 0 }
    S.lmState = 'fallback'
    S.trackEngine = 'skin'
    S.lmLogged = false
    var meta = T('camMeta')
    if (meta) meta.textContent = meta.textContent.replace(' · MESH', '')
    startSkinTrack()
  }

  /* 第三幕起画面已经是静态档案照，追踪没用了：早点停，别白烧 CPU */
  function stopTracking() {
    if (S.lmTimer) { clearTimeout(S.lmTimer); S.lmTimer = 0 }
    if (S.trackTimer) { clearInterval(S.trackTimer); S.trackTimer = 0 }
    if (S.faceTimer) { clearInterval(S.faceTimer); S.faceTimer = 0 }
    if (S.lmTracker && S.lmTracker.dispose) {
      try { S.lmTracker.dispose() } catch (e) { /* noop */ }
    }
    S.lmTracker = null
  }

  /* 浏览器 FaceDetector：支持就叠在肤色追踪上面当更准的一路 */
  function startFaceDetect() {
    var FD = window.FaceDetector
    if (!FD || !S.video) return
    var detector = null
    try { detector = new FD({ fastMode: true, maxDetectedFaces: 1 }) } catch (e) { return }
    var run = function () {
      if (S.done || !S.video || !S.video.videoWidth) return
      var p = null
      try { p = detector.detect(S.video) } catch (e) { return }
      if (!p || !p.then) return
      p.then(function (faces) {
        if (!faces || !faces.length || S.done) return
        var f = faces[0].boundingBox
        var vw = S.video.videoWidth || 1
        var vh = S.video.videoHeight || 1
        if (!f || !vw || !vh) return
        S.faceDetHitAt = Date.now()
        pushFace(mapToBox(
          (f.x + f.width / 2) / vw,
          (f.y + f.height / 2) / vh,
          (f.width / vw) * 1.45,
          (f.height / vh) * 1.35
        ), 0.35)
      }).catch(function () { /* 单帧失败无所谓 */ })
    }
    S.faceTimer = every(420, run)
  }

  function stopCamera() {
    if (S.noiseTimer) { clearInterval(S.noiseTimer); S.noiseTimer = 0 }
    if (S.faceTimer) { clearInterval(S.faceTimer); S.faceTimer = 0 }
    if (S.trackTimer) { clearInterval(S.trackTimer); S.trackTimer = 0 }
    if (S.lmTimer) { clearTimeout(S.lmTimer); S.lmTimer = 0 }
    if (S.lmTracker && S.lmTracker.dispose) {
      try { S.lmTracker.dispose() } catch (e) { /* noop */ }
    }
    S.lmTracker = null
    if (S.tracker && S.tracker.dispose) {
      try { S.tracker.dispose() } catch (e) { /* noop */ }
    }
    S.tracker = null
    S.chkCanvas = null
    S.chkCtx = null
    S.camReq = null
    try {
      if (S.video) {
        S.video.pause()
        S.video.srcObject = null
      }
    } catch (e) { /* noop */ }
    try {
      if (S.stream) S.stream.getTracks().forEach(function (t) { t.stop() })
    } catch (e) { /* noop */ }
    S.stream = null
  }

  /* 把当前画面帧画进档案照（镜像与视频保持一致）。
     注意：第三幕开始时第二幕已经 visibility:hidden，某些浏览器会在这之后
     丢掉 video 的最后一帧，drawImage 拿到全黑。所以第二幕里要按节奏连续抓帧，
     到第三幕直接用已经抓到的那张，不再重抓。 */
  /* 摄像头刚通电那几百毫秒会吐黑帧。用一张 32×24 的小图先探一眼，
     确认不是黑帧再往档案照上画 —— 否则会把上一张好照片覆盖成黑的。 */
  function frameIsDark(src) {
    try {
      if (!S.chkCanvas) {
        S.chkCanvas = document.createElement('canvas')
        S.chkCanvas.width = 32
        S.chkCanvas.height = 24
        S.chkCtx = S.chkCanvas.getContext('2d', { willReadFrequently: true })
      }
      var c = S.chkCtx
      if (!c) return false
      c.drawImage(src, 0, 0, 32, 24)
      var d = c.getImageData(0, 0, 32, 24).data
      var sum = 0
      var n = 0
      for (var i = 0; i < d.length; i += 4) {
        sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
        n++
      }
      return n > 0 && sum / n < 7
    } catch (e) {
      return false
    }
  }

  function snapshot() {
    var cv = T('snap')
    if (!cv || !cv.getContext) return
    var g = cv.getContext('2d')
    var W = cv.width, H = cv.height
    var src = null
    try {
      if (S.sim) src = T('avatar')
      else if (S.stream && S.video && S.video.videoWidth > 0) src = S.video
    } catch (e) { src = null }
    if (!src && S.noiseTimer) {
      var noise = T('noise')
      if (noise) src = noise
    }
    if (!src) {
      /* 一路都没画面：画一个「无照片」剪影，别留一块死黑 */
      if (!S.snapOK) drawPlaceholder(g, W, H)
      return
    }
    /* 黑帧（摄像头刚通电 / 被系统占用）：这一轮什么都别动 */
    if (src === S.video && !S.sim && frameIsDark(src)) {
      if (!S.snapOK) drawPlaceholder(g, W, H)
      return
    }
    g.fillStyle = '#070b10'
    g.fillRect(0, 0, W, H)
    try {
      var sw = src.videoWidth || src.width || W
      var sh = src.videoHeight || src.height || H
      /* cover 裁切 */
      var scale = Math.max(W / sw, H / sh)
      var dw = sw * scale, dh = sh * scale
      g.save()
      if (C.camMirror && src === S.video) {
        g.translate(W, 0)
        g.scale(-1, 1)
      }
      g.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh)
      g.restore()
    } catch (e) {
      if (!S.snapOK) drawPlaceholder(g, W, H)
      return
    }
    applyDossierEyes()
    /* 档案照压一点对比，像被系统二次处理过 */
    try {
      var d = g.getImageData(0, 0, W, H)
      var px = d.data
      for (var i = 0; i < px.length; i += 4) {
        var l = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114
        l = (l - 128) * 1.25 + 128
        l = l < 0 ? 0 : (l > 255 ? 255 : l)
        px[i] = l * 0.94
        px[i + 1] = l * 0.98
        px[i + 2] = l * 1.04
      }
      g.putImageData(d, 0, 0)
    } catch (e) { /* noop */ }
    S.snapOK = true
  }

  /* 兜底剪影：没有摄像头权限时，档案照也不该是一块黑 */
  function drawPlaceholder(g, W, H) {
    g.fillStyle = '#080d13'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#131c26'
    var cx = W / 2
    g.beginPath()
    g.arc(cx, H * 0.40, W * 0.19, 0, Math.PI * 2)
    g.fill()
    g.beginPath()
    g.ellipse(cx, H * 0.78, W * 0.36, H * 0.26, 0, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#4a5f72'
    g.font = '9px ui-monospace, Consolas, monospace'
    g.textAlign = 'center'
    g.fillText('NO FEED AVAILABLE', cx, H - 12)
    S.snapOK = true
  }

  /* ── 字幕 ──────────────────────────────────────────────────────────────── */
  function hideSub(v) {
    var n = $('.ms-sub')
    if (n) n.style.display = v ? 'none' : ''
  }

  /* ── 打字机 ─────────────────────────────────────────────────────────────
     整段动画只用一条「输入链」：typeSeq 是世代号，换幕/换卡时 +1，
     旧的那条 interval 下一拍就发现世代变了、自己停手 ——
     不会出现上一幕的字继续打进下一幕的台词里。
     budgetMs 是这条链的预算：字符多、幕又短，就自动加快，
     宁可快一点也不让字幕拖到下一幕去。 */
  function typeInto(el, text, budgetMs, done, tok) {
    if (!el) { if (done) done(); return }
    text = String(text == null ? '' : text)
    if (tok == null) tok = ++S.typeSeq
    el.classList.remove('ms-typing')
    el.textContent = ''
    if (!text) { if (done) done(); return }
    if (!typingOn()) {
      /* 这一幕不逐字出：整行直接到位，也不挂光标 */
      el.textContent = text
      if (done) done()
      return
    }
    var n = text.length
    var base = Math.max(4, Number(C.typeSpeed) || 34)
    var per = base
    if (budgetMs > 0) per = Math.min(base, Math.max(9, Math.round(budgetMs / n)))
    el.textContent = text.charAt(0)
    el.classList.add('ms-typing')
    var i = 1
    var t = setInterval(function () {
      if (S.done || tok !== S.typeSeq) { clearInterval(t); return }
      i++
      el.textContent = text.slice(0, i)
      if (i >= n) {
        clearInterval(t)
        if (C.typeCursor === false) el.classList.remove('ms-typing')
        if (done) done()
      }
    }, per)
    S.timers.push(t)
  }

  /* 底部字幕：先打中文那行，再打大写小字那行，光标跟着走 */
  function setSubtitle(zh, en) {
    var z = T('subZh')
    var e = T('subEn')
    if (!z || !e) return
    var tok = ++S.typeSeq
    z.classList.remove('ms-typing')
    e.classList.remove('ms-typing')
    var budget = 1200
    typeInto(z, zh, budget * 0.56, function () {
      /* 光标只留在「正在输入」的那一行：两行同时闪太吵 */
      z.classList.remove('ms-typing')
      typeInto(e, en, budget * 0.42, null, tok)
    }, tok)
  }

  /* 第一幕的两张标题卡 */
  function hasCard2() {
    return !!(String(C.bootEn2 == null ? '' : C.bootEn2).trim() ||
      String(C.bootZh2 == null ? '' : C.bootZh2).trim())
  }

  function playStatementCard(idx, budgetMs) {
    var enEl = T('bootLineEn')
    var zhEl = T('bootLineZh')
    if (!enEl || !zhEl) return
    var en = fill(idx === 0 ? C.bootEn : C.bootEn2)
    var zh = fill(idx === 0 ? C.bootZh : C.bootZh2)
    var tok = ++S.typeSeq
    enEl.classList.remove('ms-typing')
    zhEl.classList.remove('ms-typing')
    enEl.textContent = ''
    zhEl.textContent = ''
    typeInto(enEl, en, budgetMs * 0.66, function () {
      enEl.classList.remove('ms-typing')
      typeInto(zhEl, zh, budgetMs * 0.34, null, tok)
    }, tok)
  }

  function pushLog(host, label, value, hot) {
    if (!host) return
    var row = el('div', 'ms-l')
    row.appendChild(el('b', null, label))
    var v = el(hot ? 'em' : 'span', null, value)
    row.appendChild(v)
    host.appendChild(row)
    while (host.children.length > 6) host.removeChild(host.firstChild)
  }

  /* ── 每一幕 ────────────────────────────────────────────────────────────── */
  function showAct(id) {
    /* 第一幕是「纯黑 + 一句话」，把 HUD 装饰全收掉（见 splash.css 的 .ms-act1） */
    try { S.root.classList.toggle('ms-act1', id === 'boot') } catch (e) { /* noop */ }
    var acts = S.root.querySelectorAll('.ms-act')
    for (var i = 0; i < acts.length; i++) {
      if (acts[i].getAttribute('data-act') === id) acts[i].classList.add('on')
      else acts[i].classList.remove('on')
    }
    var idx = 0
    for (var j = 0; j < ACTS.length; j++) if (ACTS[j].id === id) idx = j
    var step = T('step')
    if (step) step.textContent = pad2(idx + 1) + ' / ' + pad2(ACTS.length)
    S.act = idx
    S.actId = id
    /* 模拟画面是在第一幕（取景框可能还没尺寸）就画好的，
       换幕后量一次真实尺寸重画，免得被 CSS 拉伸糊掉。 */
    if (S.sim) after(90, function () { drawAvatarFrame() })
  }

  function setState(st) {
    if (!S.root) return
    S.root.classList.remove('st-scanning', 'st-analyzing', 'st-verified')
    if (st) S.root.classList.add('st-' + st)
    var label = { scanning: 'SCANNING', analyzing: 'ANALYZING', verified: 'VERIFIED' }[st]
    var tn = T('telstate')
    if (tn && label) tn.textContent = label
    var sb = T('kvStatus')
    if (sb && label) {
      sb.textContent = label
      sb.className = st === 'analyzing' ? 'ms-warn' : (st === 'verified' ? 'ms-hot' : '')
    }
  }

  function runAct(i) {
    if (i >= ACTS.length) { finish(); return }
    var A = ACTS[i]
    var d = dur(A.dur)
    var zh = fill(C[A.zh])
    var en = fill(C[A.en])

    /* 本幕看门狗：这一幕卡死（异常或定时器被吞掉）也要放行，再给 9 秒余量。
       1.2.4 起没有人声播报，幕长就是 d —— 不再需要为「等这句念完」留延长量。 */
    armWatchdog(d + 9000)
    showAct(A.id)
    setProgress(i / ACTS.length)
    if (A.sub === false) {
      hideSub(true)
      setSubtitle('', '')
    } else {
      hideSub(false)
      setSubtitle(zh, en)
    }

    /* 先把「下一幕」的推进器挂好，再跑本幕布景：
       本幕里任何一行抛异常都不会把整条幕链掐断（后面几幕消失的来源之一）。 */
    after(d, function () { runAct(i + 1) })

    try {

    if (A.id === 'boot') {
      var log = T('bootlog')
      if (log) log.innerHTML = ''
      after(80, function () { pushLog(log, 'POWER', '120V AC OK', true) })
      after(300, function () { pushLog(log, 'CORE', '4,096 NODES OK') })
      after(560, function () { pushLog(log, 'MEMORY', '1.2 EB OK') })
      after(820, function () { pushLog(log, 'FEEDS', '13,405 / 13,405 OK') })
      after(1080, function () { pushLog(log, 'CAMERA', C.camera ? 'REQUESTING ACCESS' : 'DISABLED', true) })
      if (C.sound) after(60, function () { sfx.sweep() })

      /* 两张标题卡轮流念：第一张占前一半，第二张占后一半。
         每张卡自己的输入预算按剩余时间算，所以 actBoot 调短也不会截断。 */
      var half = d * 0.5
      playStatementCard(0, half * 0.82)
      if (hasCard2()) {
        after(half, function () {
          var st = $('.ms-statement')
          if (!st) { playStatementCard(1, half * 0.82); return }
          st.classList.add('ms-swap')
          after(170, function () {
            playStatementCard(1, half * 0.82)
            st.classList.remove('ms-swap')
          })
        })
      }
    }

    if (A.id === 'scan') {
      var telog = T('telog')
      if (telog) telog.innerHTML = ''
      setState('scanning')
      /* 取景框出场：1.5 倍缩到 1 + 白框闪一下，都是 hud.js 的规矩 */
      spawnReticle()
      after(d * 0.04, function () { pushLog(telog, 'SCAN', 'BIOMETRIC SWEEP', true) })
      after(d * 0.26, function () { pushLog(telog, 'FACE', 'GEOMETRY LOCKED') })
      after(d * 0.42, function () {
        setState('analyzing')
        /* white_red = 白边 + 红角 + 长刻度：正在判定、还没定性。
           换样式自带 75ms 交替闪（上游节奏）。
           注：不用 black_yellow —— 那是给亮画面用的，黑边落在我们这种压暗的
           监控画面上等于没有边。 */
        if (S.reticle) S.reticle.setStyle('white_red')
        pushLog(telog, 'ANALYZE', 'FACIAL GEOMETRY', true)
      })
      /* 置信度爬升 */
      var target = C.prob / 100
      var t0 = Date.now()
      var probEl = T('kvProb')
      var barEl = T('probbar')
      S.probTimer = every(60, function () {
        var p = Math.min(1, (Date.now() - t0) / (d * 0.86))
        var v = target * (0.16 + 0.84 * p) * (0.985 + Math.random() * 0.02)
        v = Math.min(target, v)
        if (probEl) probEl.textContent = v.toFixed(3)
        if (barEl) barEl.style.width = (v * 100).toFixed(1) + '%'
      })
      after(d * 0.66, function () {
        pushLog(telog, 'CROSS', 'MATCHING RECORDS')
        pushLog(telog, 'PROB', (C.prob / 100).toFixed(3), true)
      })
      after(d * 0.86, function () {
        setState('verified')
        if (C.sound) sfx.lock()
        if (S.reticle) S.reticle.setStyle(lockStyle())
        pushLog(telog, 'LOCK', 'SUBJECT ACQUIRED', true)
      })
      /* 这一幕里持续抓帧给第三幕的档案照用（视频一旦被隐藏就抓不到了） */
      S.snapOK = false
      every(380, function () { snapshot() })
    }

    if (A.id === 'match') {
      /* 换幕别把取景框/黑条瞬间抹掉：.ms-act 有 0.34s 的淡出，
         这里让 reticle 走 remove() 的 0.3s 淡出，条和框一起淡走；
         380ms 后再清引用（那时第二幕已经完全不可见）。 */
      if (S.reticle && typeof S.reticle.remove === 'function') S.reticle.remove()
      if (!S.snapOK) snapshot()
      applyDossierEyes()
      /* 第三幕刚显示时再补两拍：等布局稳定 / 照片画完后重新摆一次，
         避免首帧算出来为空或位置不对。 */
      after(60, function () { applyDossierEyes() })
      after(380, function () {
        applyDossierEyes()
        S.reticle = null
      })
      /* 档案照已经成型，追踪到此为止 */
      stopTracking()
      if (C.sound) after(40, function () { sfx.tick() })
    }

    if (A.id === 'access') {
      if (C.sound) after(40, function () { sfx.grant() })
    }

    if (A.id === 'handoff') {
      if (S.root) S.root.classList.add('ms-final')
    }

    } catch (e) {
      /* 单幕布景异常只影响这一幕的装饰，不掐断幕链 */
      try {
        if (window.console && console.warn) console.warn('[dsh-startup-machine] 本幕布景出错（不影响后续幕）：', e && e.message)
      } catch (e2) { /* noop */ }
    }
  }

  function setProgress(p) {
    var bar = T('progressbar')
    if (bar) bar.style.width = Math.max(0, Math.min(100, p * 100)).toFixed(1) + '%'
  }

  /* 进度条按真实时间走，不按幕跳 —— 读起来更「在跑」 */
  function startProgress() {
    S.startedAt = Date.now()
    S.total = totalMs()
    every(80, function () {
      var p = Math.min(1, (Date.now() - S.startedAt) / S.total)
      setProgress(p)
    })
  }

  /* ── 跳过 / 收尾 ───────────────────────────────────────────────────────── */
  function finish(skipped) {
    if (S.done) return
    S.done = true
    clearTimers()
    stopCamera()
    for (var i = 0; i < S.rafs.length; i++) {
      try { cancelAnimationFrame(S.rafs[i]) } catch (e) { /* noop */ }
    }
    S.rafs.length = 0
    detachKeys()
    var root = S.root
    try {
      if (root) {
        root.classList.add('ms-out')
        setTimeout(function () {
          try {
            if (root && root.parentNode) root.parentNode.removeChild(root)
          } catch (e) { /* noop */ }
          unlock()
        }, skipped ? 180 : 420)
      } else {
        unlock()
      }
    } catch (e) { unlock() }
    S.root = null
    S.video = null
  }

  function unlock() {
    try {
      document.documentElement.classList.remove('ms-lock')
      /* 遮罩期间把 html 压成了黑底，收场要还回去 */
      document.documentElement.style.removeProperty('background')
      if (document.body && document.body.style) document.body.style.overflow = ''
    } catch (e) { /* noop */ }
  }

  function requestSkip() {
    if (S.done) return
    if (C.sound) sfx.tick()
    finish(true)
  }

  function detachKeys() {
    if (S.keyHandler) {
      document.removeEventListener('keydown', S.keyHandler, true)
      S.keyHandler = null
    }
    if (S.clickHandler) {
      document.removeEventListener('click', S.clickHandler, true)
      S.clickHandler = null
    }
  }

  function attachKeys() {
    S.keyHandler = function (e) {
      if (!C.allowSkip) return
      var k = e.key
      if (k === 'Escape' || k === 'Esc' || k === ' ' || k === 'Enter') {
        try { e.preventDefault(); e.stopPropagation() } catch (err) { /* noop */ }
        requestSkip()
      }
    }
    document.addEventListener('keydown', S.keyHandler, true)

    var skipBtn = T('skip')
    if (skipBtn) {
      skipBtn.addEventListener('click', function (e) {
        try { e.stopPropagation() } catch (err) { /* noop */ }
        requestSkip()
      })
      /* 键盘可达 */
      skipBtn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          try { e.preventDefault(); e.stopPropagation() } catch (err) { /* noop */ }
          requestSkip()
        }
      })
    }
  }

  /* ── 启动 ──────────────────────────────────────────────────────────────── */
  function boot() {
    S.done = false
    build()
    try {
      document.documentElement.classList.add('ms-lock')
      if (document.body && document.body.style) document.body.style.overflow = 'hidden'
    } catch (e) { /* noop */ }
    attachKeys()
    /* 摄像头在第一时间请求：授权弹窗出来时观众还在看第一幕，不耽误第二幕 */
    startCamera()
    startProgress()
    runAct(0)
    /* 只有用户显式设了「强制跳过」才装全局硬切；否则靠每幕的看门狗兜底，
       这样改长任何一幕都不会被一个「开场时算好的总时长」提前切断。 */
    if (Number(C.hardStopMs) > 0) after(hardStopMs(), function () { finish(true) })
  }

  function replay(over) {
    /* 上次预览可能改过 C，先按「覆盖」或「Host 注入的原值」重读一次 */
    C = readCfg(over)
    if (S.root) {
      try {
        var old = S.root
        S.root = null
        if (old.parentNode) old.parentNode.removeChild(old)
      } catch (e) { /* noop */ }
    }
    clearTimers()
    stopCamera()
    detachKeys()
    S.done = true
    setTimeout(function () {
      S.timers.length = 0
      boot()
    }, 60)
  }

  window.__DSH_MACHINE_API__ = {
    replay: replay,
    /* 面板可以把草稿配置直接传进来预览，不必先保存 */
    previewConfig: function (over) { replay(over) },
    skip: requestSkip,
    finish: function () { finish(true) },
    /* 排障用：追踪/摄像头到底跑到哪一步了 */
    state: function () {
      return {
        act: S.act,
        face: { x: S.face.x, y: S.face.y, w: S.face.w, h: S.face.h },
        tracking: !!S.trackTimer,
        trackHitAt: S.trackHitAt,
        faceDetHitAt: S.faceDetHitAt,
        faceTrack: C.faceTrack,
        faceEngine: C.faceEngine,
        sim: !!S.sim,
        simError: S.simError || '',
        hardStopMs: hardStopMs(),
        totalMs: totalMs(),
        typeActs: C.typeActs,
        trackEngine: S.trackEngine,
        lmState: S.lmState,
        lmError: S.lmError,
        lmMs: S.lmTracker && S.lmTracker.stats ? Math.round(S.lmTracker.stats.ms * 10) / 10 : 0,
        lmCalls: S.lmTracker && S.lmTracker.stats ? S.lmTracker.stats.calls : 0,
        lmBackend: S.lmTracker ? S.lmTracker.backend : '',
        trackMode: S.trackMode,
        gpu: S.gpuRenderer,
        boxStyle: S.reticle ? S.reticle.style : '',
        boxLabel: S.reticle ? S.reticle.label : '',
        cam: [S.camW, S.camH],
        hudBox: S.reticle ? S.reticle.box.slice() : null,
        hudTarget: S.reticle && S.reticle.target ? S.reticle.target.slice() : null,
        face: [S.face.x, S.face.y, S.face.w, S.face.h],
        ft: typeof window.MSFaceTrack,
        stream: !!S.stream,
        camError: S.camError,
        eye: S.eye,
        eyeFresh: !!S.eye && (Date.now() - S.eyeAt) < 1200,
        eyeBar: S.eyeBar,
        eyeAngle: S.eyeBar && S.eyeBar.angle ? Math.round(S.eyeBar.angle * 1800 / Math.PI) / 10 : 0,
        eyeQuad: !!(S.eye && S.eye.quad),
        secure: secureContext(),
        protocol: pageProtocol(),
        hasApi: hasCamApi(),
        readyState: S.video ? S.video.readyState : -1,
        videoWidth: S.video ? S.video.videoWidth : 0
      }
    },
    config: C
  }

  /* 页面已经被 Host 判定为「这次不播」就别自嗨 */
  if (window.__DSH_MACHINE_SKIP__ === true) {
    unlock()
    return
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { boot() }, { once: true })
  } else {
    boot()
  }
})()
