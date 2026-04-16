# MyBad — AI Agent 错题集系统 PRD

> **"Because every AI says 'my bad' — but never learns from it."**

---

## 1. 产品定位

**产品名称**：MyBad
**一句话**：让 AI Agent 拥有错题本，自动记录纠正、追踪复发、提炼规则、持续进化。
**协议**：Apache-2.0
**形态**：TypeScript monorepo，通过 MCP Server 对所有 Agent 提供服务

### 核心类比

人类学习：错题 → 错题本 → 复习 → 总结套路 → 下次不出错
AI 学习：纠正 → MyBad 记录 → 每日反思 → 提炼规则 → Agent 进化

### 核心原则

1. **纯数据引擎** — 零 LLM 依赖，所有智能在 Agent 侧
2. **Agent 无关** — 通过 MCP 协议，任何 Agent 都能接入
3. **离线优先** — SQLite 单文件，无需网络、无需服务端
4. **不无限增长** — 错题 → 规则 → 毕业 → 压缩，有完整生命周期

---

## 2. 目标用户

| 用户 | 场景 | 怎么用 |
|------|------|--------|
| OpenClaw Agent | Jarvis 被用户纠正 | MCP 接入，自动捕捉 |
| Hermes Agent | 任务执行出错 | MCP 接入，主动记录 |
| Claude Code | 编程建议被否决 | MCP skill 接入 |
| 自定义 Agent | 任意对话/任务场景 | SDK 或 REST API |
| 人类开发者 | 手动管理错题 | CLI 工具 |

---

## 3. 触发机制（什么时候记录）

### 5 级触发信号

| 级别 | 方式 | 信号强度 | 示例 | 阶段 |
|------|------|---------|------|------|
| L1 显式否定 | 关键词 | 最强 | "不对"、"错了"、"不是这个" | Phase 1 |
| L2 显式修正 | 关键词+语义 | 强 | "改成X"、"应该是Y" | Phase 1 |
| L3 行为撤销 | 操作检测 | 中 | 用户撤销了 AI 操作 | Phase 2 |
| L4 重新提问 | 意图比对 | 弱 | 用户换说法重新问 | Phase 2 |
| L5 隐式不满 | 行为模式 | 最弱 | 反复追问、"算了" | Phase 3 |
| 手动记录 | 用户主动 | 最高 | "记下来，以后别犯" | Phase 1 |

**重要**：触发检测由 Agent 侧完成。MyBad 只提供 `correction_capture` 工具，Agent 决定什么时候调用。

---

## 4. 谁来记录

```
Agent 检测到纠正信号
  │
  ├─→ Agent 自己判断 category（Agent 是 LLM，自己能分析）
  │
  └─→ 调用 MCP tool: correction_capture({
        context_before: [...],    // 上N条消息
        context_after: [...],     // 下M条消息（可后续补充）
        category: "intent_weather",
        trigger_type: "L1",
        ai_misunderstanding: "intent_query_balance",
        user_intent: "intent_weather",
        user_correction: "不对，我说的是天气",
        agent_id: "jarvis",
        session_id: "sess_xxx"
      })
  │
  └─→ MyBad 返回: {
        mistake_id: "m_20260416_001",
        category: "intent_weather",
        recurrence_count: 3,      // 原子计数
        linked_mistakes: ["m_0410_001", "m_0414_002"],
        status: "recurring"       // 自动判断
      }
```

**MyBad 的角色**：纯数据引擎。存、查、计数、关联、状态流转。
**Agent 的角色**：智能层。检测、分类、反思、分析。

---

## 5. 数据模型

### 5.1 完整 SQLite Schema

