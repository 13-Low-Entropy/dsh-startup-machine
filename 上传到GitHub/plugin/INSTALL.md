# 安装与排错

## 一、装进 DSH

安装这件事说到底只有三处改动（`<profile>` 默认 `desktop`）：

| # | 位置 | 内容 |
|---|---|---|
| 1 | `~/.dsh/profiles/<profile>/package.json` → `dependencies` | `"dsh-startup-machine": "link:<插件目录，正斜杠>"` |
| 2 | 同一文件的 `dsh.profile.bundles` | 追加 `"dsh-startup-machine"` |
| 3 | `~/.dsh/profiles/<profile>/node_modules/dsh-startup-machine` | 指向插件目录的链接 |

### 路线 A：`dsh` 命令可用（首选）

```bash
dsh plugin --profile desktop remove dsh-startup-screen
dsh plugin --profile desktop add link:C:/Users/WZ113/Desktop/skill/dsh-startup-machine
```

### 路线 B：`dsh` 不在 PATH 里（Windows 上很常见）

双击 `install.cmd`，或：

```bat
install.cmd
install.cmd web
```

它先试路线 A，找不到 `dsh` 就自动转离线安装器 `install-offline.ps1`：
备份 manifest → 改两处 → 无 BOM 写回 → 重新解析校验（失败自动回滚）→ 建 junction → 验证能读到 `package.json`。
重复执行是幂等的，`install.cmd desktop uninstall` 反向清理。

也可以手动只跑离线那半截（命令见 `install.cmd` 里的 `:offline` 段）。

> 安装器已针对真实 `package.json` 的副本做过验证（结构、无 BOM、junction 解析、
> 幂等、卸载）。**加载本身没验过**——那必须重启 DSH 才能看到。

### 验证（不需要 `dsh`）

```bash
grep -c dsh-startup-machine ~/.dsh/profiles/desktop/package.json    # 期望 >= 2
grep -c dsh-startup-screen  ~/.dsh/profiles/desktop/package.json    # 期望 0
ls ~/.dsh/profiles/desktop/node_modules/dsh-startup-machine/package.json
```

三条对上就是装好了。

### 重启 dsh

**完整退出进程**（关窗口不算），重新打开。设置页应出现「启动动画 · MACHINE」。

### 卸载

```bash
install.cmd desktop uninstall
# 或
dsh plugin --profile desktop remove dsh-startup-machine
```

> 若你手动往 `$DSH_HOME/cordis.patch.yml` 里写过多余的 `insert` 行，`remove` 不会替你删它，得手动去掉。

> 给 AI 助手看的执行清单在 [`INSTALL-FOR-DSH.md`](INSTALL-FOR-DSH.md)——那份更详细，
> 含验证脚本、回滚、以及「未经用户确认不要做的事」。

## 二、和 `dsh-startup-screen` 冲突

两者都往 `index.html` 里注入全屏启动层，**同时启用会叠两层**（上层盖住下层，但两层的时间轴都在跑，
跳过按钮也可能点到被盖住的那个）。

先卸掉旧的：

```bash
dsh plugin --profile desktop remove dsh-startup-screen
```

两套配置互相独立，卸旧的不影响旧的配置文件（`~/.dsh/dsh-startup.json` 会留着，想回退随时重装）。

---

## 三、摄像头

