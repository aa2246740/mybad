# Requirements: MyBad

**Defined:** 2026-04-16
**Core Value:** Agent 被纠正后，同类错误不再犯第二次

## v1 Requirements

### Project Setup

- [ ] **SETUP-01**: pnpm monorepo 初始化（@mybad/core, @mybad/mcp-server, @mybad/cli 三个包）
- [ ] **SETUP-02**: TypeScript 严格模式配置 + tsup 双格式构建（ESM + CJS）
- [ ] **SETUP-03**: Vitest 测试框架配置 + 测试脚本

### Data Models

- [ ] **DATA-01**: Mistake 类型定义（id, category, status, trigger_type, recurrence_count, context_before, context_after, ai_misunderstanding, user_intent, user_correction, agent_id, session_id, tags, confidence, created_at, updated_at, archived_at, graduated_to_rule）
- [ ] **DATA-02**: MistakeLink 类型定义（from_id, to_id, link_type, confidence, created_at）
- [ ] **DATA-03**: Rule 类型定义（id, category, rule_text, priority, source_count, source_ids, verified_count, fail_count, status, superseded_by, created_at, updated_at）
- [ ] **DATA-04**: Verification 类型定义（id, rule_id, result, context, agent_id, verified_at）
- [ ] **DATA-05**: Reflection 类型定义（id, date, summary, new_rule_ids, hot_categories, stats, agent_id, created_at）
- [ ] **DATA-06**: 状态机合法流转定义（pending→corrected→recurring→verified→graduated + false_positive/abandoned）

### Storage Layer

- [ ] **STOR-01**: StorageAdapter 接口定义（全部 CRUD + 链接 + 规则 + 验证 + 统计 + 搜索方法）
- [ ] **STOR-02**: SQLite Schema migration 系统（001_init.sql 含全部 6 张表 + 索引 + FTS5）
- [ ] **STOR-03**: SQLiteAdapter 实现（全部 StorageAdapter 方法）
- [ ] **STOR-04**: MemoryAdapter 实现（用于测试，内存 Map 存储）
- [ ] **STOR-05**: SQLite WAL 模式 + busy_timeout 初始化配置

### Engine Layer

- [ ] **ENG-01**: CRUD 引擎（addMistake, getMistake, updateMistake, queryMistakes）
- [ ] **ENG-02**: Recurrence 原子计数引擎（同 category 写入时原子 recurrence_count++）
- [ ] **ENG-03**: Link 引擎（addLink, getLinks 正向/反向, getRelated 递归 CTE 多度查询）
- [ ] **ENG-04**: Lifecycle 引擎（transition 状态流转, checkGraduation 毕业检查, compact 压缩归档）
- [ ] **ENG-05**: Stats 引擎（getCategoryStats, getOverallStats, 按 agent/date 聚合）
- [ ] **ENG-06**: FTS5 全文搜索（searchMistakes 查询）

### MCP Server

- [ ] **MCP-01**: MCP Server 入口（stdio 传输，@mybad/core 注入）
- [ ] **MCP-02**: correction_capture 工具（上下文捕捉 + recurrence 自动计数）
- [ ] **MCP-03**: correction_query 工具（多维度查询：category/status/agent/date/recurrence）
- [ ] **MCP-04**: correction_update 工具（状态更新 + 上下文补充）
- [ ] **MCP-05**: correction_link 工具（四种关联类型 + 置信度）
- [ ] **MCP-06**: correction_rule_add 工具（规则创建 + 来源错题关联）
- [ ] **MCP-07**: correction_rule_verify 工具（pass/fail 验证 + 计数更新）
- [ ] **MCP-08**: correction_rule_query 工具（按 category/priority/status 查询规则）
- [ ] **MCP-09**: correction_reflect 工具（返回结构化反思数据供 Agent LLM 分析）
- [ ] **MCP-10**: correction_stats 工具（全局统计 + 分类统计）
- [ ] **MCP-11**: correction_search 工具（FTS5 全文搜索）
- [ ] **MCP-12**: correction_config 工具（get/set 配置）

### CLI