```sql
-- 错题表
CREATE TABLE mistakes (
  id                TEXT PRIMARY KEY,             -- 'm_20260416_001'
  category          TEXT NOT NULL,                -- Agent 判定的分类
  status            TEXT NOT NULL DEFAULT 'pending',
  trigger_type      TEXT NOT NULL,                -- L1/L2/L3/L4/L5/manual
  recurrence_count  INTEGER NOT NULL DEFAULT 1,

  -- 上下文
  context_before    TEXT NOT NULL,                 -- JSON: 上N条消息
  context_after     TEXT,                          -- JSON: 下M条消息

  -- 理解对比
  ai_misunderstanding TEXT,                        -- AI 理解成了什么
  user_intent         TEXT,                        -- 用户本意
  user_correction     TEXT,                        -- 用户纠正原话

  -- 元数据
  agent_id          TEXT,                          -- 哪个 Agent
  session_id        TEXT,                          -- 哪个会话
  tags              TEXT NOT NULL DEFAULT '[]',    -- JSON array
  confidence        REAL DEFAULT 1.0,             -- 置信度

  -- 规则关联（毕业后关联到提炼出的规则）
  graduated_to_rule TEXT REFERENCES rules(id),

  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  archived_at       TEXT
);

-- 错题关联（四种类型）
CREATE TABLE mistake_links (
  from_id    TEXT NOT NULL REFERENCES mistakes(id) ON DELETE CASCADE,
  to_id      TEXT NOT NULL REFERENCES mistakes(id) ON DELETE CASCADE,
  link_type  TEXT NOT NULL,  -- 'same_category'|'causal'|'same_root'|'semantic'
  confidence REAL DEFAULT 1.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (from_id, to_id, link_type)
);

-- 规则表（错题压缩产物）
CREATE TABLE rules (
  id              TEXT PRIMARY KEY,
  category        TEXT NOT NULL,
  rule_text       TEXT NOT NULL,                   -- 人类可读规则
  priority        TEXT NOT NULL DEFAULT 'normal',  -- normal/high/critical
  source_count    INTEGER NOT NULL DEFAULT 1,      -- 从多少条错题提炼
  source_ids      TEXT NOT NULL DEFAULT '[]',      -- JSON: 来源错题 IDs
  verified_count  INTEGER NOT NULL DEFAULT 0,      -- 正向验证次数
  fail_count      INTEGER NOT NULL DEFAULT 0,      -- 验证失败次数
  status          TEXT NOT NULL DEFAULT 'active',  -- active/superseded/archived
  superseded_by   TEXT REFERENCES rules(id),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- 验证记录
CREATE TABLE verifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id     TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  result      TEXT NOT NULL,  -- 'pass' | 'fail'
  context     TEXT,           -- 在什么场景下验证
  agent_id    TEXT,
  verified_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 反思记录
CREATE TABLE reflections (
  id              TEXT PRIMARY KEY,
  date            TEXT NOT NULL UNIQUE,  -- '2026-04-16'
  summary         TEXT NOT NULL,          -- 反思内容
  new_rule_ids    TEXT DEFAULT '[]',      -- JSON: 新提炼的规则
  hot_categories  TEXT DEFAULT '[]',      -- JSON: 高频错误
  stats           TEXT NOT NULL,          -- JSON: 当日统计
  agent_id        TEXT,
  created_at      TEXT NOT NULL
);

-- 全文搜索
CREATE VIRTUAL TABLE mistakes_fts USING fts5(
  id, category, ai_misunderstanding, user_intent, user_correction, tags
);

-- 索引
CREATE INDEX idx_mistakes_category ON mistakes(category);
CREATE INDEX idx_mistakes_status ON mistakes(status);
CREATE INDEX idx_mistakes_agent ON mistakes(agent_id);
CREATE INDEX idx_mistakes_created ON mistakes(created_at);
CREATE INDEX idx_rules_category ON rules(category);
CREATE INDEX idx_rules_status ON rules(status);
CREATE INDEX idx_verifications_rule ON verifications(rule_id);
CREATE INDEX idx_reflections_date ON reflections(date);
```

### 5.2 状态机

```
                    ┌──────────────────────────────────┐
                    │        错题生命周期               │
                    │                                  │
  捕捉 ──→ pending ─┤                                  │
                    ├─→ corrected (一次改对)            │
                    │       │                          │
                    │       ├──→ verified (N次不犯)     │
                    │       │       │                  │
                    │       │       └──→ graduated     │
                    │       │               │          │
                    │       │               └──→ 压缩  │
                    │       │                          │
                    │       └──→ recurring (再犯) ──┐  │
                    │               ↑              │  │
                    │               └──────────────┘  │
                    │                                  │
                    ├─→ abandoned (用户放弃/误报)       │
                    │                                  │
                    └─→ false_positive (不是真纠正)     │
                                                       │
                    ┌──────────────────────────────────┤
                    │        规则生命周期               │
                    │                                  │
  提炼 ──→ active ──┤                                  │
                    ├─→ verified (验证通过)             │
                    │       │                          │
                    │       └──→ superseded (被替代)    │
                    │                                  │
                    └─→ archived (过时)                 │
                                                       │
                    ┌──────────────────────────────────┤
                    │        毕业条件                   │
                    │                                  │
                    │  错题 → 规则：recurrence ≥ 2     │
                    │         且有明确 pattern          │
                    │                                  │
                    │  规则 → verified：验证 pass ≥ 3   │
                    │                                  │
                    │  verified → superseded：         │
                    │         被更优规则替代             │
                    │                                  │
                    │  graduated 错题 → 压缩：         │
                    │         关联规则已 verified       │
                    └──────────────────────────────────┘
```

