# Pitfalls Research — MyBad

**Researched:** 2026-04-16

## Critical Pitfalls

### 1. better-sqlite3 Native Bindings
**Warning signs:** `npm install` fails with node-gyp errors
**Prevention:** 
- 在 package.json 中添加 `optionalDependencies` + prebuild-install
- README 中说明 Node.js 20+ LTS 要求
- CI 中测试多平台安装
**Phase:** Phase 1（项目初始化时就要解决）

### 2. SQLite WAL Mode Concurrency
**Warning signs:** 多进程写入时 SQLITE_BUSY 错误
**Prevention:**
- 初始化时启用 WAL：`PRAGMA journal_mode=WAL`
- 设置 busy_timeout：`PRAGMA busy_timeout=5000`
- MCP Server 是单进程 stdio，通常不会有并发写入问题
**Phase:** Phase 1（SQLite 初始化时配置）

### 3. FTS5 中文分词
**Warning signs:** 中文关键词搜不到结果
**Prevention:**
- 默认用 unicode61 tokenizer，基本可用
- 中文按字符分词（"查天气" → "查"/"天"/"气"），模糊搜索能工作
- 后期可加 jieba 分词器
**Phase:** Phase 1（FTS 建表时注意）

### 4. MCP Tool Schema 验证
**Warning signs:** Agent 调用时参数类型不匹配
**Prevention:**
- 严格定义 JSON Schema（required 字段、类型约束）
- 工具实现中做 defensive validation
- 返回有意义的错误信息
**Phase:** Phase 2（MCP Server 实现时）

### 5. Monorepo Circular Dependencies
**Warning signs:** TypeScript 编译报错或运行时 undefined
**Prevention:**
- 严格单向依赖：core ← mcp-server, core ← cli
- mcp-server 和 cli 之间不互相引用
- 使用 pnpm workspace 的 `workspace:*` 协议
**Phase:** Phase 1（项目结构初始化时）

### 6. State Machine Edge Cases
**Warning signs:** 错题状态变成非法值
**Prevention:**
- 定义明确的合法状态流转矩阵
- transition() 方法中校验前置状态
- 单元测试覆盖所有状态组合
**Phase:** Phase 1（Lifecycle engine 实现时）

### 7. Recurrence Count 竞态
**Warning signs:** 两个 mistake 同时写入同一 category，计数少加
**Prevention:**
- 使用 SQL 原子操作：`UPDATE categories SET count = count + 1`
- 或者用 SQLite 事务包裹 INSERT + COUNT 更新
**Phase:** Phase 1（CRUD engine 实现时）

### 8. JSON 字段存储
**Warning signs:** JSON.parse 失败或字段类型不一致
**Prevention:**
- 写入时 JSON.stringify，读取时 try-catch JSON.parse
- 定义 TypeScript interface 强类型
- 测试中覆盖 null/empty/invalid JSON 场景
**Phase:** Phase 1（所有 JSON 字段）

### 9. npm 发布 with Native Bindings
**Warning signs:** 用户 npm install 后 better-sqlite3 编译失败
**Prevention:**
- better-sqlite3 已经有 prebuild 支持
- 在 engines 字段中限制 Node.js 版本
- 文档中说明系统依赖
**Phase:** Phase 3（发布时）

### 10. SQLite Migration without Framework
**Warning signs:** Schema 变更导致数据丢失或不一致
**Prevention:**
- 手写 migration 文件（001_init.sql, 002_xxx.sql）
- migrations 表记录已执行的 migration
- 每个 migration 是事务
**Phase:** Phase 1（Schema 初始化时）
