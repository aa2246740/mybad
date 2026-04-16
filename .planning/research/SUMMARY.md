# Research Summary — MyBad

**Synthesized:** 2026-04-16

## Stack Decision

- **TypeScript + pnpm monorepo + tsup + Vitest** — 标准组合
- **better-sqlite3** — 同步 API，WAL 模式，FTS5 内置，需注意 native bindings
- **@modelcontextprotocol/sdk** — 官方 MCP SDK
- **commander** — CLI 框架
- 不使用 ORM，直接 SQL 更可控

## Key Architecture Decisions

1. **三层包结构**: @mybad/core → @mybad/mcp-server / @mybad/cli
2. **StorageAdapter 接口**: SQLite + Memory 双实现，借鉴 Stello 模式
3. **零 LLM**: 所有智能在 Agent 侧，MyBad 纯数据引擎
4. **递归 CTE**: 图关联查询用 SQLite 原生递归 CTE

## Table Stakes Features

- 错题 CRUD（含上下文捕捉）
- Recurrence 原子计数
- 六态生命周期（含毕业机制）
- 四种关联（same_category/causal/same_root/semantic）
- 规则系统（提炼 + 验证 + 替代）
- FTS5 全文搜索
- 统计聚合
- 11 个 MCP 工具
- CLI 命令
- 压缩归档

## Critical Pitfalls to Watch

1. better-sqlite3 native bindings 安装问题 — 提前解决
2. WAL 模式 + busy_timeout 防并发问题
3. FTS5 中文分词用 unicode61 基本够用
4. 状态机 edge case 用单元测试覆盖
5. JSON 字段存储要 defensive
6. Migration 手写 + 版本记录

## Build Order

Models → StorageAdapter 接口 → Migrations → SQLiteAdapter → MemoryAdapter → Engine(CRUD → Linker → Lifecycle → Stats) → MCP Server → CLI