- [ ] **CLI-01**: mybad capture 命令
- [ ] **CLI-02**: mybad query 命令
- [ ] **CLI-03**: mybad link 命令
- [ ] **CLI-04**: mybad rule 命令（add/verify/list 子命令）
- [ ] **CLI-05**: mybad reflect 命令
- [ ] **CLI-06**: mybad stats 命令
- [ ] **CLI-07**: mybad search 命令
- [ ] **CLI-08**: mybad config 命令

### Testing

- [ ] **TEST-01**: Models 类型编译测试
- [ ] **TEST-02**: SQLiteAdapter 全部方法测试（含边界条件）
- [ ] **TEST-03**: MemoryAdapter 全部方法测试
- [ ] **TEST-04**: Engine 层单元测试（CRUD/Linker/Lifecycle/Stats）
- [ ] **TEST-05**: 状态机全部合法/非法流转测试
- [ ] **TEST-06**: Recurrence 原子计数并发测试
- [ ] **TEST-07**: MCP Server 工具集成测试

## v2 Requirements

### Server & Multi-Tenant

- **SRV-01**: REST API (Express/Fastify)
- **SRV-02**: PostgreSQL StorageAdapter 实现
- **SRV-03**: 多 Agent / 多租户隔离（space_id）

### Import/Export

- **IMEX-01**: JSON 导出全部错题 + 规则
- **IMEX-02**: Markdown 导出（人类可读报告）
- **IMEX-03**: JSON 导入（从其他实例迁移）

## Out of Scope

| Feature | Reason |
|---------|--------|
| 内置 LLM 调用 | Agent 自身就是 LLM，MyBad 是纯数据引擎 |
| 向量语义搜索 | < 10000 条规模，FTS5 够用 |
| 图可视化 UI | 不是本项目的范围 |
| 实时通知/WebSocket | Agent 按需查询即可 |
| 用户认证系统 | 本地工具 |
| 云端同步 | 离线优先 |
| 浏览器/WASM 版本 | Node.js 生态优先 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SETUP-01 | Phase 1 | Pending |
| SETUP-02 | Phase 1 | Pending |
| SETUP-03 | Phase 1 | Pending |
| DATA-01 | Phase 1 | Pending |
| DATA-02 | Phase 1 | Pending |
| DATA-03 | Phase 1 | Pending |
| DATA-04 | Phase 1 | Pending |
| DATA-05 | Phase 1 | Pending |
| DATA-06 | Phase 1 | Pending |
| STOR-01 | Phase 1 | Pending |
| STOR-02 | Phase 1 | Pending |
| STOR-03 | Phase 1 | Pending |
| STOR-04 | Phase 1 | Pending |
| STOR-05 | Phase 1 | Pending |
| ENG-01 | Phase 1 | Pending |
| ENG-02 | Phase 1 | Pending |
| ENG-03 | Phase 1 | Pending |
| ENG-04 | Phase 1 | Pending |
| ENG-05 | Phase 1 | Pending |
| ENG-06 | Phase 1 | Pending |
| TEST-01 | Phase 1 | Pending |
| TEST-02 | Phase 1 | Pending |
| TEST-03 | Phase 1 | Pending |
| TEST-04 | Phase 1 | Pending |
| TEST-05 | Phase 1 | Pending |
| TEST-06 | Phase 1 | Pending |
| TEST-07 | Phase 1 | Pending |
| MCP-01 | Phase 2 | Pending |
| MCP-02 | Phase 2 | Pending |
| MCP-03 | Phase 2 | Pending |
| MCP-04 | Phase 2 | Pending |
| MCP-05 | Phase 2 | Pending |
| MCP-06 | Phase 2 | Pending |
| MCP-07 | Phase 2 | Pending |
| MCP-08 | Phase 2 | Pending |
| MCP-09 | Phase 2 | Pending |
| MCP-10 | Phase 2 | Pending |
| MCP-11 | Phase 2 | Pending |
| MCP-12 | Phase 2 | Pending |
| CLI-01 | Phase 2 | Pending |
| CLI-02 | Phase 2 | Pending |
| CLI-03 | Phase 2 | Pending |
| CLI-04 | Phase 2 | Pending |
| CLI-05 | Phase 2 | Pending |
| CLI-06 | Phase 2 | Pending |
| CLI-07 | Phase 2 | Pending |
| CLI-08 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 48 total
- Mapped to phases: 48
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-16*
*Last updated: 2026-04-16 after initial definition*
