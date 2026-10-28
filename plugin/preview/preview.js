/* ============================================================================
 * 独立预览页的引导脚本
 * ----------------------------------------------------------------------------
 * 作用：在 splash.js 之前把配置写进 window.__DSH_MACHINE_STARTUP__，再加载运行时。
 * 这样不装进 DSH 也能看完整效果 —— 调字幕、调黑条位置、试摄像头清晰度都在这里做，
 * 满意了再去设置页填同样的值。
 * ========================================================================== */
(function () {
  'use strict'

  var KEY = 'ms-preview-cfg'

  /* 独立预览的默认配置：与 Host 侧 DEFAULTS 一致，个别字段换成预览友好值 */
  var BASE = {
    enabled: true,
    mode: 'always',
    speed: 1,
    allowSkip: true,
    actBoot: 1200,
    actScan: 3000,
    actMatch: 1400,
    actAccess: 1200,
    actHandoff: 700,
    sound: true,
    soundVolume: 0.5,
    typewriter: true,
    typeActs: 'match,access,handoff',
    typeSpeed: 34,
    typeCursor: true,
    hardStopMs: 0,
    camera: true,
    camWidth: 640,
    camMirror: true,
    camSat: 22,
    camCon: 130,
    camBright: 82,
    avatarOnNoCam: true,
    avatar: '',
    avatarBox: '49,44,36,34',
    faceTrack: true,
    faceEngine: 'auto',
    trackGpu: true,
    trackAgility: 5,
    boxStyle: 'auto',
    boxLabel: true,
    faceDetect: false,
    faceX: 50,
    faceY: 44,
    faceW: 34,
    faceH: 46,
    mosaic: true,
    mosaicBlocks: 1,
    mosaicWidth: 96,
    eyeTrack: true,
    mosaicEyeScale: 1.75,
    mosaicEyeThick: 2.2,
    eyeSmooth: 6,
    mosaicHeight: 16,
    mosaicOffset: 33,
    mosaicGap: 3,
    mosaicJitter: true,
    identity: 'Low_Entropy',
    identityId: '114514',
    status: 'ASSET',
    prob: 93,
    accessLevel: 'D',
    camId: 'CAM_017',
    brand: 'THE MACHINE',
    brandSub: 'DEEPSEEK HARNESS',
    footer: 'THE MACHINE WATCHES · DEEPSEEK HARNESS',
    bootZh: '你正被监视着。',
    bootEn: 'YOU ARE BEING WATCHED.',
    bootZh2: '我知道，因为它是被我做出来的。',
    bootEn2: 'I KNOW, BECAUSE I BUILT IT.',
    bootList: "SYSTEM_STARTUP\nLOADING:\nCORE ANALYTICS\nNEURAL NETWORKS\nHEURISTIC ENGINES\nRECOGNITION PROCESSORS\nEVOLUTIONARY GENERATORS\nINVASION NETWORKS\nCODE SYNTHESIS\nCRYPTOGRAPHIC ALGORITHMS\nDOCUMENT PROCESSORS\nCOMPUTATIONAL LINGUISTICS\nVOICEPRINT IDENTIFICATION",
    scanZh: '身份扫描中',
    scanEn: 'SCANNING BIOMETRIC SIGNATURE',
    matchZh: '识别完成',
    matchEn: 'MATCH CONFIRMED',
    accessZh: '权限已授予',
    accessEn: 'ACCESS GRANTED',
    handoffZh: '欢迎 {name}',
    handoffEn: 'WELCOME, {name}',
    accent: '#f2f2f2',
    warn: '#d9a406',
    alert: '#e5484d'
  }

  function readOverride() {
    try {
      var raw = localStorage.getItem(KEY)
      return raw ? JSON.parse(raw) : null
    } catch (e) { return null }
  }

  var override = readOverride()
  var cfg = {}
  for (var k in BASE) if (Object.prototype.hasOwnProperty.call(BASE, k)) cfg[k] = BASE[k]
  if (override && typeof override === 'object') {
    for (var k2 in override) cfg[k2] = override[k2]
  }
  window.__DSH_MACHINE_STARTUP__ = cfg

  /* 运行时必须在配置之后加载 */
  var s = document.createElement('script')
  s.src = '../lib/splash.js'
  s.async = false
  ;(document.head || document.documentElement).appendChild(s)

  /* ── 工具条 ────────────────────────────────────────────────────────────── */
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true })
    else fn()
  }

  ready(function () {
    var API = function () { return window.__DSH_MACHINE_API__ }

    byId('btn-replay').addEventListener('click', function () {
      var api = API()
      if (api && api.replay) api.replay()
      else location.reload()
    })

    byId('btn-skip').addEventListener('click', function () {
      var api = API()
      if (api && api.skip) api.skip()
    })

    var panel = byId('cfg')
    var text = byId('cfg-text')
    byId('btn-cfg').addEventListener('click', function () {
      var open = panel.classList.toggle('open')
      if (open) {
        text.value = JSON.stringify(override && Object.keys(override).length ? override : {}, null, 2)
      }
    })
    byId('cfg-reset').addEventListener('click', function () {
      try { localStorage.removeItem(KEY) } catch (e) { /* noop */ }
      location.reload()
    })
    byId('cfg-apply').addEventListener('click', function () {
      var v = {}
      try {
        v = text.value.trim() ? JSON.parse(text.value) : {}
      } catch (e) {
        alert('JSON 解析失败：' + e.message)
        return
      }
      try { localStorage.setItem(KEY, JSON.stringify(v)) } catch (e) { /* noop */ }
      location.reload()
    })

    /* 一次性申请摄像头，避免每次重播都弹授权 */
    byId('btn-camera').addEventListener('click', function () {
      var md = navigator.mediaDevices
      if (!md || !md.getUserMedia) { alert('这个页面拿不到 getUserMedia（需要 https 或 localhost）'); return }
      md.getUserMedia({ video: true, audio: false })
        .then(function (st) {
          st.getTracks().forEach(function (t) { t.stop() })
          alert('摄像头权限已拿到。现在点「重播」看第二幕。')
        })
        .catch(function (e) {
          alert('被拒绝了或没有设备：' + e.name + '\n第二幕会降级成噪点 + 纯 HUD，不影响动画。')
        })
    })
  })

  function byId(id) { return document.getElementById(id) }
})()
