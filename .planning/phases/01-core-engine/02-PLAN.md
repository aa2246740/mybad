---
phase: 01-core-engine
plan: 02
type: execute
wave: 2
depends_on: ["01-core-engine/01"]
files_modified:
  - packages/core/src/storage/adapter.ts
  - packages/core/src/storage/migrations.ts
  - packages/core/src/storage/sqlite.ts
  - packages/core/src/storage/memory.ts
  - packages/core/src/storage/index.ts
  - packages/core/src/index.ts
  - packages/core/tests/storage/adapter-interface.test.ts
  - packages/core/tests/storage/sqlite-adapter.test.ts
  - packages/core/tests/storage/memory-adapter.test.ts
autonomous: true
requirements:
  - STOR-01
  - STOR-02
  - STOR-03
  - STOR-04
  - STOR-05
  - TEST-01
  - TEST-02
  - TEST-03

must_haves:
  truths:
    - "StorageAdapter 接口定义了 PRD Section 9.2 中全部方法"
    - "SQLiteAdapter 能执行全部 CRUD 操作 + FTS5 搜索"
    - "SQLiteAdapter 递归 CTE 关联查询返回多度关联结果"
    - "MemoryAdapter 与 SQLiteAdapter 实现相同接口"
    - "SQLite WAL 模式 + busy_timeout 在初始化时配置"
    - "Migration 系统能创建全部 6 张表 + 索引 + FTS5 虚拟表"
  artifacts:
    - path: "packages/core/src/storage/adapter.ts"
      provides: "StorageAdapter 接口定义"
      contains: "interface StorageAdapter"
    - path: "packages/core/src/storage/migrations.ts"
      provides: "Schema migration 执行系统"
      contains: "runMigrations"
    - path: "packages/core/src/storage/sqlite.ts"
      provides: "SQLiteAdapter 实现"
      contains: "class SQLiteAdapter implements StorageAdapter"
    - path: "packages/core/src/storage/memory.ts"
      provides: "MemoryAdapter 实现（测试用）"
      contains: "class MemoryAdapter implements StorageAdapter"
    - path: "packages/core/src/storage/index.ts"
      provides: "Storage 层 re-export"
      exports: ["StorageAdapter", "SQLiteAdapter", "MemoryAdapter"]
  key_links:
    - from: "packages/core/src/storage/sqlite.ts"
      to: "packages/core/src/models/*.ts"
      via: "import types"
      pattern: "import.*from.*models"
    - from: "packages/core/src/storage/sqlite.ts"
      to: "packages/core/src/storage/migrations.ts"
      via: "初始化时调用 runMigrations"
      pattern: "runMigrations"
    - from: "packages/core/src/storage/memory.ts"
      to: "packages/core/src/storage/adapter.ts"
      via: "implements StorageAdapter"
      pattern: "implements StorageAdapter"
---

<objective>
实现完整存储层：StorageAdapter 接口、SQLite Schema migration、SQLiteAdapter（含 WAL/FTS5/递归 CTE）、MemoryAdapter。

Purpose: 存储层是引擎层的基础。所有 CRUD、关联、搜索操作最终都通过 StorageAdapter 执行。
Output: 可用的 SQLite 存储和内存存储，接口一致。
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/research/STACK.md
@.planning/research/ARCHITECTURE.md
@.planning/research/PITFALLS.md
@PRD.md

<!-- Types from Plan 01 that this plan consumes -->
<interfaces>
<!-- From packages/core/src/models/mistake.ts -->
export type MistakeStatus = "pending" | "corrected" | "recurring" | "verified" | "graduated" | "abandoned" | "false_positive";
export type TriggerType = "L1" | "L2" | "L3" | "L4" | "L5" | "manual";
export interface Mistake {
  id: string; category: string; status: MistakeStatus; trigger_type: TriggerType;
  recurrence_count: number; context_before: string; context_after?: string;
  ai_misunderstanding?: string; user_intent?: string; user_correction?: string;
  agent_id?: string; session_id?: string; tags: string[]; confidence: number;
  graduated_to_rule?: string; created_at: string; updated_at: string; archived_at?: string;
}
export interface MistakeFilter {
  category?: string; status?: MistakeStatus; agent_id?: string;
  date_from?: string; date_to?: string; recurrence_min?: number;
  limit?: number; offset?: number;
}

