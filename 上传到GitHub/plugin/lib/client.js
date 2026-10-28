/**
 * dsh-startup-machine — 浏览器半侧（设置页「启动动画」）
 * ----------------------------------------------------------------------------
 * 以 dsh.client bundle 格式加载（手写 ModuleLoader bundle，无需构建）：
 * 在 DSH 设置里注册一个 settings.section，用来改字幕、每幕时长、
 * 摄像头清晰度、眼部马赛克、配色等等。
 *
 * 数据不走 settings 命名空间，而是走 Host 半侧的 HTTP API
 * （GET/POST /machine-startup/config）。注册 id 必须等于 loader entry 名
 * （dsh-startup-machine），否则 ModuleLoader 会报
 * "loaded without registering dsh-startup-machine"。
 */
window.__ModuleLoader__.load({
  id: 'dsh-startup-machine',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var react = require('react')
    var h = react.createElement

    var API = '/machine-startup/config'

    /* ── CSS ─────────────────────────────────────────────────────────────── */
    var CSS = [
      '.__ms_root{max-width:660px;display:flex;flex-direction:column;gap:14px;font-size:13px;color:var(--dsw-alias-label-primary)}',
      '.__ms_version{font-family:ui-monospace,Consolas,monospace;font-size:12px;letter-spacing:.04em;color:var(--dsw-alias-label-tertiary)}',
      '.__ms_group{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:11px}',
      '.__ms_groupTitle{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary)}',
      '.__ms_field{display:flex;flex-direction:column;gap:5px}',
      '.__ms_label{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.__ms_hint{font-size:11px;line-height:1.55;color:var(--dsw-alias-label-tertiary)}',
      '.__ms_row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.__ms_input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 10px;font-size:13px;box-sizing:border-box;width:100%;outline:none}',
      '.__ms_input:focus{border-color:var(--dsw-alias-state-business-primary)}',
      '.__ms_area{width:100%;min-height:76px;resize:vertical;padding:7px 9px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1.55;outline:none;box-sizing:border-box}',
      '.__ms_inputMono{font-family:ui-monospace,Consolas,monospace;font-size:12px;letter-spacing:.06em}',
      '.__ms_select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 8px;font:inherit;font-size:13px;min-width:180px}',
      '.__ms_check{display:flex;align-items:flex-start;gap:8px;cursor:pointer}',
      '.__ms_check input{margin-top:2px;accent-color:var(--dsw-alias-state-business-primary)}',
      '.__ms_checkText{display:flex;flex-direction:column;gap:2px}',
      '.__ms_two{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
      '.__ms_three{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}',
      '.__ms_actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:2px}',
      '.__ms_btn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 14px;font:inherit;font-size:13px;cursor:pointer}',
      '.__ms_btn:hover:not(:disabled){border-color:var(--dsw-alias-state-business-primary)}',
      '.__ms_btn:disabled{opacity:.5;cursor:default}',
      '.__ms_btnPrimary{border-color:var(--dsw-alias-state-business-primary,#3964fe);background:var(--dsw-alias-state-business-primary,#3964fe);color:#fff}',
      '.__ms_status{font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.__ms_ok{font-size:12px;color:var(--dsw-alias-state-business-primary)}',
      '.__ms_err{font-size:12px;color:var(--dsw-alias-state-error-primary,#f85149)}',
      '.__ms_swatch{width:38px;height:26px;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;cursor:pointer}',
      '.__ms_preview{margin-top:2px;border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:12px}',
      '.__ms_previewText{font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:1.5}',
      '.__ms_act{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:9px 10px;display:flex;flex-direction:column;gap:8px;background:var(--dsw-alias-bg-layer-2)}',
      '.__ms_actHead{display:flex;align-items:center;justify-content:space-between;gap:10px}',
      '.__ms_actName{font-size:12px;font-weight:600;letter-spacing:.04em}',
      '.__ms_actMs{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-tertiary)}',
      /* 摄像头自检 */
      '.__ms_cam{display:grid;grid-template-columns:220px minmax(0,1fr);gap:12px;align-items:start}',
      '.__ms_camStage{position:relative;width:100%;aspect-ratio:4/3;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;overflow:hidden;background:repeating-linear-gradient(0deg,#070b10 0 2px,#0a0f15 2px 4px)}',
      '.__ms_camStage video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}',
      '.__ms_camStage .mirror{transform:scaleX(-1)}',
      '.__ms_camBox{position:absolute;transform:translate(-50%,-50%)}',
      '.__ms_camHud{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}',
      '.__ms_camEyes{position:absolute;left:4%;right:4%;display:flex;align-items:stretch}',
      '.__ms_camMsg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:10px;font-size:10px;line-height:1.6;letter-spacing:.14em;color:#7d93a6;font-family:ui-monospace,Consolas,monospace}',
      '@media (max-width: 640px){.__ms_cam{grid-template-columns:1fr}.__ms_two,.__ms_three{grid-template-columns:1fr}}'
    ].join('')
    var tagId = 'dsh-startup-machine/main.css'
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="' + tagId + '"]') === null) {
      var tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-startup-machine'
      tag.dataset.pluginCss = tagId
      tag.textContent = CSS
      ;(document.head || document.documentElement).appendChild(tag)
    }

    /* ── 表单原子 ────────────────────────────────────────────────────────── */
    function Field(props) {
      return h('div', { className: '__ms_field' },
        h('label', { className: '__ms_label' }, props.label),
        props.children,
        props.hint ? h('div', { className: '__ms_hint' }, props.hint) : null
      )
    }

    /* 多行文本：第一幕左上角那列系统名是一行一个，单行 input 存不下换行 */
    function TextArea(props) {
      return h('textarea', {
        className: '__ms_area' + (props.mono ? ' __ms_inputMono' : ''),
        rows: props.rows || 6,
        value: props.value == null ? '' : String(props.value),
        placeholder: props.placeholder || '',
        maxLength: props.maxLength || 800,
        spellCheck: false,
        onChange: function (e) { props.onChange(e.target.value) }
      })
    }

    function TextInput(props) {
      return h('input', {
        className: '__ms_input' + (props.mono ? ' __ms_inputMono' : ''),
        type: 'text',
        value: props.value == null ? '' : String(props.value),
        placeholder: props.placeholder || '',
        maxLength: props.maxLength || 120,
        spellCheck: false,
        onChange: function (e) { props.onChange(e.target.value) }
      })
    }

    function Select(props) {
      return h('select', {
        className: '__ms_select',
        value: String(props.value),
        onChange: function (e) {
          var v = e.target.value
          var num = Number(v)
          props.onChange(props.numeric && isFinite(num) ? num : v)
        }
      }, props.options.map(function (o) {
        return h('option', { key: String(o[0]), value: String(o[0]) }, o[1])
      }))
    }

    function Check(props) {
      return h('label', { className: '__ms_check' },
        h('input', {
          type: 'checkbox',
          checked: !!props.checked,
          onChange: function (e) { props.onChange(e.target.checked) }
        }),
        h('span', { className: '__ms_checkText' },
          h('span', null, props.label),
          props.hint ? h('span', { className: '__ms_hint' }, props.hint) : null
        )
      )
    }

    function ColorInput(props) {
      return h('input', {
        className: '__ms_swatch',
        type: 'color',
        value: props.value,
        onChange: function (e) { props.onChange(e.target.value) }
      })
    }

    function Range(props) {
      return h('div', { className: '__ms_row' },
        h('input', {
          type: 'range',
          min: props.min, max: props.max, step: props.step || 1,
          value: Number(props.value),
          style: { flex: '1 1 180px' },
          onChange: function (e) { props.onChange(Number(e.target.value)) }
        }),
        h('span', { className: '__ms_status', style: { minWidth: '56px', textAlign: 'right' } }, props.display)
      )
    }

    function num(v, d) {
      var n = Number(v)
      return isFinite(n) ? n : d
    }
    function sec(ms) { return (num(ms, 0) / 1000).toFixed(1) + ' s' }

    /* ── 摄像头自检 ──────────────────────────────────────────────────────── */
    /* 不存任何东西、不上传：只为让你当场看清「清晰度 / 取景框 / 黑条」长什么样。
       马赛克同样用 DOM 黑块，与启动动画里的实现保持一致。 */
    function CamTest(props) {
      var d = props.draft
      var st = react.useState('idle')          // idle | asking | live | denied
      var status = st[0], setStatus = st[1]
      var vr = react.useRef(null)
      var sr = react.useRef(null)

      function stop() {
        try {
          if (sr.current) sr.current.getTracks().forEach(function (t) { t.stop() })
        } catch (e) { /* noop */ }
        sr.current = null
        try {
          if (vr.current) { vr.current.pause(); vr.current.srcObject = null }
        } catch (e) { /* noop */ }
        setStatus('idle')
      }

      function start() {
        setStatus('asking')
        var md = navigator.mediaDevices
        if (!md || !md.getUserMedia) { setStatus('denied'); return }
        md.getUserMedia({
          audio: false,
          video: {
            width: { ideal: num(d.camWidth, 640) },
            height: { ideal: Math.round(num(d.camWidth, 640) * 0.75) },
            facingMode: 'user'
          }
        }).then(function (stream) {
          sr.current = stream
          if (vr.current) {
            vr.current.srcObject = stream
            var p = vr.current.play()
            if (p && p.catch) p.catch(function () { /* noop */ })
          }
          setStatus('live')
        }).catch(function () { setStatus('denied') })
      }

      react.useEffect(function () { return stop }, [])

      /* 自检窗口也跑追踪：走同一个后端门面（GPU 优先），同一套 cover 裁切 / 镜像换算。
         顺带把「实际用的是哪块卡」显示出来 —— 网页不能指定显卡，能做的只有
         powerPreference 提示，剩下取决于系统里的显卡首选项。 */
      var stageR = react.useRef(null)
      var bst = react.useState(null)
      var tracked = bst[0], setTracked = bst[1]
      var kst = react.useState({ mode: '', renderer: '' })
      var backend = kst[0], setBackend = kst[1]
      /* 网格引擎就位的提示：和启动动画同一条路子（肤色先跑、网格接管） */
      var lst = react.useState('')
      var lmLabel = lst[0], setLmLabel = lst[1]
      var lmRef = react.useRef(null)

      var hudR = react.useRef(null)
      var styleOf = function (dd) {
        var m = { ASSET: 'yellow', ADMIN: 'yellow', CONTINGENCY: 'yellow', THREAT: 'red', IRRELEVANT: 'white' }
        if (dd.boxStyle && dd.boxStyle !== 'auto') return dd.boxStyle
        return m[String(dd.status || '').toUpperCase()] || 'white'
      }

      react.useEffect(function () {
        if (status !== 'live') { setTracked(null); return }
        var dref = { cur: d }
        dref.cur = d
        var FT = window.MSFaceTrack
        var tracker = null
        if (d.faceTrack && FT) {
          try {
            if (window.MSFaceTrackGL && window.MSFaceTrackGL.createTracker) {
              tracker = window.MSFaceTrackGL.createTracker({ gpu: d.trackGpu !== false })
            }
          } catch (e) { tracker = null }
        }
        setBackend(tracker ? { mode: tracker.mode, renderer: tracker.renderer } : { mode: '', renderer: '' })

        /* 网格引擎异步装载：好了就顶替肤色法，没好就继续用肤色法（自检窗口不会空着） */
        var cancelled = false
        setLmLabel('')
        var LM = window.MSFaceLandmark
        var assets = window.__DSH_MACHINE_ASSETS__
        if (d.faceTrack && d.faceEngine !== 'skin' && LM && assets && vr.current) {
          LM.create({
            video: vr.current,
            basePath: assets,
            delegate: d.trackGpu === false ? 'CPU' : 'GPU'
          }).then(function (tr) {
            if (cancelled) { try { tr.dispose() } catch (e) { /* noop */ } return }
            lmRef.current = tr
            setLmLabel('478 点网格 · ' + tr.backend)
          }).catch(function () { if (!cancelled) setLmLabel('网格模型没装好，已退回肤色法') })
        }

        var cur = {
          x: num(d.faceX, 50) / 100, y: num(d.faceY, 44) / 100,
          w: num(d.faceW, 34) / 100, h: num(d.faceH, 46) / 100
        }
        var id = setInterval(function () {
          var v = vr.current
          var stage = stageR.current
          var cvs = hudR.current
          var dd = dref.cur
          if (!stage) return
          var rect = stage.getBoundingClientRect()
          if (!rect.width || !rect.height) return

          /* ── 追踪（开了才跑）：网格引擎优先，没就位就用肤色法 ── */
          var lm = lmRef.current
          var hit = null
          if (dd.faceTrack && v && v.videoWidth) {
            if (lm) {
              try { var lr = lm.detect(); hit = lr ? lr.box : null } catch (e) { hit = null }
            } else if (tracker) {
              try { hit = tracker.box(v) } catch (e) { hit = null }
            }
          }
          if (hit) {
            var boxAspect = rect.width / rect.height
            var vidAspect = v.videoWidth / v.videoHeight
            var fx = 1, fy = 1
            if (vidAspect > boxAspect) fx = boxAspect / vidAspect
            else fy = vidAspect / boxAspect
            var tx = (hit.x - (1 - fx) / 2) / fx
            var ty = (hit.y - (1 - fy) / 2) / fy
            var tw = hit.w / fx
            var th = hit.h / fy
            if (dd.camMirror) tx = 1 - tx
            var a = 0.10 + ((num(dd.trackAgility, 5) - 1) / 9) * 0.45
            cur.x += (tx - cur.x) * a
            cur.y += (ty - cur.y) * a
            cur.w += (tw - cur.w) * a
            cur.h += (th - cur.h) * a
            setTracked({
              x: Math.min(1.05, Math.max(-0.05, cur.x)),
              y: Math.min(1.05, Math.max(-0.05, cur.y)),
              w: Math.min(0.95, Math.max(0.10, cur.w)),
              h: Math.min(0.95, Math.max(0.12, cur.h))
            })
          }

          /* ── 画框：直接用和启动动画同一份 hud-draw ── */
          var H = window.MSHud
          if (!cvs || !H) return
          var g2 = null
          try { g2 = cvs.getContext('2d') } catch (e) { g2 = null }
          if (!g2) return
          var dpr = Math.min(2, window.devicePixelRatio || 1)
          var pw = Math.round(rect.width * dpr)
          var ph = Math.round(rect.height * dpr)
          if (cvs.width !== pw || cvs.height !== ph) { cvs.width = pw; cvs.height = ph }
          g2.setTransform(dpr, 0, 0, dpr, 0, 0)
          g2.clearRect(0, 0, rect.width, rect.height)
          var sq = H.squareFromBox(cur, rect.width, rect.height)
          var st = styleOf(dd)
          H.drawBox(g2, sq[0], sq[1], sq[2], sq[3], st, 1)
          if (dd.boxLabel) {
            H.drawLabel(g2, String(dd.identity || 'OPERATOR'), sq[0], sq[1], sq[2], sq[3], st, 1, rect.width)
          }
        }, 130)
        return function () {
          cancelled = true
          clearInterval(id)
          try { if (tracker) tracker.dispose() } catch (e) { /* noop */ }
          try { if (lmRef.current) lmRef.current.dispose() } catch (e) { /* noop */ }
          lmRef.current = null
          var cvs = hudR.current
          if (cvs) {
            try {
              var g2 = cvs.getContext('2d')
              g2.setTransform(1, 0, 0, 1, 0, 0)
              g2.clearRect(0, 0, cvs.width, cvs.height)
            } catch (e) { /* noop */ }
          }
        }
      }, [status, d.faceTrack, d.faceEngine])

      var box = tracked || {
        x: num(d.faceX, 50) / 100,
        y: num(d.faceY, 44) / 100,
        w: num(d.faceW, 34) / 100,
        h: num(d.faceH, 46) / 100
      }
      var w = (box.w * 100).toFixed(2)
      var hh = (box.h * 100).toFixed(2)
      var cx = (box.x * 100).toFixed(2)
      var cy = (box.y * 100).toFixed(2)
      var blocks = Math.round(num(d.mosaicBlocks, 1))
      var eyes = []
      for (var i = 0; i < blocks; i++) {
        var mid = Math.abs(i - (blocks - 1) / 2) / Math.max(1, (blocks - 1) / 2)
        eyes.push(h('i', {
          key: i,
          style: {
            flexGrow: mid < 0.28 ? 1.25 : (mid > 0.86 ? 0.62 : 1),
            background: '#000',
            height: '100%'
          }
        }))
      }

      return h('div', { className: '__ms_field' },
        h('label', { className: '__ms_label' }, '摄像头自检'),
        h('div', { className: '__ms_cam' },
          h('div', { className: '__ms_camStage', ref: stageR },
            h('video', { ref: vr, playsInline: true, muted: true, className: d.camMirror ? 'mirror' : '' }),
            status === 'live' ? h('div', {
              className: '__ms_camBox',
              style: {
                left: cx + '%',
                top: cy + '%',
                width: w + '%',
                height: hh + '%'
              }
            },
              d.mosaic ? h('div', {
                className: '__ms_camEyes',
                style: {
                  top: num(d.mosaicOffset, 36) + '%',
                  height: num(d.mosaicHeight, 13) + '%',
                  gap: num(d.mosaicGap, 2) + 'px'
                }
              }, eyes) : null
            ) : null,
            h('canvas', { className: '__ms_camHud', ref: hudR }),
            status !== 'live' ? h('div', { className: '__ms_camMsg' },
              status === 'asking' ? 'REQUESTING CAMERA…'
                : status === 'denied' ? 'CAMERA DENIED · 浏览器拦了，启动动画会自动降级为纯 HUD'
                  : 'NO FEED · 点右侧「打开摄像头」'
            ) : null
          ),
          h('div', { className: '__ms_field' },
            h('div', { className: '__ms_row' },
              h('button', {
                className: '__ms_btn', type: 'button',
                onClick: status === 'live' ? stop : start
              }, status === 'live' ? '关闭摄像头' : '打开摄像头'),
              h('span', { className: '__ms_status' },
                status !== 'live' ? '' : (tracked ? 'LIVE · TRACKING' : (d.faceTrack ? 'LIVE · SEARCHING' : 'LIVE · FIXED')))
            ),
            lmLabel || backend.mode ? h('div', { className: '__ms_status', style: { wordBreak: 'break-all' } },
              lmLabel
                ? '引擎：' + lmLabel
                : '引擎：肤色追踪 · ' + (backend.mode === 'webgl' ? 'WebGL（GPU）' : 'CPU（2D canvas）')
                  + (backend.renderer ? ' · ' + backend.renderer : '')
            ) : null,
            h('div', { className: '__ms_hint' },
              '用当前「未保存」的参数实时预览：左右动一动，取景框和黑条会跟着你走。'
              + '这段只在设置页跑，关掉就释放摄像头，不做任何录制或上传。'
              + (window.MSFaceTrack ? '' : '（追踪脚本没加载到，这里只能看固定框）')
            )
          )
        )
      )
    }

    /* ── 幕表 ────────────────────────────────────────────────────────────── */
    /* 摄像头诊断：把「为什么没有画面」变成一行能读的东西。
       启动动画的失败是瞬时且无语的，用户在设置页按一下这个，
       就能看到协议 / 安全上下文 / 权限状态 / 真实错误名。 */
    function CamDiag() {
      var st = react.useState(null)
      var info = st[0], setInfo = st[1]
      var bst = react.useState(false)
      var busy = bst[0], setBusy = bst[1]
      var pst = react.useState('')
      var perm = pst[0], setPerm = pst[1]

      var proto = '', secure = false, hasApi = false
      try { proto = String(location.protocol || '') } catch (e) { /* noop */ }
      try { secure = window.isSecureContext === true } catch (e) { /* noop */ }
      try {
        hasApi = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
      } catch (e) { /* noop */ }

      react.useEffect(function () {
        var md = null
        try { md = navigator.mediaDevices } catch (e) { md = null }
        if (!md || !md.permissions || !md.permissions.query) { setPerm('无法查询'); return }
        var q = null
        try { q = md.permissions.query({ name: 'camera' }) } catch (e) { setPerm('无法查询'); return }
        if (!q || !q.then) { setPerm('无法查询'); return }
        q.then(function (p2) {
          setPerm(p2.state)
          p2.onchange = function () { setPerm(p2.state) }
        }).catch(function () { setPerm('无法查询') })
      }, [])

      function probe() {
        setBusy(true)
        setInfo({ state: 'asking', text: '请求中…如果浏览器弹了授权框，请点允许。' })
        var md = null
        try { md = navigator.mediaDevices } catch (e) { md = null }
        if (!md || !md.getUserMedia) {
          setInfo({ state: 'err', text: 'navigator.mediaDevices 不可用 · 协议 ' + proto + ' · isSecureContext=' + secure })
          setBusy(false)
          return
        }
        md.getUserMedia({ audio: false, video: { width: { ideal: 640 }, height: { ideal: 480 } } })
          .then(function (stream) {
            var t = null
            try { t = stream.getVideoTracks()[0] } catch (e) { t = null }
            var g = (t && t.getSettings) ? t.getSettings() : {}
            setInfo({
              state: 'ok',
              text: 'OK · ' + (g.width || '?') + '×' + (g.height || '?')
                + (t && t.label ? ' · ' + t.label : '')
            })
            try { stream.getTracks().forEach(function (k) { k.stop() }) } catch (e) { /* noop */ }
          })
          .catch(function (e) {
            setInfo({
              state: 'err',
              text: ((e && (e.name || e.code)) || 'Error') + (e && e.message ? ' · ' + e.message : '')
            })
          })
          .then(function () { setBusy(false) })
      }

      var bad = info && info.state === 'err'
      return h('div', { className: '__ms_preview' },
        h('div', { className: '__ms_previewText' },
          '诊断 · 协议 ' + (proto || '?') + ' · 安全上下文 ' + (secure ? '是' : '否')
          + ' · 摄像头 API ' + (hasApi ? '可用' : '不可用')
          + ' · 权限 ' + (perm || '查询中…'),
          info ? h('div', { className: bad ? '__ms_err' : '__ms_ok', style: { marginTop: '4px' } }, info.text) : null,
          bad && /NotAllowed|Permission/i.test(info.text)
            ? h('div', { className: '__ms_hint', style: { marginTop: '4px' } },
              '被拒了。桌面端要在系统「隐私和安全性 → 相机」里允许 DSH；'
              + '或者用 dsh web 在浏览器里打开，授权一次就记住了。')
            : null
        ),
        h('button', { className: '__ms_btn', onClick: probe, disabled: busy },
          busy ? '测试中…' : '跑一次摄像头测试')
      )
    }

    var ACT_META = [
      { k: 'Boot', name: '01 · 系统唤醒', en: 'BOOT' },
      { k: 'Scan', name: '02 · 身份扫描', en: 'SCAN' },
      { k: 'Match', name: '03 · 档案比对', en: 'MATCH' },
      { k: 'Access', name: '04 · 权限授予', en: 'ACCESS' },
      { k: 'Handoff', name: '05 · 揭幕', en: 'HANDOFF' }
    ]

    /* ── 面板 ────────────────────────────────────────────────────────────── */
    /* 版本号只有一个来源：plugin/package.json。
       Host 把它注入成 window.__DSH_MACHINE_VERSION__，/config 路由也会回一份，
       两条都拿不到就**不显示版本行** —— 以前这里写死了一个 '1.5.0' 兜底，
       包是 1.2.3 时面板就顶着 v1.5.0，而排错表恰恰是「看面板底部版本号判断
       装的是不是旧版」，兜底值反而把排错带偏。 */
    function readInjectedVersion() {
      try {
        var v = window.__DSH_MACHINE_VERSION__
        return v ? String(v) : ''
      } catch (e) { return '' }
    }

    function Panel() {
      var s1 = react.useState(null), draft = s1[0], setDraft = s1[1]
      var s2 = react.useState(''), file = s2[0], setFile = s2[1]
      var s3 = react.useState(readInjectedVersion), version = s3[0], setVersion = s3[1]
      var s4 = react.useState(null), error = s4[0], setError = s4[1]
      var s5 = react.useState(null), notice = s5[0], setNotice = s5[1]
      var s6 = react.useState(false), busy = s6[0], setBusy = s6[1]

      function load() {
        setError(null)
        return fetch(API, { headers: { Accept: 'application/json' } })
          .then(function (r) { return r.json() })
          .then(function (j) {
            if (!j || j.ok !== true) throw new Error((j && j.error) || 'load failed')
            setDraft(j.config || {})
            setFile(j.file || '')
            if (j.version) setVersion(String(j.version))
          })
          .catch(function (e) { setError('读取配置失败：' + String(e && e.message ? e.message : e)) })
      }
      react.useEffect(function () { load() }, [])

      function set(key, value) {
        setNotice(null)
        setDraft(function (d) {
          var next = Object.assign({}, d)
          next[key] = value
          return next
        })
      }

      function save() {
        if (!draft) return
        setBusy(true); setNotice(null); setError(null)
        fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patch: draft })
        })
          .then(function (r) { return r.json() })
          .then(function (j) {
            if (!j || j.ok !== true) throw new Error((j && j.error) || 'save failed')
            setDraft(j.config || {})
            setNotice('已保存。下次打开 DSH 生效；点「立即预览」可以立刻按新设置重播。')
          })
          .catch(function (e) { setError('保存失败：' + String(e && e.message ? e.message : e)) })
          .then(function () { setBusy(false) })
      }

      function reset() {
        setBusy(true); setNotice(null); setError(null)
        fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reset' })
        })
          .then(function (r) { return r.json() })
          .then(function (j) {
            if (!j || j.ok !== true) throw new Error((j && j.error) || 'reset failed')
            setDraft(j.config || {})
            setNotice('已恢复默认。')
          })
          .catch(function (e) { setError('恢复默认失败：' + String(e && e.message ? e.message : e)) })
          .then(function () { setBusy(false) })
      }

      function preview() {
        var api = window.__DSH_MACHINE_API__
        if (api && typeof api.replay === 'function') {
          /* 把「面板里当前的值」直接传过去：不用先保存也能按新设置重播。
             以前的实现只调 replay()，而启动器只在页面加载时读一次配置，
             所以改完点什么都没变 —— 这就是「预览不生效」的原因。 */
          api.replay(draft)
          return
        }
        window.location.reload()
      }

      /* 拿不到版本就整行不渲染（React 会忽略 null 子节点），不做任何硬编码兜底 */
      var versionLine = version
        ? h('div', { className: '__ms_version' }, '版本 v' + version)
        : null

      if (!draft) {
        return h('div', { className: '__ms_root' },
          versionLine,
          h('div', { className: '__ms_status' }, error ? error : '读取配置中…'),
          error ? h('div', { className: '__ms_actions' },
            h('button', { className: '__ms_btn', onClick: load }, '重试')
          ) : null
        )
      }

      var totalMs = 0
      for (var ai = 0; ai < ACT_META.length; ai++) totalMs += num(draft['act' + ACT_META[ai].k], 0)

      var modeOptions = [
        ['session', '每个浏览器会话一次'],
        ['daily', '每天一次'],
        ['always', '每次打开都播放']
      ]

      return h('div', { className: '__ms_root' },
        versionLine,

        /* 播放 */
        h('div', { className: '__ms_group' },
          h('div', { className: '__ms_groupTitle' }, '播放'),
          h(Check, {
            label: '启用启动动画',
            hint: '关闭后直接进主界面。',
            checked: draft.enabled,
            onChange: function (v) { set('enabled', v) }
          }),
          h(Field, { label: '播放时机' },
            h(Select, { value: draft.mode, options: modeOptions, onChange: function (v) { set('mode', v) } })
          ),
          h(Check, {
            label: '允许跳过',
            hint: '右上角常驻 SKIP 按钮；Esc / 空格 / 回车 也能一键跳过。',
            checked: draft.allowSkip,
            onChange: function (v) { set('allowSkip', v) }
          }),
          h(Field, {
            label: '全局倍率',
            hint: '按倍数整体缩放五幕时长。0.4 慢放 · 1 原速 · 2.5 快放。'
          },
            h(Range, {
              value: num(draft.speed, 1), min: 0.4, max: 2.5, step: 0.05,
              display: num(draft.speed, 1).toFixed(2) + '×',
              onChange: function (v) { set('speed', v) }
            })
          )
        ),

        /* 每幕时长 */
        h('div', { className: '__ms_group' },
          h('div', { className: '__ms_groupTitle' }, '每一幕的时长'),
          h('div', { className: '__ms_hint' },
            '默认五幕合计 ' + sec(7500) + '。当前合计 ' + sec(totalMs)
            + '，再乘倍率 ' + num(draft.speed, 1).toFixed(2) + '× ≈ '
            + (totalMs / 1000 / num(draft.speed, 1)).toFixed(1) + ' 秒。'
            + '第二幕（身份扫描）建议不低于 2.5 秒，否则摄像头还没亮就切走了。'
          ),
          h(Check, {
            label: '字幕逐字输入',
            hint: '像终端在打字：从第一个字开始一个一个出，字后面跟着一块闪烁的光标。'
              + '幕太短或者字太多时会自动加快，绝不会拖到下一幕。',
            checked: draft.typewriter !== false,
            onChange: function (v) { set('typewriter', v) }
          }),
          draft.typewriter !== false ? h('div', { className: '__ms_two' },
            h(Field, { label: '每字间隔', hint: '毫秒/字。只当上限用 —— 时间不够会自动压缩。' },
              h(Range, {
                value: num(draft.typeSpeed, 34), min: 8, max: 90, step: 2,
                display: num(draft.typeSpeed, 34) + ' ms',
                onChange: function (v) { set('typeSpeed', v) }
              })
            ),
            h(Check, {
              label: '打完留光标',
              hint: '整句打完后那块光标继续闪，像终端还没关掉。关掉就是打完结账、光标消失。',
              checked: draft.typeCursor !== false,
              onChange: function (v) { set('typeCursor', v) }
            })
          ) : null,
          ACT_META.map(function (a) {
            var key = 'act' + a.k
            return h('div', { className: '__ms_act', key: key },
              h('div', { className: '__ms_actHead' },
                h('span', { className: '__ms_actName' }, a.name),
                h('span', { className: '__ms_actMs' }, a.en + ' · ' + sec(draft[key]))
              ),
              h(Range, {
                value: num(draft[key], 1000), min: 200, max: a.k === 'Scan' ? 15000 : 6000, step: 100,
                display: sec(draft[key]),
                onChange: function (v) { set(key, v) }
              })
            )
          }),
          h(Field, {
            label: '强制跳过',
            hint: '超过这个时间无论如何收场。自动 = 跟着上面各幕合计 + 9 秒余量，改任何一幕都会自动跟着变；'
              + '填小于合计的数值就是硬切（会在某一幕中间结束）。'
          },
            h(Range, {
              value: num(draft.hardStopMs, 0), min: 0, max: 60000, step: 500,
              display: (function () {
                var hv = num(draft.hardStopMs, 0)
                var tot = Math.round(totalMs / (num(draft.speed, 1) || 1))
                if (hv <= 0) return '自动 · ' + sec(tot + 9000)
                /* 短于合计就是硬切 —— 直接把话说在前面，免得用户以为是「后面几幕丢了」 */
                return hv < tot ? sec(hv) + ' · 短于合计，会中途切断' : sec(hv)
              })(),
              onChange: function (v) { set('hardStopMs', Math.round(v)) }
            })
          )
        ),

        /* 音效（1.2.4 起没有人声播报，这个组只留 WebAudio 音效） */
        h('div', { className: '__ms_group' },
          h('div', { className: '__ms_groupTitle' }, '音效'),
          h(Check, {
            label: '界面音效',
            hint: '扫频 / 锁定双音 / 授权和声，全部 WebAudio 现场合成，不带音频文件。',
            checked: draft.sound,
            onChange: function (v) { set('sound', v) }
          }),
          draft.sound ? h(Field, { label: '音效音量' },
            h(Range, {
              value: num(draft.soundVolume, 0.5), min: 0, max: 1, step: 0.02,
              display: Math.round(num(draft.soundVolume, 0.5) * 100) + '%',
              onChange: function (v) { set('soundVolume', v) }
            })
          ) : null
        ),

        /* 摄像头 */
        h('div', { className: '__ms_group' },
          h('div', { className: '__ms_groupTitle' }, '摄像头'),
          h(Check, {
            label: '调用摄像头',
            hint: '只在启动动画期间取流，跳过或播完立刻 stop 所有 track。'
              + '拒绝授权 / 没有设备 / 非安全上下文 → 自动降级成噪点 + 纯 HUD，不会卡死。',
            checked: draft.camera,
            onChange: function (v) { set('camera', v) }
          }),
          h('div', { className: '__ms_two' },
            h(Field, { label: '清晰度', hint: '理想宽度；实际以设备支持为准。' },
              h(Select, {
                value: draft.camWidth, numeric: true,
                options: [[320, '320p · 省资源'], [640, '640p · 推荐'], [1280, '720p · 清楚但慢']],
                onChange: function (v) { set('camWidth', v) }
              })
            ),
            h(Field, { label: '镜像' },
              h(Select, {
                value: String(draft.camMirror),
                options: [['true', '镜像（像照镜子）'], ['false', '不镜像']],
                onChange: function (v) { set('camMirror', v === 'true') }
              })
            )
          ),
          h('div', { className: '__ms_three' },
            h(Field, { label: '饱和度' },
              h(Range, {
                value: num(draft.camSat, 22), min: 0, max: 140,
                display: num(draft.camSat, 22) + '%', onChange: function (v) { set('camSat', v) }
              })
            ),
            h(Field, { label: '对比度' },
              h(Range, {
                value: num(draft.camCon, 130), min: 60, max: 220,
                display: num(draft.camCon, 130) + '%', onChange: function (v) { set('camCon', v) }
              })
            ),
            h(Field, { label: '亮度' },
              h(Range, {
                value: num(draft.camBright, 82), min: 30, max: 150,
                display: num(draft.camBright, 82) + '%', onChange: function (v) { set('camBright', v) }
              })
            )
          ),
          h(Check, {
            label: '取景框跟人走',
            hint: '默认用 478 点人脸网格（MediaPipe，模型随插件装在本地，不联网、不上传、不存画面）：'
              + '暖光/暗光/逆光下也不会丢锁，框贴在头上而不是连肩膀一起框。'
              + '模型加载好之前、或机器跑不动时，自动退回轻量肤色追踪，画面不会空。'
              + '这是给 HUD 看的几何，不做身份识别、不区分人。',
            checked: draft.faceTrack,
            onChange: function (v) { set('faceTrack', v) }
          }),
          draft.faceTrack ? h(Field, {
            label: '追踪引擎',
            hint: '自动 = 网格优先、跑不动就降级（推荐）。只想要轻量零模型的效果就选肤色法。'
          },
            h(Select, {
              value: String(draft.faceEngine || 'auto'),
              options: [['auto', '自动（网格优先）'], ['landmark', '只用 478 点网格'], ['skin', '只用肤色追踪（最省）']],
              onChange: function (v) { set('faceEngine', v) }
            })
          ) : null,
          draft.faceTrack ? h(Check, {
            label: 'GPU 加速（WebGL）',
            hint: '两个引擎都会用它：肤色法把每帧的像素统计丢给显卡；网格模型用 GPU delegate 跑推理。'
              + '关掉 = 强制纯 CPU（老核显、虚拟摄像头、远程桌面下更稳，也更容易诊断）。'
              + '拿不到 WebGL 会自动退回 CPU，功能一样只是慢一点；'
              + '网格引擎如果慢到影响动画，会自己降档（GPU → CPU → 肤色法），不会卡住画面。',
            checked: draft.trackGpu,
            onChange: function (v) { set('trackGpu', v) }
          }) : null,
          draft.faceTrack ? h(Field, {
            label: '跟随灵敏度',
            hint: '小了稳（像机械云台），大了跟手（会跟着你抖）—— 5 左右最像剧里那台机器。'
          },
            h(Range, {
              value: num(draft.trackAgility, 5), min: 1, max: 10, step: 1,
              display: Math.round(num(draft.trackAgility, 5)) + ' / 10',
              onChange: function (v) { set('trackAgility', v) }
            })
          ) : null,
          h(Check, {
            label: '额外用浏览器 FaceDetector',
            hint: 'Chrome / Edge 的人脸检测 API，比肤色法准，但桌面版默认不开放'
              + '（要手动开 chrome://flags 里的实验特性）。开了也没关系：拿不到就自动走肤色法。',
            checked: draft.faceDetect,
            onChange: function (v) { set('faceDetect', v) }
          }),
          h('div', { className: '__ms_hint' },
            draft.faceTrack
              ? '下面这组是「回落框」：追踪丢目标时回到的位置和大小。'
              : '追踪关着时，下面这组就是第二幕用到的固定框。'
          ),
          h('div', { className: '__ms_two' },
            h(Field, { label: '取景框 · 水平位置' },
              h(Range, {
                value: num(draft.faceX, 50), min: 8, max: 92,
                display: num(draft.faceX, 50) + '%', onChange: function (v) { set('faceX', v) }
              })
            ),
            h(Field, { label: '取景框 · 垂直位置' },
              h(Range, {
                value: num(draft.faceY, 44), min: 8, max: 92,
                display: num(draft.faceY, 44) + '%', onChange: function (v) { set('faceY', v) }
              })
            )
          ),
          h('div', { className: '__ms_two' },
            h(Field, { label: '取景框 · 宽' },
              h(Range, {
                value: num(draft.faceW, 34), min: 10, max: 92,
                display: num(draft.faceW, 34) + '%', onChange: function (v) { set('faceW', v) }
              })
            ),
            h(Field, { label: '取景框 · 高' },
              h(Range, {
                value: num(draft.faceH, 46), min: 10, max: 92,
                display: num(draft.faceH, 46) + '%', onChange: function (v) { set('faceH', v) }
              })
            )
          ),
          h(CamTest, { draft: draft }),
          h(CamDiag, {})
        ),

        /* 模拟头像 */
        h('div', { className: '__ms_group' },
          h('div', { className: '__ms_groupTitle' }, '模拟头像'),
          h(Check, {
            label: '没有摄像头时用模拟画面',
            hint: '关掉摄像头、没有设备、被拒绝、授权超时 —— 这些情况都会用一张头像顶着，第二幕照样有「人脸」可锁、第三幕照样有档案照。'
              + '关掉就回到老行为：噪点 + 空取景框。',
            checked: draft.avatarOnNoCam !== false,
            onChange: function (v) { set('avatarOnNoCam', v) }
          }),
          draft.avatarOnNoCam === false ? null : h('div', null,
            h(Field, {
              label: '头像地址',
              hint: '留空 = 用包内 assets/avatar/default.jpg；也可以填 http(s) 图片地址或 data: URI。相对路径在桌面端页面（dsh-app://）下取不到，会被忽略并回落到内置图。'
            },
              h(TextInput, { value: draft.avatar, mono: true, onChange: function (v) { set('avatar', v) } })
            ),
            h(Field, {
              label: '头像 · 脸的位置',
              hint: 'x,y,w,h（百分比）。取景框与黑条按这个位置摆，例如 50,43,34,46。'
            },
              h(TextInput, { value: draft.avatarBox, mono: true, onChange: function (v) { set('avatarBox', v) } })
            )
          )
        ),

        /* 马赛克 */
        h('div', { className: '__ms_group' },
          h('div', { className: '__ms_groupTitle' }, '眼部黑块马赛克'),
          h(Check, {
            label: '启用眼部黑条',
            checked: draft.mosaic,
            onChange: function (v) { set('mosaic', v) }
          }),
          draft.mosaic ? h(Check, {
            label: '黑条跟随眼睛',
            hint: '开着：黑条压在实测的两只眼睛上，人动它就动，认不出眼位时自动退回固定比例。'
              + '关掉：按取景框的固定解剖学比例摆（老行为）。',
            checked: draft.eyeTrack,
            onChange: function (v) { set('eyeTrack', v) }
          }) : null,
          draft.mosaic && draft.eyeTrack ? h('div', { className: '__ms_two' },
            h(Field, {
              label: '黑条长度',
              hint: '跟眼时 = 眼距的倍数。1.0 刚好盖住两只眼，1.75 更宽松（默认）。'
            },
              h(Range, {
                value: num(draft.mosaicEyeScale, 1.75), min: 0.5, max: 4, step: 0.05,
                display: num(draft.mosaicEyeScale, 1.75).toFixed(2) + ' × 眼距',
                onChange: function (v) { set('mosaicEyeScale', v) }
              })
            ),
            h(Field, {
              label: '黑条厚度',
              hint: '跟眼时 = 眼高的倍数。2.2 刚好压住眉毛到下眼睑。'
            },
              h(Range, {
                value: num(draft.mosaicEyeThick, 2.2), min: 0.5, max: 4, step: 0.05,
                display: num(draft.mosaicEyeThick, 2.2).toFixed(2) + ' × 眼高',
                onChange: function (v) { set('mosaicEyeThick', v) }
              })
            )
          ) : null,
          draft.mosaic && draft.eyeTrack ? h(Field, {
            label: '眼位平滑',
            hint: '眼睛位置是 8~15Hz 采样的，不平滑会一跳一跳。调大更跟手，调小更像机械云台。'
          },
            h(Range, {
              value: num(draft.eyeSmooth, 6), min: 1, max: 10, step: 1,
              display: num(draft.eyeSmooth, 6) + ' / 10',
              onChange: function (v) { set('eyeSmooth', Math.round(v)) }
            })
          ) : null,
          draft.mosaic && !draft.eyeTrack ? h('div', { className: '__ms_two' },
            h(Field, {
              label: '黑条长度',
              hint: '占取景框宽的百分比。96% 几乎横贯整框（默认）。'
            },
              h(Range, {
                value: num(draft.mosaicWidth, 96), min: 20, max: 100, step: 1,
                display: num(draft.mosaicWidth, 96) + '%',
                onChange: function (v) { set('mosaicWidth', Math.round(v)) }
              })
            ),
            h(Field, { label: '黑条厚度', hint: '占取景框高的百分比。' },
              h(Range, {
                value: num(draft.mosaicHeight, 13), min: 4, max: 34,
                display: num(draft.mosaicHeight, 13) + '%',
                onChange: function (v) { set('mosaicHeight', v) }
              })
            )
          ) : null,
          draft.mosaic && !draft.eyeTrack ? h(Field, {
            label: '黑条位置',
            hint: '黑条顶端在取景框里的位置；眼睛大约在 36–42%。'
          },
            h(Range, {
              value: num(draft.mosaicOffset, 36), min: 0, max: 86,
              display: num(draft.mosaicOffset, 36) + '%',
              onChange: function (v) { set('mosaicOffset', v) }
            })
          ) : null,
          draft.mosaic ? h('div', { className: '__ms_two' },
            h(Field, { label: '黑条切块数', hint: '1 = 一整条长方形（默认）；往上切就是方块马赛克。' },
              h(Range, {
                value: num(draft.mosaicBlocks, 1), min: 1, max: 25,
                display: Math.round(num(draft.mosaicBlocks, 1)) === 1
                  ? '1 条（整条）'
                  : Math.round(num(draft.mosaicBlocks, 1)) + ' 块',
                onChange: function (v) { set('mosaicBlocks', Math.round(v)) }
              })
            ),
            h(Field, { label: '块间缝隙' },
              h(Range, {
                value: num(draft.mosaicGap, 2), min: 0, max: 8, step: 0.5,
                display: num(draft.mosaicGap, 2) + ' px',
                onChange: function (v) { set('mosaicGap', v) }
              })
            )
          ) : null,
          draft.mosaic ? h(Check, {
            label: '锁定后轻微抖动',
            hint: '跟眼时只让「块与块的缝隙」动，条本身不会变薄 —— 以前整块上下缩会露眼。'
              + '不跟眼（固定比例）时仍是整块跳一小格。关掉就是一条死板的墨条。',
            checked: draft.mosaicJitter,
            onChange: function (v) { set('mosaicJitter', v) }
          }) : null
        ),

        /* 身份 */
        h('div', { className: '__ms_group' },
          h('div', { className: '__ms_groupTitle' }, '身份资料'),
          h(Field, {
            label: '身份名称',
            hint: '档案卡标题、终幕 WELCOME 都用它。文案里写 {name} 会被替换成这个名字。'
          }, h(TextInput, {
            value: draft.identity,
            placeholder: '例如：OPERATOR',
            onChange: function (v) { set('identity', v) }
          })),
          h('div', { className: '__ms_two' },
            h(Field, { label: '身份编号', hint: '建议数字，如 0451。' },
              h(TextInput, { value: draft.identityId, mono: true, onChange: function (v) { set('identityId', v) } })
            ),
            h(Field, { label: '权限等级' },
              h(TextInput, { value: draft.accessLevel, mono: true, onChange: function (v) { set('accessLevel', v) } })
            )
          ),
          h('div', { className: '__ms_two' },
            h(Field, { label: '分类', hint: 'THE MACHINE 的颜色即判断：ASSET 青白 / THREAT 红 / CONTINGENCY 琥珀。' },
              h(Select, {
                value: draft.status,
                options: [
                  ['ASSET', 'ASSET · 己方资产'],
                  ['ADMIN', 'ADMIN · 管理员'],
                  ['THREAT', 'THREAT · 威胁'],
                  ['CONTINGENCY', 'CONTINGENCY · 关联方'],
                  ['IRRELEVANT', 'IRRELEVANT · 无关']
                ],
                onChange: function (v) { set('status', v) }
              })
            ),
            h(Field, { label: '匹配置信度' },
              h(Range, {
                value: num(draft.prob, 93), min: 50, max: 100,
                display: (num(draft.prob, 93) / 100).toFixed(2),
                onChange: function (v) { set('prob', v) }
              })
            )
          ),
          h(Field, { label: '摄像头编号' },
            h(TextInput, { value: draft.camId, mono: true, onChange: function (v) { set('camId', v) } })
          )
        ),

        /* 文案 */
        h('div', { className: '__ms_group' },
          h('div', { className: '__ms_groupTitle' }, '字幕'),
          h('div', { className: '__ms_hint' },
            '每一幕两行：中文主字 / 英文等宽字幕（打字机逐字出）。'
            + '可用占位符：{name} {id} {status}。'
          ),
          draft.typewriter !== false ? h(Field, {
            label: '逐字输入的幕',
            hint: '幕 id，逗号分隔：boot（标题卡）· scan（人脸锁定）· match（档案）· access（授权）· handoff（揭幕）。留空 = 全部逐字。'
          },
            h(TextInput, {
              value: draft.typeActs, mono: true,
              placeholder: 'match,access,handoff',
              onChange: function (v) { set('typeActs', v) }
            })
          ) : null,
          ACT_META.map(function (a) {
            var base = a.k.toLowerCase()
            return h('div', { className: '__ms_act', key: base },
              h('div', { className: '__ms_actHead' },
                h('span', { className: '__ms_actName' }, a.name)
              ),
              h('div', { className: '__ms_two' },
                h(Field, { label: '中文主字' },
                  h(TextInput, { value: draft[base + 'Zh'], onChange: function (v) { set(base + 'Zh', v) } })
                ),
                h(Field, { label: '英文字幕' },
                  h(TextInput, { value: draft[base + 'En'], mono: true, onChange: function (v) { set(base + 'En', v) } })
                )
              ),
              base === 'boot' ? h('div', null,
                h('div', { className: '__ms_two' },
                  h(Field, { label: '第二张卡 · 中文', hint: '第一幕会连着放两张标题卡；这里留空就只播一张。' },
                    h(TextInput, { value: draft.bootZh2, onChange: function (v) { set('bootZh2', v) } })
                  ),
                  h(Field, { label: '第二张卡 · 英文' },
                    h(TextInput, { value: draft.bootEn2, mono: true, onChange: function (v) { set('bootEn2', v) } })
                  )
                ),
                h(Field, {
                  label: '左上角 · 系统名列表'
                },
                  h(TextArea, {
                    value: draft.bootList, mono: true, rows: 7,
                    onChange: function (v) { set('bootList', v) }
                  })
                )
              ) : null
            )
          }),
          h('div', { className: '__ms_two' },
            h(Field, { label: '顶部 · 品牌名' }, h(TextInput, { value: draft.brand, onChange: function (v) { set('brand', v) } })),
            h(Field, { label: '顶部 · 副标' }, h(TextInput, { value: draft.brandSub, mono: true, onChange: function (v) { set('brandSub', v) } }))
          ),
          h(Field, { label: '右下 · 页脚' },
            h(TextInput, { value: draft.footer, mono: true, onChange: function (v) { set('footer', v) } })
          )
        ),

        /* 视觉 */
        h('div', { className: '__ms_group' },
          h('div', { className: '__ms_groupTitle' }, '视觉'),
          h(Field, {
            label: '锁定框样式',
            hint: '取景框按 rosehahah/the-machine 的 hud.js 复刻，用剧里那六种固定配色，不跟下面的自定义色走。'
              + 'auto = 按「分类」自动选（ASSET/ADMIN/CONTINGENCY 黄 · THREAT 红 · IRRELEVANT 白）。'
          },
            h(Select, {
              value: draft.boxStyle || 'auto',
              options: [
                ['auto', 'auto · 按分类自动'],
                ['white', 'white · 白边白角（中性）'],
                ['yellow', 'yellow · 全黄（资产 / 管理员）'],
                ['black_yellow', 'black_yellow · 黑边黄角 + 长刻度（给亮画面用）'],
                ['red', 'red · 全红（威胁）'],
                ['white_red', 'white_red · 白边红角 + 长刻度（分析态）'],
                ['blue', 'blue · 全蓝']
              ],
              onChange: function (v) { set('boxStyle', v) }
            })
          ),
          h(Check, {
            label: '框右侧打标签',
            hint: '锁定后在框右边贴一块实底反色块，写身份名称（会出画就自动翻到左边）。'
              + '这是剧里最标志性的一笔。',
            checked: draft.boxLabel,
            onChange: function (v) { set('boxLabel', v) }
          }),
          h('div', { className: '__ms_hint' }, '下面三个颜色管的是页面其余部分（进度条、字幕光标、授权大字），影响不到取景框。'),
          h('div', { className: '__ms_three' },
            h(Field, { label: '主色' },
              h('div', { className: '__ms_row' },
                h(ColorInput, { value: draft.accent, onChange: function (v) { set('accent', v) } }),
                h('span', { className: '__ms_status' }, draft.accent)
              )
            ),
            h(Field, { label: '强调色' },
              h('div', { className: '__ms_row' },
                h(ColorInput, { value: draft.warn, onChange: function (v) { set('warn', v) } }),
                h('span', { className: '__ms_status' }, draft.warn)
              )
            ),
            h(Field, { label: '告警色' },
              h('div', { className: '__ms_row' },
                h(ColorInput, { value: draft.alert, onChange: function (v) { set('alert', v) } }),
                h('span', { className: '__ms_status' }, draft.alert)
              )
            )
          )
        ),

        /* 预览 + 操作 */
        h('div', { className: '__ms_preview' },
          h('div', { className: '__ms_previewText' },
            '预览按面板里「当前的值」重播，不用先保存。关掉浏览器或刷新后会回到已保存的配置。',
            file ? h('div', { style: { marginTop: '4px', opacity: 0.75 } }, '配置文件：' + file) : null
          ),
          h('button', { className: '__ms_btn', onClick: preview }, '立即预览')
        ),

        h('div', { className: '__ms_actions' },
          h('button', { className: '__ms_btn __ms_btnPrimary', disabled: busy, onClick: save },
            busy ? '处理中…' : '保存'),
          h('button', { className: '__ms_btn', disabled: busy, onClick: reset }, '恢复默认'),
          h('button', { className: '__ms_btn', disabled: busy, onClick: load }, '放弃修改'),
          notice ? h('span', { className: '__ms_ok' }, notice) : null,
          error ? h('span', { className: '__ms_err' }, error) : null
        )
      )
    }

    /* ── 桌面端自举 ──────────────────────────────────────────────────────── */
    /* Host 半侧靠 ctx.webServer.tapIndex 注入启动层。web profile 一定走这条路；
       Electron 可能改用 file:// + IPC 下发前端，那时 index 注入整条不生效。
       所以浏览器半侧自己兜一层：没被 Host 接管时自建根节点 + 拉 css/js 自举。 */
    var BOOT_ROUTE = '/machine-startup'

    function readFlag(store, key) {
      try {
        var s = window[store]
        return s ? s.getItem(key) : null
      } catch (e) { return null }
    }
    function writeFlag(store, key, value) {
      try {
        var s = window[store]
        if (s) s.setItem(key, value)
      } catch (e) { /* 隐私模式会抛，忽略 */ }
    }

    /* 遮罩的内联样式：**不依赖 splash.css**。
       桌面端这条自举路径里 CSS 是异步 link，在它到达之前，
       只加 class 的那层是个透明空 div —— 用户会先看到 DSH 本体。 */
    var MASK_STYLE = 'position:fixed;left:0;top:0;width:100%;height:100%;' +
      'margin:0;padding:0;background:#000;z-index:2147483000;overflow:hidden;display:block'

    function preMask() {
      var root = document.getElementById('machine-startup-root')
      if (!root) {
        root = document.createElement('div')
        root.id = 'machine-startup-root'
        ;(document.body || document.documentElement).appendChild(root)
      }
      root.className = 'ms-root ms-boot'
      try {
        /* 早于 body 建的那个遮罩挂在 <html> 上，等 body 出现挪进去 */
        if (document.body && root.parentNode !== document.body) document.body.appendChild(root)
      } catch (e) { /* noop */ }
      try {
        /* 逐条赋值，不要 cssText：splash 会在同一个 style 上挂 --ms-accent 之类的变量 */
        root.style.position = 'fixed'
        root.style.left = '0'
        root.style.top = '0'
        root.style.width = '100%'
        root.style.height = '100%'
        root.style.margin = '0'
        root.style.padding = '0'
        root.style.background = '#000'
        root.style.zIndex = '2147483000'
        root.style.overflow = 'hidden'
        root.style.display = 'block'
        document.documentElement.classList.add('ms-lock')
        /* html 也压黑：不然滚动条槽、圆角处会露一条浅色 */
        document.documentElement.style.background = '#000'
        if (document.body && document.body.style) document.body.style.overflow = 'hidden'
      } catch (e) { /* noop */ }
      return root
    }

    function dropMask() {
      try {
        var r = document.getElementById('machine-startup-root')
        if (r && r.parentNode) r.parentNode.removeChild(r)
        document.documentElement.classList.remove('ms-lock')
        document.documentElement.style.removeProperty('background')
        if (document.body && document.body.style) document.body.style.overflow = ''
        window.__DSH_MACHINE_FAILED__ = true
      } catch (e) { /* noop */ }
    }

    function release(ok) {
      if (ok) return
      dropMask()
    }

    function injectRoot(cfg) {
      /* 可能已经由 selfBoot 抢先遮上了（内联样式），这里只补齐类名 */
      var root = preMask()

      var failed = false
      var cssReady = false, scriptReady = false, ftReady = false
      function guard(err) {
        if (err) {
          if (!failed && typeof console !== 'undefined' && console.warn) {
            console.warn('[dsh-startup-machine] 启动层自举失败，已放开页面：', err.message)
          }
          failed = true
          release(false)
          return
        }
        if (cssReady && scriptReady && ftReady) release(true)
      }

      var link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = BOOT_ROUTE + '/splash.css'
      link.addEventListener('load', function () { cssReady = true; guard(null) })
      link.addEventListener('error', function () { guard(new Error('css load failed')) })
      ;(document.head || document.documentElement).appendChild(link)

      window.__DSH_MACHINE_STARTUP__ = cfg || {}
      /* 人脸网格模型的本地根路径（wasm + .task 由 Host 侧 /mp/* 路由下发） */
      window.__DSH_MACHINE_ASSETS__ = BOOT_ROUTE + '/mp/'
      /* 默认头像：桌面端走的是这条自举路径（Host 的 tapIndex 不参与），
         1.1.3 之前只由 Host 下发这两个全局 → avatarSrc() 拿到空串，
         关摄像头时只能退到剪影/噪点。这里补上路径，并尽量转成内联 data URI。 */
      window.__DSH_MACHINE_AVATAR__ = BOOT_ROUTE + '/avatar/default.jpg'
      try {
        fetch(BOOT_ROUTE + '/avatar/default.jpg')
          .then(function (r) { return r && r.ok ? r.blob() : null })
          .then(function (b) {
            if (!b || typeof FileReader === 'undefined') return
            var fr = new FileReader()
            fr.onload = function () {
              if (typeof fr.result === 'string' && fr.result.indexOf('data:image/') === 0) {
                window.__DSH_MACHINE_AVATAR_DATA__ = fr.result
              }
            }
            fr.readAsDataURL(b)
          })
          .catch(function () { /* 路由不通就让 <img> 直接用路径，再不行还有剪影 */ })
      } catch (e) { /* noop */ }
      try { delete window.__DSH_MACHINE_LOADED__ } catch (e) { window.__DSH_MACHINE_LOADED__ = undefined }

      /* 加载顺序有依赖：face-track（算法）→ face-track-gl（GPU 后端，要读前面那个的全局）
         → splash（运行时）。顺序错了会静默退回固定框 / 2D，不报错但你会以为追踪坏了。 */
      loadScriptChain([
        BOOT_ROUTE + '/face-track.js?t=' + Date.now(),
        BOOT_ROUTE + '/face-track-gl.js?t=' + Date.now(),
        BOOT_ROUTE + '/hud-draw.js?t=' + Date.now(),
        BOOT_ROUTE + '/eye-track.js?t=' + Date.now(),
        BOOT_ROUTE + '/face-landmark.js?t=' + Date.now()
      ], function () { ftReady = true; guard(null); loadSplash() })

      function loadScriptChain(list, done) {
        var i = 0
        function step() {
          if (i >= list.length) { done(); return }
          var el = document.createElement('script')
          el.src = list[i++]
          el.async = false
          el.addEventListener('load', step)
          el.addEventListener('error', function () {
            /* 某一环挂了不算致命：算法缺失只是不跟人，GPU 后端缺失只是退回 2D */
            if (typeof console !== 'undefined' && console.warn) {
              console.warn('[dsh-startup-machine] 加载失败，已降级：' + el.src)
            }
            step()
          })
          ;(document.head || document.documentElement).appendChild(el)
        }
        step()
      }

      var splashLoaded = false
      function loadSplash() {
        if (splashLoaded) return
        splashLoaded = true
        var s = document.createElement('script')
        s.src = BOOT_ROUTE + '/splash.js?t=' + Date.now()
        s.async = false
        s.addEventListener('load', function () { scriptReady = true; guard(null) })
        s.addEventListener('error', function () { guard(new Error('script load failed')) })
        ;(document.head || document.documentElement).appendChild(s)
      }

      setTimeout(function () {
        try {
          /* splash 已经在跑（window.__DSH_MACHINE_API__ 已挂上）就绝不能再收场：
             以前只看 ms-boot 类，而 splash 从没摘掉这个类，长序列会在 18 秒被整屏拿掉。 */
          if (window.__DSH_MACHINE_API__) return
          var r = document.getElementById('machine-startup-root')
          if (r && r.className && r.className.indexOf('ms-boot') !== -1) release(false)
        } catch (e) { /* noop */ }
      }, 18000)
    }

    function selfBoot() {
      try {
        if (typeof window === 'undefined' || typeof document === 'undefined') return
        if (!document.body) {
          /* 页面还没解析到 body：这时候就先遮（挂 documentElement 上），
             等 DOM 就绪再走完整流程。以前这里直接 return，
             等于「body 出现前不遮」，白给一段露出本体的时间。 */
          try { preMask(); window.__DSH_MACHINE_EARLY_MASK__ = true } catch (e) { /* noop */ }
          document.addEventListener('DOMContentLoaded', function () { selfBoot() }, { once: true })
          return
        }
        if (window.__DSH_MACHINE_BOOT__) return
        if (window.__DSH_MACHINE_STARTUP__) return
        /* 早前抢遮的那个 root 是我们自己建的，不能当成「别人已经播了」而退出 */
        if (document.getElementById('machine-startup-root') && !window.__DSH_MACHINE_EARLY_MASK__) return
        window.__DSH_MACHINE_EARLY_MASK__ = false
        if (window.__DSH_MACHINE_FAILED__ === true) return
        window.__DSH_MACHINE_BOOT__ = 'client'

        /* ── 先遮，再问 ────────────────────────────────────────────────
           以前是「先 fetch 配置、再插遮罩」，而页面本体在 fetch 回来之前
           就已经画到屏幕上了 —— 看到的就是「先闪一下 DSH 本体，动画才上来」。
           现在只用**同步可读**的缓存标记做一次预判，判不了就先遮上；
           真不用播时配置一回来立刻摘掉（几十毫秒，比露本体短得多）。 */
        var todayHint = new Date().toISOString().slice(0, 10)
        var hintSkip = readFlag('localStorage', 'dsh-startup-machine:enabled') === '0' ||
          (readFlag('localStorage', 'dsh-startup-machine:mode') === 'session' &&
            readFlag('sessionStorage', 'dsh-startup-machine:shown') === '1') ||
          (readFlag('localStorage', 'dsh-startup-machine:mode') === 'daily' &&
            readFlag('localStorage', 'dsh-startup-machine:day') === todayHint)
        var masked = false
        if (!hintSkip) { preMask(); masked = true }

        fetch(API, { headers: { Accept: 'application/json' } })
          .then(function (r) { return r.json() })
          .then(function (j) { return j && j.ok === true ? j.config : null })
          .catch(function () { return null })
          .then(function (cfg) {
            cfg = cfg || { enabled: true, mode: 'session' }
            /* 把「要不要播」的两个条件缓存下来，下次启动才能同步预判 */
            writeFlag('localStorage', 'dsh-startup-machine:mode', String(cfg.mode || 'session'))
            writeFlag('localStorage', 'dsh-startup-machine:enabled', cfg.enabled === false ? '0' : '1')
            if (cfg.enabled === false) { if (masked) dropMask(); return }
            var today = new Date().toISOString().slice(0, 10)
            if (cfg.mode === 'session' && readFlag('sessionStorage', 'dsh-startup-machine:shown') === '1') {
              if (masked) dropMask()
              return
            }
            if (cfg.mode === 'daily' && readFlag('localStorage', 'dsh-startup-machine:day') === today) {
              if (masked) dropMask()
              return
            }
            if (cfg.mode === 'session') writeFlag('sessionStorage', 'dsh-startup-machine:shown', '1')
            if (cfg.mode === 'daily') writeFlag('localStorage', 'dsh-startup-machine:day', today)
            return injectRoot(cfg)
          })
          .catch(function () { if (masked) dropMask() })
      } catch (e) { try { dropMask() } catch (e2) { /* noop */ } }
    }

    /* ── 插件 ────────────────────────────────────────────────────────────── */
    var inject = ['slots']

    function apply(ctx) {
      selfBoot()
      ctx.slots.inject('settings.section', function () {
        return ctx.slots.register(
          { name: 'settings.section', id: 'startup-machine', order: 27, label: '启动动画 · MACHINE' },
          function () { return h(Panel, {}) }
        )
      })
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
