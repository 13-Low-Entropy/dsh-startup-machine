/* ============================================================================
 * dsh-startup-machine — 取景框的 GPU 加速段（WebGL2 / WebGL1）
 * ----------------------------------------------------------------------------
 * 只干一件事：把一个视频帧/画布算成「每格肤色占比」的小表（cols×rows 个 0–1）。
 * 之后的连通域判定留在 CPU（见 face-track.js 的 analyze），因为那部分只有 300 格。
 *
 * 为什么这样分：
 *   · CPU 老路：getImageData(128×96) 会把 49 KB 从显存拉回内存，还要等一次
 *     管线同步；然后 12288 个像素在 JS 里逐个判肤色。
 *   · GPU 新路：texImage2D 直接把视频帧当纹理上传（通常零拷贝），片元着色器
 *     每个格子采样 10×10 个点算占比，readPixels 只读回 300×4 字节（1.2 KB）。
 *     像素数学在显卡上并行，内存里只过一张小表。
 *
 * 关于「用独显」—— 说清楚，别指望它凭空生效：
 *   网页**不能指定某块显卡**。这里能做的只有三件事，按可靠程度排序：
 *     1) powerPreference: 'high-performance' —— 向 Chromium 请求高性能适配器，
 *        这是 Web 平台唯一的 API 级信号，具体给不给由浏览器/驱动决定；
 *     2) 整个 DSH 进程的显卡首选项（Windows 设置 → 显示 → 显卡，或 NVIDIA 控制面板），
 *        这才是真正决定「跑在 4060 还是 610M」的开关；
 *     3) BIOS / 联想管家里开独显直连。
 *   所以本文件同时把 UNMASKED_RENDERER_WEBGL 读出来，设置页会显示你实际用的是哪块卡
 *   —— 与其猜，不如让界面直接告诉你。
 * ========================================================================== */
