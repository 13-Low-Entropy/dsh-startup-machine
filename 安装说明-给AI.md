# 给 AI / 执行安装的助手的部署说明（1.2.5）

> 这份文件是给「拿到这个压缩包、替用户装的人或 AI」看的，不是给最终用户看的。
> 注意：根目录的 `README.md` 是给访客看的仓库首页（概览/截图/安全声明），**部署和排错以本文件与 `docs\deploy-windows.md` 为准**。

> 目标：把 dsh-startup-machine **1.2.5** 装进 DSH 桌面端（Electron），让启动动画能播、摄像头能取到画面。
> 全程是可回滚的文件操作；除了改 `app.asar` 一处，其余都不碰系统，不联网，不需要 npm。
>
> **版本号说明**：对外发布号是 **1.2.5**，等于内部构建 **1.6.10**（CHANGELOG 按 1.6.x 记录，因为上游基底是 1.3.2，
> 内部沿用了自己的一路编号）。`plugin\package.json` 的 `version` 是 `1.2.5`，设置面板底部显示的也是 `v1.2.5`
> （1.2.4 起面板不再有写死的兜底版本号，拿不到就整行不显示）。
> 看到 `1.6.x` 只出现在 CHANGELOG 历史条目里，属正常。

---

## 0. 这个包是什么

1.2.5 = 插件本体（1.2.5）+ **摄像头权限补丁** + 默认配置 + 一键部署/守护脚本（守护带 SHA-256 校验）。

能力一览（当前版本实际包含的）：

