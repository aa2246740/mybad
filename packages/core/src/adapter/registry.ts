/**
 * myBad v2 — 适配器注册中心
 *
 * 管理平台适配器的注册和查找。
 * 每个 Agent 平台需要注册三个适配器：Capture、Write、Read。
 */

import type {
  CaptureAdapter,
  WriteAdapter,
  ReadAdapter,
  AgentPlatform,
} from './types'

/** 一个平台的完整适配器套件 */
export interface AdapterSuite {
  capture: CaptureAdapter
  write: WriteAdapter
  read: ReadAdapter
}

/**
 * 适配器注册中心
 *
 * 用法：
 *   const registry = new AdapterRegistry()
 *   registry.registerSuite(
 *     'claude-code',
 *     new ClaudeCodeCapture(),
 *     new ClaudeCodeWrite(),
 *     new ClaudeCodeRead(),
 *   )
 *
 *   const suite = registry.getSuite('claude-code')
 */
export class AdapterRegistry {
  private captureAdapters = new Map<AgentPlatform, CaptureAdapter>()
  private writeAdapters = new Map<AgentPlatform, WriteAdapter>()
  private readAdapters = new Map<AgentPlatform, ReadAdapter>()

  /** 注册捕获适配器 */
  registerCapture(platform: AgentPlatform, adapter: CaptureAdapter): void {
    this.captureAdapters.set(platform, adapter)
  }

  /** 注册写入适配器 */
  registerWrite(platform: AgentPlatform, adapter: WriteAdapter): void {
    this.writeAdapters.set(platform, adapter)
  }

  /** 注册读取适配器 */
  registerRead(platform: AgentPlatform, adapter: ReadAdapter): void {
    this.readAdapters.set(platform, adapter)
  }

  /**
   * 一次性注册一个平台的三个适配器
   * @param platform 目标平台
   * @param capture 捕获适配器
   * @param write 写入适配器
   * @param read 读取适配器
   */
  registerSuite(
    platform: AgentPlatform,
    capture: CaptureAdapter,
    write: WriteAdapter,
    read: ReadAdapter,
  ): void {
    this.registerCapture(platform, capture)
    this.registerWrite(platform, write)
    this.registerRead(platform, read)
  }

  /** 获取指定平台的完整适配器套件 */
  getSuite(platform: AgentPlatform): AdapterSuite | null {
    const capture = this.captureAdapters.get(platform)
    const write = this.writeAdapters.get(platform)
    const read = this.readAdapters.get(platform)

    if (!capture || !write || !read) return null

    return { capture, write, read }
  }

  /** 获取指定平台的捕获适配器 */
  getCapture(platform: AgentPlatform): CaptureAdapter | undefined {
    return this.captureAdapters.get(platform)
  }

  /** 获取指定平台的写入适配器 */
  getWrite(platform: AgentPlatform): WriteAdapter | undefined {
    return this.writeAdapters.get(platform)
  }

  /** 获取指定平台的读取适配器 */
  getRead(platform: AgentPlatform): ReadAdapter | undefined {
    return this.readAdapters.get(platform)
  }

  /** 获取所有已注册的平台 */
  getRegisteredPlatforms(): AgentPlatform[] {
    const platforms = new Set<AgentPlatform>()
    for (const key of this.captureAdapters.keys()) platforms.add(key)
    for (const key of this.writeAdapters.keys()) platforms.add(key)
    for (const key of this.readAdapters.keys()) platforms.add(key)
    return Array.from(platforms)
  }

  /** 检查指定平台是否完整注册了三个适配器 */
  isPlatformComplete(platform: AgentPlatform): boolean {
    return (
      this.captureAdapters.has(platform) &&
      this.writeAdapters.has(platform) &&
      this.readAdapters.has(platform)
    )
  }

  /** 移除指定平台的所有适配器 */
  unregister(platform: AgentPlatform): void {
    this.captureAdapters.delete(platform)
    this.writeAdapters.delete(platform)
    this.readAdapters.delete(platform)
  }
}
