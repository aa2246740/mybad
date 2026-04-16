import { describe, it, expect } from 'vitest'
import type { Mistake, MistakeStatus, TriggerType, MistakeFilter } from '../src/models/mistake'
import type { Rule, RuleStatus, RulePriority, RuleFilter } from '../src/models/rule'
import type { MistakeLink, LinkType, LinkDirection } from '../src/models/link'
import type { Verification, VerificationResult, VerificationCount } from '../src/models/verification'
import type { Reflection, ReflectionFilter } from '../src/models/reflection'
import {
  VALID_TRANSITIONS,
  RULE_VALID_TRANSITIONS,
  isValidTransition,
  isValidRuleTransition,
} from '../src/models/state-machine'

describe('Models', () => {
  it('Mistake 类型可实例化', () => {
    const m: Mistake = {
      id: 'm_001',
      category: 'intent_weather',
      status: 'pending',
      trigger_type: 'L1',
      recurrence_count: 1,
      context_before: '[]',
      tags: [],
      confidence: 1.0,
      created_at: '2026-04-16T00:00:00Z',
      updated_at: '2026-04-16T00:00:00Z',
    }
    expect(m.id).toBe('m_001')
    expect(m.status).toBe('pending')
  })

  it('MistakeStatus 包含 7 个合法值', () => {
    const statuses: MistakeStatus[] = [
      'pending', 'corrected', 'recurring', 'verified',
      'graduated', 'abandoned', 'false_positive',
    ]
    expect(statuses).toHaveLength(7)
    expect(Object.keys(VALID_TRANSITIONS)).toHaveLength(7)
  })

  it('RuleStatus 包含 4 个合法值', () => {
    const statuses: RuleStatus[] = ['active', 'verified', 'superseded', 'archived']
    expect(statuses).toHaveLength(4)
    expect(Object.keys(RULE_VALID_TRANSITIONS)).toHaveLength(4)
  })

  it('LinkType 包含 4 个合法值', () => {
    const types: LinkType[] = ['same_category', 'causal', 'same_root', 'semantic']
    expect(types).toHaveLength(4)
  })

  it('VALID_TRANSITIONS 包含全部合法流转', () => {
    expect(VALID_TRANSITIONS.pending).toEqual(['corrected', 'abandoned', 'false_positive'])
    expect(VALID_TRANSITIONS.corrected).toEqual(['recurring', 'verified', 'abandoned'])
    expect(VALID_TRANSITIONS.recurring).toEqual(['corrected', 'verified', 'abandoned'])
    expect(VALID_TRANSITIONS.verified).toEqual(['graduated', 'abandoned'])
    expect(VALID_TRANSITIONS.graduated).toEqual([])
    expect(VALID_TRANSITIONS.abandoned).toEqual([])
    expect(VALID_TRANSITIONS.false_positive).toEqual([])
  })

  it('isValidTransition 对合法流转返回 true', () => {
    expect(isValidTransition('pending', 'corrected')).toBe(true)
    expect(isValidTransition('corrected', 'verified')).toBe(true)
    expect(isValidTransition('recurring', 'corrected')).toBe(true)
    expect(isValidTransition('verified', 'graduated')).toBe(true)
  })

  it('isValidTransition 对非法流转返回 false', () => {
    expect(isValidTransition('pending', 'graduated')).toBe(false)
    expect(isValidTransition('graduated', 'pending')).toBe(false)
    expect(isValidTransition('false_positive', 'pending')).toBe(false)
    expect(isValidTransition('abandoned', 'corrected')).toBe(false)
    expect(isValidTransition('corrected', 'pending')).toBe(false)
  })

  it('TriggerType 包含 6 个合法值', () => {
    const types: TriggerType[] = ['L1', 'L2', 'L3', 'L4', 'L5', 'manual']
    expect(types).toHaveLength(6)
  })

  it('MistakeFilter 支持全部查询字段', () => {
    const filter: MistakeFilter = {
      category: 'intent_weather',
      status: 'pending',
      agent_id: 'jarvis',
      date_from: '2026-04-01',
      date_to: '2026-04-16',
      recurrence_min: 2,
      limit: 10,
      offset: 0,
    }
    expect(filter.category).toBe('intent_weather')
    expect(filter.limit).toBe(10)
  })
})
