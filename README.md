# 打怪待办

常驻桌面的悬浮工作助手：待办任务会随逾期逐渐进化为 Boss；英语单词、短语或句子可用全局快捷键速记，再按间隔重复法复习。完成待办与复习英语共用经验和等级进度。窗口可贴到屏幕左右侧，悬停边缘把手时展开。

## 运行

```bash
npm install
npm start
```

需要 Node.js 22.12 或更高版本。运行后可拖动顶部栏移动窗口，点击向下箭头收起，点击关闭按钮隐藏到系统托盘；在托盘双击图标可重新打开，右键选择「退出」才会结束程序。

在 Windows x64 上运行 `npm run installer` 可生成单文件安装程序 `dist/打怪待办-Setup-版本号-x64.exe`。将这个 exe 发给对方，双击后可选择安装目录；安装程序会创建桌面和开始菜单快捷方式，也支持从 Windows 设置卸载。当前安装程序未签名，Windows 可能提示「未知发布者」。安装和卸载不会主动删除 `%APPDATA%\wk-sidecar` 中的用户数据。

运行 `npm run package` 可生成便携版：`release/打怪待办-win32-x64/打怪待办.exe`。便携版须保留整个目录，不能只分发其中的 exe。安装版、便携版和开发版使用同一份用户数据；目前没有自动更新。

## 文档

- [功能与使用](docs/usage.md)：记录、提醒、进化、窗口和设置。
- [英语速记与复习](docs/english.md)：快捷记录、卡片、FSRS 和提醒节奏。
- [数据与恢复](docs/data.md)：存储位置、文件结构、备份、导入导出。
- [开发约定](docs/development.md)：模块边界、修改规则和验证要求。
- [迭代方向](docs/roadmap.md)：已知限制与后续优先级。

运行 `npm test` 可检查进化、经验和数据恢复规则。

## 项目结构

```text
src/
  main/              Electron 主进程、preload 与本地状态存储
  shared/            不依赖 Electron 的任务、英语和贴边规则
  renderer/
    main/            主窗口页面
    english/         英语速记与复习窗口
    dock/            屏幕边缘把手
assets/              应用图标
docs/                使用、数据和开发文档
scripts/             打包及图标生成脚本
test/                规则和持久化测试
```

入口为 `src/main/main.js`，新增文件的归属和跨目录引用约定见[开发约定](docs/development.md)。
