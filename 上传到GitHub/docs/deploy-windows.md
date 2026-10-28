# dsh-startup-machine 1.2.5 部署包

> 仓库首页（概览 / 截图 / 安全说明）见 [README.md](../README.md)。

DeepSeek Harness 启动动画「THE MACHINE」+ 设置面板修复 + **摄像头权限补丁** + **478 点人脸网格追踪** + 默认配置 + 一键部署/守护脚本。

| 项 | 值 |
|---|---|
| 版本 | **1.2.5**（2026-10-28） |
| 上游基底 | `dsh-startup-machine 1.3.2`（MIT，作者沈宏宏 / 上游项目） |
| 新增依赖 | MediaPipe Tasks Vision 0.10.20 运行时 + FaceLandmarker 模型（随包，离线） |
| 目标平台 | DSH **Desktop（Electron 桌面端）**，Windows |
| 依赖 | 无第三方 npm 依赖；Python 仅用于摄像头补丁（DSH 自带运行时即可） |

---

## 一、这个包解决了什么

1. **启动动画本体**：五幕开机序列（标题卡 → 摄像头人脸锁定 → 档案比对 → 授权 → 揭幕），默认 7.5 秒，可跳过；取景框跟随、眼部黑块马赛克、字幕/每幕时长（1.2.4 起没有人声播报）/摄像头参数全部可调。
   1.6.2 起是**纯黑底 + 开源鸿蒙 Sans**：第一幕是「一句话压在全黑上」的标题卡（两句轮流念），
   左上角一列极暗的系统名、左下角带点线引导的自检行，其余 HUD 装饰在这一幕全部收起。
   1.1.3 起：**没有摄像头也能演** —— 关掉/没设备/被拒/超时都会用一张可自定义的模拟头像顶上
   （第二幕照常锁脸、第三幕照常出档案照），图取不到还会画「档案剪影」，不会掉回噪点；
   **强制跳过**可调且默认跟着各幕合计走；逐字字幕默认只给后三幕，第一、二幕整行直出；
   **设置面板的「立即预览」按面板当前值重播（不必先保存）**；
   **眯眼时眼部黑条不再变薄**（厚度下限按眼眶高度兜底）。
   1.2.0 起：修掉「长序列被兜底定时器提前收场、后面几幕消失」和「桌面端关摄像头只显示剪影」两个实测问题；
   包内默认配置里的旧文案（`SYSTEM ONLINE`）也一并同步成新文案。
   1.2.1 起：默认头像（狗狗图）在构建时直接内嵌进 `splash.js`，用 `createImageBitmap` 解码 ——
   不再依赖 Host 下发/路由/CSP，桌面端关掉摄像头一定出图。
   1.2.2 起：**启动瞬间不再闪一下 DSH 本体** —— 遮罩改用内联样式、并且「先遮再读配置」；
   **第二幕最后那一下黑条不再消失**（眼位短暂丢失时冻结在最后位置），
   第三幕档案照在没有眼位（模拟头像 / 跟丢）时也会按取景框比例摆一条。
   1.2.3 起：**换幕时黑条不再瞬间消失** —— 取景框/黑条随 `.ms-act` 一起淡出（重写了 alpha 链路），
   档案照那条也不再因为关闭「黑条跟随眼睛」而整条不摆；第三幕显示后还会补摆两次。
   1.2.4 起：**人声播报整体移除** —— Web Speech API、音色/语速/音调/`voiceWait` 这些配置项、
   面板里的语音分组、`API.speak()` 全部删掉（幕推进回归「只看幕长」，不再有「等这句念完」的分支）；
   同时**出厂 `config` 与代码默认值对齐**，点「恢复默认」就是出厂外观（`Low_Entropy` / 114514 / 黑条 16·33·3）。
   1.2.5 起：**安全加固** —— 登录守护脚本改放到 `<DSH安装目录>\resources\dsh-startup-machine-guard\`，
   VBS 执行前用 SHA-256 校验、脚本再校验 helper（`guard-manifest.json`），安装时顺带清掉旧版用户目录里的可写副本；
   `-RestoreAsar` 只还原与安装时清单（`app.asar.camera-backup.json`：文件名/大小/SHA-256）一致的备份，
   无清单的旧备份默认拒绝（`-Force` 可强制）；修好 `重启DSH.cmd` 的 `pushd`/`popd` 和
   `restart-dsh-camera.cmd` 漏搜 `%LOCALAPPDATA%\Programs` 的问题。
2. **设置面板空白修复**：上游 1.3.1 的 `lib/client.js` 有一处 `file` 未定义 / `setFile` 绑错，导致「设置 → 启动动画 · MACHINE」一片空白。**1.3.2 已修复**，本包直接采用（并保留其新增的 `test/panel.mjs` 回归测试）。
3. **摄像头权限补丁**（本包新增）：DSH 桌面端 Electron 主进程只放行「音频」媒体权限，视频请求被直接拒绝且无官方开关。补丁以**等长字节替换**放开视频权限（详见第四节）。
4. **眼部黑条跟随实测眼位**（1.5.0 → 1.6.1 重做几何）：黑条不再按固定解剖学比例摆，而是压在你**实际的两只眼睛**上。
   1.6.1 起按「四个眼角 + 上下眼睑」建一个**斜矩形**：歪头时条跟着斜（实测歪 20° → 条转 19.7°）、
   侧脸时随透视收缩不露眼角、眨眼时不变薄、跟眼抖动只让块缝动不让条变薄；第三幕档案照里的条同样会转。
   长度/厚度仍可调，且**调小了也不会窄过眼睛**（有外眼角包络兜底）。
5. **人脸追踪换成 478 点网格**（1.6.0 新增）：原来靠肤色连通域估算，暖光/暗光/逆光会整段丢锁、头肩连成一片时框还会跑到胸口上；现在用 MediaPipe FaceLandmarker 出真几何——脸框、双眼眼睑 + 虹膜、头部姿态。模型与 wasm 随包安装在本地，**不联网、不上传、不存画面**。跑不动（虚拟显卡、老核显）会自己降档：GPU → CPU → 肤色法，动画不会跟着卡。实测暖光/暗光/逆光/侧倾 15°~25° 下框位置零漂移。
5. **默认配置**：共 **72** 项字段；身份 `Low_Entropy` / 编号 `114514`、摄像头开启。1.2.4 起**出厂 `config\dsh-startup-machine.json` 与代码里的三处 `DEFAULTS` 逐字段一致**，面板点「恢复默认」= 回到出厂外观。

---

## 二、目录结构

```
dsh-startup-machine-1.2.5\
├── 安装.cmd                 ← 一键安装（推荐）
├── 卸载.cmd                 ← 一键卸载（保留摄像头补丁；加 -RestoreAsar 可还原）
├── 重启DSH.cmd              ← 一键「完全退出 + 重启」DSH（补丁生效必需）
├── install.ps1              ← 安装逻辑（ASCII 脚本，供 cmd 调用）
├── uninstall.ps1            ← 卸载逻辑
├── VERSION.txt
├── LICENSE                  ← MIT
├── README.md                ← 仓库首页（这个包是什么 / 怎么装 / 改了什么）
├── docs\
│   └── deploy-windows.md    ← 本文件（完整部署 / 验证 / 排错 / 回滚）
├── CHANGELOG.md
├── plugin\                  ← 插件本体 1.2.5（基于上游 1.3.2）
│   ├── lib\  preview\  test\  screenshots\
│   ├── assets\mp\           ← 人脸网格运行时 + 模型（约 13 MB，离线）
│   ├── install-offline.ps1  ← 上游离线安装器（写 profile 的 manifest + junction）
│   ├── cordis.patch.yml  package.json  README.md ...
├── camera-patch\
│   ├── patch_camera.py          ← 摄像头权限补丁（--check / --apply / --asar）
│   ├── verify_and_repatch.ps1   ← 登录时校验并按需重打
│   └── restart-dsh-camera.cmd   ← 完全退出并重启 DSH
└── config\
    └── dsh-startup-machine.json ← 默认配置（安装时若不存在才写入）
