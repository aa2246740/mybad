/**
 * myBad OpenClaw 原生插件
 *
 * 把 myBad 的纠正捕捉、查询、Coach 分析注册为 OpenClaw 原生工具。
 * 绕过 MCP bug，直接在 OpenClaw 进程内运行。
 */
import type { OpenClawPluginApi, AnyAgentTool } from 'openclaw/plugin-sdk'
import { Type } from '@sinclair/typebox'
import { MyBadEngine } from '@mybad/core'
import { SQLiteAdapter } from '@mybad/core/storage'
import type { MistakeStatus, TriggerType } from '@mybad/core/models/mistake'

// ── Engine 管理 ──────────────────────────────────────────

let engine: MyBadEngine | null = null
let storage: SQLiteAdapter | null = null

function getEngine(config: Record<string, unknown>): MyBadEngine {
  if (engine) return engine
  const dbPath = (config.dbPath as string) || '.mybad/mybad.db'
  storage = new SQLiteAdapter(dbPath)
  engine = new MyBadEngine(storage)
  return engine
}

// ── 工具定义 ────────────────────────────────────────────

const captureTool: AnyAgentTool = {
  name: 'correction_capture',
  description: '捕捉一条错题。当检测到用户纠正信号（"不对"、"错了"、"应该是X"、"用Y不用Z"）时调用。',
  input: Type.Object({
    category: Type.String({ description: '错误分类（英文蛇形命名，如 data_dedup, api_auth）' }),
    trigger_type: Type.Union([
      Type.Literal('L1'), Type.Literal('L2'), Type.Literal('L3'),
      Type.Literal('L4'), Type.Literal('L5'), Type.Literal('manual'),
    ], { description: 'L1否定 L2修正 L3追问 L4拒绝 L5澄清 manual手动' }),
    ai_misunderstanding: Type.Optional(Type.String({ description: 'AI 理解成了什么' })),
    user_correction: Type.Optional(Type.String({ description: '用户纠正原话' })),
    user_intent: Type.Optional(Type.String({ description: '用户本意' })),
    context_before: Type.Optional(Type.String({ description: '纠正前的上下文' })),
    tags: Type.Optional(Type.Array(Type.String(), { description: '标签' })),
    confidence: Type.Optional(Type.Number({ description: '置信度 0.0-1.0', minimum: 0, maximum: 1 })),
  }),
  execute: async (args) => {
    const eng = getEngine(captureTool._config!)
    const id = `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const now = new Date().toISOString()
    const recurrenceCount = await (eng as any).crud.storage.incrementRecurrence(args.category)

    const m = await eng.addMistake({
      id,
      category: args.category,
      status: 'pending',
      trigger_type: args.trigger_type as TriggerType,
      recurrence_count: recurrenceCount,
      context_before: args.context_before || '[]',
      ai_misunderstanding: args.ai_misunderstanding,
      user_intent: args.user_intent,
      user_correction: args.user_correction,
      tags: args.tags || [],
      confidence: args.confidence ?? 1.0,
      created_at: now,
      updated_at: now,
    })

    const message = recurrenceCount > 1
      ? `捕捉成功 (第${recurrenceCount}次同类纠正)。mistake_id: ${m}`
      : `捕捉成功。mistake_id: ${m}`

    return { result: 'success', details: { mistake_id: m, category: args.category, recurrence_count: recurrenceCount, message } }
  },
} as AnyAgentTool & { _config?: Record<string, unknown> }

const queryTool: AnyAgentTool = {
  name: 'correction_query',
  description: '查询错题记录。按分类、状态、平台等多维度过滤。',
  input: Type.Object({
    category: Type.Optional(Type.String({ description: '按分类过滤' })),
    status: Type.Optional(Type.String({ description: '按状态过滤 (pending/corrected/recurring/verified/graduated)' })),
    platform: Type.Optional(Type.String({ description: '按平台过滤 (claude-code/openclaw/hermes)' })),
    limit: Type.Optional(Type.Number({ description: '返回数量上限', minimum: 1, maximum: 100 })),
  }),
  execute: async (args) => {
    const eng = getEngine(queryTool._config!)
    const results = await eng.queryMistakes({
      category: args.category,
      status: args.status as MistakeStatus | undefined,
      platform: args.platform,
      limit: args.limit ?? 20,
    })
    return {
      result: 'success',
      details: {
        total: results.length,
        mistakes: results.map(m => ({
          id: m.id, category: m.category, status: m.status,
          trigger_type: m.trigger_type, recurrence_count: m.recurrence_count,
          ai_misunderstanding: m.ai_misunderstanding, user_correction: m.user_correction,
          platform: m.platform, created_at: m.created_at,
        })),
      },
    }
  },
} as AnyAgentTool & { _config?: Record<string, unknown> }

const statsTool: AnyAgentTool = {
  name: 'correction_stats',
  description: '获取错题统计数据。全局概览和分类统计。',
  input: Type.Object({}),
  execute: async (_args) => {
    const eng = getEngine(statsTool._config!)
    const [categoryStats, overallStats] = await Promise.all([
      eng.getCategoryStats(),
      eng.getOverallStats(),
    ])
    return { result: 'success', details: { overall: overallStats, by_category: categoryStats } }
  },
} as AnyAgentTool & { _config?: Record<string, unknown> }

const searchTool: AnyAgentTool = {
  name: 'correction_search',
  description: '全文搜索错题。搜索分类、AI误解、用户纠正等内容。',
  input: Type.Object({
    query: Type.String({ description: '搜索关键词' }),
    limit: Type.Optional(Type.Number({ description: '返回数量上限', minimum: 1, maximum: 50 })),
  }),
  execute: async (args) => {
    const eng = getEngine(searchTool._config!)
    const results = await eng.searchMistakes(args.query, args.limit ?? 20)
    return {
      result: 'success',
      details: {
        total: results.length,
        mistakes: results.map(m => ({
          id: m.id, category: m.category, status: m.status,
          user_correction: m.user_correction, platform: m.platform, created_at: m.created_at,
        })),
      },
    }
  },
} as AnyAgentTool & { _config?: Record<string, unknown> }

const coachTool: AnyAgentTool = {
  name: 'correction_coach',
  description: 'Coach 分析：从历史纠正记录中发现模式，生成改进建议。',
  input: Type.Object({
    min_recurrence: Type.Optional(Type.Number({ description: '最小复发次数阈值，默认 2' })),
  }),
  execute: async (args) => {
    const eng = getEngine(coachTool._config!)
    const result = await eng.coachAnalyze({
      minRecurrence: args.min_recurrence ?? 2,
    })
    return { result: 'success', details: result as unknown as Record<string, unknown> }
  },
} as AnyAgentTool & { _config?: Record<string, unknown> }

const coachAppliedTool: AnyAgentTool = {
  name: 'correction_coach_applied',
  description: '获取所有已应用的 Coach 规则。这些规则应被注入到上下文中。',
  input: Type.Object({}),
  execute: async (_args) => {
    const eng = getEngine(coachAppliedTool._config!)
    const rules = await eng.coachGetAppliedRules()
    return { result: 'success', details: { total: rules.length, rules } }
  },
} as AnyAgentTool & { _config?: Record<string, unknown> }

const coachPendingTool: AnyAgentTool = {
  name: 'correction_coach_pending',
  description: '获取待确认的 Coach 推荐。新 session 开始时调用，将 pending 推荐呈现给用户。',
  input: Type.Object({}),
  execute: async (_args) => {
    const eng = getEngine(coachPendingTool._config!)
    const pending = await eng.coachGetPendingConfirmations()
    return {
      result: 'success',
      details: {
        total: pending.length,
        recommendations: pending.map(r => ({
          id: r.id, category: r.category, pattern_summary: r.pattern_summary,
          suggested_rule: r.suggested_rule, correction_count: r.correction_count,
        })),
      },
    }
  },
} as AnyAgentTool & { _config?: Record<string, unknown> }

const coachConfirmTool: AnyAgentTool = {
  name: 'correction_coach_confirm',
  description: '确认或拒绝一条 pending 的 Coach 推荐。',
  input: Type.Object({
    recommendation_id: Type.String({ description: '推荐 ID' }),
    action: Type.Union([Type.Literal('confirm'), Type.Literal('reject')]),
    reason: Type.Optional(Type.String({ description: '拒绝原因' })),
  }),
  execute: async (args) => {
    const eng = getEngine(coachConfirmTool._config!)
    if (args.action === 'confirm') {
      const rec = await eng.coachConfirm(args.recommendation_id, 'user')
      return { result: 'success', details: { recommendation: rec } }
    }
    const rec = await eng.coachReject(args.recommendation_id, args.reason)
    return { result: 'success', details: { rejected: true, recommendation: rec } }
  },
} as AnyAgentTool & { _config?: Record<string, unknown> }

const ruleQueryTool: AnyAgentTool = {
  name: 'correction_rule_query',
  description: '查询规则列表。',
  input: Type.Object({
    category: Type.Optional(Type.String({ description: '按分类过滤' })),
    status: Type.Optional(Type.String({ description: '按状态过滤 (active/verified/superseded/archived)' })),
    limit: Type.Optional(Type.Number({ description: '返回数量上限' })),
  }),
  execute: async (args) => {
    const eng = getEngine(ruleQueryTool._config!)
    const rules = await eng.getRules({
      category: args.category,
      status: args.status as any,
      limit: args.limit ?? 50,
    })
    return { result: 'success', details: { total: rules.length, rules } }
  },
} as AnyAgentTool & { _config?: Record<string, unknown> }

// ── 插件注册 ────────────────────────────────────────────

export default {
  id: 'mybad',
  name: 'myBad — AI Agent 错题本',
  description: '让 Agent 记住你的纠正，不再犯同样的错',
  configSchema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      dbPath: { type: 'string' as const, description: 'SQLite 数据库路径' },
    },
  },

  register(api: OpenClawPluginApi) {
    const config = (api.pluginConfig || {}) as Record<string, unknown>

    // 把 config 注入每个 tool（供 execute 读取）
    const tools = [
      captureTool, queryTool, statsTool, searchTool,
      coachTool, coachAppliedTool, coachPendingTool, coachConfirmTool,
      ruleQueryTool,
    ]
    for (const tool of tools) {
      ;(tool as any)._config = config
      api.registerTool(tool)
    }

    api.logger.info('myBad plugin registered — 9 tools available')
  },
}
