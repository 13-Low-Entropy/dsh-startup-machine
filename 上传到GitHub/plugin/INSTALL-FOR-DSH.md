# 给 DSH / AI 助手的安装说明

> 这份文件是给「执行安装的那个 AI」看的，不是给普通用户看的。
> 目标是：把本目录注册成 DSH 某个 profile 的插件，让启动时出现五幕开机动画。
> 全部操作都是可回滚的文件操作，不会联网、不会装依赖、不需要 npm。

---

## 0. 这是什么

`dsh-startup-machine` 是一个 DSH 插件（纯 JS，零第三方依赖，`engines.node >= 20`）。
它和自带的 `dsh-startup-screen` 做同一件事，**两者不能同时启用**（会叠两层启动画面）。

目录结构：

```
dsh-startup-machine/
├── package.json          # 插件元数据；dsh.bundle.patch 指向 cordis.patch.yml
├── cordis.patch.yml      # Host 侧挂载声明（只加一个 bundle 节点）
├── install.cmd           # 主安装器（先试 dsh CLI，失败自动转离线）
├── install-offline.ps1   # 离线安装器（不需要 dsh 在 PATH 里）
├── preview.cmd           # 起本地静态服务，浏览器里单独看动画
├── lib/                  # 运行时：index.js(Host) / client.js(设置页) / splash.*(动画)
├── preview/              # 独立预览页（不装 DSH 也能看）
├── test/                 # 三套零依赖测试
└── screenshots/          # 效果图
```

---

## 1. 安装 = 三件事

不管走哪条路，最终都要在这个 profile 里落下三处改动（`<profile>` 默认 `desktop`）：

| # | 改什么 | 具体内容 |
|---|---|---|
| 1 | `~/.dsh/profiles/<profile>/package.json` → `dependencies` | `"dsh-startup-machine": "link:<本目录绝对路径，用正斜杠>"` |
| 2 | 同一文件的 `dsh.profile.bundles` | 追加字符串 `"dsh-startup-machine"` |
| 3 | `~/.dsh/profiles/<profile>/node_modules/dsh-startup-machine` | 指向本目录的目录链接（junction 即可） |

另外**必须**把 `dsh-startup-screen` 从 1、2 两处删掉，否则两层启动动画叠着跑。

官方 CLI 的 `dsh plugin add link:<dir>` 做的正是这三件事 + 删旧的。

---

## 2. 推荐执行顺序

### 路线 A：有 `dsh` 命令（首选）

```bat
dsh plugin --profile desktop remove dsh-startup-screen
dsh plugin --profile desktop add "link:<本目录绝对路径>"
```

`web` profile 就把 `desktop` 换成 `web`。两条命令的退出码都应为 0。

### 路线 B：`dsh` 不在 PATH 里（Windows 上很常见）

直接跑目录里的安装器，它会自动判断该走 A 还是 B：

```bat
install.cmd
:: 或者指定 profile
install.cmd web
```

等价于手动调离线安装器：

```bat
powershell -NoProfile -ExecutionPolicy Bypass -File install-offline.ps1 -Profile desktop
```

离线安装器会：

1. 备份 `package.json` 到 `package.json.bak-<时间戳>`
2. 改 `dependencies` + `dsh.profile.bundles`，顺手删掉 `dsh-startup-screen`
3. 用**无 BOM** 的 UTF-8 写回（有 BOM 会让 `JSON.parse` 失败）
4. 立刻重新解析一遍，解析不过就自动从备份回滚并退出码 1
5. 在 `node_modules` 下建 junction，并验证 `<link>/package.json` 能读到

> 已实测：在真实 `package.json` 的副本上跑通，产物结构、无 BOM、junction 解析、
> 二次执行幂等、`-Uninstall` 反向清理均正常。**尚未**在活的 DSH 进程里验证加载，
> 因为加载要重启。

### 路线 C：两者都不行（比如 PowerShell 被执行策略挡住）

手工改上面那张表的三处，`package.json` 保持 UTF-8 无 BOM，`node_modules` 里的链接
可以用 `cmd /c mklink /J "<profile>\node_modules\dsh-startup-machine" "<本目录>"`。
改前先备份。

---

## 3. 装完的验证清单

按顺序检查，任何一条不对就先别让用户重启：