```

---

## 三、安装

1. 把整个 `dsh-startup-machine-1.2.5` 文件夹解压到任意位置（路径**不要有空格**更稳）。
2. 双击 **`安装.cmd`**。它会依次：
   1. 把插件复制到 `%USERPROFILE%\.dsh\plugin-sources\dsh-startup-machine` 并注册进 `desktop` profile（依赖 + bundle + junction）
   2. 应用摄像头权限补丁（自动备份原 `app.asar`）
   3. 安装登录守护（启动文件夹一个隐藏 VBS，DSH 升级后自动重打补丁）
   4. 若 `%USERPROFILE%\.dsh\dsh-startup-machine.json` 不存在则写入默认配置（已存在则不覆盖）
3. **完全退出 DSH 再启动** —— 快捷键：双击 **`重启DSH.cmd`**（会结束所有 DeepSeek Harness 进程再启动；当前会话会中断，会话记录仍在磁盘，可恢复）。

> 补丁为什么必须完全重启：Electron 主进程只在启动时读取 `app.asar`，关窗口不等于退出进程。

### 安装参数（可选）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 `
  -Profile desktop `      # 目标 profile，默认 desktop
  -SkipCameraPatch `      # 不装摄像头补丁
  -SkipGuard `            # 不装登录守护
  -ForceConfig            # 用包内默认配置覆盖现有配置
```

