---
phase: 01-core-engine
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - pnpm-workspace.yaml
  - tsconfig.json
  - packages/core/package.json
  - packages/core/tsconfig.json
  - packages/core/tsup.config.ts
  - packages/core/src/index.ts
  - packages/core/src/models/mistake.ts
  - packages/core/src/models/rule.ts
  - packages/core/src/models/link.ts
  - packages/core/src/models/verification.ts
  - packages/core/src/models/reflection.ts
  - packages/core/src/models/state-machine.ts
  - packages/core/src/models/index.ts
  - packages/core/tests/setup.ts
  - vitest.config.ts
autonomous: true
requirements:
  - SETUP-01
  - SETUP-02
  - SETUP-03
  - DATA-01
  - DATA-02
  - DATA-03
  - DATA-04
  - DATA-05
  - DATA-06

must_haves:
  truths:
    - "pnpm install 成功无报错"
    - "pnpm build 输出 ESM + CJS + .d.ts 三种格式"
    - "pnpm test 能运行（至少一个 placeholder 测试通过）"
    - "所有 6 个 model 类型可从 @mybad/core 导入"
    - "状态机合法流转矩阵定义完整，TypeScript 类型检查通过"
  artifacts:
    - path: "packages/core/src/models/mistake.ts"
      provides: "Mistake 类型 + MistakeFilter 类型"
      contains: "interface Mistake"
    - path: "packages/core/src/models/rule.ts"
      provides: "Rule 类型 + RuleFilter 类型"
      contains: "interface Rule"
    - path: "packages/core/src/models/link.ts"
      provides: "MistakeLink 类型 + LinkType 联合类型"
      contains: "interface MistakeLink"
    - path: "packages/core/src/models/verification.ts"
      provides: "Verification 类型"
      contains: "interface Verification"
    - path: "packages/core/src/models/reflection.ts"
      provides: "Reflection 类型 + ReflectionFilter"
      contains: "interface Reflection"
    - path: "packages/core/src/models/state-machine.ts"
      provides: "状态流转定义 + 合法转换矩阵"
      contains: "MistakeStatus"
    - path: "packages/core/src/index.ts"
      provides: "包入口，导出所有公共类型"
      exports: ["Mistake", "Rule", "MistakeLink", "Verification", "Reflection"]
  key_links:
    - from: "packages/core/src/index.ts"
      to: "packages/core/src/models/*.ts"
      via: "re-export"
      pattern: "export.*from.*models"
---

<objective>
初始化 pnpm monorepo 项目骨架，配置 TypeScript + tsup + Vitest，定义全部 6 个数据模型和状态机。

Purpose: 为整个 MyBad 项目奠定基础。所有后续计划（存储层、引擎层、测试）都依赖此计划产出的类型定义和项目结构。
Output: 可构建、可测试的 @mybad/core 包骨架，包含完整类型定义。
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

<interfaces>
<!-- Greenfield project — no existing interfaces. All types defined from PRD Section 5.1. -->

PRD-defined Mistake fields (Section 5.1):
  id, category, status, trigger_type, recurrence_count,
  context_before, context_after, ai_misunderstanding, user_intent, user_correction,
  agent_id, session_id, tags, confidence,
  graduated_to_rule, created_at, updated_at, archived_at

PRD-defined MistakeLink fields:
  from_id, to_id, link_type, confidence, created_at

PRD-defined Rule fields:
  id, category, rule_text, priority, source_count, source_ids,
  verified_count, fail_count, status, superseded_by, created_at, updated_at

PRD-defined Verification fields:
  id (autoincrement), rule_id, result, context, agent_id, verified_at

PRD-defined Reflection fields:
  id, date, summary, new_rule_ids, hot_categories, stats, agent_id, created_at

PRD-defined Mistake statuses (Section 5.2):
  pending, corrected, recurring, verified, graduated, abandoned, false_positive

