import { getEngine } from './engine'
import { Command } from 'commander'

export function makeLinkCommand(): Command {
  return new Command('link')
    .description('关联两条错题')
    .requiredOption('-f, --from-id <id>', '源错题 ID')
    .requiredOption('-t, --to-id <id>', '目标错题 ID')
    .requiredOption('-l, --link-type <type>', '关联类型')
    .option('--confidence <num>', '置信度', '1.0')
    .action(async (opts) => {
      const { engine, adapter } = getEngine()
      try {
        await engine.addLink(opts.fromId, opts.toId, opts.linkType, parseFloat(opts.confidence))
        console.log(JSON.stringify({ success: true }, null, 2))
      } finally { adapter.close() }
    })
}