---

## 四、摄像头权限补丁说明（重要）

**背景**：DSH 桌面端 `app.asar → lib/main.js` 里的 `installMicrophonePermissions()` 只接受
`mediaType === "audio"`，其余媒体请求一律 `callback(false)`。所以启动动画的
`getUserMedia({video})` 在到达 Windows 之前就被拒绝，表现为「动画能用但摄像头没画面」。

**做法**：在 `lib/main.js` 内做两处**等长字节替换**（文件大小不变 → asar 偏移、头部、条目大小全不变）：

| 位置 | 原代码 | 替换为 |
|---|---|---|
| 权限检查处理器 | `details.mediaType === "audio"` | `(details.mediaType \|\| 1)` + 空格补齐 |
| 权限请求处理器 | `details.mediaTypes.length === 1 && details.mediaTypes[0] === "audio"` | `details.mediaTypes.length >= 1` + 空格补齐 |

- 保留原有的信任校验：必须是主窗口、主框架、`dsh-app://app` 来源
- 音频（话筒）权限也仍然可用（`>= 1` 涵盖 audio）
- 另有 3 处 `callback(false)` 属于账号页/其它隔离分区，**未改动**

**风险与维护**
- 修改的是已安装应用本体：**DSH 升级会覆盖**，因此本包装了登录守护自动重打
- 守护日志：`%USERPROFILE%\.dsh\camera-patch\guard.log`
- 原始备份：`<DSH安装目录>\resources\app.asar.bak-camera-<时间戳>`，卸载时加 `-RestoreAsar` 可还原
- 若上游代码结构变化导致模式串找不到，补丁会**拒绝修改**并记录日志（不会改坏）

**Windows 侧前提**：设置 → 隐私和安全性 → 摄像头 → 允许应用访问摄像头（含「允许桌面应用访问」）。
本机已确认 `HKCU`/`HKLM` 的 `ConsentStore\webcam` 均为 Allow。

---

## 五、验证清单（安装并重启后）

