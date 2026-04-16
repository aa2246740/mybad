import type { StorageAdapter } from '../storage/adapter'
import type { MistakeLink, LinkType, LinkDirection } from '../models/link'

/** 关联引擎 — 错题之间的正向/反向/递归关联查询 */
export class LinkerEngine {
  constructor(private storage: StorageAdapter) {}

  /** 建立关联，幂等（重复不报错） */
  async addLink(fromId: string, toId: string, type: LinkType, confidence: number = 1.0): Promise<void> {
    await this.storage.addLink(fromId, toId, type, confidence)
  }

  /** 获取直接关联 */
  async getLinks(id: string, direction: LinkDirection = 'outbound'): Promise<MistakeLink[]> {
    return this.storage.getLinks(id, direction)
  }

  /** 获取多度关联（递归查询） */
  async getRelated(id: string, depth: number = 2): Promise<MistakeLink[]> {
    return this.storage.getRelated(id, depth)
  }
}