<!-- From packages/core/src/models/rule.ts -->
export type RuleStatus = "active" | "verified" | "superseded" | "archived";
export type RulePriority = "normal" | "high" | "critical";
export interface Rule {
  id: string; category: string; rule_text: string; priority: RulePriority;
  source_count: number; source_ids: string[]; verified_count: number; fail_count: number;
  status: RuleStatus; superseded_by?: string; created_at: string; updated_at: string;
}
export interface RuleFilter { category?: string; priority?: RulePriority; status?: RuleStatus; limit?: number; offset?: number; }

<!-- From packages/core/src/models/link.ts -->
export type LinkType = "same_category" | "causal" | "same_root" | "semantic";
export type LinkDirection = "inbound" | "outbound" | "both";
export interface MistakeLink { from_id: string; to_id: string; link_type: LinkType; confidence: number; created_at: string; }

<!-- From packages/core/src/models/verification.ts -->
export type VerificationResult = "pass" | "fail";
export interface Verification { id?: number; rule_id: string; result: VerificationResult; context?: string; agent_id?: string; verified_at: string; }
export interface VerificationCount { pass: number; fail: number; }

<!-- From packages/core/src/models/reflection.ts -->
export interface Reflection { id: string; date: string; summary: string; new_rule_ids: string[]; hot_categories: string[]; stats: Record<string, unknown>; agent_id?: string; created_at: string; }
export interface ReflectionFilter { date_from?: string; date_to?: string; agent_id?: string; limit?: number; offset?: number; }
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: StorageAdapter 接口 + Schema Migration + SQLiteAdapter 实现</name>
  <files>
    packages/core/src/storage/adapter.ts,
    packages/core/src/storage/migrations.ts,
    packages/core/src/storage/sqlite.ts,
    packages/core/src/storage/index.ts,
    packages/core/src/index.ts,
    packages/core/tests/storage/sqlite-adapter.test.ts
  </files>
  <read_first>
    @PRD.md Section 5.1 (完整 Schema — 所有 CREATE TABLE 语句)
    @PRD.md Section 9.2 (StorageAdapter 接口方法签名)
    @.planning/research/PITFALLS.md (WAL 模式、FTS5 中文、JSON 字段)
    @packages/core/src/models/ (Plan 01 产出的类型定义)
  </read_first>
  <behavior>
    - Test 1: SQLiteAdapter 构造函数创建/打开数据库并初始化 WAL 模式
    - Test 2: runMigrations 创建全部 6 张表 + 索引 + FTS5 虚拟表
    - Test 3: addMistake + getMistake 往返正确
    - Test 4: queryMistakes 按 category/status/agent_id/date 过滤
    - Test 5: updateMistake 更新指定字段
    - Test 6: incrementRecurrence 原子递增并返回新值
    - Test 7: addLink + getLinks 正向/反向查询
    - Test 8: getRelated 递归 CTE 查询多度关联（depth=2）
    - Test 9: addRule + getRules + updateRule CRUD
    - Test 10: addVerification + getVerificationCount 计数
    - Test 11: addReflection + getReflections CRUD
    - Test 12: searchMistakes FTS5 搜索返回匹配结果
    - Test 13: archiveMistakes + compactGraduated 执行成功
    - Test 14: getConfig + setConfig 配置读写
    - Test 15: getCategoryStats 返回按 category 聚合统计
    - Test 16: getOverallStats 返回全局统计
    - Test 17: WAL 模式已启用（PRAGMA journal_mode 返回 'wal'）
    - Test 18: busy_timeout 已设置（PRAGMA busy_timeout 返回 5000）
  </behavior>
  <action>
    RED phase: 先创建 packages/core/tests/storage/sqlite-adapter.test.ts，写上述 18 个测试。
    使用 :memory: 数据库（better-sqlite3 的内存模式），每个测试前重建数据库。

    GREEN phase: 实现以下文件使测试通过:

    1. packages/core/src/storage/adapter.ts — StorageAdapter 接口:
       按 PRD Section 9.2 定义全部方法。方法签名与 PRD 一致，使用 Promise 返回类型。
       包含:
       - Mistake CRUD: addMistake, getMistake, updateMistake, queryMistakes
       - Recurrence: incrementRecurrence(category, agentId?) → number
       - Links: addLink, getLinks(id, direction?), getRelated(id, depth?)
       - Rules: addRule, getRules(filter?), updateRule
       - Verification: addVerification, getVerificationCount
       - Reflection: addReflection, getReflections(filter?)
       - Stats: getCategoryStats(agentId?), getOverallStats(agentId?, dateRange?)
       - Search: searchMistakes(query, limit?)
       - Lifecycle: archiveMistakes(ids), compactGraduated(category?)
       - Config: getConfig(key), setConfig(key, value)
       - 额外定义辅助类型: CategoryStats, OverallStats, DateRange

    2. packages/core/src/storage/migrations.ts — Migration 系统:
       - migrations 表: CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY, name TEXT, applied_at TEXT)
       - runMigrations(db: Database): void 函数
       - 001_init migration: 执行 PRD Section 5.1 全部 CREATE TABLE + CREATE INDEX + CREATE VIRTUAL TABLE
       - 使用事务包裹每个 migration
       - migration 执行后 INSERT INTO migrations 记录

       001_init 包含（严格按 PRD Section 5.1）:
       - mistakes 表 (18 列)
       - mistake_links 表 (5 列, PRIMARY KEY from_id+to_id+link_type)
       - rules 表 (12 列)
       - verifications 表 (6 列, id AUTOINCREMENT)
       - reflections 表 (8 列, date UNIQUE)
       - mistakes_fts 虚拟表 (FTS5: id, category, ai_misunderstanding, user_intent, user_correction, tags)
       - 8 个索引 (idx_mistakes_category, idx_mistakes_status, idx_mistakes_agent, idx_mistakes_created, idx_rules_category, idx_rules_status, idx_verifications_rule, idx_reflections_date)

    3. packages/core/src/storage/sqlite.ts — SQLiteAdapter:
       - constructor(dbPath: string): 打开 better-sqlite3 数据库
       - 构造时执行: PRAGMA journal_mode=WAL, PRAGMA busy_timeout=5000, PRAGMA foreign_keys=ON
       - 构造时调用 runMigrations(db)
       - 实现全部 StorageAdapter 方法
       - JSON 字段处理: tags/source_ids/new_rule_ids/hot_categories/stats/context_before/context_after
         写入时 JSON.stringify，读取时 JSON.parse + try-catch
       - incrementRecurrence: 使用事务包裹
         BEGIN; SELECT COUNT(*) FROM mistakes WHERE category=?; INSERT mistakes SET recurrence_count=count+1; COMMIT;
         或者更简单: 在 INSERT 时用子查询获取当前最大 recurrence_count + 1
       - getRelated: 使用递归 CTE (PRD Section 7 的 SQL)
         WITH RECURSIVE related AS (
           SELECT to_id AS id, link_type, 1 AS depth FROM mistake_links WHERE from_id = ?
           UNION ALL
           SELECT ml.to_id, ml.link_type, r.depth + 1 FROM mistake_links ml JOIN related r ON ml.from_id = r.id WHERE r.depth < ?
         ) SELECT * FROM related;
       - searchMistakes: SELECT * FROM mistakes_fts WHERE mistakes_fts MATCH ? 然后用 id JOIN mistakes 表获取完整数据
       - queryMistakes: 根据 filter 动态构建 WHERE 子句，支持 category/status/agent_id/date_from/date_to/recurrence_min
       - 关闭方法: close(): void { this.db.close(); }

    4. packages/core/src/storage/index.ts:
       export { StorageAdapter } from './adapter'
       export { SQLiteAdapter } from './sqlite'
       export { MemoryAdapter } from './memory' // 预留，Task 2 实现
       export { runMigrations } from './migrations'

    5. 更新 packages/core/src/index.ts: 追加 export * from './storage'

    注意事项:
    - better-sqlite3 是同步 API，方法签名虽然用 Promise 但内部不需要 async（返回 Promise.resolve() 或用 async 包装以匹配接口）
    - FTS5 的 tags 字段: 写入时把 string[] join 成空格分隔的字符串
    - mistake_links 的 ON DELETE CASCADE 依赖 PRAGMA foreign_keys=ON
    - 所有方法对 null/undefined 输入做 defensive 处理
  </action>
  <acceptance_criteria>
    - packages/core/src/storage/adapter.ts 包含 "interface StorageAdapter" 且方法数 >= 18
    - packages/core/src/storage/sqlite.ts 包含 "class SQLiteAdapter implements StorageAdapter"
    - packages/core/src/storage/migrations.ts 包含 "CREATE TABLE mistakes"
    - `grep -c "PRAGMA journal_mode=WAL" packages/core/src/storage/sqlite.ts` 返回 1
    - `grep -c "WITH RECURSIVE" packages/core/src/storage/sqlite.ts` 返回 1
    - `grep -c "fts5" packages/core/src/storage/migrations.ts` 返回 1
    - `cd /Users/wu/Documents/mybad && pnpm build` 成功
    - `cd /Users/wu/Documents/mybad && pnpm test` 全部通过（18+ 新测试）
  </acceptance_criteria>
  <verify>
    <automated>cd /Users/wu/Documents/mybad && pnpm build && pnpm test -- --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <done>StorageAdapter 接口 + SQLite Schema migration + SQLiteAdapter 全部方法实现完成，18+ 测试全部通过</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: MemoryAdapter 实现（测试用内存存储）</name>
  <files>
    packages/core/src/storage/memory.ts,
    packages/core/tests/storage/memory-adapter.test.ts
  </files>
  <read_first>
    @packages/core/src/storage/adapter.ts (接口定义)
    @packages/core/src/storage/sqlite.ts (参考实现结构)
  </read_first>
  <behavior>
    - Test 1: addMistake + getMistake 往返正确
    - Test 2: queryMistakes 按 category/status/agent_id 过滤
    - Test 3: updateMistake 更新指定字段
    - Test 4: incrementRecurrence 递增返回新值
    - Test 5: addLink + getLinks 正向/反向查询
    - Test 6: getRelated 多度关联查询（内存 BFS 实现）
    - Test 7: addRule + getRules + updateRule CRUD
    - Test 8: addVerification + getVerificationCount
    - Test 9: addReflection + getReflections
    - Test 10: searchMistakes 简单文本匹配（内存模式不需要 FTS5）
    - Test 11: archiveMistakes + compactGraduated
    - Test 12: getConfig + setConfig
    - Test 13: getCategoryStats 返回按 category 聚合
    - Test 14: getOverallStats 返回全局统计
  </behavior>
  <action>
    RED phase: 先创建 packages/core/tests/storage/memory-adapter.test.ts，写上述 14 个测试。

    GREEN phase: 实现 packages/core/src/storage/memory.ts:

    class MemoryAdapter implements StorageAdapter:
    - 内部使用 Map<string, Mistake>, Map<string, Rule>, Map<string, Reflection>
    - links 用数组 MistakeLink[] 存储
    - verifications 用数组 Verification[] 存储
    - config 用 Map<string, unknown> 存储

    实现要点:
    - 全部方法返回 Promise.resolve() 包装，匹配接口签名
    - queryMistakes: Array.filter() 实现过滤逻辑，与 SQLiteAdapter 行为一致
    - getRelated: BFS 广度优先搜索实现递归关联查询，支持 depth 参数
    - searchMistakes: 简单的 string.includes() 或 Array.filter() 匹配 category/user_intent/user_correction/tags 字段
    - incrementRecurrence: 遍历 Map 统计同 category 数量，设置新 mistake 的 recurrence_count
    - getCategoryStats: Array.reduce() 聚合
    - getOverallStats: 遍历全部 mistakes 计算统计
    - updateMistake: Object.assign() 更新，更新 updated_at

    MemoryAdapter 不需要 migration 系统、不需要 WAL、不需要 FTS5。
    目的: 为引擎层测试提供快速的内存存储。
  </action>
  <acceptance_criteria>
    - packages/core/src/storage/memory.ts 包含 "class MemoryAdapter implements StorageAdapter"
    - MemoryAdapter 实现全部 StorageAdapter 方法
    - `cd /Users/wu/Documents/mybad && pnpm build` 成功
    - `cd /Users/wu/Documents/mybad && pnpm test` 全部通过（14+ 新测试）
  </acceptance_criteria>
  <verify>
    <automated>cd /Users/wu/Documents/mybad && pnpm build && pnpm test -- --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <done>MemoryAdapter 实现完成，与 SQLiteAdapter 行为一致，14+ 测试通过</done>
</task>

</tasks>

<verification>
1. `pnpm build` 成功
2. `pnpm test` 全部通过（32+ 测试）
3. StorageAdapter 接口定义完整（18+ 方法）
4. SQLiteAdapter 实现全部方法，包括 WAL、FTS5、递归 CTE
5. MemoryAdapter 实现全部方法，行为与 SQLiteAdapter 一致
6. Schema 包含全部 6 张表 + 8 个索引 + FTS5 虚拟表
</verification>

<success_criteria>
- StorageAdapter 接口 + SQLiteAdapter + MemoryAdapter 完整实现
- 全部 CRUD 操作测试通过
- FTS5 搜索测试通过
- 递归 CTE 关联查询测试通过
- WAL 模式 + busy_timeout 配置正确
- 32+ 测试全部通过
</success_criteria>

<output>
After completion, create `.planning/phases/01-core-engine/02-SUMMARY.md`
</output>