| 能力 | 说明 |
|---|---|
| 五幕开机序列 | 标题卡 → 摄像头人脸锁定 → 档案比对 → 授权 → 揭幕，默认 7.5 秒，右下可 SKIP |
| **478 点人脸网格** | MediaPipe FaceLandmarker，模型与 wasm 随包（`plugin\assets\mp\`，约 13 MB），**本地推理、不联网** |
| **斜矩形眼部黑条** | 按四个眼角 + 上下眼睑建 OBB：歪头跟着斜、侧脸不露眼角、眨眼不变薄、第三幕档案照同步旋转 |
| **模拟头像** | 关掉摄像头 / 没设备 / 被拒绝 / 授权超时 → 用一张可自定义头像顶上（`plugin\assets\avatar\default.jpg`，**构建时内嵌进 `splash.js`**，不依赖 Host 下发/路由/CSP）。自定义地址加载失败会退回内嵌图，再失败画「档案剪影」，**任何一层失败都不会掉回噪点** |
| **预览即时生效** | 面板点「立即预览」会用**面板里当前的值**重播，不用先保存；关掉页面后回到已保存的配置 |
| **眯眼不变薄** | 黑条厚度下限按「眼眶高度」（眼宽 × 0.40）兜底，眯眼 / 眨眼时不会缩成一条缝把眼睛露出来 |
| **首屏不露本体** | 遮罩用**内联样式**（不等 CSS），而且**先遮再读配置** —— 不会再先闪一下 DSH 主界面。不需要播放时配置回来立刻摘掉 |
| **档案照必有黑条** | 第三幕照片上，没有眼位（模拟头像 / 跟丢 / 数据过期）也会按取景框比例摆一条；第二幕眼位短暂丢失时冻结在最后位置，不再突然消失 |
| 纯黑 + 鸿蒙 Sans | 第一幕是「一句话压在全黑上」的标题卡；字体首选 `HarmonyOS Sans SC`（系统已装则直接用，不打包） |
| 字幕逐字输入 | 默认**只给后三幕**（`typeActs = match,access,handoff`），第一、二幕整行直出；块状光标单独闪 |
| 强制跳过 | `hardStopMs = 0` 时跟着各幕合计走（合计 + 9 秒），填数值则真的硬切 |

### 与更早版本的关系（只列关键差异，细节见 CHANGELOG.md）

- **1.2.5 = 1.6.10**：安全加固 —— ① 登录守护从用户目录迁到 `<DSH安装目录>\resources\dsh-startup-machine-guard\`，
  VBS 执行前用 SHA-256 校验脚本、脚本再校验 helper（哈希清单 `guard-manifest.json`）；安装时删掉旧版用户目录里的可写副本。
  ② `-RestoreAsar` 只还原与安装时清单（`app.asar.camera-backup.json`：文件名/大小/SHA-256）一致的备份，
  无清单的旧备份默认拒绝、`-Force` 可强制。③ 修 `重启DSH.cmd` 的 `pushd`/`popd` 与 `restart-dsh-camera.cmd`
  漏搜 `%LOCALAPPDATA%\Programs` 的问题。
- **1.2.4 = 1.6.9**：三个改动 ——
  ① **人声播报整体移除**：Web Speech API、`voice/voiceLang/voiceName/voiceRate/voicePitch/voiceVolume/voiceCue/voiceWait`
  八个配置项、五条 `*Say` 播报台词、面板里的语音分组与音色选择器、`API.speak()` 全部删掉；
  幕推进回到「只看幕长」（`after(d, ...)` + `armWatchdog(d + 9000)`），不再有「等这句念完」的分支。
  ② **出厂 config = 代码默认值**：`config\dsh-startup-machine.json` 与 Host/运行时/预览三处 `DEFAULTS`
  逐字段一致（72 项），点「恢复默认」得到的就是出厂外观（`Low_Entropy` / 114514 / 黑条 16·33·3）。
  ③ **部署脚本修复**（上一轮审查结论）：版本号只认 `plugin\package.json`；`uninstall -RestoreAsar` 补上
  `%LOCALAPPDATA%` 与 `DSH_DESKTOP_ASAR`；备份只留最近一份；守护 VBS 改成运行时展开路径（中文用户名不再失效）；
  junction 建不起来时回滚 profile manifest。
- **1.2.3 = 1.6.8**：修「换幕时黑条仍会消失」——① 换幕瞬间把取景框置空，而 `.ms-act` 还有 0.34s 淡出；
  ② `drawBar` 不吃 alpha，条不会跟着框一起淡；③ 档案照的 `applyDossierEyes()` 在关闭「黑条跟随眼睛」时整条 `return`。
  现在取景框/黑条随幕一起淡出，档案照的固定比例兜底永远执行，并在第三幕显示后补摆两次。
- **1.2.2 = 1.6.7**：修两个实测问题 —— ① 第二幕最后瞬间眼部黑条会消失（眼位过期时直接掉到「固定比例」分支，
  加上第三幕档案照在无眼位时干脆不摆条）；现在前者冻结在最后位置、后者按取景框兜底；
  ② 启动时先露出 DSH 本体页面（桌面端走 client 自举，且遮罩样式全在异步 CSS 里）——
  现在遮罩用内联样式、并且「先遮再读配置」。
- **1.2.1 = 1.6.6**：修两个实测问题 —— ① 默认头像在真实 DSH 里仍不显示（桌面端 index.html 是静态伺服的，
  Host 的注入不参与）；现在把默认图直接内嵌进 `splash.js` 并用 `createImageBitmap` 解码，彻底不依赖
  Host 下发/路由/CSP；② 语音设置不生效：音色按语言硬过滤（选中文不会再被英文音色念）、`voiceWait` 真正等念完再切幕。
- **1.2.0 = 1.6.5**：修两个实测问题 —— ① 序列超过 18 秒（或 `voiceWait` 生效）时，后几幕被兜底定时器整屏拿掉；
  ② 桌面端走 client 自举时没下发默认头像路径，关摄像头只显示剪影。顺带同步了包内默认配置的旧文案。
- **1.1.3 = 1.6.4**：修四个问题 —— ① 加长第一、二、三幕后，后面几幕被一个「开场时算好的总时长」提前切断；
  ② 改完选项点「立即预览」没反应（预览用的是旧配置）；③ 关掉摄像头时没用上预留头像；④ 眯眼时黑条跟着变薄。
- **1.1.2 = 1.6.3**：强制跳过可调且随各幕合计变动、前两幕默认不逐字、没有摄像头时用模拟头像、删掉面板三处备注。
- **1.6.2**：深蓝黑 → 纯黑、字体换开源鸿蒙 Sans、第一幕改成标题卡、字幕改逐字 + 块状光标。
- **1.6.1**：眼部黑条改为斜矩形（歪头跟着斜），厚度不再随歪头变厚，抖动只动块缝不变薄。
- **1.6.0**：人脸追踪由「肤色连通域估算」换成 478 点网格。原来暖光/暗光/逆光会整段丢锁，
  头肩连成一片时框还会跑到胸口上；现在跑不动会三级降档（GPU delegate → CPU delegate → 肤色法），
  装完最差也只是回到 1.5.0 的精度。
- **1.5.0**：眼部黑条开始跟随实测眼位。
- **1.4.0**：**摄像头权限补丁** —— DSH 主进程 `installMicrophonePermissions()` 只放行
  `mediaType === "audio"`，视频请求在到 Windows 之前就被 `callback(false)` 拒绝，且没有官方开关。
  这正是「动画能播、摄像头没画面」的根因，本包用**等长字节替换**放开视频权限。
- **1.3.2 已修**：设置页「启动动画 · MACHINE」整块空白（`lib/client.js` 里 `file` 未声明）。

> 装的时候别漏 `plugin\assets\mp\`（6 个文件：模型 `.task` + wasm + bundle + 2 个许可，二进制约 13 MB）
> 和 `plugin\assets\avatar\default.jpg`。
> 前者漏了会静默降级成肤色追踪，后者漏了「没有摄像头」时会退回噪点。

---

## 1. 目录结构（顶层）

```
dsh-startup-machine-1.2.5\
├── 安装.cmd / 卸载.cmd / 重启DSH.cmd     ← 用户入口（cmd 包装）
├── install.ps1 / uninstall.ps1            ← 安装/卸载逻辑（ASCII）
├── VERSION.txt / README.md / CHANGELOG.md
├── 安装说明-给AI.md                        ← 本文件
├── plugin\                                ← 插件本体（版本 1.2.5）
│   ├── lib\  preview\  test\  screenshots\
│   ├── assets\mp\                         ← 人脸网格运行时 + 模型（vision_bundle.mjs / wasm / .task）
│   ├── assets\avatar\default.jpg          ← 没有摄像头时的模拟头像（4:3，约 100 KB）
│   ├── install-offline.ps1                ← 写 profile manifest + junction，并摘掉 dsh-startup-screen
│   └── package.json / cordis.patch.yml / ...
├── camera-patch\
│   ├── patch_camera.py                    ← 摄像头权限补丁（--check / --apply）
│   ├── verify_and_repatch.ps1             ← 登录守护（升级后自动重打）
│   └── restart-dsh-camera.cmd             ← 完全退出 + 重启 DSH
└── config\dsh-startup-machine.json        ← 出厂配置（72 个字段；与代码里的三处 DEFAULTS 逐字段一致）
```

---

## 2. 安装 = 四步（install.ps1 干的事）

1. **装插件**：把 `plugin\` 复制到 `<DSH_HOME>\plugin-sources\dsh-startup-machine`，调 `plugin\install-offline.ps1` 登记 profile（依赖 + bundle + junction），并摘掉 `dsh-startup-screen`。
2. **摄像头补丁**：`camera-patch\patch_camera.py --apply`，等长替换 `app.asar → lib/main.js` 两处，自动备份 `app.asar.bak-camera-<时间戳>`。
3. **登录守护**：把 `camera-patch\` 拷到 `<DSH_HOME>\camera-patch`，在启动文件夹放一个隐藏 VBS，登录时静默跑 `verify_and_repatch.ps1`（DSH 升级覆盖 app.asar 后自动重打）。
4. **默认配置**：`<DSH_HOME>\dsh-startup-machine.json` **不存在才写**（已存在不覆盖；加 `-ForceConfig` 才覆盖）。

---

## 3. 执行顺序（推荐）

### 3.1 找 DSH 安装目录

本机实测在 `D:\deepseek\新建文件夹\`（`DeepSeek Harness.exe` + `resources\app.asar`）。
如果找不到，用这句定位：

```powershell
Get-Process | Where-Object { $_.Name -like '*harness*' } | Select-Object -First 1 Path
```

### 3.2 装

```powershell
# 解压后，进入包目录，跑（也可以直接双击 安装.cmd）
powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1
```

带参数变体：`-Profile web`（装到 web profile，摄像头由浏览器授权，不用补丁）、
`-SkipCameraPatch`、`-SkipGuard`、`-ForceConfig`。

### 3.3 完全重启 DSH（补丁生效必需）

Electron 主进程**只在启动时**读 `app.asar`，关窗口不算退出。必须结束**所有**进程再开：

```powershell
taskkill /IM "DeepSeek Harness.exe" /F
# 稍等 2-3 秒，再双击 D:\deepseek\新建文件夹\DeepSeek Harness.exe
# 或直接跑包里的 重启DSH.cmd
```

> 进程名是 `DeepSeek Harness`（带空格），`taskkill /IM "DeepSeek Harness.exe"` 实测能命中。
> 结束进程会中断当前会话，但会话记录在磁盘、可恢复——安装前提醒用户。

---

## 4. 验证清单（装完并重启后逐条对）

| # | 检查 | 命令 / 位置 | 期望 |
|---|---|---|---|
| 1 | 补丁是否打上 | `python camera-patch\patch_camera.py --check` | `status: PATCHED`，退出码 0 |
| 2 | asar 没被改坏 | 补丁后 `main.js` 大小不变（`516716`）、asar 头部可解析 | 见下方「完整性」 |
| 3 | 插件登记 | `<DSH_HOME>\profiles\desktop\package.json` | `dependencies` 有 `link:`，`bundles` 含 `dsh-startup-machine`，且无 `dsh-startup-screen` |
| 4 | 插件版本 | `plugin-sources\dsh-startup-machine\package.json` | `"version": "1.2.5"`（旧版会残留 1.3.x / 1.6.x，必须被覆盖） |
| 5 | 七套测试 | 在 `plugin\` 下 `npm test`，或按下方命令逐个跑 | **105 / 36 / 10 / 14 / 13 / 14 / 8** 全绿 |
| 6 | 配置 | `<DSH_HOME>\dsh-startup-machine.json` | `identity=Low_Entropy`、`identityId=114514`、`camera=true`、`enabled=true` |
| 7 | 资源随包 | `plugin-sources\dsh-startup-machine\assets\` | `mp\` 有 **6** 个文件（`vision_bundle.mjs` + `wasm\vision_wasm_internal.{js,wasm}` + `face_landmarker.task` + 2 个许可）、`avatar\default.jpg` 存在 |
| 8 | 启动动画第一幕 | 重启后看 | 纯黑底；`YOU ARE BEING WATCHED.` → `I KNOW, BECAUSE I BUILT IT.` 两张卡；左上角极暗系统名；左下角 `POWER … OK` 点线自检行 |
| 9 | 启动动画第二幕 | 同上 | **实时摄像头画面** + 取景框跟随；遥测出现 `MESH 478 PTS · GPU`（或 CPU） |
| 10 | 设置面板 | 设置 → 启动动画 · MACHINE | 不再空白；**底部版本 `v1.2.5`**；摄像头自检「引擎」一行先写肤色追踪、约 0.5 秒后变 `478 点网格` |
| 11 | 黑条跟眼 | 第二幕歪一下头 | 黑条跟着倾斜、完整盖住双眼；把「黑条跟随眼睛」关掉会退回固定比例 |
| 12 | 模拟头像 | 面板关掉「调用摄像头」→ 重播 | 第二幕出现头像（不是噪点、也不是剪影）、取景框套在脸上、第三幕档案照也是它；状态栏写 `SIMULATED FEED · NO CAMERA`（1.2.2 起默认图内嵌在 splash.js 里，桌面端也一定出图） |
| 13 | 强制跳过 | 面板 → 强制跳过 | 「自动」时显示「自动 · N s」，改任一幕时长该数字跟着变；填更小的值会在那一幕中间硬切 |
| 14 | 立即预览 | 面板改任一幕时长（先别保存）→ 点「立即预览」 | 重播用的就是新时长，不用先保存 |
| 15 | 启动瞬间 | 完全退出 DSH 再打开 | **第一眼是黑屏**（不是主界面）；黑屏很短后进第一幕，不会闪出 DSH 本体 |
| 16 | 控制台无报错 | F12 控制台 | 干净 |
| 17 | 登录守护位置 | `<DSH安装目录>\resources\dsh-startup-machine-guard\` | 有 `verify_and_repatch.ps1`、`patch_camera.py`、`guard-manifest.json`；启动文件夹 VBS 里 `expected=` 的 SHA-256 与 `certutil -hashfile` 一致 |
| 18 | 备份清单 | `<DSH安装目录>\resources\app.asar.camera-backup.json` | 存在，记有 `backup` / `sha256` / `size`；没有它 `-RestoreAsar` 会拒绝还原 |
| 19 | 重启脚本 | 包内 `重启DSH.cmd` | `pushd`/`popd` 成对；`restart-dsh-camera.cmd` 覆盖 `%LOCALAPPDATA%\Programs\*` 与 `Program Files (x86)` |

**命令行自检**（node 用 DSH 自带的运行时）：

```powershell
$node = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
Push-Location <包目录>\plugin
& $node test\smoke.mjs          # 105 项
& $node test\hud-draw.mjs       # 36 项
& $node test\panel.mjs          # 10 项
& $node test\eye-track.mjs      # 14 项
& $node test\face-track.mjs     # 13 项
& $node test\face-landmark.mjs  # 14 项
& $node test\lint-globals.mjs   #  8 项
Pop-Location
```

> 本机实测（1.4.0 时代的 DSH 构建，字节数随 DSH 版本变化，关键是**补丁前后一致**）：
> 补丁后 `main.js` 大小 `516716` 与补丁前一致，asar 头部可解析、所有条目无越界，
> 字节级 diff 只有两处等长改动（`mediaType === "audio"` → `(details.mediaType || 1)`、
> `mediaTypes.length === 1 && ...[0] === "audio"` → `mediaTypes.length >= 1`），其余零改动。
> 主窗口/主框架/`dsh-app://app` 来源校验、音频权限都保留，另有 3 处 `callback(false)`
> 属账号页/隔离分区，未动。

