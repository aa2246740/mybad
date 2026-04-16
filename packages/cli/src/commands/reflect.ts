import { getEngine } from './engine'
import { Command } from 'commander'

export function makeReflectCommand(): Command {
  return new Command('reflect')
    .description('获取结构化反思数据')
    .option('--date-from <date>', '起始日期')
    .option('--date-to <date>', '截止日期')
    .option('--min-recurrence <n>', '最小复发次数')
    .action(async (opts) => {
      const { engine, adapter } = getEngine()
      try {
        const data = await engine.getReflectionData({
          dateFrom: opts.dateFrom, dateTo: opts.dateTo,
          minRecurrence: opts.minRecurrence ? parseInt(opts.minRecurrence) : undefined,
        })
        console.log(JSON.stringify(data, null, 2))
      } finally { adapter.close() }
    })
}
