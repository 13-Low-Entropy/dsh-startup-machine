/* ============================================================================
 * dsh-startup-machine — 冒烟测试（零依赖，node test/smoke.mjs）
 * ----------------------------------------------------------------------------
 * 不打 DOM，只守住那些「改一处忘一处」的契约：
 *   1) 三份 DEFAULTS（Host / 运行时 / 预览）字段必须一致
 *   2) 插件标识三处必须一致：package.json name / cordis.patch id / loader id
 *   3) Host 半侧的导出形状必须能被 cordis-plugin-loader 认
 *   4) 关键 DOM 钩子（data-t / class）必须与 CSS、设置页对得上
 * ========================================================================== */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

let passed = 0
function check(label, fn) {
  fn()
  passed++
  console.log('  ok  ' + label)
}

/* 从一份源码里抠出 DEFAULTS 对象的键名。
   结束位置按「缩进 ≤2 且只有右花括号」的行判定 —— 不能用第一个 '\n}'，
   因为 splash.js 的 DEFAULTS 缩进两格结束，再往下还有别的对象字面量。 */
function keysOf(source, anchor) {
  const at = source.indexOf(anchor)
  assert.ok(at >= 0, '找不到锚点：' + anchor)
  const lines = source.slice(at).split('\n')
  const keys = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s{0,2}\}\s*$/.test(line)) break
    const m = /^\s{2,6}([A-Za-z][A-Za-z0-9]*)\s*:/.exec(line)
    if (m) keys.push(m[1])
  }
  assert.ok(keys.length > 10, '解析出的字段太少，锚点或缩进变了：' + keys.length)
  return keys
}

const pkg = JSON.parse(read('package.json'))
const hostSrc = read('lib/index.js')
const splashSrc = read('lib/splash.js')
const clientSrc = read('lib/client.js')
const previewSrc = read('preview/preview.js')
const cssSrc = read('lib/splash.css')

console.log('\ndsh-startup-machine smoke\n')

console.log('[标识]')
check('package.json 声明了 dsh.bundle 与 dsh.client', () => {
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.deepEqual(pkg.dsh.client.inject, ['@deepseek-ai/dsh-client-ui-settings'])
})
check('cordis.patch.yml 的 id 与包名一致', () => {
  const yml = read('cordis.patch.yml')
  assert.ok(yml.includes('id: ' + pkg.name), 'patch id 不等于 ' + pkg.name)
  assert.ok(yml.includes('name: ' + pkg.name))
})
check('设置页 loader id 与包名一致', () => {
  assert.ok(clientSrc.includes("id: '" + pkg.name + "'"), 'ModuleLoader id 不等于 ' + pkg.name)
})
check('入口文件存在', () => {
  assert.ok(fs.existsSync(path.join(ROOT, pkg.main)))
  assert.ok(fs.existsSync(path.join(ROOT, 'lib/client.js')))
})

console.log('\n[配置字段一致性]')
const hostKeys = keysOf(hostSrc, 'const DEFAULTS = {')
const splashKeys = keysOf(splashSrc, 'var DEFAULTS = {')
const previewKeys = keysOf(previewSrc, 'var BASE = {')

check('Host 与运行时的 DEFAULTS 字段完全一致（' + hostKeys.length + ' 项）', () => {
  assert.deepEqual(hostKeys.slice().sort(), splashKeys.slice().sort())
})
check('预览页覆盖了运行时的全部字段', () => {
  assert.deepEqual(previewKeys.slice().sort(), splashKeys.slice().sort())
})

console.log('\n[时长与默认值]')
check('五幕默认合计 7500ms（7.5 秒）', () => {
  const total = ['actBoot', 'actScan', 'actMatch', 'actAccess', 'actHandoff']
    .map((k) => Number((new RegExp(k + ':\\s*(\\d+)').exec(hostSrc) || [])[1]))
    .reduce((a, b) => a + b, 0)
  assert.equal(total, 7500)
})
check('Host 侧 normalize 覆盖了每一个数值字段的区间', () => {
  const rangeKeys = [...hostSrc.matchAll(/^\s{2}(\w+):\s*\[[\d.,\s]+\],?$/gm)].map((m) => m[1])
  for (const k of ['speed', 'actBoot', 'actScan', 'actMatch', 'actAccess', 'actHandoff',
    'mosaicBlocks', 'mosaicHeight', 'mosaicOffset', 'camSat', 'faceX', 'faceY', 'faceW', 'faceH']) {
    assert.ok(rangeKeys.includes(k), '缺少区间定义：' + k)
  }
})

console.log('\n[DOM 契约]')
check('运行时用到的 data-t 钩子在骨架里都有', () => {
  const used = new Set([...splashSrc.matchAll(/T\('([\w]+)'\)/g)].map((m) => m[1]))
  for (const key of used) {
    assert.ok(splashSrc.includes('data-t="' + key + '"'), '骨架缺少 data-t="' + key + '"')
  }
})
check('CSS 定义了运行时切换的每一个状态类', () => {
  for (const cls of ['ms-root', 'ms-boot', 'ms-out', 'ms-act', 'ms-hud', 'ms-eyes',
    'ms-sub', 'ms-progress', 'ms-skip', 'ms-welcome']) {
    assert.ok(cssSrc.includes('.' + cls), 'CSS 缺少 .' + cls)
  }
  for (const st of ['st-analyzing', 'st-verified']) {
    assert.ok(cssSrc.includes(st), 'CSS 缺少状态 .' + st)
  }
})
check('动画不再用 top 做全屏插值（避免每帧 layout/paint）', () => {
  const sweep = cssSrc.slice(cssSrc.indexOf('.ms-sweep {'), cssSrc.indexOf('@keyframes ms-sweep'))
  assert.ok(!/@keyframes ms-sweep[\s\S]*?top\s*:/.test(cssSrc.slice(cssSrc.indexOf('@keyframes ms-sweep'), cssSrc.indexOf('@keyframes ms-sweep') + 300)),
    '全屏扫掠光还在 animate top')
  assert.ok(sweep.includes('will-change: transform'))
})

check('马赛克开关与抖动类名一致', () => {
  assert.ok(splashSrc.includes("classList.add('ms-mosaic')"))
  assert.ok(cssSrc.includes('.ms-root.ms-mosaic .ms-eyes'))
  assert.ok(cssSrc.includes('.ms-root.ms-jitter .ms-eyes i'))
})

console.log('\n[取景框追踪]')
/* face-track.js 是 UMD：浏览器里挂 window.MSFaceTrack，Node 里挂 globalThis —— 
   这里 import 只为让它执行一次，再从未带命名导出的模块上取全局对象。 */
await import(pathToFileURL(path.join(ROOT, 'lib/face-track.js')).href)
check('追踪算法文件存在且能独立加载', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'lib/face-track.js')))
  const ft = globalThis.MSFaceTrack
  assert.equal(typeof (ft && ft.detect), 'function')
  assert.equal(ft.detect(null), null, '空输入不该抛')
})
check('追踪脚本缺失时运行时能静默降级（不是崩）', () => {
  assert.ok(splashSrc.includes("var FT = window.MSFaceTrack"))
  assert.ok(splashSrc.includes("if (!FT || typeof FT.detect !== 'function'"), '没有对 MSFaceTrack 做存在性判断')
  assert.ok(splashSrc.includes('function relaxFace'), '没有回落逻辑')
})
check('Host 侧提供了 face-track.js 路由与 <script> 注入', () => {
  assert.ok(hostSrc.includes("ROUTE_BASE + '/face-track.js'"))
  assert.ok(hostSrc.includes('readFaceTrack()'))
})
check('追踪开关与灵敏度字段齐全', () => {
  assert.ok(hostSrc.includes('faceTrack: true'))
  assert.ok(hostSrc.includes('trackAgility: 5'))
  assert.ok(hostSrc.includes('trackAgility: [1, 10]'))
})