---

## 5. 排错

| 现象 | 先查 | 处置 |
|---|---|---|
| 动画能播但摄像头没画面 | 是不是只关了窗口没退进程 | `taskkill /IM "DeepSeek Harness.exe" /F` 后重开 |
| 同上 | `patch_camera.py --check` | 非 PATCHED 就 `--apply` |
| 同上 | 守护日志 `<DSH_HOME>\camera-patch\guard.log` | 看是「re-applied OK」还是「upstream code may have changed」 |
| 设置页空白 | 面板版本号 | 若是 v1.3.1 说明装成了旧版，重装 1.2.5 |
| 登录守护不生效（`guard.log` 不更新） | `<DSH安装目录>\resources\dsh-startup-machine-guard\guard.log`；`guard-manifest.json` 在不在 | 脚本被移动/篡改、或哈希不匹配时 VBS 会静默不执行；重装一次就会重建脚本+清单+VBS |
| `-RestoreAsar` 提示没有可验证的备份 | 安装目录里有没有 `app.asar.camera-backup.json` | 1.2.4 及更早安装的没有清单；重装一次生成清单，或确认备份可信后用 `-Force` 强制还原 |
| 按用户安装的机器上 `重启DSH.cmd` 找不到 exe | 包内 `camera-patch\restart-dsh-camera.cmd` 是否含 `LOCALAPPDATA` | 1.2.4 及更早漏了 `%LOCALAPPDATA%\Programs`；1.2.5 已修 |
| 换幕时黑条消失 | 面板底部版本号 | 1.2.2 及更早：换幕瞬间取景框被置空、条不吃 alpha、档案照在关闭「跟随眼睛」时不摆条；1.2.3 起随幕淡出 + 兜底条永远执行 |
| 后面几幕直接没了 / 动画提前收场 | 面板底部版本号 | 1.1.3 及更早：整段序列超过 18 秒会被兜底定时器整屏拿掉，升到 1.2.0 |
| 点「立即预览」没反应 / 还是旧设置 | 面板底部版本号 | 1.1.2 及更早的预览读的是「已保存」配置，升到 1.1.3 后按面板当前值重播 |
| 没摄像头时画面是剪影而不是头像 | `assets\avatar\default.jpg` 在不在；面板版本号 | 1.2.1 起默认图内嵌在 `splash.js` 里，不再依赖 Host 下发；升到 1.2.1 及以后重播应出狗图。自定义地址失效时会自动退回内嵌图 |
| 面板「模拟头像」里填了 `assets/avatar/default.jpg` 这类相对路径 | 桌面端页面是 `dsh-app://`，相对路径取不到 | 1.2.2 起只认 `data:` / `http(s):` / `blob:`，其它值一律忽略并回落内置图；把该栏留空即可 |
| 第二幕框不动 / 一直 NO LOCK | 遥测有没有 `MESH 478 PTS` | 只有 `FACE / GEOMETRY LOCKED` 说明走了肤色法：看 `assets\mp\` 是否完整，或把 `faceEngine` 临时设 `landmark` 强制只用网格 |
| 网格引擎很慢（虚拟显卡 / 远程桌面） | `state()` 里 `lmMs` | 属正常降档：>220 ms/帧会 GPU → CPU → 肤色法，动画不该被拖卡 |
| 黑条偏了 / 太厚太薄 | 遥测确认是 `MESH` 而非 `skin` | 调「黑条长度 / 黑条厚度 / 眼位平滑」；戴眼镜或侧脸超 30° 属模型边界 |
| 没摄像头时画面是噪点而不是头像 | `assets\avatar\default.jpg` 在不在 | 补文件，或把 `avatarOnNoCam` 置 `true`（默认就是 true） |
| 头像上取景框偏了 | `avatarBox`（`x,y,w,h` 百分比） | 换成自己的照片时按「眉到下巴」那块重新填，默认 `49,44,36,34` |
| 第一幕显示的还是「SYSTEM ONLINE」 | 旧配置里存了 `bootEn` / `bootZh` | 这两个键存在时优先用旧文案；删掉或改掉即用新文案 |
| DSH 升级后摄像头又不行 | `guard.log` | 登录守护会自动重打；也可手动跑 `verify_and_repatch.ps1` |

Windows 侧前提：设置 → 隐私和安全性 → 摄像头 → 允许桌面应用访问（本机已确认 `ConsentStore\webcam` 为 Allow）。

---

## 6. 卸载与回滚

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File uninstall.ps1             # 移除插件+守护，保留摄像头补丁和配置
powershell -NoProfile -ExecutionPolicy Bypass -File uninstall.ps1 -RestoreAsar # 连 app.asar 一起还原（先完全退出 DSH）
powershell -NoProfile -ExecutionPolicy Bypass -File uninstall.ps1 -RestoreAsar -Force # 备份没有安装时清单时，明确强制还原旧备份
```