| 状态 | 含义 | 入口 | 出口 |
|------|------|------|------|
| `pending` | 已纠正但未确认改对 | 捕捉 | corrected / abandoned |
| `corrected` | 一次改对 | 用户确认 | recurring / verified |
| `recurring` | 同 category 再犯 | recurrence++ | corrected / verified |
| `verified` | 确认学会 | N次不犯后 Agent 标记 | graduated |
| `graduated` | 已提炼为规则，原始记录可压缩 | 关联规则 verified | 归档 |
| `abandoned` | 用户放弃纠正 | 用户主动 | 不再追踪 |
| `false_positive` | 误触发 | Agent 标记 | 排除统计 |

---

## 6. 入库出库策略

### 6.1 入库（In）

| 场景 | 操作 |
|------|------|
| 新 category | INSERT + recurrence = 1 |
| 已有 category | INSERT + 原子 `recurrence_count++` + 自动 link |
| 手动记录 | INSERT, trigger_type = 'manual' |
| 误触发后入库 | INSERT pending, 后续 Agent 标记 false_positive |

### 6.2 出库（Out）

| 场景 | 条件 | 操作 |
|------|------|------|
| **毕业** | 关联规则 verified × 3 | 标记 graduated + 压缩原始记录 |
| **过期** | pending 超 90 天 | 标记 abandoned |
| **误报** | Agent 判定 false_positive | 排除统计，保留记录 |
| **规则替代** | 新规则覆盖旧规则 | 旧规则 superseded |
| **定期压缩** | graduated 记录 > 100 条 | 保留统计摘要，删除原始上下文 |

### 6.3 增长模型

```
假设：每天 2 条新错题，毕业率 60%

时间     累计入库    毕业/压缩    净存量
1个月     60          36          24
3个月     180        108          72
1年       730        438         292
3年      2190       1314         876

稳态：入库 ≈ 毕业 + 过期 + 压缩
净存量在 ~1000 条左右趋于平衡
SQLite 百万级无压力，1000 条完全不是问题
```

---

## 7. 关联体系

### 四种关联类型

| 类型 | 含义 | 建立方式 | 示例 |
|------|------|---------|------|
| `same_category` | 同类错误 | 自动（同 category 写入时） | intent_weather ↔ intent_weather |
| `causal` | 因果链 | Agent 判定 | A错导致B错 |
| `same_root` | 同根因 | Agent 每日反思时分析 | 不同category但根因相同 |
| `semantic` | 语义相似 | Agent 判断或后期语义分析 | 感觉像但category不同 |

### 关联查询

```sql
-- 正向：这条错题关联了谁
SELECT to_id, link_type FROM mistake_links WHERE from_id = 'm_001';

-- 反向：谁关联了这条错题（Obsidian 式反向链接）
SELECT from_id, link_type FROM mistake_links WHERE to_id = 'm_001';

-- 二度关联：递归 CTE
WITH RECURSIVE related AS (
  SELECT to_id AS id, link_type, 1 AS depth
  FROM mistake_links WHERE from_id = 'm_001'
  UNION ALL
  SELECT ml.to_id, ml.link_type, r.depth + 1
  FROM mistake_links ml JOIN related r ON ml.from_id = r.id
  WHERE r.depth < 3
)
SELECT * FROM related;

-- 同 category 的所有错题（最常用）
SELECT * FROM mistakes WHERE category = 'intent_weather'
ORDER BY created_at DESC;

-- 高复发 category
SELECT category, COUNT(*) as total, MAX(recurrence_count) as worst
FROM mistakes WHERE status != 'false_positive'
GROUP BY category HAVING worst > 1
ORDER BY worst DESC;
```

---

## 8. MCP 工具定义

### 8.1 工具列表

