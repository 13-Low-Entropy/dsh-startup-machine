/* ============================================================================
 * dsh-startup-machine — Host 半侧
 * ----------------------------------------------------------------------------
 * 做三件事：
 *   1) 在 index.html 里注入启动层：首屏兜底黑幕 + 关键 CSS + 配置 + 运行时
 *   2) 提供 /machine-startup/splash.css · splash.js · config 三个路由
 *   3) 配置持久化到 ~/.dsh/dsh-startup-machine.json（设置页读写 config 路由）
 *
 * 配置刻意不走 settings 命名空间：自带 JSON + 自带设置面板，不受
 * dsh-settings 版本变更影响（与 dsh-startup-screen / dsh-meme 同款做法）。
 * ========================================================================== */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const CONFIG_FILE = path.join(DSH_HOME, 'dsh-startup-machine.json')

const NS = 'dsh-startup-machine'
const ROUTE_BASE = '/machine-startup'

const PLUGIN_VERSION = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'))
    const v = String(pkg.version || '').trim()
    return v || '0.0.0'
  } catch (err) {
    return '0.0.0'
  }
})()

/** 默认配置：与 lib/splash.js 的 DEFAULTS 逐字段对应。 */
const DEFAULTS = {
  /* 播放 */
  enabled: true,
  mode: 'session',
  speed: 1,
  allowSkip: true,
  /* 每幕时长（毫秒），五幕默认合计 7500ms */
  actBoot: 1200,
  actScan: 3000,
  actMatch: 1400,
  actAccess: 1200,
  actHandoff: 700,

  /* 音效（WebAudio 当场合成，不带音频文件）。1.2.4 起不再有 TTS 人声播报。 */
  sound: true,
  soundVolume: 0.5,

  /* 字幕 */
  typewriter: true,
  /* 哪几幕用逐字输入（幕 id，逗号分隔；留空=全部都用）。默认只给后三幕。 */
  typeActs: 'match,access,handoff',
  typeSpeed: 34,
  typeCursor: true,

  /* 强制跳过：0 = 跟随各幕合计（合计 + 9 秒余量）；>0 = 固定毫秒，但不小于合计 */
  hardStopMs: 0,

  /* 摄像头 */
  camera: true,
  camWidth: 640,
  camMirror: true,
  camSat: 22,
  camCon: 130,
  camBright: 82,
  faceTrack: true,
  faceEngine: 'auto',
  trackGpu: true,
  trackAgility: 5,
  boxStyle: 'auto',
  boxLabel: true,
  faceDetect: false,
  /* 没有摄像头时用的模拟头像：'' = 用包内 assets/avatar/default.jpg */
  avatarOnNoCam: true,
  avatar: '',
  avatarBox: '49,44,36,34',      // 头像里「人脸」的位置：x,y,w,h（百分比）
  faceX: 50,
  faceY: 44,
  faceW: 34,
  faceH: 46,

  /* 眼部马赛克 */
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

  /* 身份 */
  identity: 'Low_Entropy',
  identityId: '114514',
  status: 'ASSET',
  prob: 93,
  accessLevel: 'D',
  camId: 'CAM_017',
  brand: 'THE MACHINE',
  brandSub: 'DEEPSEEK HARNESS',
  footer: 'THE MACHINE WATCHES · DEEPSEEK HARNESS',

  /* 字幕 */
  bootZh: '你正被监视着。',
  bootEn: 'YOU ARE BEING WATCHED.',
  bootZh2: '我知道，因为它是被我做出来的。',
  bootEn2: 'I KNOW, BECAUSE I BUILT IT.',
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

const BOOL_KEYS = [
  'enabled', 'allowSkip', 'sound',
  'camera', 'camMirror', 'faceTrack', 'trackGpu', 'boxLabel', 'faceDetect', 'mosaic', 'mosaicJitter',
  'eyeTrack', 'typewriter', 'typeCursor', 'avatarOnNoCam'
]
const INT_KEYS = ['actBoot', 'actScan', 'actMatch', 'actAccess', 'actHandoff', 'mosaicBlocks', 'mosaicGap', 'prob', 'typeSpeed', 'hardStopMs']
const COLOR_KEYS = ['accent', 'warn', 'alert']
const TEXT_KEYS = [
  'identity', 'identityId', 'accessLevel', 'camId', 'brand', 'brandSub', 'footer',
  'bootZh', 'bootEn', 'bootZh2', 'bootEn2', 'bootList',
  'typeActs', 'avatar', 'avatarBox',
  'scanZh', 'scanEn',
  'matchZh', 'matchEn',
  'accessZh', 'accessEn',
  'handoffZh', 'handoffEn'
]
const ENUMS = {
  mode: ['always', 'session', 'daily'],
  faceEngine: ['auto', 'landmark', 'skin'],
  status: ['ASSET', 'ADMIN', 'THREAT', 'IRRELEVANT', 'CONTINGENCY'],
  boxStyle: ['auto', 'white', 'yellow', 'blue', 'red', 'black_yellow', 'white_red'],
  camWidth: [320, 640, 1280]
}
const RANGES = {
  speed: [0.4, 2.5],
  actBoot: [300, 12000],
  actScan: [600, 20000],
  actMatch: [300, 12000],
  actAccess: [300, 12000],
  actHandoff: [200, 8000],
  soundVolume: [0, 1],
  camSat: [0, 140],
  camCon: [60, 220],
  camBright: [30, 150],
  trackAgility: [1, 10],
  faceX: [8, 92],
  faceY: [8, 92],
  faceW: [10, 92],
  faceH: [10, 92],
  mosaicBlocks: [1, 25],
  mosaicWidth: [20, 100],
  mosaicEyeScale: [0.5, 4],
  mosaicEyeThick: [0.5, 4],
  eyeSmooth: [1, 10],
  mosaicHeight: [4, 34],
  mosaicOffset: [0, 86],
  mosaicGap: [0, 8],
  prob: [50, 100],
  typeSpeed: [4, 120],
  hardStopMs: [0, 120000]
}

function normalize(input) {
  const out = { ...DEFAULTS }
  const src = input && typeof input === 'object' ? input : {}
  for (const key of Object.keys(DEFAULTS)) {
    if (!(key in src) || src[key] === undefined || src[key] === null) continue
    const value = src[key]
    if (BOOL_KEYS.includes(key)) {
      out[key] = value === true || value === 'true' || value === 1 || value === '1'
    } else if (ENUMS[key]) {
      if (key === 'camWidth') {
        const n = Number(value)
        out[key] = ENUMS[key].includes(n) ? n : DEFAULTS[key]
      } else {
        out[key] = ENUMS[key].includes(value) ? value : DEFAULTS[key]
      }
    } else if (RANGES[key]) {
      const [lo, hi] = RANGES[key]
      const n = Number(value)
      out[key] = Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : DEFAULTS[key]
      if (INT_KEYS.includes(key)) out[key] = Math.round(out[key])
    } else if (COLOR_KEYS.includes(key)) {
      const s = String(value).trim()
      out[key] = /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : DEFAULTS[key]
    } else if (TEXT_KEYS.includes(key)) {
      /* bootList 是一整列系统名，允许比单句文案长 */
      out[key] = String(value).slice(0, key === 'bootList' ? 800 : 120)
    } else {
      out[key] = value
    }
  }
  if (!String(out.identity).trim()) out.identity = DEFAULTS.identity
  if (!String(out.identityId).trim()) {
    out.identityId = String(out.identity).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'OPERATOR'
  }
  if (!String(out.camId).trim()) out.camId = DEFAULTS.camId
  return out
}

function readConfig() {
  try {
    return normalize(JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')))
  } catch (err) {
    return { ...DEFAULTS }
  }
}

function writeConfig(next) {
  const cfg = normalize(next)
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
  const tmp = CONFIG_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf8')
  fs.renameSync(tmp, CONFIG_FILE)
  return cfg
}

/** 静态文件按 mtime 缓存：改完插件刷新页面即生效。 */
function makeReader(rel) {
  let cache = null
  return function read() {
    const file = path.join(PACKAGE_ROOT, rel)
    try {
      const st = fs.statSync(file)
      if (!cache || cache.mtimeMs !== st.mtimeMs) {
        cache = { mtimeMs: st.mtimeMs, text: fs.readFileSync(file, 'utf8') }
      }
      return cache.text
    } catch (err) {
      return ''
    }
  }
}

const readSplashCss = makeReader('lib/splash.css')
const readSplashJs = makeReader('lib/splash.js')
const readFaceTrack = makeReader('lib/face-track.js')
const readFaceTrackGl = makeReader('lib/face-track-gl.js')
const readHudDraw = makeReader('lib/hud-draw.js')
const readEyeTrack = makeReader('lib/eye-track.js')
const readFaceLandmark = makeReader('lib/face-landmark.js')

/**
 * MediaPipe 的 wasm / 模型是二进制，不能按 utf8 读（一个字节错就整块报废），
 * 所以单开一个按 mtime 缓存的 Buffer 读取器。文件不在（精简安装）就返回 null，
 * 路由回 404，前端自动退回肤色追踪 —— 缺资源只是降级，不是故障。
 */
function makeBinReader(rel) {
  let cache = null
  return function read() {
    const file = path.join(PACKAGE_ROOT, rel)
    try {
      const st = fs.statSync(file)
      if (!cache || cache.mtimeMs !== st.mtimeMs || cache.size !== st.size) {
        cache = { mtimeMs: st.mtimeMs, size: st.size, buf: fs.readFileSync(file) }
      }
      return cache.buf
    } catch (err) {
      return null
    }
  }
}
const readAvatar = makeBinReader('assets/avatar/default.jpg')
const readMpBundle = makeBinReader('assets/mp/vision_bundle.mjs')
const readMpModel = makeBinReader('assets/mp/face_landmarker.task')
const readMpWasmJs = makeBinReader('assets/mp/wasm/vision_wasm_internal.js')
const readMpWasm = makeBinReader('assets/mp/wasm/vision_wasm_internal.wasm')

/** 内联脚本里绝对不能出现 `</script>`。 */
function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '')
}