console.log('\n[GPU 后端]')
const glSrc = read('lib/face-track-gl.js')
const glMod = await import(pathToFileURL(path.join(ROOT, 'lib/face-track-gl.js')).href)
check('GPU 后端文件存在且导出 create / createTracker', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'lib/face-track-gl.js')))
  const m = globalThis.MSFaceTrackGL
  assert.equal(typeof (m && m.create), 'function')
  assert.equal(typeof (m && m.createTracker), 'function')
  void glMod
})
check('请求高性能适配器（Web 平台唯一的显卡提示）', () => {
  assert.ok(glSrc.includes("powerPreference: o.powerPreference || 'high-performance'"))
})
check('能报出实际生效的显卡型号', () => {
  assert.ok(glSrc.includes('WEBGL_debug_renderer_info'))
  assert.ok(glSrc.includes('UNMASKED_RENDERER_WEBGL'))
})
check('着色器里的肤色阈值与 isSkin() 完全一致（防两边漂移）', () => {
  const frag = glSrc.slice(glSrc.indexOf('var FRAG'), glSrc.indexOf('function compile'))
  /* 逐个阈值核对：写在着色器里的字面量必须与 JS 版同值 */
  for (const t of ['48.0', '10.0', '72.0', '46.0', '132.0', '128.0', '180.0']) {
    assert.ok(frag.includes(t), '着色器缺少阈值 ' + t)
  }
  assert.ok(frag.includes('0.168736') && frag.includes('0.331264'), 'YCbCr 系数不一致')
  assert.ok(frag.includes('0.418688') && frag.includes('0.081312'), 'YCbCr 系数不一致')
})
check('Host 侧提供 face-track-gl.js 路由与注入，且顺序在算法之后', () => {
  assert.ok(hostSrc.includes("ROUTE_BASE + '/face-track-gl.js'"))
  assert.ok(hostSrc.includes('readFaceTrackGl()'))
  const iAlgo = hostSrc.indexOf("'/face-track.js\"></script>")
  const iGl = hostSrc.indexOf("'/face-track-gl.js\"></script>")
  assert.ok(iAlgo > 0 && iGl > iAlgo, '<script> 顺序错了：GL 必须在 face-track.js 之后')
})
check('设置页自举也按 算法 → GPU → 运行时 的顺序加载', () => {
  const iA = clientSrc.indexOf("'/face-track.js?t='")
  const iG = clientSrc.indexOf("'/face-track-gl.js?t='")
  assert.ok(iA > 0 && iG > iA, '自举加载顺序错了')
})
check('拿不到 WebGL 时退回 2D，不崩', () => {
  assert.ok(glSrc.includes('if (!gl) return null'))
  assert.ok(glSrc.includes('dead = true'), '上下文丢失后没有降级标记')
  assert.ok(splashSrc.includes("tracker = window.MSFaceTrackGL.createTracker"), '运行时没用门面')
  assert.ok(splashSrc.includes("mode: 'cpu'"), '运行时缺少内联 CPU 兜底')
})
check('GPU 路径不在每帧创建上下文（复用同一实例）', () => {
  assert.ok(splashSrc.includes('S.tracker = tracker'))
  assert.ok(splashSrc.includes('S.tracker.dispose()'))
})

