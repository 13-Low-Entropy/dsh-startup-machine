/**
 * 设置页面板的回归测试 —— 不需要 react / react-dom / 浏览器。
 *
 * 用一个最小假 React（createElement / useState / useEffect / useRef）把
 * Panel 真正执行一遍，然后走它的返回树：
 *   · 组件里抛异常          → 整块设置页变白（v1.3.0 就是这样坏的）
 *   · createElement 的类型非法 → React 报 "Element type is invalid"
 *   · 引用了没声明的变量    → ReferenceError，同样让整页变白
 *
 * 这三种都属于「静态检查 / node --check 都过得去、一上真机就白屏」的问题，
 * 只能靠真跑一遍渲染函数才抓得到。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

let passed = 0
const failures = []
function check(name, fn) {
  try {
    fn()
    passed++
    console.log('  ok  ' + name)
  } catch (e) {
    failures.push({ name, e })
    console.log('  FAIL ' + name + '\n        ' + e.message)
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || '断言失败') }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '不相等') + '：' + a + ' vs ' + b) }

/* ── 从 Host 侧抠出默认配置 ───────────────────────────────────────────── */
const hostSrc = read('lib/index.js')
function blockAt(src, marker) {
  const at = src.indexOf(marker)
  assert(at >= 0, '找不到 ' + marker)
  let depth = 0
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(src.indexOf('{', at), i + 1) }
  }
  throw new Error(marker + ' 没有闭合')
}
const DEFAULTS = eval('(' + blockAt(hostSrc, 'const DEFAULTS = {') + ')')

/* ── 假环境 ───────────────────────────────────────────────────────────── */
const noop = () => {}
const fakeDoc = {
  head: { appendChild: noop },
  documentElement: { appendChild: noop },
  body: { style: {} },
  querySelector: () => null,
  createElement: () => ({ dataset: {}, style: {}, appendChild: noop, addEventListener: noop }),
  getElementById: () => null,
  addEventListener: noop
}
const win = {
  document: fakeDoc,
  location: { protocol: 'http:', reload: noop },
  navigator: { mediaDevices: {}, userAgent: 'node' },
  isSecureContext: true,
  addEventListener: noop,
  sessionStorage: { getItem: () => null, setItem: noop },
  localStorage: { getItem: () => null, setItem: noop },
  devicePixelRatio: 1
}

/* 假 React：hook 顺序用游标模拟，第 0 个 useState 可以被覆写成「已加载的配置」 */
let cursor = 0
let draftOverride = null
const react = {
  createElement(type, props, ...children) {
    if (type === undefined || type === null) throw new Error('createElement 的类型是 undefined')
    if (typeof type !== 'string' && typeof type !== 'function') {
      throw new Error('createElement 的类型非法：' + typeof type)
    }
    return { $$el: true, type, props: Object.assign({}, props, { children: children.length ? children : undefined }) }
  },
  Fragment: 'Fragment',
  useState(init) {
    const i = cursor++
    if (i === 0 && draftOverride) return [draftOverride, noop]
    return [typeof init === 'function' ? init() : init, noop]
  },
  useEffect() {},
  useLayoutEffect() {},
  useMemo(fn) { return fn() },
  useCallback(fn) { return fn },
  useRef() { return { current: null } },
  useReducer(_r, init) { return [init, noop] },
  useContext() { return {} }
}

/* ── 加载 client.js ───────────────────────────────────────────────────── */
let captured = null
win.window = win
win.__ModuleLoader__ = { load(def) { captured = def } }

const clientSrc = read('lib/client.js')
const runFactory = new Function(
  'window', 'document', 'navigator', 'fetch', 'console',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'localStorage', 'sessionStorage',
  clientSrc
)
runFactory.call(win, win, fakeDoc, win.navigator,
  () => Promise.reject(new Error('no network in test')), console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  win.localStorage, win.sessionStorage)

check('client.js 通过 ModuleLoader 注册，id 与包名一致', () => {
  assert(captured, '没有调用 __ModuleLoader__.load')
  eq(captured.id, 'dsh-startup-machine')
})