/** 首屏兜底：应用挂载前先把窗口盖住，避免闪出界面本体。 */
/* 遮罩的内联样式：不依赖任何外部 CSS，插上即黑 */
const MASK_INLINE = 'position:fixed;left:0;top:0;width:100%;height:100%;margin:0;padding:0;' +
  'background:#000;z-index:2147483000;overflow:hidden;display:block'

const CRITICAL_CSS = [
  /* 锁屏期间 html/body 一起压黑：只盖住 root 的话，滚动条槽和圆角处会露浅色 */
  'html.ms-lock,html.ms-lock body{overflow:hidden!important;background:#000!important}',
  '#machine-startup-root.ms-root{position:fixed;inset:0;z-index:2147483000;background:#000}'
].join('')

/**
 * 首屏判定：mode=session/daily 时先看标记再决定播不播。
 * 兜底看门狗按 18 秒算 —— 默认 7.5 秒的序列 + 摄像头授权弹窗 + 慢机，
 * 留足余量；真卡住了也绝不留黑屏。
 */
const BOOTSTRAP_JS = `(function(){try{
var c=window.__DSH_MACHINE_STARTUP__||{};
var root=document.getElementById('machine-startup-root');
var off=!c.enabled;
var sp=c.speed>0?c.speed:1;
var tot=((c.actBoot||1200)+(c.actScan||3000)+(c.actMatch||1400)+(c.actAccess||1200)+(c.actHandoff||700))/sp;
var hs=(c.hardStopMs>0)?Math.max(1200,c.hardStopMs):tot+9000;
/* 这里只是「页面彻底卡死」的最后兜底，不该比动画本身更早收场：
   以前它按开场算好的总时长装定时器，幕一改长就把后面几幕整屏拿掉了。
   现在给足余量（至少 30 秒），提前收场交给启动器自己的每幕看门狗。 */
if(!(hs>1000))hs=30000;
hs=Math.max(hs,30000);
if(!off&&c.mode==='session'&&sessionStorage.getItem('dsh-startup-machine:shown')==='1')off=true;
if(!off&&c.mode==='daily'&&localStorage.getItem('dsh-startup-machine:day')===new Date().toISOString().slice(0,10))off=true;
if(off){window.__DSH_MACHINE_SKIP__=true;if(root&&root.parentNode)root.parentNode.removeChild(root);}
else{
  document.documentElement.classList.add('ms-lock');
  if(c.mode==='session')try{sessionStorage.setItem('dsh-startup-machine:shown','1')}catch(e){}
  if(c.mode==='daily')try{localStorage.setItem('dsh-startup-machine:day',new Date().toISOString().slice(0,10))}catch(e){}
  /* 兜底：连 splash.js 都没跑起来（404/被拦/语法错）时无条件放行，绝不锁黑屏 */
  setTimeout(function(){try{var r=document.getElementById('machine-startup-root');if(r&&r.className&&r.className.indexOf('ms-boot')!==-1&&!window.__DSH_MACHINE_API__){if(r.parentNode)r.parentNode.removeChild(r);document.documentElement.classList.remove('ms-lock');if(document.body)document.body.style.overflow='';window.__DSH_MACHINE_FAILED__=true;}}catch(e){}},hs);
}
}catch(e){} })()`

