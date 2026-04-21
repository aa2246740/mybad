/**
 * myBad v2 — 平台适配器模块
 *
 * 导出所有适配器类型、注册中心和工具类。
 */

// 类型定义
export type {
  AgentPlatform,
  CaptureAdapter,
  WriteAdapter,
  WriteResult,
  ReadAdapter,
  RuleScope,
  ScopedRule,
  ResolvedRuleSet,
  RuleConflictRecord,
  RuleTracking,
  RuleLifecycleStatus,
  LifecycleAction,
  EnforcementRule,
} from './types'

export { SCOPE_PRIORITY, compareScopePriority } from './types'

// 注册中心
export { AdapterRegistry } from './registry'
export type { AdapterSuite } from './registry'

// 三层作用域合并
export { ScopeMerger } from './scope'
export type { ScopedRules, MergedRule } from './scope'

// 冲突解决
export { ConflictResolver } from './conflict-resolver'

// 规则生命周期管理
export { RuleLifecycleManager, DEFAULT_THRESHOLDS } from './rule-lifecycle'
export type { LifecycleThresholds } from './rule-lifecycle'

// 执行规则生成
export { EnforcementGenerator, DEFAULT_ENFORCEMENT_CONFIG } from './enforcement-generator'
export type { EnforcementGeneratorConfig } from './enforcement-generator'

// Claude Code 适配器
export {
  ClaudeCodeCapture,
  ClaudeCodeWrite,
  ClaudeCodeRead,
  ClaudeCodeHookInstaller,
} from './claude-code'
export type { HookInstallResult } from './claude-code'

// OpenClaw 适配器
export {
  OpenClawCapture,
  OpenClawWrite,
  OpenClawRead,
} from './openclaw'

// Hermes 适配器
export {
  HermesCapture,
  HermesWrite,
  HermesRead,
} from './hermes'

// 跨项目提炼
export { Distiller, DEFAULT_DISTILLER_CONFIG } from './distiller'
export type { DistillerConfig, DistillationResult } from './distiller'