- 原始 `app.asar` 备份：`<DSH安装目录>\resources\app.asar.bak-camera-<时间戳>`；1.2.5 起同时写
  `app.asar.camera-backup.json`（文件名/大小/SHA-256），`-RestoreAsar` 只还原与清单完全一致的备份。
- 配置 `<DSH_HOME>\dsh-startup-machine.json` 默认保留，需手动删。

---

## 7. 未经用户确认不要做的事

- 不要改 `<DSH_HOME>\profiles\*\package.json` 以外的文件
- 不要删 `app.asar.bak-camera-*`（回滚用）
- 不要替用户改 Windows 摄像头隐私开关、显卡首选项、BIOS
- 不要在没有 `app.asar` 备份的情况下跑 `--apply`（脚本自己会备份，但别手动删了它）
- 不要对已运行的 DSH 进程做 `--apply` 后不提醒重启
- 不要覆盖用户已有的 `dsh-startup-machine.json`（除非用户明确要求，或用了 `-ForceConfig`）

---

## 8. 装完发用户的一段话

> 装好了。四件事：① 插件已升级到 **1.2.5**（设置面板不再空白，底部显示 `v1.2.5`）；
> ② 摄像头权限补丁已打上，启动动画第二幕会真的调用摄像头；③ 默认身份是 `Low_Entropy / 114514`；
> ④ **没有摄像头也能演** —— 关掉摄像头或用模拟头像，第二幕照样锁脸、第三幕照样出档案照。
> **请完整退出 DeepSeek Harness 再启动**（会中断当前会话，记录还在），
> 之后启动时先播 7.5 秒五幕动画、右下角可 SKIP，设置 → 启动动画 · MACHINE 里都能调
> （每幕时长、强制跳过、逐字输入的幕、模拟头像、眼部黑条、取景框跟随）。1.2.4 起**没有人声播报**了，只有 WebAudio 音效。
> DSH 以后升级覆盖了补丁，登录时会自动重打；想彻底还原就跑 `卸载.cmd` 加 `-RestoreAsar`。

