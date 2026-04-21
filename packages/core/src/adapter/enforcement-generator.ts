/**
 * myBad v2 — 执行规则生成器
 *
 * 将高置信度的规则转化为可执行的 pattern（正则表达式），
 * 供 PreToolUse Hook 进行确定性强制执行。
 *
 * 只处理"可模式化"的规则：
 * - 代码模式类规则 → 生成正则 pattern
 * - API 参数类规则 → 生成参数检查 pattern
 * - 不可模式化 → 只走上下文注入，不生成 enforcement
 */

import type { CoachRecommendation, CorrectionClarity } from '../models/coach'
import type { EnforcementRule, RuleTracking } from './types'

/** 执行规则生成配置 */
export interface EnforcementGeneratorConfig {
  /** 生成 enforcement 的最低置信度 */
  minConfidence: number
  /** 生成 enforcement 的最低触发次数 */
  minTriggered: number
  /** 只对明确纠正生成 enforcement */
  requireExplicit: boolean
  /** 默认执行模式（block 还是 warn） */
  defaultAction: 'block' | 'warn'
  /** 只有置信度 = 1.0 且模式明确时才用 block */
  blockOnlyPerfect: boolean
}

/** 默认配置 */
export const DEFAULT_ENFORCEMENT_CONFIG: EnforcementGeneratorConfig = {
  minConfidence: 0.8,
  minTriggered: 3,
  requireExplicit: true,
  defaultAction: 'warn',
  blockOnlyPerfect: true,
}

/**
 * 规则模式化判断结果
 */
interface PatternAnalysis {
  /** 是否可以模式化 */
  patternable: boolean
  /** 生成的正则 pattern（如果可以模式化） */
  pattern?: string
  /** 触发的工具名 */
  triggerTool: string
  /** 执行模式 */
  action: 'block' | 'warn'
  /** 给 Agent 的提示信息 */
  message: string
}

/**
 * 执行规则生成器
 *
 * Coach 分析完纠正后调用，判断规则是否可模式化，
 * 如果可以则生成 EnforcementRule 写入 enforcement_rules 表。
 */
export class EnforcementGenerator {
  constructor(private config: EnforcementGeneratorConfig = DEFAULT_ENFORCEMENT_CONFIG) {}

  /**
   * 判断一条 Coach 推荐是否可以生成执行规则
   *
   * 可模式化的规则类型：
   * - 代码模式：去重用 Set 不用 filter、JSON.stringify 带 indent
   * - API 参数：用 url 不用 title、token 放 header 不放 query
   *
   * 不可模式化的规则类型：
   * - 意图理解：用户要图表不是文字
   * - 沟通风格：先说结论再说细节
   */
  canGenerateEnforcement(
    recommendation: CoachRecommendation,
    tracking?: RuleTracking,
  ): boolean {
    // 必须有足够的置信度
    if (tracking && tracking.confidence < this.config.minConfidence) return false

    // 必须有足够的触发次数
    if (tracking && tracking.triggeredCount < this.config.minTriggered) return false

    // 必须是明确纠正
    if (this.config.requireExplicit && recommendation.clarity !== 'explicit') return false

    // 必须已应用
    if (recommendation.status !== 'auto_applied' && recommendation.status !== 'confirmed') {
      return false
    }

    // 检查规则内容是否可以模式化
    return this.analyzePattern(recommendation).patternable
  }

  /**
   * 分析规则内容，尝试生成可执行 pattern
   */
  analyzePattern(recommendation: CoachRecommendation): PatternAnalysis {
    const rule = recommendation.suggested_rule
    const category = recommendation.category

    // 已知的可模式化 category → 使用预设 pattern
    const knownPattern = this.getKnownPattern(category, rule)
    if (knownPattern) return knownPattern

    // 尝试从规则文本中提取 pattern
    return this.extractPatternFromRule(category, rule, recommendation.correction_count)
  }

