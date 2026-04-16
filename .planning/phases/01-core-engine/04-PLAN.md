---
phase: 01-core-engine
plan: 04
type: execute
wave: 4
depends_on: ["01-core-engine/03"]
files_modified:
  - packages/core/tests/integration/full-flow.test.ts
  - packages/core/tests/integration/concurrent-recurrence.test.ts
autonomous: true
requirements:
  - TEST-05
  - TEST-06
  - TEST-07

must_haves:
  truths:
    - "完整的 capture → query → update → link → rule_add → rule_verify → reflect 流程通过"
    - "并发写入同一 category 时 recurrence_count 不会少加"
    - "状态机全部 7x7=49 种组合被测试覆盖"
    - "全流程使用 SQLiteAdapter（真实数据库）而非 MemoryAdapter"
  artifacts:
    - path: "packages/core/tests/integration/full-flow.test.ts"
      provides: "端到端集成测试"
      contains: "describe.*integration"
    - path: "packages/core/tests/integration/concurrent-recurrence.test.ts"
      provides: "并发 recurrence 计数测试"
      contains: "concurrent"
  key_links:
    - from: "packages/core/tests/integration/full-flow.test.ts"
      to: "packages/core/src/engine/index.ts"
      via: "导入 MyBadEngine"
      pattern: "import.*MyBadEngine"
    - from: "packages/core/tests/integration/concurrent-recurrence.test.ts"
      to: "packages/core/src/storage/sqlite.ts"
      via: "使用 SQLiteAdapter（真实并发）"
      pattern: "SQLiteAdapter"
---

<objective>
编写跨层集成测试和并发测试，验证 MyBadEngine 的端到端工作流和数据一致性。

