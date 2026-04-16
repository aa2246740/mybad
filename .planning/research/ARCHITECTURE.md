# Architecture Research — MyBad

**Researched:** 2026-04-16
**Reference:** Stello project analysis (storage adapter pattern, recursive CTE)

## Component Boundaries

```
┌─────────────────────────────────────────────────────┐
│  @mybad/mcp-server                                   │
│  MCP Server 入口，工具定义和路由                       │
│  依赖: @mybad/core                                   │
├─────────────────────────────────────────────────────┤
│  @mybad/cli                                          │
│  CLI 命令入口                                        │
│  依赖: @mybad/core                                   │
├─────────────────────────────────────────────────────┤
│  @mybad/core                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │   Models    │  │   Engine    │  │  Storage    │ │
│  │ mistake.ts  │  │ crud.ts     │  │ adapter.ts  │ │
│  │ rule.ts     │  │ linker.ts   │  │ sqlite.ts   │ │
│  │ link.ts     │  │ lifecycle.ts│  │ memory.ts   │ │
│  │ verif.ts    │  │ stats.ts    │  │ migrations  │ │
│  │ reflect.ts  │  │             │  │             │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────┘
```

## Data Flow

```
Agent 调用 MCP tool
  → MCP Server 解析参数
    → Engine 处理业务逻辑
      → StorageAdapter 执行 SQL
        → SQLite 存储
      ← StorageAdapter 返回结果
    ← Engine 返回业务对象
  ← MCP Server 格式化返回

关键数据流：
1. capture: Agent → MCP → Engine.crud.addMistake() → SQLite INSERT + recurrence++
2. query: Agent → MCP → Engine.crud.queryMistakes() → SQLite SELECT
3. link: Agent → MCP → Engine.linker.addLink() → SQLite INSERT INTO mistake_links
4. lifecycle: Agent → MCP → Engine.lifecycle.transition() → SQLite UPDATE status
5. rule: Agent → MCP → Engine.crud.addRule() → SQLite INSERT INTO rules
6. verify: Agent → MCP → Engine.lifecycle.verify() → SQLite INSERT INTO verifications
7. reflect: Agent → MCP → Engine.stats.getStats() → SQLite 聚合查询 → 返回数据给 Agent LLM 分析
```

## Suggested Build Order

参考 Stello 的分层模式：

1. **Models** — 纯类型定义，无依赖
2. **StorageAdapter 接口** — 定义契约
3. **Migrations** — Schema 建表
4. **SQLiteAdapter** — 实现接口
5. **MemoryAdapter** — 测试用
6. **Engine 层** — CRUD → Linker → Lifecycle → Stats（按依赖顺序）
7. **MCP Server** — 包装 Engine 为 MCP 工具
8. **CLI** — 包装 Engine 为命令行

## Key Patterns from Stello

### Storage Adapter Separation
Stello 用 `SessionTree` 接口 + `SessionTreeImpl`(FileSystem) + `PgSessionTree`(PostgreSQL) 模式。
MyBad 借鉴：`StorageAdapter` 接口 + `SQLiteAdapter` + `MemoryAdapter`。

### Recursive CTE for Graph Traversal
Stello 的 PgSessionTree 用 `WITH RECURSIVE` 做祖先/后代查询。
MyBad 的 mistake_links 表同样可以用递归 CTE 做多度关联查询。

### Topology Node vs Entity Separation
Stello 把 Session 和 TopologyNode 分开。MyBad 不需要这个分离——mistake 本身既是数据又是节点。

### Interface-First Design
所有模块间只通过 interface 通信，不跨包 import 内部文件。MyBad 采用同样原则。
