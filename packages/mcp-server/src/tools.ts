import type { MyBadEngine } from '@mybad/core'

/** MCP 工具定义 */
export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler: (engine: MyBadEngine, args: Record<string, unknown>) => Promise<Record<string, unknown>>
}

// ── Schema 定义 ──────────────────────────────────────────

const captureSchema = {
  type: 'object' as const,
  properties: {
    context_before: { type: 'array', items: { type: 'object' }, description: '纠正前的上下文消息' },
    context_after: { type: 'array', items: { type: 'object' }, description: '纠正后的上下文消息（可选）' },
    category: { type: 'string', description: 'Agent 判定的错误分类' },
    trigger_type: { type: 'string', enum: ['L1', 'L2', 'L3', 'L4', 'L5', 'manual'], description: '触发级别' },
    ai_misunderstanding: { type: 'string', description: 'AI 理解成了什么' },
    user_intent: { type: 'string', description: '用户本意' },
    user_correction: { type: 'string', description: '用户纠正原话' },
    agent_id: { type: 'string', description: '哪个 Agent' },
    session_id: { type: 'string', description: '哪个会话' },
    tags: { type: 'array', items: { type: 'string' }, description: '标签' },
    confidence: { type: 'number', description: '置信度 0.0-1.0' },
  },
  required: ['context_before', 'category', 'trigger_type'],
}

const querySchema = {
  type: 'object' as const,
  properties: {
    category: { type: 'string' },
    status: { type: 'string', enum: ['pending', 'corrected', 'recurring', 'verified', 'graduated', 'abandoned', 'false_positive'] },
    agent_id: { type: 'string' },
    date_from: { type: 'string', description: 'ISO 8601 日期' },
    date_to: { type: 'string', description: 'ISO 8601 日期' },
    recurrence_min: { type: 'number' },
    limit: { type: 'number' },
    offset: { type: 'number' },
  },
}