| 现象 | 原因 | 处理 |
|---|---|---|
| 黑条没跟着眼睛跑，一直按老位置摆 | 「黑条跟随眼睛」被关了，或检测不到眼位（侧脸/逆光/戴墨镜） | 设置页 → 眼部黑块马赛克 → 打开「黑条跟随眼睛」；控制台 `__DSH_MACHINE_API__.state().eyeFresh` 看是不是 false |
| 黑条盖不住眼，只压住一半 | 眼位厚度倍数太小 | 「黑条厚度（跟眼）」往上调（默认 2.2×），或把「眼位平滑」调低 |
| 控制台报 `chosen is not defined` | 1.4.0 及更早的已知问题 | 升级到 1.5.0+（已修，并加了回归断言） |
| 设置页「启动动画 · MACHINE」整块空白、点不动 | 面板渲染时抛了异常（v1.3.0 有这个 bug：一个变量没声明） | 升到 1.3.2+。判断方法：F12 控制台会有一条红色 `ReferenceError` / `Element type is invalid` |
| 第二幕只有噪点，状态行 `ACQUIRING SIGNAL` 一直不动 | 权限请求挂起 —— 授权框没弹出来或没点 | 桌面端常见。先在设置页点「跑一次摄像头测试」授权一次；或改用 `dsh web` 在浏览器里授权 |
| 状态行 `PERMISSION DENIED` | 明确被拒 | 系统「隐私和安全性 → 相机」里允许 DSH；或浏览器地址栏的摄像头图标里改成「允许」 |
| 状态行 `WAITING FOR CAMERA` | 请求已发出，2.2 秒还没回 | 看窗口里有没有授权框；没有就是宿主没应答，同上 |
| 状态行 `NO CAMERA · CHECK PERMISSION` | 6 秒仍没结果，已判定失败 | 同上；同时右侧 `SOURCE` 会写 `NO SIGNAL · SEE SETTINGS` |
| 状态行 `DEVICE BUSY` | 摄像头被别的程序占着（会议软件、相机 App） | 关掉那个程序再重播 |
| 状态行 `NO CAMERA DEVICE` | 系统里没有可用摄像头 | 插上/启用摄像头；笔记本确认没有被物理遮挡开关关掉 |
| 状态行 `CAMERA API UNAVAILABLE` | 非安全上下文（`file://` 或 http 局域网地址） | 用 `dsh web`（localhost）或 https |
| 第二幕只有噪点，状态行 `NO SIGNAL` | 授权被拒 / 没有设备 | 点浏览器地址栏的摄像头图标允许，或在系统「隐私和安全性 → 相机」里打开 |
| 状态行 `CAMERA API UNAVAILABLE` | 非安全上下文（`file://` 或 http 局域网地址） | 用 `dsh web`（localhost）或 https |
| 画面偏灰偏暗 | 这是设计：饱和度 22% / 亮度 82% | 设置页调「饱和度 / 对比度 / 亮度」，或点「摄像头自检」当场看 |
| 画面是反的 | 镜像开着 | 设置页「镜像 → 不镜像」 |

### 卡在「没有摄像头画面」时的三步

1. **设置页 → 摄像头 → 点「跑一次摄像头测试」**。它会直接打印结果：
   - `OK · 640×480 · 设备名` → 摄像头没问题，问题在启动动画的时序，把「第二幕时长」调长再看
   - `NotAllowedError` → 被拒。系统「隐私和安全性 → 相机」里允许，或浏览器里允许
   - 一直显示「请求中…」→ 授权请求挂起，换 `dsh web` 打开试
   - `navigator.mediaDevices 不可用` → 当前页面不是安全上下文（看它显示的 protocol）
2. 那一行还会显示 **协议 / 是否安全上下文 / 权限状态**，把这三项截图就能定位。
3. 控制台里 `__DSH_MACHINE_API__.state()` 会带 `camError`、`secure`、`protocol`、`hasApi`；
   播完就没了，所以在设置页点「立即预览」之后再切到控制台看。
| 取景框不跟人走 | 「取景框跟人走」被关了，或追踪脚本没加载 | 设置页「摄像头 → 取景框跟人走」打开。下面「排查追踪」一行能看出是哪一种 |
| 取景框乱跳 / 太抖 | 灵敏度太高，或背景有大面积同色物体 | 灵敏度降到 2–4；实在不行关掉追踪用固定框 |
| 框不动，`GEO` 显示 `NO LOCK · FIXED` | 画面里没有足够的肤色像素（逆光、蓝屏光、深色衣服挡住脸） | 补光、把脸放进画面；或直接关掉追踪 |
| 框总差一点、偏半格 | 格子量化 + 平滑的固有误差 | 正常，别追这点精度；实在介意就把灵敏度调高 |
| 自检窗口显示「加速：CPU（2D canvas）」 | WebGL 被关 / 驱动被拉黑 / 显存不足 | 浏览器进 `chrome://gpu` 看 WebGL 是否 Hardware accelerated；不行就认出 CPU 路径，功能不缺 |
| 显卡型号显示成核显 | 系统里没给 DSH 指定高性能 | 见下面「让 DSH 用独显」 |
| 黑条没压到眼睛 | 黑条位置默认 36% | 调「黑条位置」到 30–42%，配合「黑条高度」10–16% |
| 摄像头指示灯一直亮 | — | 不该发生：跳过或播完会 `stop()` 所有 track。若确实常亮，说明动画没走完，见下方「卡在黑屏」 |