const name = NS
const inject = ['webServer', 'connection']

/**
 * 取 HTTP 载体。web profile 与桌面端都会挂 @deepseek-ai/dsh-web-app；
 * Electron 可能改成 file:// + IPC 下发前端，那时没有 webServer，
 * 本插件不该炸一颗 fiber —— 交给客户端半侧自举（lib/client.js）。
 */
function resolveWebServer(ctx) {
  try {
    const viaGet = typeof ctx.get === 'function' ? ctx.get('webServer') : undefined
    if (viaGet) return viaGet
  } catch (err) { /* 取不到就当没有 */ }
  return ctx.webServer
}

function hasRoutes(server) {
  return !!server && typeof server.register === 'function' && typeof server.tapIndex === 'function'
}

function apply(ctx) {
  const disposers = []
  const webServer = resolveWebServer(ctx)

  if (!hasRoutes(webServer)) {
    try {
      ctx.logger?.warn?.(
        '[' + NS + '] 当前 profile 没有可用 webServer（桌面端可能用 file:// + IPC 下发前端）；' +
        'Host 半侧跳过路由与首屏注入，改由浏览器半侧自举启动界面。'
      )
    } catch (err) { /* 日志失败不影响加载 */ }
    return
  }

  /** 浏览器信任栅栏：自定义路由必须过一遍，否则可被任意网页读写配置。 */
  function rejected(req, res) {
    try {
      const conn = (typeof ctx.get === 'function' ? ctx.get('connection') : undefined) || ctx.connection
      if (!conn || typeof conn.requestRejection !== 'function') return false
      const code = conn.requestRejection(req)
      if (code === undefined || code === null || code === false) return false
      res.statusCode = typeof code === 'number' ? code : 403
      res.end()
      return true
    } catch (err) {
      return false
    }
  }

  function registerRoute(route) {
    const inner = route && route.handler
    const wrapped = Object.assign({}, route, {
      handler: async (req, res) => {
        if (rejected(req, res)) return
        return inner(req, res)
      }
    })
    return webServer.register(wrapped)
  }

  function sendJson(res, code, payload) {
    const body = Buffer.from(JSON.stringify(payload), 'utf8')
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': String(body.length)
    })
    res.end(body)
  }

  function readBody(req, limit = 96 * 1024) {
    return new Promise((resolve) => {
      let size = 0
      const chunks = []
      req.on('data', (c) => {
        size += c.length
        if (size > limit) {
          req.destroy()
          resolve('')
          return
        }
        chunks.push(c)
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', () => resolve(''))
    })
  }

  function sendText(res, type, text) {
    const body = Buffer.from(text, 'utf8')
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'Content-Length': String(body.length)
    })
    res.end(body)
  }

  /* 二进制（wasm / 模型）。Content-Length 必须给：wasm 要靠它走流式编译 */
  function sendBin(res, type, buf) {
    if (!buf || !buf.length) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('not installed')
      return
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'Content-Length': String(buf.length)
    })
    res.end(buf)
  }

  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE_BASE + '/splash.css',
    handler: (req, res) => sendText(res, 'text/css; charset=utf-8', readSplashCss())
  }))

  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE_BASE + '/splash.js',
    handler: (req, res) => sendText(res, 'application/javascript; charset=utf-8', readSplashJs())
  }))

  /* 取景框追踪算法：单独成文件，好在 Node 里直接跑单元测试 */
  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE_BASE + '/face-track.js',
    handler: (req, res) => sendText(res, 'application/javascript; charset=utf-8', readFaceTrack())
  }))

  /* GPU 后端（WebGL）。加载顺序必须在前一个之后 —— 它要读 window.MSFaceTrack。 */
  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE_BASE + '/face-track-gl.js',
    handler: (req, res) => sendText(res, 'application/javascript; charset=utf-8', readFaceTrackGl())
  }))

  /* 取景框绘制（移植自 rosehahah/the-machine 的 hud.js） */
  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE_BASE + '/hud-draw.js',
    handler: (req, res) => sendText(res, 'application/javascript; charset=utf-8', readHudDraw())
  }))

  /* 眼位检测（黑条跟眼用；单独成文件，好在 Node 里直接跑单元测试） */
  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE_BASE + '/eye-track.js',
    handler: (req, res) => sendText(res, 'application/javascript; charset=utf-8', readEyeTrack())
  }))

  /* 人脸网格追踪（MediaPipe FaceLandmarker 封装）。算法本体是异步 import，
     这里是加载器自身，必须早于 splash.js 可访问。 */
  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE_BASE + '/face-landmark.js',
    handler: (req, res) => sendText(res, 'application/javascript; charset=utf-8', readFaceLandmark())
  }))

  /* MediaPipe 运行时与模型：全部本地下发，不联网、不走 CDN。
     加起来 ~13 MB，首次加载后由 Chromium 的 HTTP 缓存兜住。 */
  /* 默认模拟头像（没有摄像头时冒充实时画面） */
  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE_BASE + '/avatar/default.jpg',
    handler: (req, res) => sendBin(res, 'image/jpeg', readAvatar())
  }))

  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE_BASE + '/mp/vision_bundle.mjs',
    handler: (req, res) => sendBin(res, 'application/javascript; charset=utf-8', readMpBundle())
  }))

  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE_BASE + '/mp/face_landmarker.task',
    handler: (req, res) => sendBin(res, 'application/octet-stream', readMpModel())
  }))

  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE_BASE + '/mp/wasm/vision_wasm_internal.js',
    handler: (req, res) => sendBin(res, 'application/javascript; charset=utf-8', readMpWasmJs())
  }))

  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE_BASE + '/mp/wasm/vision_wasm_internal.wasm',
    handler: (req, res) => sendBin(res, 'application/wasm', readMpWasm())
  }))

  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE_BASE + '/config',
    handler: async (req, res) => {
      const method = (req.method || 'GET').toUpperCase()
      if (method === 'GET') {
        sendJson(res, 200, {
          ok: true, version: PLUGIN_VERSION, config: readConfig(), defaults: DEFAULTS, file: CONFIG_FILE
        })
        return
      }
      if (method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method not allowed' })
        return
      }
      const text = await readBody(req)
      let payload = {}
      try {
        payload = text ? JSON.parse(text) : {}
      } catch (err) {
        sendJson(res, 400, { ok: false, error: 'invalid json' })
        return
      }
      try {
        if (payload && payload.action === 'reset') {
          const cfgNow = writeConfig(DEFAULTS)
          sendJson(res, 200, { ok: true, version: PLUGIN_VERSION, config: cfgNow, defaults: DEFAULTS })
          return
        }
        const current = readConfig()
        const patch = payload && typeof payload.patch === 'object' && payload.patch ? payload.patch : payload
        const cfgNow = writeConfig({ ...current, ...patch })
        sendJson(res, 200, { ok: true, version: PLUGIN_VERSION, config: cfgNow, defaults: DEFAULTS })
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String((err && err.message) || err) })
      }
    }
  }))

  disposers.push(webServer.tapIndex((html) => {
    if (!html || html.includes(ROUTE_BASE + '/splash.js')) return html
    const cfg = readConfig()
    /* 默认头像直接内联成 data URI：DSH 页面跑在 dsh-app:// 下，
       用 <img src="http://127.0.0.1:.../"> 取图有被 CSP 的 img-src 拦掉的风险，
       一旦拦掉就会静默退回噪点（用户看到的就是「没有启用预留头像」）。
       内联进启动脚本就没有跨源问题，也不需要等一次网络往返。 */
    let avatarData = ''
    try {
      const buf = readAvatar()
      if (buf && buf.length) avatarData = 'data:image/jpeg;base64,' + buf.toString('base64')
    } catch (err) { avatarData = '' }
    const head =
      '<link rel="stylesheet" href="' + ROUTE_BASE + '/splash.css">' +
      '<style id="dsh-machine-critical">' + CRITICAL_CSS + '</style>'
    const body =
      '<div id="machine-startup-root" class="ms-root ms-boot" style="' + MASK_INLINE + '"></div>' +
      '<script>window.__DSH_MACHINE_BOOT__="index";window.__DSH_MACHINE_VERSION__=' + safeJson(PLUGIN_VERSION) +
      ';window.__DSH_MACHINE_ASSETS__=' + safeJson(ROUTE_BASE + '/mp/') +
      ';window.__DSH_MACHINE_AVATAR__=' + safeJson(ROUTE_BASE + '/avatar/default.jpg') +
      ';window.__DSH_MACHINE_AVATAR_DATA__=' + safeJson(avatarData) +
      ';window.__DSH_MACHINE_STARTUP__=' + safeJson(cfg) + ';' + BOOTSTRAP_JS + '</script>' +
      '<script defer src="' + ROUTE_BASE + '/face-track.js"></script>' +
      '<script defer src="' + ROUTE_BASE + '/face-track-gl.js"></script>' +
      '<script defer src="' + ROUTE_BASE + '/hud-draw.js"></script>' +
      '<script defer src="' + ROUTE_BASE + '/eye-track.js"></script>' +
      '<script defer src="' + ROUTE_BASE + '/face-landmark.js"></script>' +
      '<script defer src="' + ROUTE_BASE + '/splash.js"></script>'

    let out = html
    /* 用正则匹配开标签：`<body class="...">` 这种带属性的写法，
       以前 `replace('<body>')` 直接落空，遮罩被塞到 </body> 前面（太晚）。 */
    const headOpen = /<head[^>]*>/i
    const bodyOpen = /<body[^>]*>/i
    if (headOpen.test(out)) out = out.replace(headOpen, (m) => m + head)
    else if (out.includes('</head>')) out = out.replace('</head>', head + '</head>')
    else out = head + out
    if (bodyOpen.test(out)) out = out.replace(bodyOpen, (m) => m + body)
    else if (out.includes('</body>')) out = out.replace('</body>', body + '</body>')
    else out = out + body
    return out
  }))

  ctx.effect(() => () => {
    for (const dispose of disposers) {
      try { dispose() } catch (err) { /* noop */ }
    }
  })
}

/* 导出形状对齐 DSH 内部插件：只给具名 name / inject / apply。
   不导出 default —— cordis-plugin-loader 的 unwrapExports 是
   `exports.default ?? exports`，一旦有 default 就只认 default。 */
export { apply, inject, name }