PRD-defined Rule statuses:
  active, verified, superseded, archived
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: 初始化 pnpm monorepo + TypeScript + tsup + Vitest</name>
  <files>
    package.json, pnpm-workspace.yaml, tsconfig.json, vitest.config.ts,
    packages/core/package.json, packages/core/tsconfig.json, packages/core/tsup.config.ts,
    packages/core/src/index.ts, packages/core/tests/setup.ts
  </files>
  <read_first>
    @.planning/research/STACK.md (确认技术栈版本)
    @PRD.md Section 9.3 (包结构)
  </read_first>
  <action>
    1. 在 /Users/wu/Documents/mybad/ 创建根 package.json:
       - name: "mybad", private: true
       - scripts: { "build": "pnpm -r run build", "test": "vitest run", "test:watch": "vitest" }
       - devDependencies: typescript@^5.5, tsup@^8.0, vitest@^2.0

    2. 创建 pnpm-workspace.yaml: packages: ["packages/*"]

    3. 创建根 tsconfig.json:
       - compilerOptions: { strict: true, esModuleInterop: true, skipLibCheck: true, target: "ES2022", module: "ESNext", moduleResolution: "bundler", declaration: true, declarationMap: true, sourceMap: true }
       - references 指向 packages/core

    4. 创建 vitest.config.ts:
       - test.include: ["packages/*/tests/**/*.test.ts"]
       - 如有需要配置 alias

    5. 创建 packages/core/ 目录结构:
       - src/ 和 tests/

    6. 创建 packages/core/package.json:
       - name: "@mybad/core", version: "0.1.0"
       - main: "./dist/index.cjs", module: "./dist/index.js", types: "./dist/index.d.ts"
       - exports: { ".": { import: "./dist/index.js", require: "./dist/index.cjs", types: "./dist/index.d.ts" } }
       - scripts: { "build": "tsup", "test": "vitest run" }
       - peerDependencies 不需要，devDependencies 中加 typescript

    7. 创建 packages/core/tsconfig.json:
       - extends 根 tsconfig.json
       - compilerOptions: { outDir: "dist", rootDir: "src" }
       - include: ["src"]

    8. 创建 packages/core/tsup.config.ts:
       - entry: ["src/index.ts"]
       - format: ["esm", "cjs"]
       - dts: true, sourcemap: true, clean: true

    9. 创建 packages/core/src/index.ts: 初始导出空对象 {}

    10. 创建 packages/core/tests/setup.ts: vitest 钩子（beforeEach/afterEach 空实现即可）

    11. 运行 pnpm install 确认安装成功

    注意：此阶段只创建 core 包骨架。mcp-server 和 cli 包目录在 Phase 2 才需要。
    注意：不需要初始化 git（项目还不是 git repo，由后续流程处理）。
  </action>
  <acceptance_criteria>
    - packages/core/package.json 存在且 name 为 "@mybad/core"
    - pnpm-workspace.yaml 存在且包含 "packages/*"
    - `cd /Users/wu/Documents/mybad && pnpm install` 无报错
    - `cd /Users/wu/Documents/mybad && pnpm build` 成功输出 dist/index.js, dist/index.cjs, dist/index.d.ts
    - `cd /Users/wu/Documents/mybad && pnpm test` 运行成功（0 tests passed 是正常的，因为还没写测试）
  </acceptance_criteria>
  <verify>
    <automated>cd /Users/wu/Documents/mybad && pnpm install && pnpm build && echo "BUILD_OK"</automated>
  </verify>
  <done>monorepo 骨架就绪，pnpm build 输出三种格式，pnpm test 可运行</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 定义全部 6 个数据模型 + 状态机</name>
  <files>
    packages/core/src/models/mistake.ts,
    packages/core/src/models/rule.ts,
    packages/core/src/models/link.ts,
    packages/core/src/models/verification.ts,
    packages/core/src/models/reflection.ts,
    packages/core/src/models/state-machine.ts,
    packages/core/src/models/index.ts,
    packages/core/src/index.ts,
    packages/core/tests/models.test.ts
  </files>
  <read_first>
    @PRD.md Section 5.1 (完整 Schema 定义)
    @PRD.md Section 5.2 (状态机定义)
    @PRD.md Section 9.2 (StorageAdapter 接口 — 决定 model 需要哪些 filter 类型)
  </read_first>
  <behavior>
    - Test 1: 所有 model 类型能被正确导入和实例化
    - Test 2: MistakeStatus 联合类型包含 7 个合法值
    - Test 3: RuleStatus 联合类型包含 4 个合法值
    - Test 4: LinkType 联合类型包含 4 个合法值
    - Test 5: VALID_TRANSITIONS 对象包含全部合法状态流转
    - Test 6: isValidTransition 返回 true 对合法流转，false 对非法流转
    - Test 7: TriggerType 联合类型包含 6 个合法值
    - Test 8: MistakeFilter 支持全部 PRD 定义的查询字段
  </behavior>
  <action>
    RED phase: 先创建 packages/core/tests/models.test.ts，写上述 8 个测试用例。

    GREEN phase: 创建以下文件使测试通过:

    1. packages/core/src/models/mistake.ts:
       - MistakeStatus 联合类型: "pending" | "corrected" | "recurring" | "verified" | "graduated" | "abandoned" | "false_positive"
       - TriggerType 联合类型: "L1" | "L2" | "L3" | "L4" | "L5" | "manual"
       - Mistake interface: 按 PRD Section 5.1 定义所有 18 个字段，类型严格匹配
       - MistakeFilter interface: category?, status?, agent_id?, date_from?, date_to?, recurrence_min?, limit?, offset?
       - ContextMessage interface: { role: string, content: string } (用于 context_before/context_after)
       - 导出所有类型

    2. packages/core/src/models/rule.ts:
       - RuleStatus 联合类型: "active" | "verified" | "superseded" | "archived"
       - RulePriority 联合类型: "normal" | "high" | "critical"
       - Rule interface: 按 PRD 定义所有 12 个字段
       - RuleFilter interface: category?, priority?, status?, limit?, offset?
       - 导出所有类型

    3. packages/core/src/models/link.ts:
       - LinkType 联合类型: "same_category" | "causal" | "same_root" | "semantic"
       - MistakeLink interface: from_id, to_id, link_type, confidence, created_at
       - LinkDirection 联合类型: "inbound" | "outbound" | "both"
       - 导出所有类型

    4. packages/core/src/models/verification.ts:
       - VerificationResult 联合类型: "pass" | "fail"
       - Verification interface: id(number), rule_id, result, context, agent_id, verified_at
       - VerificationCount interface: { pass: number; fail: number }
       - 导出所有类型

    5. packages/core/src/models/reflection.ts:
       - Reflection interface: 按 PRD 定义全部字段
       - ReflectionFilter interface: date_from?, date_to?, agent_id?, limit?, offset?
       - 导出所有类型

    6. packages/core/src/models/state-machine.ts:
       - VALID_TRANSITIONS: Record<MistakeStatus, MistakeStatus[]> 常量
         - pending → ["corrected", "abandoned", "false_positive"]
         - corrected → ["recurring", "verified", "abandoned"]
         - recurring → ["corrected", "verified", "abandoned"]
         - verified → ["graduated", "abandoned"]
         - graduated → [] (终态)
         - abandoned → [] (终态)
         - false_positive → [] (终态)
       - isValidTransition(from: MistakeStatus, to: MistakeStatus): boolean
       - RULE_VALID_TRANSITIONS: Record<RuleStatus, RuleStatus[]>
         - active → ["verified", "superseded", "archived"]
         - verified → ["superseded", "archived"]
         - superseded → [] (终态)
         - archived → [] (终态)
       - 导出所有

    7. packages/core/src/models/index.ts: 从所有 model 文件 re-export

    8. 更新 packages/core/src/index.ts: export * from './models'

    重要规则:
    - tags 字段用 string[] 类型（TypeScript 层面），存储层负责 JSON 序列化
    - context_before/context_after 用 ContextMessage[] 类型
    - source_ids 用 string[] 类型
    - new_rule_ids/hot_categories/stats 用对应数组/对象类型
    - created_at/updated_at 用 string 类型 (ISO 8601)
    - 所有可选字段用 ? 标记
    - 不要使用 any 类型
  </action>
  <acceptance_criteria>
    - packages/core/src/models/ 下有 6 个 .ts 文件 + index.ts
    - 每个文件导出对应 interface 和辅助类型
    - `grep -c "interface Mistake" packages/core/src/models/mistake.ts` 返回 1 或更多
    - `grep -c "VALID_TRANSITIONS" packages/core/src/models/state-machine.ts` 返回 1 或更多
    - `grep -c "isValidTransition" packages/core/src/models/state-machine.ts` 返回 1 或更多
    - `cd /Users/wu/Documents/mybad && pnpm build` 成功
    - `cd /Users/wu/Documents/mybad && pnpm test` 全部通过
  </acceptance_criteria>
  <verify>
    <automated>cd /Users/wu/Documents/mybad && pnpm build && pnpm test -- --reporter=verbose 2>&1 | tail -20</automated>
  </verify>
  <done>全部 6 个数据模型 + 状态机定义完成，TypeScript 编译通过，model 类型测试全部通过</done>
</task>

</tasks>

<verification>
1. `pnpm install` 无报错
2. `pnpm build` 成功，dist/ 下有 index.js (ESM), index.cjs (CJS), index.d.ts (类型)
3. `pnpm test` 全部通过
4. 所有 model 类型可从 @mybad/core 导入
5. 状态机合法流转完整
</verification>

<success_criteria>
- pnpm monorepo 骨架完整（根 + packages/core）
- tsup 双格式构建成功（ESM + CJS + .d.ts）
- Vitest 配置就绪
- 6 个 model 文件 + 状态机文件存在且类型正确
- 全部测试通过（8+ 测试用例）
</success_criteria>

<output>
After completion, create `.planning/phases/01-core-engine/01-SUMMARY.md`
</output>
