---
phase: 01-core-engine
plan: 03
type: execute
wave: 3
depends_on: ["01-core-engine/02"]
files_modified:
  - packages/core/src/engine/crud.ts
  - packages/core/src/engine/linker.ts
  - packages/core/src/engine/lifecycle.ts
  - packages/core/src/engine/stats.ts
  - packages/core/src/engine/index.ts
  - packages/core/src/index.ts
  - packages/core/tests/engine/crud.test.ts
  - packages/core/tests/engine/linker.test.ts
  - packages/core/tests/engine/lifecycle.test.ts
  - packages/core/tests/engine/stats.test.ts
autonomous: true
requirements:
  - ENG-01
  - ENG-02
  - ENG-03
  - ENG-04
  - ENG-05
  - ENG-06
  - TEST-04
  - TEST-05
  - TEST-06

must_haves:
  truths:
    - "Engine.addMistake 写入数据库并返回带 ID 的 Mistake"
    - "同 category 写入时 recurrence_count 自动原子递增"
    - "Linker.addLink 建立关联，getRelated 支持多度递归查询"
    - "Lifecycle.transition 仅允许合法状态流转，拒绝非法流转"
    - "Lifecycle.checkGraduation 正确判断毕业条件"
    - "Stats.getCategoryStats 和 getOverallStats 返回正确聚合数据"
    - "searchMistakes 调用 FTS5 搜索"
    - "CRUD 引擎的 queryMistakes 支持多维度过滤"
  artifacts:
    - path: "packages/core/src/engine/crud.ts"
      provides: "CRUD 引擎 + recurrence 原子计数"
      exports: ["CrudEngine"]
    - path: "packages/core/src/engine/linker.ts"
      provides: "关联引擎（正向/反向/递归查询）"
      exports: ["LinkerEngine"]
    - path: "packages/core/src/engine/lifecycle.ts"
      provides: "状态流转 + 毕业检查 + 压缩归档"
      exports: ["LifecycleEngine"]
    - path: "packages/core/src/engine/stats.ts"
      provides: "统计聚合引擎"
      exports: ["StatsEngine"]
    - path: "packages/core/src/engine/index.ts"
      provides: "Engine 层统一导出"
      exports: ["MyBadEngine"]
  key_links:
    - from: "packages/core/src/engine/crud.ts"
      to: "packages/core/src/storage/adapter.ts"
      via: "注入 StorageAdapter 实例"
      pattern: "constructor.*StorageAdapter"
    - from: "packages/core/src/engine/crud.ts"
      to: "packages/core/src/models/state-machine.ts"
      via: "使用 isValidTransition 校验状态"
      pattern: "isValidTransition"
    - from: "packages/core/src/engine/linker.ts"
      to: "packages/core/src/storage/adapter.ts"
      via: "调用 addLink/getLinks/getRelated"
      pattern: "this\.storage\.(addLink|getLinks|getRelated)"
    - from: "packages/core/src/engine/lifecycle.ts"
      to: "packages/core/src/models/state-machine.ts"
      via: "使用 VALID_TRANSITIONS 校验"
      pattern: "VALID_TRANSITIONS"
---

<objective>
实现完整引擎层：CRUD 引擎（含原子 recurrence 计数）、Link 引擎（含递归 CTE）、Lifecycle 引擎（状态机 + 毕业 + 压缩）、Stats 引擎（聚合统计）。

Purpose: 引擎层是 MyBad 的核心业务逻辑层。MCP Server 和 CLI 都通过引擎层操作数据。引擎层封装所有业务规则，确保数据一致性。
Output: 可用的 MyBadEngine 类，提供全部业务操作方法。
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@PRD.md

<interfaces>
<!-- From packages/core/src/storage/adapter.ts (Plan 02) -->
interface StorageAdapter {
  addMistake(m: Mistake): Promise<string>;
  getMistake(id: string): Promise<Mistake | null>;
  updateMistake(id: string, updates: Partial<Mistake>): Promise<void>;
  queryMistakes(filter: MistakeFilter): Promise<Mistake[]>;
  incrementRecurrence(category: string, agentId?: string): Promise<number>;
  addLink(from: string, to: string, type: LinkType, confidence?: number): Promise<void>;
  getLinks(id: string, direction?: LinkDirection): Promise<MistakeLink[]>;
  getRelated(id: string, depth?: number): Promise<MistakeLink[]>;
  addRule(rule: Rule): Promise<string>;
  getRules(filter?: RuleFilter): Promise<Rule[]>;
  updateRule(id: string, updates: Partial<Rule>): Promise<void>;
  addVerification(v: Verification): Promise<void>;
  getVerificationCount(ruleId: string): Promise<VerificationCount>;
  addReflection(r: Reflection): Promise<string>;
  getReflections(filter?: ReflectionFilter): Promise<Reflection[]>;
  getCategoryStats(agentId?: string): Promise<CategoryStats[]>;
  getOverallStats(agentId?: string, dateRange?: DateRange): Promise<OverallStats>;
  searchMistakes(query: string, limit?: number): Promise<Mistake[]>;
  archiveMistakes(ids: string[]): Promise<number>;
  compactGraduated(category?: string): Promise<number>;
  getConfig(key: string): Promise<unknown>;
  setConfig(key: string, value: unknown): Promise<void>;
}

