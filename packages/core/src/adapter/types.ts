/**
 * myBad v2 — 平台适配器类型定义
 *
 * 三个适配器分别对应 myBad 生命周期的三个关卡：
 * - CaptureAdapter: 捕获层 — 谁检测纠正信号、怎么触发 correction_capture
 * - WriteAdapter: 写入层 — Coach 分析完规则写到哪里
 * - ReadAdapter: 读取层 — Agent 怎么在下次 session 读到规则
 *
 * 与 StorageAdapter 的区别：
 * - StorageAdapter 是存储后端适配（SQLite vs Memory）
 * - 这三个 Adapter 是平台行为适配（Claude Code vs OpenClaw vs Hermes）
 */

import type { CoachRecommendation, CoachTarget } from '../models/coach'

// ── 规则作用域 ──────────────────────────────────────────

/** 规则作用域层级 */
export type RuleScope = 'project' | 'agent' | 'universal'

/** 作用域优先级（数值越高优先级越高） */
export const SCOPE_PRIORITY: Record<RuleScope, number> = {
  universal: 0,
  agent: 1,
  project: 2,
}

/** 比较两个作用域的优先级，返回 >0 表示 a 优先于 b */
export function compareScopePriority(a: RuleScope, b: RuleScope): number {
  return SCOPE_PRIORITY[a] - SCOPE_PRIORITY[b]
}

// ── Agent 平台 ──────────────────────────────────────────

/** 支持的 Agent 平台 */
export type AgentPlatform = 'claude-code' | 'openclaw' | 'hermes' | 'generic'

// ── 捕获适配器 ──────────────────────────────────────────

/**
 * 捕获适配器 — 解决"谁检测纠正信号"
 *
 * 职责：生成纠正检测指令和启动检查指令，这些指令会被注入到 Agent 上下文中
 */
export interface CaptureAdapter {
  /** 适配器名称 */
  name: string
  /** Agent 平台标识 */
  platform: AgentPlatform

  /**
   * 注册纠正检测指令
   * 返回需要注入到 Agent 系统指令中的文本
   * 这段文本告诉 Agent：什么时候调用 correction_capture
   */
  getCaptureInstructions(): string

  /**
   * 注册 session 启动检查指令
   * 返回需要注入到 Agent 启动流程中的文本
   * 这段文本告诉 Agent：新 session 开始时检查 pending
   */
  getStartupInstructions(): string
}

// ── 写入适配器 ──────────────────────────────────────────

/** 写入操作结果 */
export interface WriteResult {
  success: boolean
  targetPath: string
  error?: string
}

/**
 * 写入适配器 — 解决"Coach 写到哪里"
 *
 * 职责：将 Coach 推荐写入目标位置（文件、bootstrap 等）
 * 不同平台有不同的写入目标：
 * - Claude Code → .mybad/session-inject.md（Hook 读取）
 * - OpenClaw → .mybad/rules/ + .mybad/pending.md（hook 读取文件）
 * - Hermes → MEMORY.md + Skill 文件（双写策略）
 */
export interface WriteAdapter {
  /** 适配器名称 */
  name: string
  /** 支持的目标文件类型 */
  supportedTargetTypes: string[]

  /**
   * 将 Coach 推荐写入目标
   * @param recommendation Coach 推荐记录
   * @param scope 规则作用域
   */
  writeRule(recommendation: CoachRecommendation, scope?: RuleScope): Promise<WriteResult>

  /**
   * 从目标中移除规则（归档/降级时使用）
   * @param category 要移除的规则分类
   */
  removeRule(category: string): Promise<boolean>

  /**
   * 扫描当前环境，返回可用的目标文件列表
   * 用于 Coach 匹配推荐时判断目标文件
   */
  scanTargets(projectRoot: string): Promise<CoachTarget[]>
}

// ── 读取适配器 ──────────────────────────────────────────

/**
 * 读取适配器 — 解决"Agent 怎么读到规则"
 *
 * 职责：格式化规则文本用于注入到 Agent 上下文
 * 不同平台有不同的注入方式：
 * - Claude Code → Hook stdout 直接注入
 * - OpenClaw → bootstrapFiles 数组
 * - Hermes → MEMORY.md 自动注入
 */
export interface ReadAdapter {
  /** 适配器名称 */
  name: string

  /**
   * 生成需要注入到 Agent 上下文的规则文本
   * @param rules 规则文本列表
   * @param scope 规则作用域（默认 'all' 合并三层）
   */
  formatRulesForContext(
    rules: string[],
    scope?: RuleScope | 'all',
  ): string

  /**
   * 生成 pending 推荐的提示文本
   * 当有 pending 推荐时，这段文本会被注入让 Agent 提醒用户
   */
  formatPendingForContext(pending: CoachRecommendation[]): string
}

// ── 冲突解决相关 ────────────────────────────────────────

/** 带作用域的规则条目（冲突解决用） */
export interface ScopedRule {
  recommendation: CoachRecommendation
  scope: RuleScope
  overridden: boolean
}

/** 冲突解决结果 */
export interface ResolvedRuleSet {
  /** category → 最终生效的规则 */
  activeRules: Map<string, ScopedRule>
  /** 记录的冲突列表 */
  conflicts: RuleConflictRecord[]
}

/** 冲突记录 */
export interface RuleConflictRecord {
  category: string
  winnerScope: RuleScope
  winnerRule: CoachRecommendation
  loserScope: RuleScope
  loserRule: CoachRecommendation
}

// ── 规则追踪相关 ────────────────────────────────────────

/** 规则追踪记录 */
export interface RuleTracking {
  id: string
  recommendationId: string
  category: string
  scope: RuleScope

  // 计数器
  triggeredCount: number
  obeyedCount: number
  violatedCount: number

  // 置信度（自动计算：obeyed / (obeyed + violated)）
  confidence: number

  // 生命周期状态
  lifecycle: RuleLifecycleStatus

  // 时间戳
  createdAt: string
  lastTriggeredAt: string | null
  lastViolatedAt: string | null
  lastCheckedAt: string
}

/** 规则生命周期状态 */
export type RuleLifecycleStatus =
  | 'active'       // 正常生效
  | 'graduated'    // 毕业（高置信度，升级为永久规则）
  | 'downgraded'   // 降级（低置信度，待重审）
  | 'archived'     // 归档（长期未触发）
  | 'superseded'   // 被新规则替代
  | 'evolved'      // 进化（规则被更新为更精确版本）

/** 生命周期操作 */
export interface LifecycleAction {
  ruleId: string
  trackingId: string
  action: 'graduate' | 'downgrade' | 'archive' | 'evolve'
  reason: string
  newRuleText?: string  // evolve 时的新规则文本
}

// ── 执行层相关 ──────────────────────────────────────────

/** 执行规则 */
export interface EnforcementRule {
  id: string
  category: string
  recommendationId: string

  // 触发条件
  triggerTool: string
  triggerPattern: string
  triggerMcpTool?: string

  // 执行行为
  action: 'block' | 'warn'
  message: string

  // 元数据
  confidence: number
  createdFrom: 'coach_auto' | 'manual'
  createdAt: string
}
