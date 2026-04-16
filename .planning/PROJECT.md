# MyBad

## What This Is

MyBad 是一个 AI Agent 错题集系统——让任何 AI Agent 能够自动记录人类纠正信号、追踪错误复发、提炼规则并持续进化。类比人类学习的"错题本"，让 AI 拥有自我纠错和持续进化的能力。

通过 MCP 协议对 OpenClaw、Hermes、Claude Code 等所有 Agent 提供服务。纯 TypeScript 实现，SQLite 默认存储，零 LLM 依赖，离线运行。

## Core Value

Agent 被纠正后，同类错误不再犯第二次。错题 → 规则 → 进化，形成完整学习闭环。

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] StorageAdapter 接口 + SQLite 实现（Schema 初始化、CRUD、原子 recurrence 计数）
- [ ] 错题关联系统（四种 link_type：same_category / causal / same_root / semantic，正向+反向+递归查询）
- [ ] 六态生命周期管理（pending → corrected → recurring → verified → graduated → archived + false_positive / abandoned）
- [ ] 规则系统（错题提炼规则、规则验证 pass/fail、规则替代 supersede）
- [ ] 统计聚合（by category / by status / by agent、毕业率、复发率）
- [ ] MCP Server（11 个工具：capture / query / update / link / rule_add / rule_verify / rule_query / reflect / stats / search / config）
- [ ] CLI 工具（capture / query / link / rule / reflect / stats / search / config 命令）
- [ ] FTS5 全文搜索
- [ ] 压缩归档机制（graduated 错题压缩、过期 pending 清理）
- [ ] 存储适配器抽象（SQLite 默认 + Memory 测试 + PG 后期扩展）

### Out of Scope

- 内置 LLM 调用 — Agent 自身就是 LLM，MyBad 是纯数据引擎，不包 LLM
- REST API / HTTP Server — Phase 2 内容
- PostgreSQL 实现 — Phase 2 内容
- 语义向量搜索（ChromaDB/embedding）— Phase 3 内容
- 多 Agent 共享 / 多租户 — Phase 3 内容
- 图可视化 UI — 不在本项目范围

## Context

- 产品灵感来自人类学习的"错题本"机制：错题 → 错题集 → 复习 → 总结套路
- 调研了 Obsidian、Stello、Neo4j、NetworkX、ChromaDB 等方案后，确定 SQLite + FTS5 为最优存储方案
- Stello 的存储接口分离、双适配器模式、递归 CTE 图遍历等设计值得借鉴
- 目标用户：OpenClaw Agent（Jarvis）、Hermes Agent、Claude Code、自定义 Agent
- PRD 完整文档：`/Users/wu/Documents/mybad/PRD.md`

## Constraints

- **Tech Stack**: TypeScript 严格模式 + pnpm monorepo + Vitest + tsup
- **Storage**: SQLite（better-sqlite3），同步 API
- **Interface**: MCP 为主力接口（@modelcontextprotocol/sdk）
- **Zero LLM**: 不引入任何 LLM 依赖，智能在 Agent 侧
- **Offline**: 全部本地运行，不需要网络或服务端
- **Package**: npm 发布，包名 @mybad/core, @mybad/mcp-server, @mybad/cli

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 零 LLM 依赖 | Agent 自身就是 LLM，不需要再包一层 | — Pending |
| MCP 为主力接口 | 最通用的 Agent 工具协议，一个 Server 覆盖所有 Agent | — Pending |
| SQLite 默认存储 | 离线、零部署、单文件、百万级性能、ACID 事务 | — Pending |
| StorageAdapter 抽象 | 可切换 PG 等后端，借鉴 Stello 的双适配器模式 | — Pending |
| Agent 侧分类/反思 | 智能在 Agent，数据在 MyBad，职责清晰 | — Pending |
| 六态生命周期 | 有毕业机制，错题 → 规则 → 压缩，不无限增长 | — Pending |
| 四种关联类型 | 覆盖同类/因果/根因/语义四个维度 | — Pending |
| 规则表独立 | 错题是原材料，规则是成品，有独立的验证和替代机制 | — Pending |
| 验证机制 pass/fail | 不只记错，还确认学会了，pass × 3 毕业 | — Pending |
| FTS5 全文搜索 | < 10000 条规模，不需要向量数据库 | — Pending |
| 项目名 mybad | 全球通用口头禅，自带 meme 属性，容易传播 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-16 after initialization*