---

## 9. 已知限制（如实告知）

- 摄像头补丁改的是已安装应用本体；DSH 升级会覆盖，靠登录守护自动重打。
- 仅 Windows；桌面端媒体权限由 Electron 主进程控制，无官方开关。
- 若上游（DSH）重构导致模式串不再唯一，补丁会**拒绝修改**并记日志，不会改坏。
- 人脸追踪用的是 478 点网格模型，**不做身份识别**（不判断「你是谁」，只出几何：脸框、眼睑、虹膜、头部姿态）。
- 模型边界：戴粗框/反光眼镜、侧脸超过 30～40°、强逆光直射、脸部被大面积遮挡时点位会偏；
  这时可以把「黑条跟随眼睛」关掉，退回取景框固定比例。
- 虚拟显卡、远程桌面、纯软件渲染下 GPU delegate 可能每帧 1 秒以上，会自动降到 CPU 再降到肤色法；
  降档是设计行为，不是故障。
- 模拟头像是一张静态图（加了冷调 + 细噪点），不会动；它只负责「有画面可锁」，不模仿真人反应。
  图片取不到时画的是一个「档案剪影」（暗底 + 头肩轮廓），只保证有脸可锁，不试图长得像人。
- 字体依赖系统已装 `HarmonyOS Sans SC`；没装则回落到 Noto Sans SC / 思源 / 雅黑，排版不塌但字重会变。