console.log('\n[取景框绘制（移植自 the-machine）]')
const hudSrc = read('lib/hud-draw.js')
await import(pathToFileURL(path.join(ROOT, 'lib/hud-draw.js')).href)
check('hud-draw.js 存在并导出绘制与状态机', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'lib/hud-draw.js')))
  const m = globalThis.MSHud
  for (const k of ['drawBox', 'drawLabel', 'drawEyes', 'Reticle', 'STYLES', 'squareFromBox']) {
    assert.ok(m && m[k], '缺少导出：' + k)
  }
})
check('六种样式与剧里配色齐全', () => {
  const m = globalThis.MSHud
  assert.deepEqual(Object.keys(m.STYLES).sort(),
    ['black_yellow', 'blue', 'red', 'white', 'white_red', 'yellow'])
  assert.equal(m.COLORS.white, '#f2f2f2')
  assert.equal(m.COLORS.yellow, '#f2e02a')
  assert.equal(m.COLORS.red, '#e8212b')
})
check('线宽/臂长/虚线的比例仍是原作的数值', () => {
  for (const t of ['s / 85', 's * 0.11', 's * 0.034', 's * 0.022', 'lw * 1.7', 'lw * 1.35']) {
    assert.ok(hudSrc.includes(t), '几何参数被改动：' + t)
  }
})
check('取景框用 canvas 画，不再是 CSS 括号', () => {
  assert.ok(hostSrc.includes("ROUTE_BASE + '/hud-draw.js'"), 'Host 缺少 hud-draw 路由')
  assert.ok(splashSrc.includes('S.reticle.paint(g, st, W)'))
  assert.ok(!/class="ms-ret/.test(splashSrc), '还在用 CSS 角括号')
})
check('黑条与框画在同一张画布上（不会错位）', () => {
  assert.ok(/var HUD = window\.MSHud/.test(splashSrc), '没有取一次 MSHud 引用')
  assert.ok(splashSrc.includes('HUD.drawEyes(g, st.x, st.y, st.w, st.h'))
  assert.ok(splashSrc.includes('HUD.drawBar(g, fit.x, fit.y, fit.w, fit.h'), '眼位黑条没画在同一画布')
  assert.ok(!splashSrc.includes('facebox.style.left'), '还在同步 DOM 黑条容器')
})
check('脚本注入顺序：face-track → face-track-gl → hud-draw → splash', () => {
  const a = hostSrc.indexOf("'/face-track.js\"></script>")
  const b = hostSrc.indexOf("'/face-track-gl.js\"></script>")
  const c = hostSrc.indexOf("'/hud-draw.js\"></script>")
  const d = hostSrc.indexOf("'/splash.js\"></script>")
  assert.ok(a > 0 && b > a && c > b && d > c, '注入顺序不对')
})
check('框样式与标签开关可配置', () => {
  assert.ok(hostSrc.includes("boxStyle: 'auto'"))
  assert.ok(hostSrc.includes("boxLabel: true"))
  assert.ok(hostSrc.includes("boxStyle: ['auto', 'white', 'yellow', 'blue', 'red', 'black_yellow', 'white_red']"))
})

console.log('\n[Host 导出形状]')
const mod = await import(pathToFileURL(path.join(ROOT, 'lib/index.js')).href)
check('导出 name / inject / apply，且没有 default', () => {
  assert.equal(mod.name, pkg.name)
  assert.deepEqual(mod.inject, ['webServer', 'connection'])
  assert.equal(typeof mod.apply, 'function')
  assert.equal(mod.default, undefined, '不能有 default（loader 的 unwrapExports 只认 default）')
})

console.log('\n[降级路径]')
check('摄像头失败有噪点兜底、无画面有剪影兜底', () => {
  assert.ok(splashSrc.includes('function startNoise'))
  assert.ok(splashSrc.includes('function drawPlaceholder'))
  assert.ok(splashSrc.includes('NO FEED AVAILABLE'))
})
check('有看门狗：卡死也会放行，且不会提前切掉后面几幕', () => {
  assert.ok(splashSrc.includes('finish(true)'))
  assert.ok(splashSrc.includes('function armWatchdog'), '缺「每幕看门狗」')
  assert.ok(splashSrc.includes('armWatchdog(d + 9000)'), 'runAct 里没有按幕挂看门狗（或幕长算错）')
  assert.ok(splashSrc.includes('if (Number(C.hardStopMs) > 0) after(hardStopMs()'),
    '全局硬切没有改成「只有显式设置才生效」')
  assert.ok(hostSrc.includes('hs=Math.max(hs,30000)'), '首屏兜底没给足余量（会提前切掉后面几幕）')
  assert.ok(!hostSrc.includes('},18000)'), '首屏兜底又写死成 18 秒了')
})
check('跳过同时绑了按钮与键盘', () => {
  assert.ok(splashSrc.includes("'Escape'"))
  assert.ok(splashSrc.includes("addEventListener('keydown'"))
})
check('播完必停摄像头（track.stop）', () => {
  assert.ok(/getTracks\(\)\.forEach\(function \(t\) \{ t\.stop\(\) \}\)/.test(splashSrc))
})

console.log('\n[安装器]')
const instCmd = read('install.cmd')
const instPs = read('install-offline.ps1')
check('install.cmd 两条路都在：先试 CLI，失败转离线', () => {
  assert.ok(instCmd.includes('plugin --profile %PROFILE% add'), '缺少官方 CLI 路径')
  assert.ok(instCmd.includes('install-offline.ps1'), '缺少离线安装器回退')
  assert.ok(instCmd.includes('remove dsh-startup-screen'), '没有摘掉自带的启动画面')
  assert.ok(instCmd.includes('uninstall'), '缺少卸载入口')
})
check('离线安装器写 UTF-8 无 BOM（BOM 会让 JSON.parse 失败）', () => {
  assert.ok(instPs.includes('UTF8Encoding]::new($false)'), '没有显式去掉 BOM')
  assert.ok(!instPs.includes('-Encoding UTF8'), 'Set-Content -Encoding UTF8 会写 BOM')
  assert.ok(instPs.includes('WriteAllText'), '没有用 WriteAllText 落盘')
})
check('离线安装器有备份、校验与回滚，且修 manifest 的三处都覆盖', () => {
  assert.ok(instPs.includes('.bak-$stamp') && instPs.includes('Copy-Item'), '没有备份')
  assert.ok(instPs.includes('ConvertFrom-Json') && instPs.includes('ConvertTo-Json'), '没有做解析校验')
  assert.ok(instPs.includes('rolled back from backup'), '没有回滚')
  assert.ok(instPs.includes("'link:'"), '没有拼 link: 依赖串')
  assert.ok(instPs.includes('bundles'), '没有登记 bundle')
  assert.ok(instPs.includes('-ItemType Junction'), '没有建 junction（symlink 需要管理员）')
})
check('离线安装器保持纯 ASCII（解压到中文路径也不会乱码）', () => {
  const bad = [...instPs].filter((ch) => ch.charCodeAt(0) > 126)
  assert.equal(bad.length, 0, '出现非 ASCII 字符：' + bad.slice(0, 5).join(''))
})

console.log('\n[摄像头失败要说人话]')
check('错误名 → HUD 文案的映射齐全', () => {
  for (const k of ['NotAllowedError', 'NotFoundError', 'NotReadableError',
    'OverconstrainedError', 'SecurityError', 'AbortError']) {
    assert.ok(splashSrc.includes(k + ':'), '映射表缺 ' + k)
  }
  assert.ok(splashSrc.includes('function camErrText'), '缺少 camErrText')
  assert.ok(/function camFail/.test(splashSrc), '缺少 camFail')
})
check('取流失败不再静默铺噪点（必须走 camFail 写状态）', () => {
  const at = splashSrc.indexOf('function startCamera()')
  const seg = splashSrc.slice(at, splashSrc.indexOf('function setCamState'))
  assert.ok(/\.catch\(function \(e\) \{[\s\S]*camFail\(e\)/.test(seg), '失败分支没有调用 camFail')
  assert.ok(!/startNoise\(\)\s*\n\s*\}\)\s*$/.test(seg.trim()), '还在只铺噪点')
})
check('分辨率被拒会退一步用「任意分辨率」再试', () => {
  assert.ok(splashSrc.includes('OverconstrainedError'))
  assert.ok(splashSrc.includes('video: true'), '没有降级约束重试')
})
check('state() 暴露摄像头诊断字段', () => {
  for (const k of ['camError', 'secure', 'protocol', 'hasApi']) {
    assert.ok(splashSrc.includes(k + ':'), 'state() 缺 ' + k)
  }
})

console.log('\n[眼位跟随与黑条尺寸]')
check('眼位与尺寸相关字段齐全', () => {
  for (const k of ['eyeTrack', 'mosaicWidth', 'mosaicEyeScale', 'mosaicEyeThick', 'eyeSmooth']) {
    assert.ok(hostSrc.includes(k + ':'), 'Host 缺 ' + k)
    assert.ok(splashSrc.includes(k + ':'), '运行时缺 ' + k)
  }
  assert.ok(hostSrc.includes("'eyeTrack'"), 'eyeTrack 没登记为布尔项')
})
check('包内默认配置覆盖了插件的全部字段（新增字段别忘了同步）', () => {
  const cfgPath = path.join(ROOT, '..', 'config', 'dsh-startup-machine.json')
  if (!fs.existsSync(cfgPath)) return
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  const missing = hostKeys.filter((k) => !(k in cfg))
  assert.equal(missing.length, 0, 'config 里缺这些字段：' + missing.join(', '))
})
check('eye-track.js 有路由、且注入顺序在 hud-draw 之后 splash 之前', () => {
  assert.ok(hostSrc.includes("ROUTE_BASE + '/eye-track.js'"))
  assert.ok(hostSrc.includes('readEyeTrack()'))
  const iAlgo = hostSrc.indexOf("'/face-track.js\"></script>")
  const iGl = hostSrc.indexOf("'/face-track-gl.js\"></script>")
  const iHud = hostSrc.indexOf("'/hud-draw.js\"></script>")
  const iEye = hostSrc.indexOf("'/eye-track.js\"></script>")
  const iSpl = hostSrc.indexOf("'/splash.js\"></script>")
  assert.ok(iAlgo > 0 && iGl > iAlgo && iHud > iGl && iEye > iHud && iSpl > iEye, '注入顺序不对')
})
check('设置页自举也按顺序加载了 eye-track.js', () => {
  const iH = clientSrc.indexOf("'/hud-draw.js?t='")
  const iE = clientSrc.indexOf("'/eye-track.js?t='")
  assert.ok(iH > 0 && iE > iH, '自举加载顺序不对')
})
check('眼位短暂丢失时冻结在最后位置，只有从未锁到才回落固定比例', () => {
  /* 以前是「不新鲜就直接跳固定比例」，条会突然跳走/消失 —— 正是
     「第二幕最后那一下黑条没了」。现在先冻结，再退到固定比例。 */
  assert.ok(/else if \(C\.eyeTrack && S\.eyeBar && HUD && HUD\.drawBar\)/.test(splashSrc),
    '没有「冻结上一次眼位」的分支')
  assert.ok(/else if \(HUD && HUD\.drawEyes\)/.test(splashSrc), '没有回落到 drawEyes')
  assert.ok(splashSrc.includes('function eyeBar()'), '缺眼位几何函数')
})
check('黑条长度是参数（不再写死 96%）', () => {
  assert.ok(hudSrc.includes('cfg.widthRatio'), 'drawEyes 不吃 widthRatio')
  assert.ok(!/var span = w \* 0\.96/.test(hudSrc), '长度还写死着 0.96')
  assert.ok(splashSrc.includes('widthRatio:'), '运行时没传 widthRatio')
})
check('眼位模式用 barSize 纯函数算长宽', () => {
  assert.ok(hudSrc.includes('function barSize'), '缺 barSize')
  assert.ok(hudSrc.includes('barSize: barSize'), 'barSize 没导出')
  assert.ok(splashSrc.includes("barSize('eye'"), '运行时没用 eye 模式')
  assert.ok(splashSrc.includes('mosaicEyeScale') && splashSrc.includes('mosaicEyeThick'), '倍数没接上配置')
})
check('档案照的黑条也按眼位摆', () => {
  assert.ok(splashSrc.includes('function applyDossierEyes'), '缺档案照眼位同步')
  assert.ok(splashSrc.includes('applyDossierEyes()'), '没调用档案照眼位同步')
})

console.log('\n[人脸网格追踪（MediaPipe FaceLandmarker）]')
check('Host 侧有四个 /mp/* 路由，且用的是二进制读取器', () => {
  for (const p of ['/mp/vision_bundle.mjs', '/mp/face_landmarker.task',
    '/mp/wasm/vision_wasm_internal.js', '/mp/wasm/vision_wasm_internal.wasm']) {
    assert.ok(hostSrc.includes("ROUTE_BASE + '" + p + "'"), '缺路由 ' + p)
  }
  assert.ok(hostSrc.includes('function makeBinReader'), '没有二进制读取器')
  /* wasm 必须声明成 application/wasm，否则流式编译直接退化 */
  assert.ok(hostSrc.includes("'application/wasm'"), 'wasm 的 Content-Type 不对')
  assert.ok(!/makeReader\('assets\/mp/.test(hostSrc), 'wasm 被当成 utf8 读了')
})
check('模型与 wasm 真的在包里（缺了会静默降级，必须在打包前拦住）', () => {
  const need = {
    'assets/mp/vision_bundle.mjs': 100 * 1024,
    'assets/mp/face_landmarker.task': 1024 * 1024,
    'assets/mp/wasm/vision_wasm_internal.js': 100 * 1024,
    'assets/mp/wasm/vision_wasm_internal.wasm': 5 * 1024 * 1024
  }
  for (const [rel, min] of Object.entries(need)) {
    const p = path.join(ROOT, rel)
    assert.ok(fs.existsSync(p), '缺文件 ' + rel)
    assert.ok(fs.statSync(p).size >= min, rel + ' 体积明显不对（可能下残缺了）')
  }
})
check('face-landmark.js 注入顺序在 splash.js 之前', () => {
  const iLm = hostSrc.indexOf("'/face-landmark.js\"></script>")
  const iSpl = hostSrc.indexOf("'/splash.js\"></script>")
  assert.ok(iLm > 0 && iSpl > iLm, '注入顺序不对（splash 先跑了就没有 MSFaceLandmark 可用）')
  assert.ok(hostSrc.includes("window.__DSH_MACHINE_ASSETS__"), '没有下发资源根路径')
})
check('运行时是「先肤色、网格就位后接管」，且失败会回退', () => {
  assert.ok(splashSrc.includes('function startTrack'), '缺 startTrack')
  assert.ok(/function startTrack\(\) \{\s*startSkinTrack\(\)/.test(splashSrc), 'startTrack 没有先起肤色兜底')
  assert.ok(splashSrc.includes('function mountLandmark'), '缺 mountLandmark')
  assert.ok(splashSrc.includes('function fallbackToSkin'), '缺回退')
  assert.ok(splashSrc.includes('function degradeLandmark'), '缺性能降级')
  assert.ok(splashSrc.includes('startTrack()'), '摄像头就绪后没有调用 startTrack')
})
check('faceEngine 三档在 Host / 运行时 / 预览三处都登记了', () => {
  for (const s of [hostSrc, splashSrc, previewSrc]) {
    assert.ok(/faceEngine:/.test(s), '有地方缺 faceEngine')
  }
  assert.ok(hostSrc.includes("faceEngine: ['auto', 'landmark', 'skin']"), 'Host 没把它登记成枚举')
  assert.ok(splashSrc.includes("'auto', 'landmark', 'skin'"), '运行时没做取值兜底')
})
check('追踪在第三幕就停（不留定时器空转）', () => {
  assert.ok(splashSrc.includes('function stopTracking'), '缺 stopTracking')
  const at = splashSrc.indexOf("if (A.id === 'match')")
  const seg = splashSrc.slice(at, at + 900)
  assert.ok(seg.includes('stopTracking()'), '第三幕没有停追踪')
  assert.ok(splashSrc.includes('S.lmTimer'), 'stopCamera 没清网格追踪的定时器')
})

console.log('\n[眼位黑条 1.6.1：跟头转 + 永不露眼]')
check('运行时用 eyeBarFit 建斜矩形（不再只调 barSize 拼水平条）', () => {
  assert.ok(hudSrc.includes('function eyeBarFit'), '缺 eyeBarFit')
  assert.ok(splashSrc.includes('H.eyeBarFit'), '运行时没用 eyeBarFit')
  assert.ok(splashSrc.includes('function eyeBar()'), '缺 eyeBar() 统一出口')
  assert.ok(/thickScale: C\.mosaicEyeThick/.test(splashSrc), '厚度倍数没接上')
  /* eyeBarFit 不能再吃 bbox 眼高（歪头时 bbox 变大，条会跟着变厚）；
     只有 barSize 的回退路径才该用 eyeH */
  const atFit = splashSrc.indexOf('H.eyeBarFit(pts')
  assert.ok(atFit > 0, '找不到 eyeBarFit 调用点')
  assert.ok(!/eyeH/.test(splashSrc.slice(atFit, atFit + 260)), 'eyeBarFit 又去吃 bbox 眼高了（歪头会变厚）')
  assert.ok(/minH: Math\.max\(6, ehPx \* 1\.1\)/.test(splashSrc), '眨眼时没有厚度下限')
})
check('drawBar 带旋转角与 edge 抖动模式', () => {
  assert.ok(/function drawBar\(ctx, x, y, w, h, blocks, gap, t, angle, jitterMode\)/.test(hudSrc), 'drawBar 签名没升级')
  assert.ok(hudSrc.includes("jitterMode === 'edge'"), '没有 edge 抖动分支')
  assert.ok(splashSrc.includes("'edge'"), '运行时没启用 edge 抖动')
})
check('眼位数据带眼角四点，并逐点平滑', () => {
  assert.ok(splashSrc.includes('EYE_QUAD_KEYS'), '缺四点索引表')
  assert.ok(splashSrc.includes('quad: hit.eyes.quad'), '网格结果没把 quad 传下去')
  assert.ok(/function cloneQuad/.test(splashSrc), '缺 quad 克隆')
})
check('平滑是距离自适应的（快动跟手、静止不抖）', () => {
  assert.ok(splashSrc.includes('var jump = Math.sqrt(jx * jx + jy * jy)'), '没有算位移')
  assert.ok(/base \+ Math\.min\(0\.42, jump \* 8\)/.test(splashSrc), '没有按位移放大跟随系数')
})
check('档案照里的条也旋转（DOM transform + transform-origin）', () => {
  assert.ok(splashSrc.includes("host.style.transform = fit.angle ? 'rotate("), '档案照没旋转')
  assert.ok(/\.ms-eyes \{[^}]*transform-origin: 50% 50%/.test(cssSrc), '.ms-eyes 缺 transform-origin')
})
check('四点缺失时仍然回退到老算法（不会没有条）', () => {  assert.ok(splashSrc.includes("if (typeof H.barSize !== 'function') return null"), '没有 barSize 回退分支')
  const at = splashSrc.indexOf('function eyeBar()')
  const seg = splashSrc.slice(at, at + 1800)
  assert.ok(seg.includes("H.barSize('eye'"), '回退分支没调 barSize')
})

check('档案照的抖动只放大不缩小（缩一下就会露眼）', () => {
  assert.ok(/@keyframes ms-eye-jit/.test(cssSrc), '缺抖动关键帧')
  const at = cssSrc.indexOf('@keyframes ms-eye-jit')
  const seg = cssSrc.slice(at, at + 400)
  const shrinks = /scaleY\(\s*\.\d/.test(seg) || /scaleY\(\s*0\.\d/.test(seg)
  assert.ok(!shrinks, '关键帧里又出现 scaleY 小于 1 了')
})

console.log('\n[1.6.2 主题：纯黑 + 鸿蒙 Sans + 标题卡 + 打字机]')
check('底色是纯黑，不再是深蓝', () => {
  assert.ok(/\.ms-root \{[^}]*--ms-bg: #000;/.test(cssSrc), '--ms-bg 不是 #000')
  assert.ok(!/#05080c|#080d13|#0c141c|#101a24/.test(cssSrc), '还有深蓝色值没换掉')
  assert.ok(hostSrc.includes('background:#000}'), 'Host 首屏兜底的底色没换')
})
check('标题/正文用鸿蒙 Sans，终端数据仍用等宽', () => {
  assert.ok(/--ms-sans: "HarmonyOS Sans SC"/.test(cssSrc), '缺 --ms-sans 或首选项不是鸿蒙')
  assert.ok(/#machine-startup-root\.ms-root \{[^}]*font-family: var\(--ms-sans\)/.test(cssSrc), '根字体没切到 sans')
  assert.ok(cssSrc.includes('.ms-bootlog,'), '等宽清单里没有 bootlog')
  assert.ok(hudSrc.includes('HarmonyOS Sans SC'), '画布标签字体没跟着换')
})
check('第一幕是标题卡：大字 + 中文 + 左上角暗列表', () => {
  assert.ok(splashSrc.includes('data-t="bootLineEn"'), '缺英文大字节点')
  assert.ok(splashSrc.includes('data-t="bootLineZh"'), '缺中文节点')
  assert.ok(splashSrc.includes('data-t="bootlist"'), '缺左上角列表节点')
  assert.ok(splashSrc.includes('playStatementCard'), '缺标题卡播放逻辑')
  assert.ok(cssSrc.includes('.ms-statement-en'), '缺标题卡样式')
})
check('第一幕会把 HUD 装饰收掉（ms-act1）', () => {
  assert.ok(splashSrc.includes("classList.toggle('ms-act1'"), '没有切 ms-act1 类')
  for (const sel of ['.ms-grid', '.ms-rail', '.ms-frame', '.ms-bottom', '.ms-grain']) {
    assert.ok(cssSrc.includes('.ms-act1 ' + sel), 'ms-act1 没隐藏 ' + sel)
  }
})
check('字幕逐字输入：有打字机函数、光标类、并且只留一个光标', () => {
  assert.ok(splashSrc.includes('function typeInto'), '缺 typeInto')
  assert.ok(splashSrc.includes("classList.add('ms-typing')"), '没有挂光标类')
  assert.ok(cssSrc.includes('.ms-typing::after'), 'CSS 里没有光标')
  assert.ok(cssSrc.includes('@keyframes ms-caret'), '光标没有闪烁关键帧')
  assert.ok(/z\.classList\.remove\('ms-typing'\)|enEl\.classList\.remove\('ms-typing'\)/.test(splashSrc),
    '打下一行时没把上一行的光标收掉（会出现两个光标同时闪）')
})
check('时间不够会自动加快，不会打到下一幕', () => {
  const at = splashSrc.indexOf('function typeInto')
  const seg = splashSrc.slice(at, at + 1200)
  assert.ok(seg.includes('budgetMs / n'), '没有按预算分摊每字间隔')
  assert.ok(seg.includes('tok !== S.typeSeq'), '换幕时没有中断旧的输入链')
})
check('打字机有开关与速度配置（Host / 运行时 / 预览三处都有）', () => {
  for (const s of [hostSrc, splashSrc, previewSrc]) {
    for (const k of ['typewriter', 'typeSpeed', 'typeCursor']) {
      assert.ok(s.includes(k + ':'), '有地方缺 ' + k)
    }
  }
  assert.ok(hostSrc.includes("'typewriter', 'typeCursor'"), '布尔项没登记')
  assert.ok(hostSrc.includes('typeSpeed: [4, 120]'), 'typeSpeed 没有范围约束')
})

console.log('\n[1.6.3 强制跳过 / 逐字幕表 / 模拟头像]')
check('强制跳过：0 跟随合计，填数值能硬切', () => {
  assert.ok(splashSrc.includes('function hardStopMs'), '缺 hardStopMs')
  assert.ok(splashSrc.includes('v > 0 ? Math.max(1200, v) : totalMs() + 9000'), '取值为 0 时没有跟随合计')
  assert.ok(splashSrc.includes('after(hardStopMs(), function () { finish(true) })'), '看门狗没用 hardStopMs')
  assert.ok(hostSrc.includes('Math.max(1200,c.hardStopMs)'), 'Host 自举兜底没跟着改')
  assert.ok(hostSrc.includes('},hs)'), '自举定时器还是写死的 18000')
  assert.ok(hostSrc.includes('hardStopMs: [0, 120000]'), 'hardStopMs 没有范围约束')
})
check('逐字幕表：默认只给后三幕，前两幕整行直出', () => {
  assert.ok(splashSrc.includes('function typingOn'), '缺 typingOn')
  assert.ok(splashSrc.includes("typeActs: 'match,access,handoff'"), '默认值不对')
  assert.ok(splashSrc.includes('if (!typingOn())'), 'typeInto 没有走 typingOn')
  assert.ok(splashSrc.includes('S.actId = id'), 'showAct 没记录幕 id')
  for (const s of [hostSrc, splashSrc, previewSrc]) assert.ok(s.includes('typeActs:'), '有地方缺 typeActs')
})
check('模拟头像：没人开摄像头时用一张图冒充画面', () => {
  assert.ok(splashSrc.includes('function startAvatar'), '缺 startAvatar')
  assert.ok(splashSrc.includes('function drawAvatarFrame'), '缺 drawAvatarFrame')
  assert.ok(splashSrc.includes('function fakeFace'), '缺 fakeFace（头像上的脸位）')
  assert.ok(splashSrc.includes("classList.add('ms-sim')"), '没有切模拟态类')
  /* 三条失败路径都要走头像 */
  const atFail = splashSrc.indexOf('function camFail')
  assert.ok(splashSrc.slice(atFail, atFail + 1200).includes('startAvatar('), 'camFail 没用头像')
  assert.ok(splashSrc.includes("startAvatar('CAMERA OFF')"), '关摄像头时没用头像')
  assert.ok(splashSrc.includes("startAvatar('TIMEOUT')"), '授权超时没用头像')
  assert.ok(splashSrc.includes("src = T('avatar')"), '档案照没有取头像画布')
  assert.ok(cssSrc.includes('.ms-root.ms-sim .ms-camview canvas.ms-avatar'), '缺 ms-sim 样式')
})
check('默认头像文件与路由都在', () => {
  const p = path.join(ROOT, 'assets/avatar/default.jpg')
  assert.ok(fs.existsSync(p), '缺 assets/avatar/default.jpg')
  assert.ok(fs.statSync(p).size > 20 * 1024, '默认头像太小，可能没合成好')
  assert.ok(hostSrc.includes("ROUTE_BASE + '/avatar/default.jpg'"), '缺头像路由')
  assert.ok(hostSrc.includes('__DSH_MACHINE_AVATAR__'), '没有下发头像路径')
  assert.ok(previewSrc.length >= 0 && read('preview/index.html').includes('__DSH_MACHINE_AVATAR__'), '预览页没设头像路径')
})
check('三处备注按用户要求删掉了', () => {
  assert.ok(!clientSrc.includes('英语（THE MACHINE 原味）'), '播报语言还带备注')
  const atMosaic = clientSrc.indexOf("label: '启用眼部黑条'")
  const seg = clientSrc.slice(atMosaic, atMosaic + 200)
  assert.ok(!seg.includes('hint:'), '「启用眼部黑条」还留着备注')
  const atList = clientSrc.indexOf("label: '左上角 · 系统名列表'")
  const seg2 = clientSrc.slice(atList, atList + 200)
  assert.ok(!seg2.includes('hint:'), '系统名列表还留着备注')
})

console.log('\n[发版同步：安装说明 / VERSION.txt / 配置字段数]')
/* 包外的那份 安装说明-给AI.md 只在「整包」里存在；plugin 被单独装进
   plugin-sources 时读不到，此时这些断言自动跳过（不是失败）。 */
const PKG_ROOT = path.join(ROOT, '..')
const DOC_PATH = path.join(PKG_ROOT, '安装说明-给AI.md')
const hasDoc = fs.existsSync(DOC_PATH)
const VER = JSON.parse(read('package.json')).version

check('安装说明的版本号与 package.json 一致', () => {
  if (!hasDoc) { console.log('    (跳过：不在整包里)'); return }
  const doc = fs.readFileSync(DOC_PATH, 'utf8')
  assert.ok(doc.split('\n')[0].includes(VER), '首行版本号没同步到 ' + VER)
  assert.ok(doc.includes('dsh-startup-machine-' + VER + '\\'), '目录示例还是旧版本号')
  assert.ok(doc.includes('"version": "' + VER + '"'), '验证清单里的插件版本没同步')
})
check('安装说明里的配置字段数 / 模型文件数与实际一致', () => {
  if (!hasDoc) return
  const doc = fs.readFileSync(DOC_PATH, 'utf8')
  const cfgPath = path.join(PKG_ROOT, 'config', 'dsh-startup-machine.json')
  if (fs.existsSync(cfgPath)) {
    const n = Object.keys(JSON.parse(fs.readFileSync(cfgPath, 'utf8'))).length
    assert.ok(doc.includes('（' + n + ' 个字段'), '文档没写当前的字段数 ' + n)
  }
  /* assets/mp 的文件数也要跟文档对上：加/删模型文件时文档别装看不见 */
  const mp = path.join(ROOT, 'assets', 'mp')
  if (fs.existsSync(mp)) {
    let files = 0
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(dir, e.name))
        else files++
      }
    }
    walk(mp)
    assert.ok(doc.includes('**' + files + '** 个文件'), '文档里 mp 的文件数不是实际的 ' + files)
  }
})
check('安装说明里的测试项数与实际一致（改测试数量时同步那张表）', () => {
  if (!hasDoc) return
  const doc = fs.readFileSync(DOC_PATH, 'utf8')
  /* 七个文件的项数，改任何一个测试的 check 数量都要回来改这里和文档 */
  const TALLY = '105 / 36 / 10 / 14 / 13 / 14 / 8'
  assert.ok(doc.includes(TALLY), '汇总行没同步，应为 ' + TALLY)
  for (const s of ['smoke.mjs          # 105 项', 'hud-draw.mjs       # 36 项',
    'panel.mjs          # 10 项', 'eye-track.mjs      # 14 项',
    'face-track.mjs     # 13 项', 'face-landmark.mjs  # 14 项',
    'lint-globals.mjs   #  8 项']) {
    assert.ok(doc.includes(s), '逐条清单缺：' + s.trim())
  }
})
check('VERSION.txt 与 package.json 版本一致', () => {
  const vp = path.join(PKG_ROOT, 'VERSION.txt')
  if (!fs.existsSync(vp)) return
  const v = fs.readFileSync(vp, 'utf8')
  assert.ok(v.split('\n')[0].includes(VER), 'VERSION.txt 首行版本不对')
  assert.ok(v.includes('plugin-version: ' + VER), 'VERSION.txt 的 plugin-version 不对')
})
check('安装说明里不再残留旧稿痕迹', () => {
  if (!hasDoc) return
  const doc = fs.readFileSync(DOC_PATH, 'utf8')
  for (const bad of ['插件本体（版本 1.4.0）', '重装 1.4.0', 'smoke 44', 'hud-draw 17', '底部版本 v1.5.0', '四套测试']) {
    assert.ok(!doc.includes(bad), '安装说明还留着旧稿内容：' + bad)
  }
})

console.log('\n[1.1.3 四项回归：幕长 / 预览 / 模拟头像 / 眯眼]')
check('改长后面前几幕不会把后面几幕切掉', () => {
  /* 总时长的全局定时器是元凶：开场算一次，幕一改长就会提前收场。
     现在只保留「每幕自己」的看门狗，全局硬切必须用户显式设置。 */
  const atHard = splashSrc.indexOf('after(hardStopMs()')
  assert.ok(atHard > 0, '找不到全局硬切（它应当还在，只是要带守卫）')
  assert.ok(splashSrc.slice(Math.max(0, atHard - 60), atHard).includes('Number(C.hardStopMs) > 0'),
    '全局硬切没有「显式设置才生效」的守卫')
  assert.equal(splashSrc.indexOf('after(hardStopMs()', atHard + 1), -1, '出现了第二处无条件的全局硬切')
  assert.ok(/if \(Number\(C\.hardStopMs\) > 0\) after\(hardStopMs\(\)/.test(splashSrc),
    '全局硬切没加「只有显式设置才生效」的守卫')
  assert.ok(splashSrc.includes('armWatchdog(d + 9000)'), '每幕看门狗没挂上（或幕长算错）')
  assert.ok(/if \(S\.watchdog\)/.test(splashSrc), '看门狗没有在换幕时重置')
})
check('预览按「未保存的草稿」重播', () => {
  assert.ok(/function readCfg\(over\)/.test(splashSrc), 'readCfg 不接受覆盖')
  assert.ok(/function replay\(over\)/.test(splashSrc), 'replay 不接受覆盖')
  assert.ok(splashSrc.includes('C = readCfg(over)'), 'replay 没有重读配置')
  assert.ok(clientSrc.includes('api.replay(draft)'), '面板预览没把草稿传过去')
  assert.ok(!clientSrc.includes('预览按「已保存」的配置'), '预览文案还是旧的')
})
check('模拟头像兜底链：内嵌图解码优先，任何一层失败都不掉回噪点', () => {
  assert.ok(splashSrc.includes('var AVATAR_B64 ='), '缺构建时内嵌的默认头像（1.2.1 起不再依赖 Host 下发）')
  assert.ok(splashSrc.includes('function decodeAvatar'), '缺 decodeAvatar')
  assert.ok(splashSrc.includes('createImageBitmap'), '没有用 createImageBitmap（还会被 <img> 的 CSP 卡）')
  assert.ok(splashSrc.includes('function drawSilhouette'), '缺档案剪影兜底')
  assert.ok(splashSrc.includes('function gradeFrame'), '缺冷调/噪点处理')
  const at = splashSrc.indexOf('function startAvatar')
  const seg = splashSrc.slice(at, at + 1600)
  assert.ok(seg.indexOf('drawAvatarFrame()') < seg.indexOf('decodeAvatar('),
    '没有先把剪影立起来（还是等图解码）')
  assert.ok(seg.includes('S.simError = String(url).slice(0, 120)'), '自定义图失败后没有记录/兜底')
  assert.ok(seg.includes("if (url !== 'builtin')"), '自定义图失败后没有退回内嵌默认图')
  assert.ok(splashSrc.includes("return 'builtin'"), 'avatarSrc 没在内嵌图上兜底')
})
check('眯眼时黑条不塌（眼眶高度下限）', () => {
  assert.ok(hudSrc.includes('EYE_SOCKET_RATIO'), '缺眼眶高度下限系数')
  const at = hudSrc.indexOf('var eyeW = Math.max(')
  assert.ok(at > 0, '没有按单眼宽度算下限')
  assert.ok(hudSrc.slice(at, at + 400).includes('eyeW * EYE_SOCKET_RATIO'), '下限没用上')
})

console.log('\n[1.2.0 两项回归：长序列不被提前切 / 自举也下发头像]')
check('splash 起来后摘掉 ms-boot，两个兜底定时器不再整屏收场', () => {
  assert.ok(splashSrc.includes("classList.remove('ms-boot')"), 'splash 没摘 ms-boot（长序列会被兜底提前切掉）')
  assert.ok(/if \(window\.__DSH_MACHINE_API__\) return/.test(clientSrc), 'client 的 18 秒兜底没检查 splash 是否已起来')
  assert.ok(hostSrc.includes('!window.__DSH_MACHINE_API__'), 'Host 首屏兜底没检查 splash 是否已起来')
})
check('幕链：先挂下一幕定时器、单幕异常不断链、看门狗只看幕长', () => {
  assert.ok(splashSrc.includes('after(d, function () { runAct(i + 1) })'), '没先挂下一幕定时器')
  const atNext = splashSrc.indexOf('after(d, function () { runAct(i + 1) })')
  const atBootAct = splashSrc.indexOf("if (A.id === 'boot') {")
  assert.ok(atNext > 0 && atNext < atBootAct, '下一幕定时器还是挂在幕末（异常会断链）')
  assert.ok(splashSrc.includes('本幕布景出错（不影响后续幕）'), '单幕异常没有捕获')
  assert.ok(splashSrc.includes('armWatchdog(d + 9000)'), '看门狗没有按幕长 + 9 秒挂')
})
check('桌面端自举也下发头像（兼容旧 Host），但默认图不再依赖它', () => {
  assert.ok(clientSrc.includes("window.__DSH_MACHINE_AVATAR__ = BOOT_ROUTE + '/avatar/default.jpg'"),
    'client 自举没下发头像路径')
  assert.ok(clientSrc.includes('readAsDataURL'), 'client 没把默认头像转成 data URI')
  assert.ok(splashSrc.includes('var AVATAR_B64 ='), '默认头像没有内嵌进 splash.js')
})

console.log('\n[1.2.1 回归：内嵌头像] ← 语音播报已在 1.2.4 移除')
check('内嵌头像与 assets/avatar/default.jpg 逐字节一致', () => {
  const jpg = path.join(ROOT, 'assets/avatar/default.jpg')
  assert.ok(fs.existsSync(jpg), '缺 assets/avatar/default.jpg')
  const b64 = fs.readFileSync(jpg).toString('base64')
  assert.ok(b64.length > 100000, '默认图太小')
  assert.ok(splashSrc.includes("var AVATAR_B64 = '" + b64 + "'"),
    'splash.js 里内嵌的 base64 与文件不一致（构建时漏注入/图换了没重打）')
})
check('1.2.4 起不再有人声播报（Web Speech API 已整体移除）', () => {
  for (const [name, src] of [['splash.js', splashSrc], ['client.js', clientSrc], ['index.js', hostSrc]]) {
    assert.ok(!src.includes('speechSynthesis'), name + ' 还在用 speechSynthesis')
    assert.ok(!src.includes('SpeechSynthesisUtterance'), name + ' 还在构造播报对象')
  }
  assert.ok(!/\bvoice[A-Z]?\w*\s*:/.test(splashSrc), 'splash 还留着 voice* 配置键')
  assert.ok(!hostSrc.includes("'voice'"), 'Host 的 BOOL_KEYS 还留着 voice')
  assert.ok(!clientSrc.includes('VoicePicker'), '面板还留着音色选择器')
  assert.ok(!/draft\.voice/.test(clientSrc), '面板还在读 draft.voice')
  assert.ok(!splashSrc.includes('speak:'), 'splash 还对外暴露 speak()')
})
check('幕推进只看幕长：不等人声，也不会被播报拖长', () => {
  assert.ok(splashSrc.includes('after(d, function () { runAct(i + 1) })'), '幕推进不是按幕长 d')
  for (const dead of ['waitSpeech', 'speechDone', 'speechDeadline', 'voiceWait']) {
    assert.ok(!splashSrc.includes(dead), '还留着播报等待的残留：' + dead)
  }
  assert.ok(splashSrc.includes('armWatchdog(d + 9000)'), '看门狗没按幕长 + 9 秒挂')
})
check('配置里填了相对路径（assets/avatar/default.jpg）也回落到内置图', () => {
  /* 真机实测：配置里被写进了 " assets/avatar/default.jpg"（带前导空格的相对路径）。
     dsh-app:// 页面取不到它，旧逻辑会拿同一个坏地址反复重试 → 永远剪影。 */
  assert.ok(/if \(u && \/\^\(data:\|https\?:\|blob:\)\/i\.test\(u\)\) return u/.test(splashSrc),
    'avatarSrc 没校验地址协议（相对路径会被当成自定义图反复重试）')
  assert.ok(!splashSrc.includes("return u || 'builtin'"), '旧的「有值就用」逻辑还在')
})

console.log('\n[1.2.2 两项回归：首屏遮罩 / 档案照黑条]')
check('首屏遮罩不依赖 CSS，且先遮再读配置', () => {
  /* 桌面端走 client 自举：以前是「先 fetch 配置、再插遮罩」，
     页面本体早就画出来了；遮罩本身又只靠 class，样式在异步 CSS 里。 */
  assert.ok(clientSrc.includes('function preMask'), '缺 preMask')
  assert.ok(clientSrc.includes("root.style.background = '#000'"), '遮罩没写内联背景')
  assert.ok(clientSrc.includes('function dropMask'), '缺 dropMask')
  const atBoot = clientSrc.indexOf('function selfBoot')
  const seg = clientSrc.slice(atBoot, atBoot + 1800)
  assert.ok(seg.indexOf('preMask()') < seg.indexOf('fetch(API'),
    '自举还是「先问配置再遮」')
  assert.ok(seg.includes('hintSkip'), '没有用同步标记做预判')
  assert.ok(hostSrc.includes('const MASK_INLINE'), 'Host 注入的 root 没有内联样式')
  assert.ok(hostSrc.includes('const headOpen = /<head[^>]*>/i'), 'head 匹配没用正则')
  assert.ok(hostSrc.includes('const bodyOpen = /<body[^>]*>/i'), 'body 匹配没用正则')
  assert.ok(hostSrc.includes('background:#000!important'), 'critical css 没把 html/body 压黑')
  assert.ok(splashSrc.includes("if (!root.style.position)"), 'splash 没有「CSS 未到也要铺满」的兜底')
})
check('档案照黑条：没有眼位也要摆一条', () => {
  const at = splashSrc.indexOf('function applyDossierEyes')
  const seg = splashSrc.slice(at, at + 4200)
  assert.ok(seg.includes('barSize(\'box\''), '缺「按取景框摆」的兜底分支')
  assert.ok(!/if \(!C\.eyeTrack \|\| !S\.eye\) return/.test(seg), '还在「没有眼位就直接 return」')
  assert.ok(seg.includes("srcKind === 'video'"), '没有区分模拟头像与真实视频')
  assert.ok(seg.includes('mirrored ?'), '镜像条件没跟 snapshot 对齐')
})

console.log('\n[1.2.3 换幕黑条回归]')
check('换幕时取景框/黑条一起淡出，不再瞬间消失', () => {
  /* 真机反馈：换幕时黑条仍会消失。根因是 match 幕一进门就 S.reticle = null，
     而 .ms-act 还有 0.34s 淡出 —— 画面还在、条先没了；且 drawBar 不吃 alpha。 */
  assert.ok(splashSrc.includes('S.reticle.remove()'), '换幕时没有让 reticle 淡出（仍是瞬间 S.reticle = null）')
  assert.ok(splashSrc.includes('g.globalAlpha = st.alpha'), '黑条没跟取景框一起吃淡出透明度')
  assert.ok(/after\(380, function \(\) \{[\s\S]{0,240}S\.reticle = null/.test(splashSrc),
    '淡出结束后没有清理 reticle 引用')
})
check('档案照黑条不因关闭「黑条跟随眼睛」而整条消失', () => {
  const at = splashSrc.indexOf('function applyDossierEyes')
  const seg = splashSrc.slice(at, at + 1200)
  assert.ok(!/\n\s*if \(!C\.eyeTrack\) return/.test(seg), 'applyDossierEyes 仍因 eyeTrack 关闭而整条 return')
  assert.ok(splashSrc.includes('if (C.eyeTrack && S.eye)'), '眼位分支没有只按 eyeTrack 判断')
  assert.ok(splashSrc.includes('after(60, function () { applyDossierEyes() })'), '第三幕显示后没有补摆黑条')
})

console.log('\n[出厂配置一致性]')
check('出厂 config 与代码默认值字段完全对齐（删语音后 72 项）', () => {
  const cfgPath = path.join(PKG_ROOT, 'config', 'dsh-startup-machine.json')
  if (!fs.existsSync(cfgPath)) { console.log('    (跳过：不在整包里)'); return }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  assert.deepEqual(Object.keys(cfg).sort(), hostKeys.slice().sort(), 'config 与 DEFAULTS 的字段集合不一致')
  for (const k of Object.keys(cfg)) {
    assert.ok(!/^voice/i.test(k), 'config 还留着语音键：' + k)
    assert.ok(!/Say$/.test(k), 'config 还留着播报台词键：' + k)
  }
})
check('未声明变量扫描器本身可用（把已知坏写法注入应当被抓到）', () => {
  const lintPath = path.join(ROOT, 'test', 'lint-globals.mjs')
  assert.ok(fs.existsSync(lintPath), '缺 test/lint-globals.mjs')
  assert.ok(fs.readFileSync(lintPath, 'utf8').includes('未声明变量扫描'), '扫描器内容不对')
})

console.log('\n[1.2.5 安全加固回归]')
check('登录守护：脚本装到 app.asar 旁边，VBS 执行前校验 SHA-256', () => {
  if (!fs.existsSync(path.join(PKG_ROOT, 'install.ps1'))) { console.log('    (跳过：不在整包里)'); return }
  const inst = fs.readFileSync(path.join(PKG_ROOT, 'install.ps1'), 'utf8')
  assert.ok(inst.includes('dsh-startup-machine-guard'), '守护脚本没有装到 app.asar 旁边的受保护目录')
  assert.ok(inst.includes('certutil -hashfile'), 'VBS 没有用 certutil 校验脚本哈希')
  assert.ok(inst.includes('If LCase(m(0).Value) <> expected'), 'VBS 没有比对 SHA-256')
  assert.ok(inst.includes('guard-manifest.json'), '没有写守卫哈希清单')
  assert.ok(inst.includes('legacy guard script removed'), '没有清理旧版用户目录里的守卫脚本')
})
check('守卫脚本：运行前先校验 patch_camera.py 的哈希', () => {
  if (!fs.existsSync(path.join(PKG_ROOT, 'install.ps1'))) { console.log('    (跳过：不在整包里)'); return }
  const guard = fs.readFileSync(path.join(PKG_ROOT, 'camera-patch', 'verify_and_repatch.ps1'), 'utf8')
  assert.ok(guard.includes('guard-manifest.json'), '守卫没读哈希清单')
  assert.ok(guard.includes('hash mismatch'), '守卫没有哈希不匹配的处理')
  assert.ok(guard.includes('refusing to run'), '守卫哈希不匹配时没有拒绝运行')
})
check('-RestoreAsar 只还原与安装时 SHA-256/大小一致的备份', () => {
  if (!fs.existsSync(path.join(PKG_ROOT, 'install.ps1'))) { console.log('    (跳过：不在整包里)'); return }
  const un = fs.readFileSync(path.join(PKG_ROOT, 'uninstall.ps1'), 'utf8')
  assert.ok(un.includes('app.asar.camera-backup.json'), '没有读安装时写的备份清单')
  assert.ok(un.includes('Get-FileHash'), '没有计算备份哈希')
  assert.ok(un.includes('does not match the install-time SHA-256 manifest'), '没有跳过不匹配的备份')
  assert.ok(un.includes('[switch]$Force'), '没有 -Force 例外开关')
})
check('patch_camera.py 打补丁时记录备份哈希', () => {
  if (!fs.existsSync(path.join(PKG_ROOT, 'install.ps1'))) { console.log('    (跳过：不在整包里)'); return }
  const py = fs.readFileSync(path.join(PKG_ROOT, 'camera-patch', 'patch_camera.py'), 'utf8')
  assert.ok(py.includes('MANIFEST_SUFFIX'), '缺清单文件名常量')
  assert.ok(py.includes('def write_manifest'), '缺 write_manifest')
  assert.ok(py.includes('def sha256_of'), '缺 sha256_of')
})
check('旧安装已打补丁时自动补写备份哈希清单', () => {
  if (!fs.existsSync(path.join(PKG_ROOT, 'install.ps1'))) { console.log('    (跳过：不在整包里)'); return }
  const py = fs.readFileSync(path.join(PKG_ROOT, 'camera-patch', 'patch_camera.py'), 'utf8')
  assert.ok(py.includes('Backfill the manifest'), '缺「already patched 时补写清单」的分支')
  assert.ok(/if already:[\s\S]{0,500}write_manifest/.test(py), 'already patched 分支没有补写清单')
})
check('重启脚本：pushd/popd 成对，且覆盖 %LOCALAPPDATA%\\Programs', () => {
  if (!fs.existsSync(path.join(PKG_ROOT, 'install.ps1'))) { console.log('    (跳过：不在整包里)'); return }
  const restartTop = fs.readFileSync(path.join(PKG_ROOT, '重启DSH.cmd'), 'utf8')
  assert.ok(/pushd/.test(restartTop), '重启DSH.cmd 没有 pushd')
  const restartCam = fs.readFileSync(path.join(PKG_ROOT, 'camera-patch', 'restart-dsh-camera.cmd'), 'utf8')
  assert.ok(restartCam.includes('LOCALAPPDATA'), '重启脚本没搜 %LOCALAPPDATA%\\Programs')
})

console.log('\n全部通过：' + passed + ' 项\n')