| 工具 | 用途 | Agent 调用时机 |
|------|------|---------------|
| `correction_capture` | 捕捉一条错题 | 检测到纠正信号时 |
| `correction_query` | 查询错题 | 想了解历史错误时 |
| `correction_update` | 更新错题状态 | 确认改对/标记误报时 |
| `correction_link` | 关联两条错题 | 发现关联时 |
| `correction_rule_add` | 添加规则 | 反思提炼出规则时 |
| `correction_rule_verify` | 验证规则 | 这次没犯时 |
| `correction_rule_query` | 查询规则 | 想看当前生效规则时 |
| `correction_reflect` | 获取反思数据 | 每日反思时 |
| `correction_stats` | 统计数据 | 想看全局概览时 |
| `correction_search` | 全文搜索 | 模糊查找时 |
| `correction_config` | 配置管理 | 调整参数时 |

### 8.2 核心工具参数

```typescript
// correction_capture — 捕捉错题
{
  context_before: Array<{role: string, content: string}>,  // 上N条消息
  context_after?: Array<{role: string, content: string}>,  // 下M条消息（可选）
  category: string,                  // Agent 判定的分类
  trigger_type: "L1"|"L2"|"L3"|"L4"|"L5"|"manual",
  ai_misunderstanding?: string,      // AI 理解成了什么
  user_intent?: string,              // 用户本意
  user_correction?: string,          // 用户纠正原话
  agent_id?: string,
  session_id?: string,
  tags?: string[],
  confidence?: number                // 0.0 ~ 1.0
}
// 返回: { mistake_id, category, recurrence_count, linked_mistakes, status }

// correction_query — 查询错题
{
  category?: string,
  status?: string,
  agent_id?: string,
  date_from?: string,
  date_to?: string,
  recurrence_min?: number,
  limit?: number,
  offset?: number
}

// correction_update — 更新状态
{
  mistake_id: string,
  status: "corrected"|"recurring"|"verified"|"graduated"|"abandoned"|"false_positive",
  context_after?: Array<{role: string, content: string}>  // 补充后续上下文
}

// correction_link — 关联
{
  from_id: string,
  to_id: string,
  link_type: "same_category"|"causal"|"same_root"|"semantic",
  confidence?: number
}

// correction_rule_add — 添加规则
{
  category: string,
  rule_text: string,
  source_ids: string[],              // 来源错题
  priority?: "normal"|"high"|"critical"
}

// correction_rule_verify — 验证规则
{
  rule_id: string,
  result: "pass"|"fail",
  context?: string,
  agent_id?: string
}

// correction_reflect — 获取反思数据
{
  date_from?: string,
  date_to?: string,
  include_categories?: string[],
  min_recurrence?: number
}
// 返回: 结构化的反思输入数据（Agent 用自己的 LLM 分析）

// correction_stats — 统计
{
  agent_id?: string,
  date_from?: string,
  date_to?: string
}
// 返回: { total, by_status, by_category, graduation_rate, recurrence_rate, ... }

// correction_search — 全文搜索
{
  query: string,
  limit?: number
}

// correction_config — 配置
{
  action: "get"|"set",
  key: string,
  value?: any
}
```

---

## 9. 系统架构

### 9.1 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                      接口层                                  │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │MCP Server│ │REST API  │ │   CLI    │ │   SDK    │       │
│  │ (主力)   │ │(远程部署) │ │(开发调试)│ │(嵌入式)  │       │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘       │
│       └────────────┴────────────┴────────────┘              │
│                         │                                   │
├─────────────────────────┴───────────────────────────────────┤
│                      引擎层                                  │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │  CRUD    │ │  Link    │ │Lifecycle │ │  Stats   │       │
│  │ 增删改查 │ │  关联器  │ │ 生命周期 │ │  统计器  │       │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘       │
│       └────────────┴────────────┴────────────┘              │
│                         │                                   │
├─────────────────────────┴───────────────────────────────────┤
│                      存储层                                  │
│                                                             │
│  ┌──────────────────────────────────────────────────┐       │
│  │              StorageAdapter 接口                  │       │
│  ├──────────────┬───────────────┬───────────────────┤       │
│  │ SQLiteAdapter│ PgAdapter     │ MemoryAdapter     │       │
│  │ (本地/默认)  │ (生产/多租户)  │ (测试)            │       │
│  └──────────────┴───────────────┴───────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 存储适配器接口

