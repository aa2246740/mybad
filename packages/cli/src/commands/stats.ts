import { getEngine } from './engine'
import { Command } from 'commander'

export function makeStatsCommand(): Command {
  return new Command('stats')
    .description('获取统计数据')
    .option('-a, --agent-id <id>', '按 Agent 过滤')
    .option('--date-from <date>', '起始日期')
    .option('--date-to <date>', '截止日期')
    .action(async (opts) => {
      const { engine, adapter } = getEngine()
      try {
        const [catStats, overall] = await Promise.all([
          engine.getCategoryStats(opts.agentId),
          engine.getOverallStats(opts.agentId, opts.dateFrom || opts.dateTo ? { from: opts.dateFrom, to: opts.dateTo } : undefined),
        ])
        console.log(JSON.stringify({ overall, by_category: catStats }, null, 2))
      } finally { adapter.close() }
    })
}
