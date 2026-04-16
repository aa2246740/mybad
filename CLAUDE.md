<!-- GSD:project-start source:PROJECT.md -->
## Project

**MyBad**

MyBad 是一个 AI Agent 错题集系统——让任何 AI Agent 能够自动记录人类纠正信号、追踪错误复发、提炼规则并持续进化。类比人类学习的"错题本"，让 AI 拥有自我纠错和持续进化的能力。

通过 MCP 协议对 OpenClaw、Hermes、Claude Code 等所有 Agent 提供服务。纯 TypeScript 实现，SQLite 默认存储，零 LLM 依赖，离线运行。

**Core Value:** Agent 被纠正后，同类错误不再犯第二次。错题 → 规则 → 进化，形成完整学习闭环。

### Constraints

- **Tech Stack**: TypeScript 严格模式 + pnpm monorepo + Vitest + tsup
- **Storage**: SQLite（better-sqlite3），同步 API
- **Interface**: MCP 为主力接口（@modelcontextprotocol/sdk）
- **Zero LLM**: 不引入任何 LLM 依赖，智能在 Agent 侧
- **Offline**: 全部本地运行，不需要网络或服务端
- **Package**: npm 发布，包名 @mybad/core, @mybad/mcp-server, @mybad/cli
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Core Stack
| Component | Choice | Version | Confidence | Rationale |
|-----------|--------|---------|------------|-----------|
| Language | TypeScript strict | 5.5+ | High | Agent 生态主流，类型安全 |
| Runtime | Node.js | 20+ LTS | High | better-sqlite3 需要 native bindings |
| Build | tsup | ^8.0 | High | ESM + CJS dual output，零配置 |
| Package Manager | pnpm | ^9.0 | High | Monorepo 标准，workspace 原生支持 |
| Testing | Vitest | ^2.0 | High | TypeScript 原生，快 |
| Storage | better-sqlite3 | ^11.0 | High | 同步 API，WAL 模式，FTS5 支持 |
| MCP SDK | @modelcontextprotocol/sdk | ^1.0 | High | 官方 SDK，TypeScript 原生 |
| CLI | commander | ^12.0 | Medium | 成熟稳定，TypeScript 支持 |
## Key Technical Notes
### better-sqlite3
- 同步 API，不需要 async/await 包装
- WAL 模式支持并发读写
- FTS5 内置，支持中文需要自定义 tokenizer 或使用 unicode61
- Native bindings (node-gyp) 可能导致 npm install 问题，需要 prebuild
- 发布 npm 包时需要使用 prebuild-install 或 @aspect-build/rules_js
### @modelcontextprotocol/sdk
- 工具定义用 JSON Schema 描述参数
- Server 通过 stdio 传输
- 工具实现是纯 async 函数
### tsup
- 配合 `--dts` 生成类型声明
- `format: ["esm", "cjs"]` 双格式
- `sourcemap: true`
### FTS5 中文支持
- 默认 tokenizer (unicode61) 对中文分词不好
- 可选方案：简单按字符分词，或使用 jieba 分词
- 对错题集场景（关键词搜索为主），unicode61 基本够用
- 后期可加 jieba-wasm 做中文分词
## What NOT to use
| Rejected | Why |
|----------|-----|
| sql.js | 纯 WASM，性能不如 native，不支持 WAL |
| drizzle-orm | 过度抽象，SQLite 直接 SQL 更可控 |
| Prisma | Schema-first 不适合动态建表需求 |
| kysely | 增加复杂度，SQLite 原生 SQL 足够 |
| Neo4j | 过度设计，递归 CTE 够用 |
| ChromaDB | < 10000 条不需要向量搜索 |
| NetworkX (Python) | 不需要图算法，关联查询 SQL 够用 |
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