---

## 四、让 DSH 用独显（这是系统的事，不是插件的）

网页和 Electron 都**不能指定用哪块显卡**，插件只能发一个 `powerPreference: 'high-performance'`
提示。真正生效的是下面三处，按可靠程度排序：

### 1. Windows 显卡首选项（最常用）

`设置 → 系统 → 显示 → 显卡`（Win11：设置 → 系统 → 屏幕 → 显示卡）→
「添加桌面应用」→ 选 `dsh.exe`（或你启动 DSH 用的 Electron 可执行文件）→ 选项 → **高性能**。

> 找不到 dsh.exe？先启动一次 DSH，任务管理器 → 详细信息 → 右键进程 → 「打开文件所在的位置」。

### 2. NVIDIA 控制面板

`管理 3D 设置 → 程序设置 → 添加` 同一个 exe → 「为此程序选择首选图形处理器」→
**高性能 NVIDIA 处理器**。顺便把「电源管理模式」设成「首选最高性能」。

### 3. BIOS / 联想管家：独显直连

Legion R9000P：`Lenovo Vantage → 显卡 → 独显直连`（或 BIOS 里 `Graphics Device = Discrete`）。
直连后核显完全退出，不存在「选错卡」的问题，代价是拔电续航变差。

### 怎么确认生效了

装好后进 `设置 →「启动动画 · MACHINE」→ 摄像头 → 打开摄像头`，自检窗口下面会写着：

```
加速：WebGL（GPU）· ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028E0) Direct3D11 ...)
```

出现 `RTX 4060` 就是对独显了；出现 `AMD Radeon 610M` / `Intel` 就是还在核显上。
另外 `dsh web` 启动后在浏览器打开 `edge://gpu`（或 `chrome://gpu`）也能看到
「WebGL: Hardware accelerated」。

## 五、常见问题

**Q：快捷键没反应？**
A：SKIP 需要「允许跳过」开着。Esc / 空格 / 回车都在捕获阶段监听，DSH 主界面抢不走。

**Q：字体不像终端？**
A：插件用的是 `JetBrains Mono → Cascadia Mono → Consolas → Noto Sans Mono CJK SC → 微软雅黑` 的栈。
装了 JetBrains Mono 最像原剧；没装会退到 Consolas。

**Q：怎么确认追踪是不是在工作？**
A：打开浏览器控制台（F12）看三处：

```js
// 1. 追踪脚本挂上了没
typeof window.MSFaceTrack            // 应该是 "object"

// 2. 追踪跑起来没
__DSH_MACHINE_API__.state()
// { tracking: true, ft: "object", stream: true, readyState: 4, videoWidth: 640,
//   face: { x: 0.42, y: 0.47, w: 0.26, h: 0.34 }, trackHitAt: 1730... }
//   ↑ face 里四个数在动 = 真的在跟；tracking:true 但 face 不动 = 没检到目标
```

跳过或播完后 `__DSH_MACHINE_API__` 就没了（覆盖层已卸载）。想在播放中反复看，
就在设置页点「立即预览」，播放时切到控制台。

**Q：卡在黑屏怎么办？**
A：三层兜底都失效才会发生，正常不会。手动急救——浏览器控制台执行：

```js
document.getElementById('machine-startup-root')?.remove()
document.documentElement.classList.remove('ms-lock')
document.body.style.overflow = ''
```

然后把 `~/.dsh/dsh-startup-machine.json` 里 `enabled` 改成 `false`，重启 dsh 排查。

**Q：想恢复出厂？**
A：设置页「恢复默认」，或删掉 `~/.dsh/dsh-startup-machine.json` 再重启。

**Q：改完设置要重启吗？**
A：不用。保存后下次加载生效；想立刻看就在设置页点「立即预览」。

---

## 六、手动改配置

`~/.dsh/dsh-startup-machine.json`，字段见 `lib/index.js` 的 `DEFAULTS`。
Host 半侧的 `normalize()` 会夹取越界值与非法颜色，手改不会把插件改崩。
每幕时长单位是**毫秒**（`actBoot: 1200` = 1.2 秒）。
