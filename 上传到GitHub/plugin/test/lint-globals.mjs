/**
 * 静态扫描：找出「赋值给一个本文件里从没声明过的变量」。
 *
 * 为什么要做这个：v1.3.2 ~ v1.4.0 里有个 `chosen` —— 它声明在语音模块的
 * IIFE 内部，却在模块外的 voiceschanged 回调里被赋值，浏览器语音列表一变
 * 就抛 `ReferenceError: chosen is not defined`。node --check 查不出
 * （语法没问题），人工读也容易漏，但它会出现在用户的控制台里，
 * 看着就像插件坏了。
 *
 * 规则（宁可漏报不要误报）：
 *   · 找出所有 `标识符 =` 形态的赋值（排除 ==、===、!=、>=、<=、=>）
 *   · 排除属性赋值（a.b =）与下标赋值（a[0] =）
 *   · 声明来源：var/let/const（含逗号续声明与解构）、function 名、形参、
 *     箭头形参、catch 参数
 *
 * 能力边界（说清楚，别指望它做太多）：这是**文件级**检查，只知道「这个名字在
 * 本文件里被声明过」，不区分作用域。所以「内层函数里 var x、外层又给 x 赋值」
 * 这种它抓不到 —— v1.4.0 的 chosen 就是这种（已单独修，另有断言盯着）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FILES = [
  'lib/splash.js',
  'lib/hud-draw.js',
  'lib/face-track.js',
  'lib/face-track-gl.js',
  'lib/eye-track.js',
  'lib/face-landmark.js',
  'lib/index.js',
  'lib/client.js'
]

function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
}

function declaredNames(src) {
  const names = new Set()
  let m
  /* var / let / const（含逗号续声明）：
     用「声明词或逗号之后紧跟 标识符 =」来取，
     避免把对象字面量里的键也算成变量。 */
  const decl = /(?:\b(?:var|let|const)\s+|,)\s*([A-Za-z_$][\w$]*)\s*=/g
  while ((m = decl.exec(src))) names.add(m[1])
  /* 没有初始值的声明：var a, b */
  const decl2 = /\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*(?:;|,)/g
  while ((m = decl2.exec(src))) names.add(m[1])
  /* 解构声明：var { a, b } = … */
  const destr = /\b(?:var|let|const)\s*\{([^}]*)\}\s*=/g
  while ((m = destr.exec(src))) {
    for (const part of m[1].split(',')) {
      const id = /^\s*([A-Za-z_$][\w$]*)/.exec(part)
      if (id) names.add(id[1])
    }
  }
  /* function 名 */
  const fn = /\bfunction\s+([A-Za-z_$][\w$]*)/g
  while ((m = fn.exec(src))) names.add(m[1])
  /* function 形参 */
  const fp = /\bfunction[^{]*?\(([^)]*)\)/g
  while ((m = fp.exec(src))) {
    for (const part of m[1].split(',')) {
      const id = /^\s*([A-Za-z_$][\w$]*)/.exec(part)
      if (id) names.add(id[1])
    }
  }
  /* 箭头函数形参：(a, b) => */
  const ap = /\(([^)]*)\)\s*=>/g
  while ((m = ap.exec(src))) {
    for (const part of m[1].split(',')) {
      const id = /^\s*([A-Za-z_$][\w$]*)/.exec(part)
      if (id) names.add(id[1])
    }
  }
  /* 箭头函数单形参：a => */
  const ap1 = /(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*=>/g
  while ((m = ap1.exec(src))) names.add(m[1])
  /* catch (e) */
  const ct = /\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g
  while ((m = ct.exec(src))) names.add(m[1])
  return names
}

/* 浏览器/宿主提供的全局 */
const GLOBALS = new Set([
  'window', 'document', 'navigator', 'location', 'console', 'Math', 'JSON', 'Object', 'Array',
  'String', 'Number', 'Boolean', 'Date', 'RegExp', 'Error', 'TypeError', 'RangeError',
  'Promise', 'Symbol', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Infinity', 'NaN', 'undefined',
  'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout',
  'setInterval', 'clearInterval', 'performance', 'fetch', 'Uint8Array', 'Uint8ClampedArray',
  'Int32Array', 'Float32Array', 'Image', 'AudioContext', 'webkitAudioContext', 'Audio',
  'XMLHttpRequest', 'globalThis', 'self', 'top', 'parent', 'arguments', 'event',
  'speechSynthesis', 'SpeechSynthesisUtterance', 'AudioParam', 'OscillatorNode', 'GainNode',
  'module', 'exports', 'require'
])

let passed = 0
const failures = []
function check(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name) }
  catch (e) { failures.push(name + ' — ' + e.message); console.log('  FAIL ' + name + '\n        ' + e.message) }
}

console.log('\n[未声明变量扫描]')

for (const rel of FILES) {
  const full = path.join(ROOT, rel)
  if (!fs.existsSync(full)) continue
  const raw = fs.readFileSync(full, 'utf8')
  const src = stripCommentsAndStrings(raw)
  const declared = declaredNames(src)

  check(rel + '：没有赋值给未声明的变量', () => {
    const bad = []
    const lines = src.split('\n')
    lines.forEach((line, i) => {
      /* 标识符 = ，但不是 ==/===/!=/>=/<=/=>，也不是 a.b / a[0] */
      const re = /(?<![.\w$])([A-Za-z_$][\w$]*)\s*=(?![=>])/g
      let m
      while ((m = re.exec(line))) {
        const name = m[1]
        if (declared.has(name) || GLOBALS.has(name)) continue
        bad.push((i + 1) + ': ' + line.trim().slice(0, 76))
        break
      }
    })
    if (bad.length) throw new Error(bad.join(' | '))
  })
}

console.log('')
if (failures.length) {
  for (const f of failures) console.log('失败：' + f)
  process.exit(1)
}
console.log('全部通过：' + passed + ' 项\n')
