import { getEngine } from './engine'
import { Command } from 'commander'

export function makeSearchCommand(): Command {
  return new Command('search')
    .description('全文搜索错题')
    .requiredOption('-q, --query <text>', '搜索关键词')
    .option('-l, --limit <n>', '返回数量', '20')
    .action(async (opts) => {
      const { engine, adapter } = getEngine()
      try {
        const results = await engine.searchMistakes(opts.query, parseInt(opts.limit))
        console.log(JSON.stringify({ total: results.length, mistakes: results }, null, 2))
      } finally { adapter.close() }
    })
}