<!-- From packages/core/src/models/state-machine.ts (Plan 01) -->
type MistakeStatus = "pending" | "corrected" | "recurring" | "verified" | "graduated" | "abandoned" | "false_positive";
const VALID_TRANSITIONS: Record<MistakeStatus, MistakeStatus[]>;
function isValidTransition(from: MistakeStatus, to: MistakeStatus): boolean;
const RULE_VALID_TRANSITIONS: Record<RuleStatus, RuleStatus[]>;
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: CRUD 引擎 + Link 引擎</name>
  <files>
    packages/core/src/engine/crud.ts,
    packages/core/src/engine/linker.ts,
    packages/core/src/engine/index.ts,
    packages/core/src/index.ts,
    packages/core/tests/engine/crud.test.ts,
    packages/core/tests/engine/linker.test.ts
  </files>
  <read_first>
    @packages/core/src/storage/adapter.ts (StorageAdapter 接口)
    @packages/core/src/models/mistake.ts (Mistake 类型)
    @packages/core/src/models/link.ts (MistakeLink, LinkType)
    @PRD.md Section 4 (数据流 capture)
    @PRD.md Section 7 (关联体系)
  </read_first>
  <behavior>
    CRUD 引擎测试:
    - Test 1: addMistake 生成 ID 并写入 storage，返回 Mistake 对象
    - Test 2: addMistake 同 category 时 recurrence_count 自动递增（recurrence_count = 已有数 + 1）
    - Test 3: addMistake 同 category 时自动创建 same_category link
    - Test 4: getMistake 返回已存储的 Mistake
    - Test 5: updateMistake 更新指定字段并更新 updated_at
    - Test 6: queryMistakes 按 category/status/agent_id/date 过滤
    - Test 7: addRule 创建规则并关联 source_ids
    - Test 8: getRules 查询规则
    - Test 9: addVerification 添加验证记录
    - Test 10: searchMistakes 调用 FTS5 搜索

    Link 引擎测试:
    - Test 11: addLink 建立关联，置信度默认 1.0
    - Test 12: getLinks outbound 返回正向关联
    - Test 13: getLinks inbound 返回反向关联
    - Test 14: getLinks both 返回双向关联
    - Test 15: getRelated depth=1 返回一度关联
    - Test 16: getRelated depth=2 返回二度关联（递归）
    - Test 17: addLink 重复关联不报错（幂等）
  </behavior>
  <action>
    RED phase: 创建 packages/core/tests/engine/crud.test.ts 和 linker.test.ts，写上述 17 个测试。
    使用 MemoryAdapter（速度快，不依赖 SQLite）。

    GREEN phase: 实现以下文件:

    1. packages/core/src/engine/crud.ts — CrudEngine:
       constructor(storage: StorageAdapter)

       方法:
       - addMistake(input: Omit<Mistake, 'id' | 'created_at' | 'updated_at' | 'recurrence_count'>): Promise<Mistake>
         - 生成 ID: `m_${Date.now()}_${randomSuffix}` 或用 nanoid 风格
         - 设置 created_at/updated_at = new Date().toISOString()
         - 调用 storage.incrementRecurrence(category, agent_id) 获取当前 recurrence 值
         - 设置 recurrence_count = 返回值
         - 调用 storage.addMistake(mistake) 写入
         - 如果 recurrence > 1，自动调用 storage.addLink 创建 same_category link 到最近的同 category mistake
         - 返回完整 Mistake 对象

       - getMistake(id: string): Promise<Mistake | null>
         - 直接委托 storage.getMistake(id)

       - updateMistake(id: string, updates: Partial<Mistake>): Promise<void>
         - 设置 updates.updated_at = new Date().toISOString()
         - 委托 storage.updateMistake(id, updates)

       - queryMistakes(filter: MistakeFilter): Promise<Mistake[]>
         - 委托 storage.queryMistakes(filter)

       - addRule(input: Omit<Rule, 'id' | 'created_at' | 'updated_at' | 'verified_count' | 'fail_count' | 'source_count'>): Promise<Rule>
         - 生成 ID，设置默认值，写入 storage

       - getRules(filter?: RuleFilter): Promise<Rule[]>
         - 委托 storage.getRules(filter)

       - updateRule(id: string, updates: Partial<Rule>): Promise<void>
         - 更新 updated_at，委托 storage

       - addVerification(input: Omit<Verification, 'id'>): Promise<void>
         - 委托 storage.addVerification
         - 同步更新 Rule 的 verified_count 或 fail_count

       - searchMistakes(query: string, limit?: number): Promise<Mistake[]>
         - 委托 storage.searchMistakes(query, limit)

    2. packages/core/src/engine/linker.ts — LinkerEngine:
       constructor(storage: StorageAdapter)

       方法:
       - addLink(fromId: string, toId: string, type: LinkType, confidence?: number): Promise<void>
         - 验证 fromId 和 toId 对应的 Mistake 存在
         - 默认 confidence = 1.0
         - 委托 storage.addLink，try-catch 处理重复关联

       - getLinks(id: string, direction?: LinkDirection): Promise<MistakeLink[]>
         - 委托 storage.getLinks(id, direction)

       - getRelated(id: string, depth?: number): Promise<MistakeLink[]>
         - 默认 depth = 2
         - 委托 storage.getRelated(id, depth)

    3. packages/core/src/engine/index.ts:
       - MyBadEngine 类: 组合 CrudEngine + LinkerEngine + LifecycleEngine + StatsEngine
       - constructor(storage: StorageAdapter) 创建所有子引擎
       - 代理所有子引擎方法
       - 或者: 导出各子引擎 + 一个 createEngine 工厂函数
       - 设计选择: 导出独立类，由消费者按需组合

       实际方案: 导出 CrudEngine, LinkerEngine, LifecycleEngine, StatsEngine 独立类，
       以及一个 MyBadEngine facade 类组合全部。

    4. 更新 packages/core/src/index.ts: 追加 engine 层导出
  </action>
  <acceptance_criteria>
    - packages/core/src/engine/crud.ts 存在且包含 "class CrudEngine"
    - packages/core/src/engine/linker.ts 存在且包含 "class LinkerEngine"
    - `grep -c "incrementRecurrence" packages/core/src/engine/crud.ts` >= 1
    - `grep -c "addLink" packages/core/src/engine/crud.ts` >= 1 (自动关联)
    - `grep -c "getRelated" packages/core/src/engine/linker.ts` >= 1
    - `cd /Users/wu/Documents/mybad && pnpm build` 成功
    - `cd /Users/wu/Documents/mybad && pnpm test` 通过（17+ 新测试）
  </acceptance_criteria>
  <verify>
    <automated>cd /Users/wu/Documents/mybad && pnpm build && pnpm test -- --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <done>CRUD 引擎 + Link 引擎实现完成，recurrence 原子计数 + 自动关联 + 递归查询全部工作</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Lifecycle 引擎 + Stats 引擎</name>
  <files>
    packages/core/src/engine/lifecycle.ts,
    packages/core/src/engine/stats.ts,
    packages/core/tests/engine/lifecycle.test.ts,
    packages/core/tests/engine/stats.test.ts
  </files>
  <read_first>
    @packages/core/src/models/state-machine.ts (状态机定义)
    @packages/core/src/storage/adapter.ts (StorageAdapter 接口)
    @PRD.md Section 5.2 (状态机 + 毕业条件)
    @PRD.md Section 6 (入库出库策略)
    @.planning/research/PITFALLS.md (状态机 edge case)
  </read_first>
  <behavior>
    Lifecycle 引擎测试:
    - Test 1: transition pending→corrected 成功
    - Test 2: transition pending→abandoned 成功
    - Test 3: transition corrected→verified 成功
    - Test 4: transition corrected→recurring 成功
    - Test 5: transition recurring→verified 成功
    - Test 6: transition verified→graduated 成功
    - Test 7: transition pending→graduated 抛出 InvalidTransitionError
    - Test 8: transition corrected→pending 抛出 InvalidTransitionError
    - Test 9: transition graduated→corrected 抛出 InvalidTransitionError（终态）
    - Test 10: transition false_positive→pending 抛出 InvalidTransitionError（终态）
    - Test 11: checkGraduation 对 recurrence>=2 且有规则的 mistake 返回 true
    - Test 12: checkGraduation 对 recurrence=1 的 mistake 返回 false
    - Test 13: compact 对 graduated mistakes 执行压缩
    - Test 14: transition 自动更新 updated_at

    Stats 引擎测试:
    - Test 15: getCategoryStats 返回按 category 聚合的统计
    - Test 16: getOverallStats 返回全局统计（总数、by_status、by_category）
    - Test 17: getCategoryStats 按 agent_id 过滤
    - Test 18: getOverallStats 按日期范围过滤
    - Test 19: getReflectionData 返回结构化反思输入数据
  </behavior>
  <action>
    RED phase: 创建 packages/core/tests/engine/lifecycle.test.ts 和 stats.test.ts，写上述 19 个测试。

    GREEN phase: 实现以下文件:

    1. packages/core/src/engine/lifecycle.ts — LifecycleEngine:
       constructor(storage: StorageAdapter)

       方法:
       - transition(mistakeId: string, toStatus: MistakeStatus): Promise<Mistake>
         - 从 storage 获取当前 mistake
         - 用 isValidTransition(current.status, toStatus) 校验
         - 不合法: throw new InvalidTransitionError(current.status, toStatus)
         - 合法: storage.updateMistake(id, { status: toStatus, updated_at: ... })
         - 如果 toStatus === 'graduated': 设置 graduated_to_rule（如果有关联规则）
         - 如果 toStatus === 'abandoned': 设置 archived_at
         - 返回更新后的 Mistake

       - checkGraduation(mistakeId: string): Promise<{ eligible: boolean; rule?: Rule }>
         - 获取 mistake
         - 条件: recurrence_count >= 2 AND 有同 category 的 rule 存在
         - 返回 { eligible, rule? }

       - compact(category?: string): Promise<number>
         - 查询所有 status=graduated 的 mistakes（按 category 可选）
         - 调用 storage.compactGraduated(category)
         - 返回压缩数量

       自定义错误类:
       - InvalidTransitionError extends Error
         constructor(public from: MistakeStatus, public to: MistakeStatus)

    2. packages/core/src/engine/stats.ts — StatsEngine:
       constructor(storage: StorageAdapter)

       方法:
       - getCategoryStats(agentId?: string): Promise<CategoryStats[]>
         - 委托 storage.getCategoryStats(agentId)

       - getOverallStats(agentId?: string, dateRange?: DateRange): Promise<OverallStats>
         - 委托 storage.getOverallStats(agentId, dateRange)

       - getReflectionData(options: { dateFrom?: string; dateTo?: string; includeCategories?: string[]; minRecurrence?: number }): Promise<ReflectionInput>
         - 查询 pending/recurring mistakes
         - 查询高频 category
         - 查询关联分析
         - 组装返回结构化数据供 Agent LLM 分析
         - ReflectionInput 类型: { pending_mistakes, recurring_mistakes, hot_categories, linked_groups, date_range }

    3. 更新 packages/core/src/engine/index.ts:
       - 追加 LifecycleEngine, StatsEngine 导出
       - 完善 MyBadEngine facade 类

    确保 engine/index.ts 中的 MyBadEngine 正确代理所有子引擎方法。
  </action>
  <acceptance_criteria>
    - packages/core/src/engine/lifecycle.ts 包含 "class LifecycleEngine"
    - packages/core/src/engine/stats.ts 包含 "class StatsEngine"
    - `grep -c "InvalidTransitionError" packages/core/src/engine/lifecycle.ts` >= 1
    - `grep -c "isValidTransition" packages/core/src/engine/lifecycle.ts` >= 1
    - `grep -c "checkGraduation" packages/core/src/engine/lifecycle.ts` >= 1
    - `grep -c "getCategoryStats" packages/core/src/engine/stats.ts` >= 1
    - `grep -c "getReflectionData" packages/core/src/engine/stats.ts` >= 1
    - `cd /Users/wu/Documents/mybad && pnpm build` 成功
    - `cd /Users/wu/Documents/mybad && pnpm test` 通过（19+ 新测试）
  </acceptance_criteria>
  <verify>
    <automated>cd /Users/wu/Documents/mybad && pnpm build && pnpm test -- --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <done>Lifecycle 引擎（状态机 + 毕业 + 压缩）+ Stats 引擎（聚合统计 + 反思数据）实现完成，19+ 测试通过</done>
</task>

</tasks>

<verification>
1. `pnpm build` 成功
2. `pnpm test` 全部通过（36+ 引擎测试）
3. 全部 4 个引擎文件存在且实现完整
4. 状态机全部合法/非法流转测试通过
5. Recurrence 原子计数工作正常
6. 递归 CTE 关联查询工作正常
7. 统计聚合返回正确数据
</verification>

<success_criteria>
- CRUD 引擎: addMistake + recurrence 原子计数 + 自动关联 + queryMistakes
- Link 引擎: addLink + getLinks (正向/反向) + getRelated (递归 CTE)
- Lifecycle 引擎: transition (状态机校验) + checkGraduation + compact
- Stats 引擎: getCategoryStats + getOverallStats + getReflectionData
- MyBadEngine facade 组合所有子引擎
- 36+ 测试全部通过
</success_criteria>

<output>
After completion, create `.planning/phases/01-core-engine/03-SUMMARY.md`
</output>
