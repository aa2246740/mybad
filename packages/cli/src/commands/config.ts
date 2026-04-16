import { getEngine } from './engine'
import { Command } from 'commander'

export function makeConfigCommand(): Command {
  const cmd = new Command('config')
  cmd.description('配置管理')

  cmd.command('get')
    .requiredOption('-k, --key <key>', '配置键名')
    .action(async (opts) => {
      const { engine, adapter } = getEngine()
      try {
        const value = await engine.crud['storage'].getConfig(opts.key)
        console.log(JSON.stringify({ key: opts.key, value }, null, 2))
      } finally { adapter.close() }
    })

  cmd.command('set')
    .requiredOption('-k, --key <key>', '配置键名')
    .requiredOption('-v, --value <value>', '配置值')
    .action(async (opts) => {
      const { engine, adapter } = getEngine()
      try {
        await engine.crud['storage'].setConfig(opts.key, opts.value)
        console.log(JSON.stringify({ success: true }, null, 2))
      } finally { adapter.close() }
    })

  return cmd
}
