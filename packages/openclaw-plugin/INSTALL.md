# myBad OpenClaw 插件安装指南

## 安装步骤

### 1. 克隆并构建 mybad

```bash
git clone https://github.com/aa2246740/mybad.git
cd mybad
npx pnpm install && pnpm build
```

### 2. 安装插件（本地链接模式）

```bash
cd packages/openclaw-plugin
openclaw plugins install -l .
```

如果 `-l` 不行，试直接路径：

```bash
openclaw plugins install /path/to/mybad/packages/openclaw-plugin
```

### 3. 配置插件

在 `openclaw.json`（或 `~/.openclaw/openclaw.json`）中添加：

```json
{
  "plugins": {
    "enabled": true,
    "entries": {
      "mybad": {
        "enabled": true,
        "config": {
          "dbPath": "/Users/你/.mybad/mybad.db"
        }
      }
    }
  }
}
```

### 4. 重启 Gateway

```bash
openclaw gateway restart
```

### 5. 验证

```bash
openclaw plugins list        # 应该看到 mybad
openclaw plugins info mybad   # 应该看到 9 个工具
```

## 可用工具

| 工具名 | 用途 |
|--------|------|
| `correction_capture` | 捕捉一条纠正 |
| `correction_query` | 查询错题 |
| `correction_stats` | 统计数据 |
| `correction_search` | 全文搜索 |
| `correction_coach` | Coach 分析 |
| `correction_coach_applied` | 获取已应用规则 |
| `correction_coach_pending` | 获取待确认推荐 |
| `correction_coach_confirm` | 确认/拒绝推荐 |
| `correction_rule_query` | 查询规则列表 |

## 卸载

```bash
openclaw plugins uninstall mybad
openclaw gateway restart
```

## 故障排除

- **工具不出现**：检查 `openclaw plugins info mybad` 是否列出工具。如果列出但 Agent 调用不了，是 OpenClaw 的 `registerTool` 已知 bug（issues #47683, #50328），需要升级 OpenClaw 版本。
- **better-sqlite3 加载失败**：确保 Node.js 版本 ≥ 18，重新 `pnpm install`。
- **数据库路径错误**：检查 config 中的 dbPath 是否是绝对路径。