const updateSchema = {
  type: 'object' as const,
  properties: {
    mistake_id: { type: 'string', description: '错题 ID' },
    status: { type: 'string', enum: ['corrected', 'recurring', 'verified', 'graduated', 'abandoned', 'false_positive'] },
    context_after: { type: 'array', items: { type: 'object' }, description: '补充后续上下文' },
    user_correction: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: ['mistake_id', 'status'],
}

const linkSchema = {
  type: 'object' as const,
  properties: {
    from_id: { type: 'string' },
    to_id: { type: 'string' },
    link_type: { type: 'string', enum: ['same_category', 'causal', 'same_root', 'semantic'] },
    confidence: { type: 'number' },
  },
  required: ['from_id', 'to_id', 'link_type'],
}

const ruleAddSchema = {
  type: 'object' as const,
  properties: {
    category: { type: 'string' },
    rule_text: { type: 'string', description: '人类可读规则' },
    source_ids: { type: 'array', items: { type: 'string' }, description: '来源错题 IDs' },
    priority: { type: 'string', enum: ['normal', 'high', 'critical'] },
  },
  required: ['category', 'rule_text', 'source_ids'],
}

const ruleVerifySchema = {
  type: 'object' as const,
  properties: {
    rule_id: { type: 'string' },
    result: { type: 'string', enum: ['pass', 'fail'] },
    context: { type: 'string', description: '验证场景' },
    agent_id: { type: 'string' },
  },
  required: ['rule_id', 'result'],
}

const ruleQuerySchema = {
  type: 'object' as const,
  properties: {
    category: { type: 'string' },
    priority: { type: 'string', enum: ['normal', 'high', 'critical'] },
    status: { type: 'string', enum: ['active', 'verified', 'superseded', 'archived'] },
    limit: { type: 'number' },
    offset: { type: 'number' },
  },
}

const reflectSchema = {
  type: 'object' as const,
  properties: {
    date_from: { type: 'string' },
    date_to: { type: 'string' },
    include_categories: { type: 'array', items: { type: 'string' } },
    min_recurrence: { type: 'number' },
  },
}

const statsSchema = {
  type: 'object' as const,
  properties: {
    agent_id: { type: 'string' },
    date_from: { type: 'string' },
    date_to: { type: 'string' },
  },
}

const searchSchema = {
  type: 'object' as const,
  properties: {
    query: { type: 'string', description: '搜索关键词' },
    limit: { type: 'number' },
  },
  required: ['query'],
}

const configSchema = {
  type: 'object' as const,
  properties: {
    action: { type: 'string', enum: ['get', 'set'] },
    key: { type: 'string' },
    value: { description: '设置值（任意 JSON）' },
  },
  required: ['action', 'key'],
}

// ── 12 个 MCP 工具 ─────────────────────────────────────

export const tools: ToolDefinition[] = [
  // MCP-01: correction_capture
  {
    name: 'correction_capture',
    description: '捕捉一条错题记录。当检测到用户纠正信号时调用。',
    inputSchema: captureSchema,
    handler: async (engine, args) => {
      const m = await engine.addMistake({
        category: args.category as string,
        status: 'pending',
        trigger_type: args.trigger_type as any,
        context_before: JSON.stringify(args.context_before ?? []),
        context_after: args.context_after ? JSON.stringify(args.context_after) : undefined,
        ai_misunderstanding: args.ai_misunderstanding as string,
        user_intent: args.user_intent as string,
        user_correction: args.user_correction as string,
        agent_id: args.agent_id as string,
        session_id: args.session_id as string,
        tags: (args.tags as string[]) ?? [],
        confidence: (args.confidence as number) ?? 1.0,
      })
      const links = await engine.getLinks(m.id, 'outbound')
      return {
        mistake_id: m.id,
        category: m.category,
        recurrence_count: m.recurrence_count,
        linked_mistakes: links.map(l => l.to_id),
        status: m.status,
      }
    },
  },

  // MCP-02: correction_query
  {
    name: 'correction_query',
    description: '查询错题记录。支持按分类、状态、Agent、日期等多维度过滤。',
    inputSchema: querySchema,
    handler: async (engine, args) => {
      const results = await engine.queryMistakes({
        category: args.category as string,
        status: args.status as any,
        agent_id: args.agent_id as string,
        date_from: args.date_from as string,
        date_to: args.date_to as string,
        recurrence_min: args.recurrence_min as number,
        limit: args.limit as number,
        offset: args.offset as number,
      })
      return {
        total: results.length,
        mistakes: results.map(m => ({
          id: m.id,
          category: m.category,
          status: m.status,
          trigger_type: m.trigger_type,
          recurrence_count: m.recurrence_count,
          ai_misunderstanding: m.ai_misunderstanding,
          user_intent: m.user_intent,
          user_correction: m.user_correction,
          agent_id: m.agent_id,
          tags: m.tags,
          created_at: m.created_at,
        })),
      }
    },
  },

  // MCP-03: correction_update
  {
    name: 'correction_update',
    description: '更新错题状态。用于确认改对、标记误报、标记再犯等。',
    inputSchema: updateSchema,
    handler: async (engine, args) => {
      const updates: Record<string, unknown> = { status: args.status }
      if (args.context_after) updates.context_after = JSON.stringify(args.context_after)
      if (args.user_correction) updates.user_correction = args.user_correction
      if (args.tags) updates.tags = args.tags

      // 如果是合法状态流转，用 transition（校验状态机）
      try {
        const updated = await engine.transition(args.mistake_id as string, args.status as any)
        // 额外更新非状态字段
        if (args.context_after || args.user_correction || args.tags) {
          await engine.updateMistake(args.mistake_id as string, updates as any)
        }
        const final = await engine.getMistake(args.mistake_id as string)
        return { success: true, mistake: final }
      } catch (e: any) {
        // 直接更新（不走状态机）
        await engine.updateMistake(args.mistake_id as string, updates as any)
        const updated = await engine.getMistake(args.mistake_id as string)
        return { success: true, mistake: updated, warning: e.message }
      }
    },
  },

  // MCP-04: correction_link
  {
    name: 'correction_link',
    description: '关联两条错题。支持四种关联类型：same_category、causal、same_root、semantic。',
    inputSchema: linkSchema,
    handler: async (engine, args) => {
      await engine.addLink(
        args.from_id as string,
        args.to_id as string,
        args.link_type as any,
        (args.confidence as number) ?? 1.0
      )
      return { success: true, from_id: args.from_id, to_id: args.to_id, link_type: args.link_type }
    },
  },

  // MCP-05: correction_rule_add
  {
    name: 'correction_rule_add',
    description: '添加一条规则。从错题中提炼出的经验法则。',
    inputSchema: ruleAddSchema,
    handler: async (engine, args) => {
      const rule = await engine.addRule({
        category: args.category as string,
        rule_text: args.rule_text as string,
        priority: ((args.priority as string) ?? 'normal') as any,
        status: 'active',
        source_ids: args.source_ids as string[],
      })
      return { success: true, rule_id: rule.id, rule_text: rule.rule_text }
    },
  },

  // MCP-06: correction_rule_verify
  {
    name: 'correction_rule_verify',
    description: '验证规则。当 Agent 成功遵守或违反规则时调用。',
    inputSchema: ruleVerifySchema,
    handler: async (engine, args) => {
      await engine.addVerification({
        rule_id: args.rule_id as string,
        result: args.result as any,
        context: args.context as string,
        agent_id: args.agent_id as string,
        verified_at: new Date().toISOString(),
      })
      const rules = await engine.getRules()
      const rule = rules.find(r => r.id === args.rule_id)
      return { success: true, rule_id: args.rule_id, result: args.result, verified_count: rule?.verified_count, fail_count: rule?.fail_count }
    },
  },

  // MCP-07: correction_rule_query
  {
    name: 'correction_rule_query',
    description: '查询规则列表。',
    inputSchema: ruleQuerySchema,
    handler: async (engine, args) => {
      const rules = await engine.getRules({
        category: args.category as string,
        priority: args.priority as any,
        status: args.status as any,
        limit: args.limit as number,
        offset: args.offset as number,
      })
      return { total: rules.length, rules }
    },
  },

  // MCP-08: correction_reflect
  {
    name: 'correction_reflect',
    description: '获取结构化反思数据。用于 Agent 每日反思、分析错误模式。',
    inputSchema: reflectSchema,
    handler: async (engine, args) => {
      const data = await engine.getReflectionData({
        dateFrom: args.date_from as string,
        dateTo: args.date_to as string,
        includeCategories: args.include_categories as string[],
        minRecurrence: args.min_recurrence as number,
      })
      return data as unknown as Record<string, unknown>
    },
  },

  // MCP-09: correction_stats
  {
    name: 'correction_stats',
    description: '获取统计数据。全局概览和分类统计。',
    inputSchema: statsSchema,
    handler: async (engine, args) => {
      const [categoryStats, overallStats] = await Promise.all([
        engine.getCategoryStats(args.agent_id as string),
        engine.getOverallStats(args.agent_id as string, args.date_from || args.date_to ? { from: args.date_from as string, to: args.date_to as string } : undefined),
      ])
      return { overall: overallStats, by_category: categoryStats }
    },
  },

  // MCP-10: correction_search
  {
    name: 'correction_search',
    description: '全文搜索错题。搜索范围包括分类、AI 误解、用户意图、用户纠正、标签。',
    inputSchema: searchSchema,
    handler: async (engine, args) => {
      const results = await engine.searchMistakes(args.query as string, (args.limit as number) ?? 20)
      return { total: results.length, mistakes: results }
    },
  },

  // MCP-11: correction_config
  {
    name: 'correction_config',
    description: '配置管理。获取或设置 MyBad 配置项。',
    inputSchema: configSchema,
    handler: async (engine, args) => {
      if (args.action === 'get') {
        const value = await engine.crud['storage'].getConfig(args.key as string)
        return { key: args.key, value }
      }
      await engine.crud['storage'].setConfig(args.key as string, args.value)
      return { success: true, key: args.key, value: args.value }
    },
  },
]