| # | 检查 | 期望 |
|---|---|---|
| 1 | 第一幕 | 纯黑底；中间一句话（`YOU ARE BEING WATCHED.` → `I KNOW, BECAUSE I BUILT IT.`）逐字打出、末尾块状光标闪；左上角极暗系统名列表；左下角 `POWER … OK` 自检行 |
| 2 | 启动动画第二幕 | 出现**实时摄像头画面** + 取景框跟随；底部字幕逐字输入 |
| 3 | 设置 → 启动动画 · MACHINE | 面板正常显示（不再空白），顶部无红色报错 |
| 4 | 面板 → 摄像头自检 →「打开摄像头」 | 出画面；「引擎」一行先显示肤色追踪，约 0.5 秒后变成 `478 点网格 · GPU`（或 `CPU`） |
| 5 | 面板 → 身份资料 | 身份名称 `Low_Entropy`、编号 `114514` |
| 6 | 面板 → 眼部黑块马赛克 | 有「黑条跟随眼睛 / 黑条长度 / 黑条厚度 / 眼位平滑」四项 |
| 7 | 第二幕黑条 | 黑条压在**你的眼睛上**（不是固定位置）；**歪一下头，条会跟着斜**；把「黑条跟随眼睛」关掉会退回固定比例 |
| 8 | 第二幕遥测 | 日志里出现 `MESH 478 PTS · GPU`（或 CPU）；`GEO` 的 X/Y 会跟着你动，且不跳 | 
| 9 | 面板 → 模拟头像 | 关掉「调用摄像头」再重播：第二幕出现头像、取景框套在脸上、黑条压住眼睛，第三幕档案照也是它 |
| 10 | 面板 → 强制跳过 | 选「自动」时显示「自动 · 12.5 s」；把某幕时长拉长，这个数字会跟着变；填个更小的数会在那一幕中间硬切 |
| 11 | 启动瞬间 | 完全退出 DSH 再打开：**先看到的是黑屏**，不是主界面；黑屏停留很短后进第一幕 |
| 12 | 面板 → 立即预览 | 改任一幕时长（先别保存）→ 点「立即预览」：重播用的就是新时长；**加长前几幕也不会把后面几幕切掉** |
| 13 | 完全退出后重开 | 动画再次播放（显示模式 `session` = 每个会话一次） |

命令行自检（在包内 `plugin` 目录）：

```powershell
$node = "C:\Users\WZ113\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
& $node test/smoke.mjs         # 期望 全部通过：97 项
& $node test/hud-draw.mjs      # 期望 全部通过：36 项
& $node test/panel.mjs         # 期望 全部通过：10 项
& $node test/eye-track.mjs     # 期望 全部通过：14 项
& $node test/face-track.mjs    # 期望 全部通过：13 项
& $node test/face-landmark.mjs # 期望 全部通过：14 项
& $node test/lint-globals.mjs  # 期望 全部通过：8 项
```

---

## 六、配置

- 位置：`%USERPROFILE%\.dsh\dsh-startup-machine.json`（72 个字段，原子写入，UTF-8 无 BOM）
- 默认值见 `config\dsh-startup-machine.json`
- 修改后**下次启动生效**；设置页「立即预览」可先看效果
- 注意：设置页点「恢复默认」会回到插件内置默认（身份 `OPERATOR`/`0451`），不是你的配置

---

## 七、卸载