```typescript
interface StorageAdapter {
  // Mistake
  addMistake(m: Mistake): Promise<string>;
  getMistake(id: string): Promise<Mistake | null>;
  updateMistake(id: string, updates: Partial<Mistake>): Promise<void>;
  queryMistakes(filter: MistakeFilter): Promise<Mistake[]>;

  // Recurrence（原子操作）
  incrementRecurrence(category: string, agentId?: string): Promise<number>;

  // Links
  addLink(from: string, to: string, type: LinkType, confidence?: number): Promise<void>;
  getLinks(id: string, direction?: 'inbound' | 'outbound' | 'both'): Promise<MistakeLink[]>;
  getRelated(id: string, depth?: number): Promise<MistakeLink[]>;

  // Rules
  addRule(rule: Rule): Promise<string>;
  getRules(filter?: RuleFilter): Promise<Rule[]>;
  updateRule(id: string, updates: Partial<Rule>): Promise<void>;

  // Verification
  addVerification(v: Verification): Promise<void>;
  getVerificationCount(ruleId: string): Promise<{ pass: number; fail: number }>;

  // Reflection
  addReflection(r: Reflection): Promise<string>;
  getReflections(filter?: ReflectionFilter): Promise<Reflection[]>;

  // Stats
  getCategoryStats(agentId?: string): Promise<CategoryStats[]>;
  getOverallStats(agentId?: string, dateRange?: DateRange): Promise<OverallStats>;

  // Search
  searchMistakes(query: string, limit?: number): Promise<Mistake[]>;

  // Lifecycle
  archiveMistakes(ids: string[]): Promise<number>;
  compactGraduated(category?: string): Promise<number>;

  // Config
  getConfig(key: string): Promise<unknown>;
  setConfig(key: string, value: unknown): Promise<void>;
}
```

### 9.3 包结构

```
mybad/
├── packages/
│   ├── core/                          # @mybad/core
│   │   ├── src/
│   │   │   ├── storage/
│   │   │   │   ├── adapter.ts         # StorageAdapter 接口
│   │   │   │   ├── sqlite.ts          # SQLite 实现
│   │   │   │   ├── memory.ts          # 内存实现（测试）
│   │   │   │   └── migrations.ts      # Schema 初始化
│   │   │   ├── engine/
│   │   │   │   ├── crud.ts            # 增删改查
│   │   │   │   ├── linker.ts          # 关联管理
│   │   │   │   ├── lifecycle.ts       # 状态流转 + 毕业 + 压缩
│   │   │   │   └── stats.ts           # 统计聚合
│   │   │   ├── models/
│   │   │   │   ├── mistake.ts
│   │   │   │   ├── rule.ts
│   │   │   │   ├── link.ts
│   │   │   │   ├── verification.ts
│   │   │   │   └── reflection.ts
│   │   │   └── index.ts
│   │   ├── tests/
│   │   └── package.json
│   │
│   ├── mcp-server/                    # @mybad/mcp-server
│   │   ├── src/
│   │   │   ├── server.ts              # MCP Server 入口
│   │   │   ├── tools.ts               # 工具定义和实现
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── cli/                           # @mybad/cli
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   │   ├── capture.ts
│   │   │   │   ├── query.ts
│   │   │   │   ├── link.ts
│   │   │   │   ├── rule.ts
│   │   │   │   ├── reflect.ts
│   │   │   │   ├── stats.ts
│   │   │   │   ├── search.ts
│   │   │   │   └── config.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── server/                        # @mybad/server（后期）
│       ├── src/
│       │   ├── storage/
│       │   │   └── pg-adapter.ts      # PostgreSQL 实现
│       │   ├── http/
│       │   │   ├── app.ts
│       │   │   └── routes.ts
│       │   └── index.ts
│       └── package.json
│
├── docs/
│   └── architecture.md
├── package.json
├── tsconfig.json
├── pnpm-workspace.yaml
└── README.md
```

---

## 10. Agent 集成方式

### 10.1 MCP 配置（通用）

```json
{
  "mcpServers": {
    "mybad": {
      "command": "npx",
      "args": ["-y", "@mybad/mcp-server"],
      "env": {
        "MYBAD_DB_PATH": "~/.mybad/db.sqlite"
      }
    }
  }
}
```

### 10.2 Agent 使用示例

