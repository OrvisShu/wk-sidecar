# 数据与恢复

## 存储位置

主进程默认使用 Electron 的 `appData/wk-sidecar` 目录，因此开发版和便携版默认读取同一份数据。开发版设置 `WK_SIDECAR_DEV_DATA_DIR` 时可改用独立测试目录；打包版不受该变量影响。主文件名为 `tasks.json`。

| 系统 | 通常位置 |
| --- | --- |
| Windows | `%APPDATA%\wk-sidecar\tasks.json` |
| macOS | `~/Library/Application Support/wk-sidecar/tasks.json` |
| Linux | `~/.config/wk-sidecar/tasks.json`，或 `$XDG_CONFIG_HOME/wk-sidecar/tasks.json` |

实际目录以设置中的「打开目录」为准。数据仅写入本机文件，当前没有账户、云同步或加密；能访问该系统账户文件的程序可以读取任务内容。

## 文件结构

`tasks.json` 是 UTF-8 JSON。当前结构如下，时间均为 Unix 毫秒时间戳：

```json
{
  "tasks": [{
    "id": "uuid",
    "title": "写周报",
    "createdAt": 1760000000000,
    "dueAt": 1760003600000,
    "completedAt": null,
    "earnedXp": null,
    "snoozedUntil": null,
    "lastNotifiedAt": null
  }],
  "cards": [{
    "id": "uuid",
    "front": "take notes",
    "back": "记笔记",
    "example": "",
    "createdAt": 1760000000000,
    "updatedAt": 1760000000000,
    "schedule": {"due": 1760000000000, "stability": 0, "difficulty": 0, "elapsed_days": 0, "scheduled_days": 0, "reps": 0, "lapses": 0, "learning_steps": 0, "state": 0, "last_review": null},
    "reviews": [],
    "earnedXp": 0,
    "lastXpDay": ""
  }],
  "reviewReminder": {"day": "", "count": 0, "lastAt": 0},
  "xp": 0,
  "completedCount": 0,
  "settings": {
    "notifications": true,
    "alwaysOnTop": true,
    "compact": false,
    "theme": "system",
    "opacity": 1,
    "openAtLogin": false,
    "englishShortcut": "Control+Shift+E",
    "englishReminders": true
  },
  "windowPosition": {"x": 100, "y": 100}
}
```

读取时由 `state-store.js` 校验字段、补齐旧版缺失的设置、限制透明度范围。总经验按已完成任务和英语卡片各自累计的 `earnedXp` 重算，任务完成数只统计已完成任务。英语卡片的 `lastXpDay` 用于限制同一卡片每天只获得一次复习经验；评分历史最多保存最近 100 条，不用于重算总经验。主进程独占文件读写；渲染进程只能通过 `preload.js` 暴露的 IPC 操作数据。

## 写入与备份

每次修改先写 `tasks.json.tmp`，再替换主文件。替换前会将上一份有效主文件复制为 `tasks.json.bak`。如果主文件解析失败，启动时会尝试从 `.bak` 恢复，并把坏文件改名为 `tasks.json.corrupt-时间戳` 供排查。

`.bak` 只保留上一份有效状态，不是长期历史。导入前应用会额外保存一份 `tasks.json.before-import-时间戳.json`；这些快照不会自动清理。需要长期保留时，用设置中的「导出」保存到其他位置。

## 导入、导出与手动恢复

导出文件包含完整状态。导入时会校验文件并要求确认，**替换任务、英语卡片、经验和复习提示计数**，保留本设备的窗口位置与偏好。导入前的当前状态会留下独立快照。

要手动恢复 `.bak` 或导入前快照：先从托盘彻底退出程序，再备份当前 `tasks.json`，将目标文件复制为 `tasks.json`，最后重启。不要在程序运行时直接编辑数据文件，否则下一次应用写入可能覆盖手工修改。

修改持久化结构时，先更新 `state-store.js` 的默认值和规范化逻辑，再增加读取旧数据与损坏文件的测试。字段含义或迁移步骤有变化时同步更新本文档。
