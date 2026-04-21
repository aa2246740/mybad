# myBad

> **"Because every AI says 'my bad' — but never learns from it."**

让 AI Agent 拥有错题本，自动记录纠正、追踪复发、提炼规则、持续进化。

## 它解决什么问题？

每个用过 AI Agent 的人都经历过：你纠正了它，它说"记住了"，下次新 session 它又犯同样的错。myBad 就是解决这个问题的 — 它不是给 Agent 加记忆，而是**改造 Agent 运行的环境**，把你的纠正焊进它下次读到的流程文件里。

## 快速开始

### 从源码安装

```bash
git clone https://github.com/your-username/mybad.git
cd mybad
pnpm install
pnpm build

# 验证安装
node packages/cli/dist/index.js --help
```

### 初始化（一键安装）

```bash
# 自动检测当前 Agent 平台
node packages/cli/dist/index.js init

# 指定平台
node packages/cli/dist/index.js init --platform claude-code
node packages/cli/dist/index.js init --platform openclaw
node packages/cli/dist/index.js init --platform hermes
```

init 会自动完成：
- 注册 Hook（SessionStart / PostCompact / PreToolUse）
- 注入 CLAUDE.md 静态兜底指令
- 创建 `.mybad/` 目录和 `.gitignore`
- 输出 MCP Server 配置

### 配置 MCP Server

init 完成后会输出 MCP 配置，复制到你的 Agent 配置文件中。对于 Claude Code，放到项目根目录的 `.mcp.json`：

```json
{
  "mcpServers": {
    "mybad": {
      "command": "node",
      "args": ["/path/to/mybad/packages/mcp-server/dist/server.js"],
      "env": {
        "MYBAD_DB_PATH": ".mybad/mybad.db"
      }
    }
  }
}
```

## 怎么用

### 日常使用（不需要手动操作）

安装好之后，myBad 在后台自动工作：
1. 当你纠正 Agent（"不对"、"应该是 X"、"用 Y 不用 Z"）→ Agent 通过 MCP 工具自动捕捉
2. 同类错误重复出现 → Agent 提醒你"这个错误重复出现了 N 次"
3. 规则自动注入到后续 session → Agent 不再犯同样的错

### 注册项目（支持跨项目提炼）

```bash
node packages/cli/dist/index.js register          # 注册当前项目
node packages/cli/dist/index.js register list     # 查看所有已注册项目
node packages/cli/dist/index.js register remove   # 移除当前项目
```

### Coach 分析

```bash
node packages/cli/dist/index.js coach                # 项目内分析
node packages/cli/dist/index.js coach --universal    # 跨项目提炼
node packages/cli/dist/index.js coach --min-recurrence 3
```

### Dashboard 可视化

```bash
node packages/cli/dist/index.js dashboard            # 生成并打开 Dashboard
node packages/cli/dist/index.js dashboard --no-open  # 只生成不打开
```

### CLI 其他命令

```bash
node packages/cli/dist/index.js capture -c intent_weather -t L1 --user-correction "不是余额，是天气"
node packages/cli/dist/index.js query -c intent_weather
node packages/cli/dist/index.js stats
node packages/cli/dist/index.js search -q "weather"
```

## 架构

```
@mybad/core         — 存储层 + 引擎层 + 适配器（SQLite + FTS5 + 三层作用域）
@mybad/mcp-server   — MCP Server（stdio 传输，15 个工具）
@mybad/cli          — CLI 命令行工具（init / register / coach / dashboard / capture / ...）
```

### 适配器架构

```
                    myBad Core
      Engine (Facade) → 5 Sub-Engines → SQLite Storage
            ↓
      AdapterRegistry（注册三平台适配器）
       ├── CaptureAdapter  — 谁检测纠正信号
       ├── WriteAdapter    — Coach 写到哪里
       └── ReadAdapter     — Agent 怎么读到规则
```

### Claude Code 四层防线

| 层级 | 机制 | 加载方式 |
|------|------|---------|
| 1. 静态兜底 | CLAUDE.md（~150 token 纠正检测指令） | 每次 session 自动加载 |
| 2. 动态注入 | SessionStart Hook → .mybad/session-inject.md | Hook stdout 注入 |
| 3. 压缩恢复 | PostCompact Hook | 上下文压缩后重新注入 |
| 4. 确定性执行 | PreToolUse Hook → enforce.mjs | 正则匹配 → block/warn |

### 三层作用域

| 层级 | 存放 | 谁能用 | 怎么产生 |
|------|------|--------|---------|
| 项目规则 | `{project}/.mybad/mybad.db` | 只在这个项目 | 项目内纠正 |
| Agent 规则 | `~/.mybad/agents/{platform}.db` | 该 Agent 所有项目 | 平台使用经验 |
| 通用规则 | `~/.mybad/universal.db` | 所有项目、所有 Agent | Coach 跨项目提炼 |

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
| `correction_coach` | 运行 Coach 分析 |
| `correction_coach_applied` | 获取已应用规则 |
| `correction_coach_pending` | 获取待确认推荐 |
| `correction_coach_confirm` | 确认一条推荐 |

## 核心概念

### 错题生命周期

```
捕捉 → pending → corrected → verified → graduated → 压缩
                    ↓             ↑
                 recurring ──────┘
```

### 规则生命周期

```
规则生成 → active → 高置信度 → graduated（毕业）
                 → 低置信度 → downgraded（降级/重审）
                 → 长期未触发 → archived（归档）
                 → 被新纠正修正 → evolved（进化）
```

### 确定性执行

可模式化的规则从"建议"升级为"强制"：

```json
{
  "category": "data_dedup",
  "trigger_tool": "Write|Edit",
  "trigger_pattern": "\\.filter\\([\\s\\S]*?\\.indexOf",
  "action": "warn",
  "message": "去重应使用 Set 而非 filter+indexOf"
}
```

不可模式化的规则（意图理解、沟通风格）只走上下文注入（建议层）。

## 支持的 Agent 平台

| 平台 | 适配方式 | 状态 |
|------|---------|------|
| Claude Code | Hook + CLAUDE.md + MCP | ✅ 完整支持 |
| OpenClaw | agent:bootstrap hook | ✅ 完整支持 |
| Hermes | MEMORY.md + Skill 双写 | ✅ 完整支持 |

## 开发

```bash
pnpm install
pnpm build
pnpm test
```

技术栈：TypeScript + SQLite (better-sqlite3) + FTS5 + tsup + vitest

## 设计原则

1. **Harness Engineering** — 不是教 Agent，而是改造 Agent 运行的环境
2. **如果不在上下文里，它就不存在** — 确保规则一定被注入
3. **三层防线** — 静态兜底 + 动态注入 + 确定性执行
4. **数据闭环** — 追踪遵守/违反 → 置信度 → 生命周期管理
5. **自我进化** — 规则被违反时自动重新分析，生成更精确的规则

## 致谢

- [Anthropic Harness Engineering](https://www.anthropic.com/engineering) — Generator-Evaluator 分离架构灵感
- [vizual](https://github.com/aa2246740/vizual) — Dashboard 可视化组件库

## License

Apache-2.0
