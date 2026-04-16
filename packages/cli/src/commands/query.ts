import { getEngine } from './engine'
import { Command } from 'commander'

export function makeQueryCommand(): Command {
  return new Command('query')
    .description('查询错题')
    .option('-c, --category <category>', '按分类过滤')
    .option('-s, --status <status>', '按状态过滤')
    .option('-a, --agent-id <id>', '按 Agent 过滤')
    .option('--date-from <date>', '起始日期')
    .option('--date-to <date>', '截止日期')
    .option('--limit <n>', '返回数量', '20')
    .action(async (opts) => {
      const { engine, adapter } = getEngine()
      try {
        const results = await engine.queryMistakes({
          category: opts.category, status: opts.status, agent_id: opts.agentId,
          date_from: opts.dateFrom, date_to: opts.dateTo, limit: parseInt(opts.limit),
        })
        console.log(JSON.stringify({ total: results.length, mistakes: results }, null, 2))
      } finally { adapter.close() }
    })
}