Purpose: 前三个计划分别测试了各层，本计划验证层间协作正确性。集成测试使用真实 SQLite 数据库，并发测试验证 recurrence_count 原子性。
Output: 全部测试通过，Phase 1 完整验证。
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
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: 端到端集成测试 + 状态机全覆盖测试</name>
  <files>
    packages/core/tests/integration/full-flow.test.ts
  </files>
  <read_first>
    @packages/core/src/engine/index.ts (MyBadEngine API)
    @packages/core/src/models/state-machine.ts (状态流转定义)
    @PRD.md Section 4 (数据流)
    @PRD.md Section 5.2 (状态机 + 毕业条件)
    @PRD.md Section 8.2 (工具参数)
  </read_first>
  <behavior>
    全流程测试 (使用 SQLiteAdapter + :memory: 数据库):
    - Test 1: capture → 返回带 id 的 Mistake，status=pending，recurrence_count=1
    - Test 2: capture 同 category → recurrence_count=2，自动创建 same_category link
    - Test 3: query by category → 返回 2 条记录
    - Test 4: update status corrected → status 变为 corrected
    - Test 5: link 两条 mistake (causal) → getLinks 返回关联
    - Test 6: getRelated depth=2 → 返回多度关联
    - Test 7: addRule + source_ids → 规则创建成功
    - Test 8: rule verify pass × 3 → verified_count=3
    - Test 9: checkGraduation → eligible=true
    - Test 10: transition to graduated → status=graduated
    - Test 11: compact → graduated 记录被压缩
    - Test 12: search → FTS5 搜索返回匹配结果
    - Test 13: getCategoryStats → 返回正确统计
    - Test 14: getOverallStats → 返回全局概览
    - Test 15: getReflectionData → 返回结构化反思数据

    状态机全覆盖测试:
    - Test 16-22: 每个状态的所有合法出口都测试
    - Test 23-49: 所有不合法的流转都抛出 InvalidTransitionError
      (可以用嵌套 describe + test.each 覆盖 7x7 矩阵)

    规则生命周期测试:
    - Test 50: active → verified → superseded 流转
    - Test 51: active → archived 直接归档
    - Test 52: verified → superseded 替代
  </behavior>
  <action>
    创建 packages/core/tests/integration/ 目录。

    创建 packages/core/tests/integration/full-flow.test.ts:

    使用 SQLiteAdapter + :memory: 数据库。每个 describe 块前 beforeEach 重新创建数据库和引擎实例。

    结构:
    ```
    describe('MyBad Integration', () => {
      describe('Full Flow', () => {
        // Tests 1-15: 完整 capture → graduated 流程
      })

      describe('State Machine Complete Coverage', () => {
        // 用 test.each 覆盖全部合法/非法流转
        // 从 VALID_TRANSITIONS 派生合法矩阵，其余都是非法
        const validCases = [
          ['pending', 'corrected'], ['pending', 'abandoned'], ...
        ]
        const invalidCases = [
          ['pending', 'pending'], ['pending', 'recurring'],
          ['pending', 'verified'], ['pending', 'graduated'], ...
        ]
        test.each(validCases)('transition %s → %s succeeds', ...)
        test.each(invalidCases)('transition %s → %s throws', ...)
      })

      describe('Rule Lifecycle', () => {
        // Tests 50-52: 规则生命周期
      })
    })
    ```

    每个测试步骤断言返回值和副作用（如 database 中的实际数据）。
    ```

    确保:
    - 使用 SQLiteAdapter（不是 MemoryAdapter），测试真实 SQL 行为
    - :memory: 数据库避免文件系统污染
    - 每个测试独立，不依赖其他测试的状态
  </action>
  <acceptance_criteria>
    - packages/core/tests/integration/full-flow.test.ts 文件存在
    - 包含至少 3 个 describe 块 (Full Flow, State Machine, Rule Lifecycle)
    - 状态机测试覆盖 7x7=49 种组合
    - `cd /Users/wu/Documents/mybad && pnpm test` 全部通过
  </acceptance_criteria>
  <verify>
    <automated>cd /Users/wu/Documents/mybad && pnpm build && pnpm test -- --reporter=verbose 2>&1 | tail -40</automated>
  </verify>
  <done>端到端集成测试 + 状态机全覆盖测试 + 规则生命周期测试完成，全部通过</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 并发 recurrence 计数测试</name>
  <files>
    packages/core/tests/integration/concurrent-recurrence.test.ts
  </files>
  <read_first>
    @packages/core/src/engine/crud.ts (recurrence 逻辑)
    @packages/core/src/storage/sqlite.ts (incrementRecurrence 实现)
    @.planning/research/PITFALLS.md (竞态条件)
  </read_first>
  <behavior>
    - Test 1: 串行写入 10 条同 category mistake，recurrence_count 从 1 递增到 10
    - Test 2: 并发写入 10 条同 category mistake（用 worker_threads 或快速串行模拟），所有 recurrence_count 值唯一且在 1-10 范围内
    - Test 3: 快速连续 addMistake + updateMistake 不丢失数据
    - Test 4: 两个不同 category 的并发写入互不影响
  </behavior>
  <action>
    创建 packages/core/tests/integration/concurrent-recurrence.test.ts:

    使用 SQLiteAdapter（真实文件数据库，不是 :memory:，因为并发测试需要 WAL 模式）。
    测试文件放在临时目录，afterAll 清理。

    重要: Node.js 是单线程的，真正的并发需要:
    - 方案 A: 使用 worker_threads 创建多个 worker 并发写入
    - 方案 B: 快速串行执行（同步 API 本身是原子的，串行快速执行验证计数递增正确性）
    - 选择方案 B（better-sqlite3 是同步 API，不存在真正的竞态条件，串行验证即可）

    ```
    describe('Concurrent Recurrence', () => {
      // Test 1: 串行写入验证计数
      // Test 2: 快速连续写入验证计数正确递增
      // Test 3: addMistake + updateMistake 交替操作不丢失数据
      // Test 4: 不同 category 互不影响
    })
    ```

    验证策略:
    - 每个 mistake 的 recurrence_count 唯一
    - recurrence_count 单调递增
    - 最终值 = 写入次数
    - 不同 category 的计数独立
  </action>
  <acceptance_criteria>
    - packages/core/tests/integration/concurrent-recurrence.test.ts 文件存在
    - 4 个并发相关测试通过
    - `cd /Users/wu/Documents/mybad && pnpm test` 全部通过
  </acceptance_criteria>
  <verify>
    <automated>cd /Users/wu/Documents/mybad && pnpm build && pnpm test -- --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <done>并发 recurrence 计数测试通过，验证原子性正确</done>
</task>

</tasks>

<verification>
1. `pnpm build` 成功
2. `pnpm test` 全部通过（总计 >= 60 测试）
3. 端到端集成流程测试通过（capture → graduated 全流程）
4. 状态机 7x7 全覆盖测试通过
5. 并发 recurrence 计数测试通过
6. SQLite WAL 模式在集成测试中验证
</verification>

<success_criteria>
- Phase 1 全部 27 个 requirement 对应测试通过
- 总测试数 >= 60（model 8 + sqlite 18 + memory 14 + crud 10 + linker 7 + lifecycle 14 + stats 5 + integration 52 + concurrent 4）
- `pnpm build` 输出 ESM + CJS + .d.ts
- 全流程使用 SQLiteAdapter 验证真实 SQL 行为
</success_criteria>

<output>
After completion, create `.planning/phases/01-core-engine/04-SUMMARY.md`
</output>