const mod = captured.factory((name) => {
  if (name === 'react') return react
  throw new Error('意外的 require：' + name)
})

check('导出 apply，inject 里声明 slots', () => {
  eq(typeof mod.apply, 'function')
  assert(Array.isArray(mod.inject) && mod.inject.includes('slots'), 'inject 缺 slots')
})

/* 借 apply() 拿到被注册的面板组件 */
let Panel = null
mod.apply({
  slots: {
    inject(_n, fn) { return fn() },
    register(_meta, comp) { Panel = comp; return noop }
  }
})

check('注册了 settings.section，面板组件拿到了', () => {
  eq(typeof Panel, 'function')
})

/* ── 走渲染树 ─────────────────────────────────────────────────────────── */
/* 走渲染树：遇到函数组件就真的调用它（这才是 React 干的事），
   收集抛错、非法类型，顺便把出现过的组件名记下来。 */
function walk(node, where, ctx) {
  if (node === null || node === undefined || typeof node === 'boolean') return
  if (typeof node === 'string' || typeof node === 'number') return
  if (Array.isArray(node)) {
    node.forEach((n, i) => walk(n, where + '[' + i + ']', ctx))
    return
  }
  if (!node.$$el) { ctx.issues.push(where + ' 不是元素'); return }
  if (typeof node.type === 'string') {
    const kids = node.props && node.props.children
    if (kids) walk(kids, where + '>' + node.type, ctx)
    return
  }
  const name = node.type.name || '(anonymous)'
  ctx.names.add(name)
  let out
  try {
    out = node.type(node.props || {})
  } catch (e) {
    ctx.issues.push('<' + name + '> 渲染抛错：' + e.message)
    return
  }
  walk(out, where + '>' + name, ctx)
}

function render(draft) {
  cursor = 0
  draftOverride = draft
  const ctx = { issues: [], names: new Set() }
  walk({ $$el: true, type: Panel, props: {} }, 'Panel', ctx)
  return ctx
}

const cases = [
  ['还没读到配置（draft = null）', null],
  ['完整默认配置（' + Object.keys(DEFAULTS).length + ' 个字段）', DEFAULTS],
  ['只有两个字段的旧配置', { enabled: true, mode: 'session' }],
  ['空对象配置', {}]
]

for (const [name, draft] of cases) {
  check('渲染不抛错、组件类型都合法：' + name, () => {
    const ctx = render(draft)
    assert(ctx.issues.length === 0, ctx.issues.join(' / '))
  })
}

check('draft 里的每个字段都在 DEFAULTS 里有定义（不会读到 undefined）', () => {
  const bad = new Set()
  const keys = new Set(Object.keys(DEFAULTS))
  for (const m of clientSrc.matchAll(/\bdraft\.([A-Za-z][A-Za-z0-9]*)/g)) {
    if (!keys.has(m[1])) bad.add(m[1])
  }
  eq(bad.size, 0, '未定义的 draft 字段：' + [...bad].join(', '))
})

check('面板里该有的组件都渲染到了（含摄像头自检与诊断）', () => {
  const names = render(DEFAULTS).names
  for (const want of ['CamTest', 'CamDiag', 'Field', 'Select', 'Range', 'Check']) {
    assert(names.has(want), '渲染树里缺 ' + want)
  }
})

check('每个 useState 的取值器都成对解构（v1.3.0 的空白页就是这个坑）', () => {
  const lines = clientSrc.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = /var (s\d+) = react\.useState\(/.exec(lines[i])
    if (!m) continue
    const rest = lines.slice(i, i + 3).join(' ')
    const setter = new RegExp('set[A-Z][A-Za-z0-9]* = ' + m[1] + '\\[1\\]').test(rest)
    assert(setter, '第 ' + (i + 1) + ' 行 ' + m[1] + ' 没有把 [1] 解构给 setter')
  }
})

console.log('')
if (failures.length) {
  for (const f of failures) console.log('失败：' + f.name + '\n' + (f.e.stack || f.e.message))
  process.exit(1)
}
console.log('全部通过：' + passed + ' 项\n')