  /**
   * 为已知的 category 提供预定义 pattern
   * 这些是基于常见纠正场景的高质量 pattern
   */
  private getKnownPattern(category: string, rule: string): PatternAnalysis | null {
    const knownPatterns: Record<string, PatternAnalysis> = {
      'data_dedup': {
        patternable: true,
        pattern: '\\.filter\\([\\s\\S]*?\\.indexOf',
        triggerTool: 'Write|Edit',
        action: 'warn',
        message: `myBad 执行规则：去重应使用 Set 而非 filter+indexOf`,
      },
      'api_auth': {
        patternable: true,
        pattern: 'token.*params|query.*token|\\?.*token=',
        triggerTool: 'Write|Edit',
        action: 'warn',
        message: `myBad 执行规则：token 必须放在 Authorization header，不能放在 query params`,
      },
      'format_json': {
        patternable: true,
        pattern: 'JSON\\.stringify\\([^,]*\\)(?!.*indent)',
        triggerTool: 'Write|Edit',
        action: 'warn',
        message: `myBad 执行规则：JSON.stringify 应带 indent 参数`,
      },
    }

    return knownPatterns[category] ?? null
  }

  /**
   * 从规则文本中提取 pattern
   *
   * 启发式方法：检测规则中是否包含明确的代码模式描述
   */
  private extractPatternFromRule(
    category: string,
    rule: string,
    correctionCount: number,
  ): PatternAnalysis {
    // 检测是否包含"用 X 不用 Y"模式
    const useNotUse = rule.match(/用\s+(\S+)\s+不?不用\s+(\S+)/)
    if (useNotUse) {
      const [, use, notUse] = useNotUse
      return {
        patternable: true,
        // 匹配"不该用"的模式
        pattern: notUse.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        triggerTool: 'Write|Edit',
        action: 'warn',
        message: `myBad 执行规则：${rule}`,
      }
    }

    // 检测是否包含"用 X 改成/改为/替换 Y"模式
    const replace = rule.match(/改为|改成|替换|换成|修改为/)
    if (replace) {
      return {
        patternable: true,
        // 通用模式：匹配规则中的关键代码片段
        pattern: this.extractCodePattern(rule),
        triggerTool: 'Write|Edit',
        action: 'warn',
        message: `myBad 执行规则：${rule}`,
      }
    }

    // 无法模式化 — 只走上下文注入
    return {
      patternable: false,
      triggerTool: '',
      action: 'warn',
      message: '',
    }
  }

  /**
   * 从规则文本中提取代码模式的启发式方法
   */
  private extractCodePattern(rule: string): string {
    // 提取反引号包裹的代码片段
    const codeMatch = rule.match(/`([^`]+)`/)
    if (codeMatch) {
      return codeMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }

    // 提取点号连接的方法调用
    const methodMatch = rule.match(/\w+\.\w+/)
    if (methodMatch) {
      return methodMatch[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }

    // 退而求其次：用规则的关键词
    return rule.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  /**
   * 生成完整的 EnforcementRule 对象
   * 供持久化到 enforcement_rules 表
   */
  generate(
    recommendation: CoachRecommendation,
    tracking?: RuleTracking,
  ): EnforcementRule | null {
    if (!this.canGenerateEnforcement(recommendation, tracking)) return null

    const analysis = this.analyzePattern(recommendation)
    if (!analysis.patternable || !analysis.pattern) return null

    // 决定 action：只有置信度 1.0（从未被违反）且模式明确时才用 block
    let action = this.config.defaultAction
    if (this.config.blockOnlyPerfect) {
      action = (tracking?.confidence === 1.0 || !tracking) ? 'block' : 'warn'
    }

    return {
      id: `enforce_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      category: recommendation.category,
      recommendationId: recommendation.id,
      triggerTool: analysis.triggerTool,
      triggerPattern: analysis.pattern,
      action,
      message: analysis.message + `（基于 ${recommendation.correction_count} 次纠正）`,
      confidence: tracking?.confidence ?? 1.0,
      createdFrom: 'coach_auto',
      createdAt: new Date().toISOString(),
    }
  }

  /**
   * 批量生成：对一组推荐生成所有可生成的执行规则
   */
  generateBatch(
    recommendations: CoachRecommendation[],
    trackings: Map<string, RuleTracking>,
  ): EnforcementRule[] {
    const results: EnforcementRule[] = []

    for (const rec of recommendations) {
      const tracking = trackings.get(rec.id)
      const enforcement = this.generate(rec, tracking)
      if (enforcement) {
        results.push(enforcement)
      }
    }

    return results
  }
}
