# MyBad

> **"Because every AI says 'my bad' — but never learns from it."**

让 AI Agent 拥有错题本，自动记录纠正、追踪复发、提炼规则、持续进化。

## 快速开始

### MCP Server（推荐）

在你的 Agent 配置文件中添加：

```json
{
  "mcpServers": {
    "mybad": {
      "command": "npx",
      "args": ["@mybad/mcp-server"]
    }
  }
}
```

或指定数据库路径：

```json
{
  "mcpServers": {
    "mybad": {
      "command": "npx",
      "args": ["@mybad/mcp-server"],
      "env": {
        "MYBAD_DB_PATH": "/path/to/mybad.db"
      }
    }
  }
}
```

### CLI

```bash
npx @mybad/cli capture -c intent_weather -t L1 --user-correction "不是余额，是天气"
npx @mybad/cli query -c intent_weather
npx @mybad/cli stats
npx @mybad/cli search -q "weather"
```

## MCP 工具列表

| 工具 | 用途 |
|------|------|
| `correction_capture` | 捕捉一条错题 |
| `correction_query` | 查询错题（多维度过滤） |
| `correction_update` | 更新错题状态 |
| `correction_link` | 关联两条错题 |
| `correction_rule_add` | 添加规则 |
| `correction_rule_verify` | 验证规则（pass/fail） |
| `correction_rule_query` | 查询规则 |
| `correction_reflect` | 获取结构化反思数据 |
| `correction_stats` | 统计数据 |
| `correction_search` | 全文搜索 |
| `correction_config` | 配置管理 |

## 核心概念

### 错题生命周期

```
捕捉 → pending → corrected → verified → graduated → 压缩
                    ↓             ↑
                 recurring ──────┘
```

- **pending**: 已纠正但未确认
- **corrected**: 一次改对
- **recurring**: 同类错误再犯（自动 recurrence++）
- **verified**: 确认学会
- **graduated**: 已提炼为规则
- **abandoned**: 放弃追踪
- **false_positive**: 误报

### 规则系统

错题反复出现后可提炼为规则，规则经过验证后可毕业：

```
错题 × N → 规则 → 验证 pass × 3 → verified → 可能被更优规则 supersede
```

### 关联类型

- **same_category**: 同类错误（自动建立）
- **causal**: 因果链（Agent 判定）
- **same_root**: 同根因（反思时分析）
- **semantic**: 语义相似（Agent 判断）

## 架构

```
@mybad/core       — 存储层 + 引擎层（SQLite + FTS5 + 递归 CTE）
@mybad/mcp-server — MCP Server（stdio 传输）
@mybad/cli        — CLI 命令行工具
```

## 开发

```bash
pnpm install
pnpm build
pnpm test
```

## 设计原则

1. **纯数据引擎** — 零 LLM 依赖，Agent 自身就是 LLM
2. **Agent 无关** — 通过 MCP 协议，任何 Agent 都能接入
3. **离线优先** — SQLite 单文件，无需网络
4. **不无限增长** — 错题 → 规则 → 毕业 → 压缩

## License

Apache-2.0
