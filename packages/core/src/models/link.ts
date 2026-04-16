/** 关联类型 */
export type LinkType = 'same_category' | 'causal' | 'same_root' | 'semantic'

/** 查询方向 */
export type LinkDirection = 'inbound' | 'outbound' | 'both'

/** 错题关联 */
export interface MistakeLink {
  from_id: string
  to_id: string
  link_type: LinkType
  confidence: number
  created_at: string
}
