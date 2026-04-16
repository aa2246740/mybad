import { getEngine } from './engine'
import { Command } from 'commander'

export function makeRuleCommand(): Command {
  const cmd = new Command('rule')
  cmd.description('规则管理')

  cmd.command('add')
    .description('添加规则')
    .requiredOption('-c, --category <category>', '分类')
    .requiredOption('-r, --rule-text <text>', '规则文本')
    .option('-s, --source-ids <ids>', '来源错题 IDs（逗号分隔）')
    .option('-p, --priority <priority>', '优先级', 'normal')
    .action(async (opts) => {
      const { engine, adapter } = getEngine()
      try {
        const rule = await engine.addRule({
          category: opts.category, rule_text: opts.ruleText, priority: opts.priority,
          status: 'active', source_ids: opts.sourceIds ? opts.sourceIds.split(',') : [],
        })
        console.log(JSON.stringify({ success: true, rule_id: rule.id }, null, 2))
      } finally { adapter.close() }
    })

  cmd.command('verify')
    .description('验证规则')
    .requiredOption('-r, --rule-id <id>', '规则 ID')
    .requiredOption('--result <result>', '结果 (pass|fail)')
    .option('--context <text>', '验证场景')
    .action(async (opts) => {
      const { engine, adapter } = getEngine()
      try {
        await engine.addVerification({
          rule_id: opts.ruleId, result: opts.result, context: opts.context,
          verified_at: new Date().toISOString(),
        })
        console.log(JSON.stringify({ success: true }, null, 2))
      } finally { adapter.close() }
    })

  cmd.command('list')
    .description('列出规则')
    .option('-c, --category <category>', '按分类过滤')
    .option('-s, --status <status>', '按状态过滤')
    .action(async (opts) => {
      const { engine, adapter } = getEngine()
      try {
        const rules = await engine.getRules({ category: opts.category, status: opts.status })
        console.log(JSON.stringify({ total: rules.length, rules }, null, 2))
      } finally { adapter.close() }
    })

  return cmd
}