**捕捉错题**：
```
用户说："不对，我说的是查天气不是查余额"
Agent 内部判断：这是 L1 显式否定，category = intent_weather
Agent 调用：correction_capture({...})
MyBad 返回：recurrence_count = 3, linked_mistakes = [m_0410, m_0414]
Agent 决定：提醒用户"这类错误已出现 3 次"
```

**每日反思**：
```
Agent 调用：correction_reflect({ date_from: "2026-04-15" })
MyBad 返回：结构化数据（所有 pending/recurring 错题、高频 category、关联分析）
Agent 用自己的 LLM 分析
Agent 调用：correction_rule_add({ rule_text: "...", source_ids: [...] })
Agent 通知用户：建议更新 System Prompt
```

**正向验证**：
```
用户问天气 → Agent 这次理解对了
Agent 调用：correction_rule_verify({ rule_id: "r_001", result: "pass" })
MyBad 更新：verified_count = 3 → 规则可以标记 verified
```

---

## 11. CLI 命令

```bash
# 安装
npm install -g @mybad/cli

# 捕捉
mybad capture --category intent_weather \
  --ai-misunderstanding "query_balance" \
  --user-intent "weather" \
  --correction "不对，是查天气"

# 查询
mybad query --status recurring
mybad query --category intent_weather --limit 10

# 关联
mybad link m_001 m_002 --type same_category

# 规则
mybad rule add --category intent_weather \
  --text "用户提到城市+天气 → intent_weather" \
  --sources m_001,m_002
mybad rule verify r_001 --result pass
mybad rule list --status active

# 反思数据
mybad reflect --from 2026-04-15 --to 2026-04-16

# 统计
mybad stats
mybad stats --agent jarvis

# 搜索
mybad search "余额混淆"

# 配置
mybad config set db_path ~/.mybad/db.sqlite
mybad config get db_path
```

---

## 12. 开发阶段

### Phase 1 — 核心（当前）
- [ ] @mybad/core — StorageAdapter 接口 + SQLite 实现
- [ ] @mybad/core — 全部数据模型 + Schema 迁移
- [ ] @mybad/core — CRUD、Link、Lifecycle、Stats 引擎
- [ ] @mybad/mcp-server — 全部 11 个 MCP 工具
- [ ] @mybad/cli — 全部 CLI 命令
- [ ] 完整测试覆盖

### Phase 2 — 生产化
- [ ] @mybad/server — REST API + PG 实现
- [ ] 多 Agent / 多租户隔离
- [ ] 导入导出（JSON / Markdown）

### Phase 3 — 生态
- [ ] Agent 适配器（OpenClaw / Hermes / Claude Code skill）
- [ ] GitHub 仓库 + README + 文档站
- [ ] npm 发布

---

## 13. 技术栈

| 组件 | 选型 | 理由 |
|------|------|------|
| 语言 | TypeScript 严格模式 | 类型安全，Agent 生态主流 |
| 构建 | tsup (ESM + CJS) | 双格式输出 |
| 包管理 | pnpm monorepo | Monorepo 标准 |
| 测试 | Vitest | 快，TypeScript 原生 |
| 存储 | better-sqlite3 | 同步 API，性能好，零部署 |
| MCP | @modelcontextprotocol/sdk | 官方 SDK |
| CLI | commander | 成熟稳定 |

---

## 14. 设计决策记录

| # | 决策 | 理由 |
|---|------|------|
| 1 | 零 LLM 依赖 | Agent 自身就是 LLM，不需要再包一层 |
| 2 | MCP 为主力接口 | 最通用的 Agent 工具协议 |
| 3 | SQLite 默认存储 | 离线、零部署、单文件、百万级性能 |
| 4 | StorageAdapter 抽象 | 可切换 PG 等后端 |
| 5 | Agent 侧分类/反思 | 智能在 Agent，数据在 MyBad |
| 6 | 六态生命周期 | 有毕业机制，不无限增长 |
| 7 | 四种关联类型 | 覆盖同类/因果/根因/语义 |
| 8 | 规则表独立 | 错题是原材料，规则是成品 |
| 9 | 验证机制 | 不只是记错，还要确认学会了 |
| 10 | FTS5 全文搜索 | < 10000 条规模，不需要向量数据库 |

---

*MyBad — Because every AI says 'my bad' but never learns from it.*
*Apache-2.0 © 2026*
