# 开发约定

## 目录与模块边界

根目录只放项目配置、许可证和 README。应用代码统一放在 `src/`，资源、文档、开发脚本和测试分别放在 `assets/`、`docs/`、`scripts/` 和 `test/`。新增窗口在 `src/renderer/` 下建立独立目录，同一窗口的 HTML、CSS 和页面脚本放在一起。

| 文件 | 职责 |
| --- | --- |
| `src/main/main.js` | Electron 生命周期、窗口、托盘、系统通知、IPC 和操作系统能力 |
| `src/main/preload.js` | 向页面暴露最小权限的 IPC 接口 |
| `src/main/state-store.js` | 状态默认值、旧数据兼容、校验、备份和恢复 |
| `src/shared/task-engine.js` | 阶段、提醒时间和经验计算的纯规则；主进程与主窗口共用 |
| `src/shared/english-engine.js` | FSRS 包装、到期查询与提示频率规则 |
| `src/shared/dock-engine.js` | 贴边几何规则 |
| `src/renderer/main/` | 主窗口界面、交互与主题 |
| `src/renderer/english/` | 速记、编辑与复习窗口 |
| `src/renderer/dock/` | 屏幕边缘把手窗口 |

`shared/` 不依赖 Electron、DOM 或本地数据路径，可由 Node 测试直接导入。`renderer/` 只通过 preload 暴露的接口请求系统能力；主进程用绝对路径加载页面。页面引用其他目录的资源时，按当前 HTML 所在目录计算相对路径。移动入口或页面后同步检查 `package.json`、打包脚本、图标路径和测试引用。

新增任务规则时只在 `src/shared/task-engine.js` 实现，并补边界测试。新增持久化字段时同时修改 `src/main/state-store.js` 的默认值、规范化和测试。新增主进程能力时经过 `src/main/preload.js` 的明确接口暴露，IPC 参数必须在主进程校验。页面渲染用户输入使用 `textContent`，避免把任务文本当成 HTML。

英语卡片的评分只由主进程调用 `english-engine.js` 完成。`schedule` 存储数值型时间戳，送入 `ts-fsrs` 前恢复为 `Date`；不要在页面重新计算间隔。未填释义的卡片只作草稿，不进入复习和通知队列。修改提醒规则时同步检查安静时段、间隔和每日上限测试。

总经验由已完成待办的 `earnedXp` 和英语卡片的累计 `earnedXp` 相加。英语卡片每天最多奖励一次，`lastXpDay` 记录本地日期；评分历史只保留最近 100 条，不能用历史条数重算总经验。修改删除、导入或恢复行为时保持这项总账一致。

不要在页面或主进程另写一份阶段/经验公式。修改托盘、置顶、透明度、开机启动等操作系统行为时，验证开发版和打包版；打包版应继续使用固定的 `wk-sidecar` 数据目录。

贴边状态只保存 `windowDock` 与主窗口展开坐标。主窗口隐藏到托盘时，把手也必须隐藏；切换紧凑模式、显示器工作区变化和重启后，应按 `dock-engine.js` 重算主窗口与把手位置。

## 本地验证

开发版可设置 `WK_SIDECAR_DEV_DATA_DIR` 指向临时目录，以隔离测试数据；打包版始终使用固定的用户数据目录。验证需要修改卡片或任务的流程时使用这个开关。

```bash
npm install
npm test
npm start
npm run package
```

`npm run package` 目前只面向 Windows x64，输出便携版目录 `release/打怪待办-win32-x64`。目录已加入 `.gitignore`。应用图标源文件在 `assets/`；在 Windows 修改图标后可运行 `powershell -ExecutionPolicy Bypass -File scripts/generate-icon.ps1` 重新生成 PNG 和 ICO。

涉及任务、提醒或存储的修改至少验证：新增任务、到期边界、完成/撤销、删除后的经验、重启恢复、坏文件恢复。涉及窗口或偏好的修改还需验证：收起/展开、托盘隐藏与退出、系统主题切换、透明度及再次启动唤回窗口。打包改动要实际启动生成的可执行文件，检查图标和数据目录。

## 保持可维护

- 保持 `state-store.js` 对旧 JSON 的兼容，不直接删除已有用户数据。需要破坏性迁移时明确增加版本字段和迁移测试。
- 不把通知计时依赖于页面持续打开；提醒在主进程运行，阶段按时间戳重新计算。
- 设置的界面值、主进程副作用和磁盘字段须同步，不能出现“勾选了但没有生效”的状态。
- 只为有明确用途的功能增加依赖。打包产物不应包含测试、开发脚本或开发工具依赖。
- 文档与实际行为同次更新；未完成的想法放在[迭代方向](roadmap.md)，不要写成已支持功能。