双击 **`卸载.cmd`**（默认保留摄像头补丁），或：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File uninstall.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File uninstall.ps1 -RestoreAsar   # 同时还原 app.asar
```

卸载会移除：profile 里的依赖/bundle/junction、登录守护、插件源码副本。
配置文件默认保留；摄像头补丁默认保留（加 `-RestoreAsar` 才还原，需先完全退出 DSH）。

---

## 八、常见问题

**Q1：设置页「启动动画 · MACHINE」一片空白？**
1.3.1 的已知 bug；本包基于 1.3.2 已修复。若仍空白，检查是否装成了旧版（面板底部会显示版本号，它直接来自 `plugin\package.json` 的 `version`，不再有写死的兜底值）。

**Q2：动画能播，但摄像头没画面？**
1. 确认已**完全退出** DSH（不是关窗口）——这是最常见原因
2. 查 `%USERPROFILE%\.dsh\camera-patch\guard.log`，确认补丁状态
3. 手动重打：`python camera-patch\patch_camera.py --check` / `--apply`
4. 确认 Windows 摄像头隐私开关为「允许」

**Q3：黑条看起来还是偏了 / 太厚或太薄？**
1. 黑条的位置来自 478 点网格的**眼角与上下眼睑**，不是按框的比例猜的；先确认第二幕遥测里有 `MESH 478 PTS`
2. 太厚/太薄调「黑条厚度」倍数（默认 2.2 ≈ 3.5 倍眼睑张开），太长/太短调「黑条长度」（默认 1.75，且不会窄过外眼角）
3. 觉得条抖得慌就把「眼位平滑」调小、或关掉「锁定抖动」（1.6.1 起抖动只动块缝，不会让条变薄）
4. 戴眼镜/大幅度侧脸时网格仍可能估偏，属于模型边界；这时把「黑条跟随眼睛」关掉会退回取景框固定比例

**Q4：第二幕的框卡在固定位置不动 / 一直显示 NO LOCK？**
1. 先看第二幕遥测日志：有 `MESH 478 PTS · GPU|CPU` 说明网格引擎在跑；只有 `FACE / GEOMETRY LOCKED` 说明走了肤色法
2. `%USERPROFILE%\.dsh\dsh-startup-machine.json` 里把 `"faceEngine"` 设为 `"landmark"` 可以强制只用网格（排查用），
   设成 `"skin"` 则回到 1.5.0 的纯肤色方案
3. 虚拟摄像头 / 远程桌面 / 纯软件渲染下 GPU delegate 会很慢，插件会自动换 CPU 再试，
   还是慢就退回肤色法 —— 这是设计行为，不是坏了
4. 若 `plugin\assets\mp` 被清理过（模型 3.6 MB + wasm 9.1 MB），网格会静默降级；重装即可

**Q5：多出 13 MB 值得吗？**
模型与 wasm 只在本地读，不联网、不缓存到云。换来的是第二、三幕在真实家居灯光下不再丢锁。
想省空间可以把 `faceEngine` 设为 `"skin"` 并删掉 `plugin\assets\mp`，插件会自动降级、功能不缺（只是回到肤色法的精度）。

**Q6：DSH 升级后摄像头又不行了？**
登录守护会在下次登录时自动重打；也可立即手动执行
`powershell -File "%USERPROFILE%\.dsh\camera-patch\verify_and_repatch.ps1"`。

**Q7：不想改应用本体，有没有零改动的方案？**
有：把插件装到 `web` profile 并用浏览器访问 DSH（浏览器会正常弹摄像头授权，DSH 升级也不受影响）。
代价是需要用浏览器打开，而不是桌面客户端。

---

## 九、许可与致谢

- 插件本体：`dsh-startup-machine`，MIT，版权归上游作者（沈宏宏 / 上游仓库）
- 视觉与 HUD 的参考项目（均 MIT）：
  - [rosehahah/the-machine](https://github.com/rosehahah/the-machine) —— The Machine 的开源复刻，取景框绘制规则移植自它的 `web/hud.js`
  - [Crispsormd/the-machine-windows](https://github.com/Crispsormd/the-machine-windows) —— 上面那个的 Windows 移植，人脸识别叙事与 HUD 信息结构的参考
  - [yuqisun/dsh-theme-machine](https://github.com/yuqisun/dsh-theme-machine) —— 同一个剧的 DSH 皮肤，本项目视觉基线
- 人脸网格：MediaPipe Tasks Vision（Apache-2.0，Google）与 FaceLandmarker 模型，随包离线分发
- 摄像头补丁、部署与守护脚本：本包附加，同样以 MIT 提供
- 修改已安装应用属于非常规手段，请自行评估风险；仅供本人机器使用
