# Features Research — MyBad

**Researched:** 2026-04-16

## Table Stakes (Must Have)

### Mistake Capture
- 记录错题（上下文、分类、AI 误解、用户意图、用户纠正原话）
- 5 级触发类型标记（L1-L5 + manual）
- 多 Agent 支持（agent_id 标识）

### Recurrence Tracking
- 同 category 原子计数（recurrence_count++）
- 自动标记 recurring 状态
- 按 category 聚合查询

### Lifecycle Management
- 六态状态机（pending/corrected/recurring/verified/graduated/archived + false_positive/abandoned）
- 状态流转（corrected → verified → graduated）
- 毕业机制（verified × 3 → graduated）

### Linking
- 四种关联类型（same_category/causal/same_root/semantic）
- 正向 + 反向查询
- 递归关联查询（二度）

### Rule System
- 错题提炼规则（source_ids → rule_text）
- 规则验证（pass/fail 计数）
- 规则替代（superseded_by）

### Query & Search
- 多维度查询（category/status/agent/date/recurrence）
- FTS5 全文搜索
- 统计聚合（by category/by status/by agent）

### MCP Interface
- 11 个工具（capture/query/update/link/rule_add/rule_verify/rule_query/reflect/stats/search/config）
- JSON Schema 参数定义
- stdio 传输

## Differentiators

### Compaction & Archival
- graduated 错题自动压缩
- 过期 pending 清理
- 规则替代后旧规则归档
- 增长不会无限

### Agent-Agnostic Design
- 零 LLM 依赖
- 通过 MCP 协议适配任何 Agent
- StorageAdapter 抽象可换后端

### CLI Tools
- 人类可手动操作
- 开发调试友好
- 导入导出能力

## Anti-Features (Deliberately NOT Building)

| Feature | Why Not |
|---------|---------|
| 内置 LLM 调用 | Agent 自身就是 LLM |
| 图可视化 UI | 不是本项目的范围 |
| 向量语义搜索 | 规模不到，FTS5 够用 |
| 实时通知/WebSocket | 不需要实时，Agent 按需查询 |
| 用户认证系统 | 本地工具，不需要认证 |
| 云端同步 | 离线优先，不需要云 |
| 多租户 | Phase 2 内容 |

## Feature Dependencies

```
Mistake CRUD → Recurrence Tracking → Lifecycle → Rule System → Verification → Compaction
     ↓              ↓
  FTS Search     Linking System
     ↓
  Stats/Query
     ↓
  MCP Server (exposes all above)
  CLI (exposes all above)
```