```bat
:: 1) 依赖登记了吗（应输出 link:<本目录>）
findstr /C:"dsh-startup-machine" "%USERPROFILE%\.dsh\profiles\desktop\package.json"

:: 2) 旧的还在不在（应无输出）
findstr /C:"dsh-startup-screen" "%USERPROFILE%\.dsh\profiles\desktop\package.json"

:: 3) 链接能不能解析（应能列出文件）
dir "%USERPROFILE%\.dsh\profiles\desktop\node_modules\dsh-startup-machine"
```

在 Linux/macOS/bash 下等价于：

```bash
grep -c dsh-startup-machine ~/.dsh/profiles/desktop/package.json      # 期望 >= 2
grep -c dsh-startup-screen  ~/.dsh/profiles/desktop/package.json      # 期望 0
ls ~/.dsh/profiles/desktop/node_modules/dsh-startup-machine/package.json  # 期望存在
```

有 `node` 的话还可以跑一遍插件自检（不碰摄像头、不写任何东西）：

```bash
cd <本目录>
node test/smoke.mjs        # 期望「全部通过：44 项」
node test/panel.mjs        # 期望「全部通过：10 项」（设置页能不能渲染的回归测试）
node test/hud-draw.mjs     # 期望「全部通过：17 项」
node test/face-track.mjs   # 期望「全部通过：13 项」
```

---

## 4. 装完之后会发生什么

- **必须完整重启 DSH**（退出进程，不是关窗口），插件在启动时装配。
- 重启后：启动出现 7.5 秒五幕动画，右下角有 `SKIP`。
- 设置页多出一组入口：**设置 → 启动动画 · MACHINE**（60+ 项，含摄像头自检）。
- 配置文件在 `~/.dsh/dsh-startup-machine.json`，首次启动后生成。
  **改代码里的默认值不会覆盖已存在的配置**——要让新默认生效，得删掉这个 json 或在面板里点「恢复默认」。

---

## 5. 回滚

```bat
install.cmd desktop uninstall
```

或手工：删掉 `dependencies` 里那行、`bundles` 里那项、`node_modules` 里那个链接。
想连自带启动画面一起恢复，从 `package.json.bak-<时间戳>` 还原，或
`dsh plugin --profile desktop add dsh-startup-screen`。

---

## 6. 已知坑（别踩）

1. **两层启动画面**：只装不删 `dsh-startup-screen`，会看到两个动画叠在一起。
2. **JSON 带 BOM**：Windows PowerShell 5.1 的 `Set-Content -Encoding UTF8` 会写 BOM，
   导致 profile 加载失败。必须用 `[System.IO.File]::WriteAllText` + `UTF8Encoding($false)`。
3. **`link:` 路径用反斜杠**：npm 的 spec 里反斜杠是转义符，务必写成 `link:C:/a/b`。
4. **junction vs symlink**：symlink 需要管理员或开发者模式，junction 不需要，用 junction。
5. **摄像头被占用**：动画播放时会独占摄像头几秒，如果别的软件（会议软件）正在用，
   取流会失败——插件会降级成噪点 + 纯 HUD，不会卡住。
6. **路径别带空格**（中文可以，空格不行）：`link:` 的值是 npm spec，部分解析器会按空白切开。
   离线安装器能用，但之后若改用 CLI 就可能装不上。放在 `C://dsh-plugins//dsh-startup-machine` 这种路径最稳。
7. **不要**把本目录放到 OneDrive 同步目录或网络盘下，junction 会解析不到。

---

## 7. 未经用户确认不要做的事

- 不要修改 `~/.dsh/profiles/*/package.json` 之外的文件
- 不要删 `package.json.bak-*`（那是回滚用的）
- 不要替用户去改摄像头权限、显卡首选项、BIOS 设置
- 不要在没有备份的情况下重写 `package.json`

---

## 8. 一段可粘贴的确认话术（装完发给用户）

> 装好了：`dsh-startup-machine` 已登记到 desktop profile，自带的 `dsh-startup-screen`
> 已移除（否则会叠两层）。**请完整退出 DSH 再启动**——启动时会先播 7.5 秒五幕动画，
> 右下角可以 SKIP。之后进「设置 → 启动动画 · MACHINE」调字幕、时长、摄像头。
> 想回滚就跑 `install.cmd desktop uninstall`。