(function (root, factory) {
  var api = factory()
  if (typeof module === 'object' && module && module.exports) module.exports = api
  if (root) root.MSFaceTrackGL = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  /* 每个格子采样 S×S 个点。1024 个源像素的格子采 100 个点，占比估计的
     标准误差约 0.05 —— 阈值是 0.45 且后面还有时间平滑，够用。
     再往上加只会变慢，不会变准（真正的准是老路的逐像素统计，那是 CPU 的活）。 */
  var SAMPLES = 10

  var VERT = [
    'attribute vec2 a_pos;',
    'varying vec2 v_uv;',
    'void main() {',
    '  v_uv = a_pos * 0.5 + 0.5;',
    '  gl_Position = vec4(a_pos, 0.0, 1.0);',
    '}'
  ].join('\n')

  /* 肤色规则必须与 face-track.js 的 isSkin() 逐条对应（阈值一模一样）。
     改一边就得改另一边，否则 GPU 与 CPU 的结果会悄悄分叉。 */
  var FRAG = [
    'precision highp float;',
    'uniform sampler2D u_tex;',
    'uniform vec2 u_grid;',
    'varying vec2 v_uv;',
    'float isSkin(vec3 c255) {',
    '  float r = c255.r, g = c255.g, b = c255.b;',
    '  float mx = max(max(r, g), b);',
    '  float mn = min(min(r, g), b);',
    '  if (mx < 48.0) return 0.0;',
    '  if (mx - mn < 10.0) return 0.0;',
    '  if (r <= g || r <= b) return 0.0;',
    '  if (r - g < 10.0) return 0.0;',
    '  if (r < 72.0) return 0.0;',
    '  float y  = 0.299 * r + 0.587 * g + 0.114 * b;',
    '  float cb = 128.0 - 0.168736 * r - 0.331264 * g + 0.5 * b;',
    '  float cr = 128.0 + 0.5 * r - 0.418688 * g - 0.081312 * b;',
    '  if (y <= 46.0) return 0.0;',
    '  if (cb < 72.0 || cb > 132.0) return 0.0;',
    '  if (cr < 128.0 || cr > 180.0) return 0.0;',
    '  return 1.0;',
    '}',
    'void main() {',
    '  vec2 cell = floor(v_uv * u_grid);',
    '  vec2 base = cell / u_grid;',
    '  vec2 stp = 1.0 / (u_grid * ' + SAMPLES.toFixed(1) + ');',
    '  float hit = 0.0;',
    '  for (int y = 0; y < ' + SAMPLES + '; y++) {',
    '    for (int x = 0; x < ' + SAMPLES + '; x++) {',
    '      vec2 uv = base + (vec2(float(x), float(y)) + 0.5) * stp;',
    '      hit += isSkin(texture2D(u_tex, uv).rgb * 255.0);',
    '    }',
    '  }',
    '  gl_FragColor = vec4(hit / ' + (SAMPLES * SAMPLES).toFixed(1) + ', 0.0, 0.0, 1.0);',
    '}'
  ].join('\n')

  function compile(gl, type, src) {
    var sh = gl.createShader(type)
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      var log = ''
      try { log = gl.getShaderInfoLog(sh) || '' } catch (e) { log = '' }
      try { gl.deleteShader(sh) } catch (e) { /* noop */ }
      throw new Error('shader compile failed: ' + log)
    }
    return sh
  }

  /**
   * 建一个采样器。拿不到 WebGL 就返回 null —— 调用方必须准备好退回 CPU 路径。
   * @param {{powerPreference?:string}} [opts]
   */
  function create(opts) {
    var o = opts || {}
    if (typeof document === 'undefined') return null
    var canvas = null
    var gl = null
    var attrs = {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      desynchronized: true,
      /* 唯一的「请给我性能更好的那块卡」信号。不保证生效，见文件头说明。 */
      powerPreference: o.powerPreference || 'high-performance',
      failIfMajorPerformanceCaveat: false
    }
    try {
      canvas = document.createElement('canvas')
      gl = canvas.getContext('webgl2', attrs) ||
        canvas.getContext('webgl', attrs) ||
        canvas.getContext('experimental-webgl', attrs)
    } catch (e) {
      gl = null
    }
    if (!gl) return null

    var prog = null
    var buf = null
    var tex = null
    var locPos = -1
    var locTex = -1
    var locGrid = -1
    var readBuf = null
    var frac = null
    var curCols = 0
    var curRows = 0
    var renderer = ''

    try {
      var vs = compile(gl, gl.VERTEX_SHADER, VERT)
      var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
      prog = gl.createProgram()
      gl.attachShader(prog, vs)
      gl.attachShader(prog, fs)
      gl.linkProgram(prog)
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error('program link failed')
      }
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.useProgram(prog)

      locPos = gl.getAttribLocation(prog, 'a_pos')
      locTex = gl.getUniformLocation(prog, 'u_tex')
      locGrid = gl.getUniformLocation(prog, 'u_grid')

      buf = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
      gl.enableVertexAttribArray(locPos)
      gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0)

      tex = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      gl.uniform1i(locTex, 0)
    } catch (e) {
      return null
    }

    try {
      var dbg = gl.getExtension('WEBGL_debug_renderer_info')
      renderer = String(
        (dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) ||
        gl.getParameter(gl.RENDERER) || ''
      )
    } catch (e) { renderer = '' }

    function resize(cols, rows) {
      if (curCols === cols && curRows === rows) return
      curCols = cols
      curRows = rows
      canvas.width = cols
      canvas.height = rows
      readBuf = new Uint8Array(cols * rows * 4)
      frac = new Float32Array(cols * rows)
      gl.viewport(0, 0, cols, rows)
      gl.uniform2f(locGrid, cols, rows)
    }

    /**
     * @param {HTMLVideoElement|HTMLCanvasElement|ImageBitmap|OffscreenCanvas} source
     * @param {number} cols
     * @param {number} rows
     * @returns {Float32Array|null} 每格肤色占比（行优先，从上到下）
     */
    function grid(source, cols, rows) {
      if (!gl || !source) return null
      try {
        resize(cols, rows)
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        gl.readPixels(0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, readBuf)
      } catch (e) {
        return null
      }
      /* readPixels 第 0 行来自帧缓冲 y=0（视口底部），而 UNPACK_FLIP_Y=false 时
         uv.y=0 对应源图顶部 —— 两个翻转正好抵消，所以返回顺序就是「从上到下」，
         与 CPU 版的行序一致。下面这个注释就是防着以后有人「顺手修一下」。 */
      for (var i = 0; i < frac.length; i++) frac[i] = readBuf[i * 4] / 255
      return frac
    }

    function dispose() {
      try {
        if (gl) {
          if (tex) gl.deleteTexture(tex)
          if (buf) gl.deleteBuffer(buf)
          if (prog) gl.deleteProgram(prog)
          var lose = gl.getExtension('WEBGL_lose_context')
          if (lose) lose.loseContext()
        }
      } catch (e) { /* noop */ }
      gl = null
      canvas = null
      readBuf = null
      frac = null
    }

    return {
      ok: true,
      renderer: renderer,
      samples: SAMPLES,
      grid: grid,
      dispose: dispose
    }
  }

  /**
   * 后端门面：GPU 可用就走 GPU，不可用就退回 2D canvas。
   * splash.js 与设置页自检共用这一份，免得两处漂移。
   *
   * @param {{gpu?:boolean, cols?:number, rows?:number}} [opts]
   * @returns {{mode:'webgl'|'cpu', renderer:string, box:function, dispose:function}|null}
   */
  function createTracker(opts) {
    var o = opts || {}
    var FT = (typeof globalThis !== 'undefined' && globalThis.MSFaceTrack) || null
    if (!FT || typeof FT.detect !== 'function') return null
    var cols = o.cols || FT.COLS || 20
    var rows = o.rows || FT.ROWS || 15

    var gls = null
    if (o.gpu !== false) {
      try { gls = create() } catch (e) { gls = null }
    }
    var cv = null
    var g2 = null
    var dead = false

    function cpuBox(src) {
      if (!g2) {
        cv = document.createElement('canvas')
        cv.width = 128
        cv.height = 96
        try { g2 = cv.getContext('2d', { willReadFrequently: true }) } catch (e) { g2 = cv.getContext('2d') }
      }
      if (!g2) return null
      try { g2.drawImage(src, 0, 0, 128, 96) } catch (e) { return null }
      var img = null
      try { img = g2.getImageData(0, 0, 128, 96) } catch (e) { return null }
      return FT.detect(img)
    }

    function box(src) {
      if (!src) return null
      if (gls && !dead) {
        var fr = gls.grid(src, cols, rows)
        if (fr) return FT.analyze(fr, cols, rows)
        /* 上下文丢了（切换显卡 / 驱动重置 / 标签页被回收）：本场次降级到 CPU，
           不再每帧试一次，避免反复创建上下文。 */
        dead = true
      }
      return cpuBox(src)
    }

    function dispose() {
      if (gls) { try { gls.dispose() } catch (e) { /* noop */ } }
      gls = null
      g2 = null
      cv = null
    }

    return {
      mode: gls ? 'webgl' : 'cpu',
      renderer: gls ? (gls.renderer || '') : '',
      box: box,
      dispose: dispose
    }
  }

  return { create: create, createTracker: createTracker, SAMPLES: SAMPLES }
})
