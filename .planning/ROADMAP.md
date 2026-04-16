# Roadmap: MyBad

**Created:** 2026-04-16
**Strategy:** Coarse granularity, 3 phases
**Core Value:** Agent 被纠正后，同类错误不再犯第二次

## Phase Overview

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 1 | Core Engine | SQLite 存储 + 数据模型 + 全部引擎逻辑 + 完整测试 | SETUP-01~03, DATA-01~06, STOR-01~05, ENG-01~06, TEST-01~07 | 全部测试通过，MCP Server 能通过 core 包执行所有操作 |
| 2 | MCP Server + CLI | 对外暴露接口，Agent 和人类可以使用 | MCP-01~12, CLI-01~08 | MCP Server 可被 Agent 调用，CLI 可手动操作 |
| 3 | Polish & Publish | 文档、集成测试、npm 发布 | — | npm install @mybad/mcp-server 能用 |

## Phase 1: Core Engine

**Goal:** 完成 @mybad/core 包的全部实现，包括存储层、引擎层、测试。

**Requirements:** SETUP-01, SETUP-02, SETUP-03, DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, STOR-01, STOR-02, STOR-03, STOR-04, STOR-05, ENG-01, ENG-02, ENG-03, ENG-04, ENG-05, ENG-06, TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06, TEST-07

**Success Criteria:**
1. `pnpm build` 成功，@mybad/core 输出 ESM + CJS + .d.ts
2. `pnpm test` 全部通过（≥30 个测试用例）
3. SQLiteAdapter 能执行全部 CRUD 操作 + FTS5 搜索 + 递归 CTE 关联查询
4. 状态机覆盖全部合法流转 + 拒绝非法流转
5. Recurrence 计数是原子操作

**Plans:** 4 plans

Plans:
- [ ] 01-core-engine/01-PLAN.md — Monorepo 初始化 + 全部数据模型定义
- [ ] 01-core-engine/02-PLAN.md — 存储层（StorageAdapter 接口 + SQLite + Memory）
- [ ] 01-core-engine/03-PLAN.md — 引擎层（CRUD + Linker + Lifecycle + Stats）
- [ ] 01-core-engine/04-PLAN.md — 集成测试 + 并发测试 + 状态机全覆盖

**Build Order:**
1. Monorepo 初始化 + TypeScript 配置
2. Models（纯类型）
3. StorageAdapter 接口
4. SQLite Schema migration
5. SQLiteAdapter 实现
6. MemoryAdapter 实现
7. Engine 层（CRUD → Linker → Lifecycle → Stats）
8. 全部测试

## Phase 2: MCP Server + CLI

**Goal:** 基于 @mybad/core 构建 MCP Server 和 CLI，让 Agent 和人类都能使用。

**Requirements:** MCP-01, MCP-02, MCP-03, MCP-04, MCP-05, MCP-06, MCP-07, MCP-08, MCP-09, MCP-10, MCP-11, MCP-12, CLI-01, CLI-02, CLI-03, CLI-04, CLI-05, CLI-06, CLI-07, CLI-08

**Success Criteria:**
1. MCP Server 通过 stdio 启动，暴露 12 个工具
2. Agent 能通过 MCP 调用 correction_capture 并获得正确返回
3. CLI `mybad capture/query/stats` 命令可用
4. MCP Server 集成测试通过

**Build Order:**
1. MCP Server 入口 + 工具注册框架
2. 12 个 MCP 工具逐一实现
3. MCP Server 集成测试
4. CLI 入口 + 8 个命令逐一实现
5. CLI 手动测试

## Phase 3: Polish & Publish

**Goal:** 文档、README、npm 发布。

**Success Criteria:**
1. README.md 包含安装、配置、使用示例
2. npm publish @mybad/core, @mybad/mcp-server, @mybad/cli 成功
3. `npx @mybad/mcp-server` 能直接启动

---
*Roadmap created: 2026-04-16*
