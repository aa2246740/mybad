import { getEngine } from './engine'
import { Command } from 'commander'

export function makeCaptureCommand(): Command {
  return new Command('capture')
    .description('捕捉一条错题')
    .requiredOption('-c, --category <category>', '错误分类')
    .requiredOption('-t, --trigger-type <type>', '触发级别')
    .option('--ai-misunderstanding <text>', 'AI 理解成了什么')
    .option('--user-intent <text>', '用户本意')
    .option('--user-correction <text>', '用户纠正原话')
    .option('--agent-id <id>', 'Agent ID')
    .option('--tags <tags>', '标签（逗号分隔）')
    .option('--confidence <num>', '置信度', '1.0')
    .action(async (opts) => {
      const { engine, adapter } = getEngine()
      try {
        const m = await engine.addMistake({
          category: opts.category, status: 'pending', trigger_type: opts.triggerType,
          context_before: '[]', ai_misunderstanding: opts.aiMisunderstanding,
          user_intent: opts.userIntent, user_correction: opts.userCorrection,
          agent_id: opts.agentId, tags: opts.tags ? opts.tags.split(',') : [],
          confidence: parseFloat(opts.confidence),
        })
        console.log(JSON.stringify({ mistake_id: m.id, category: m.category, recurrence_count: m.recurrence_count, status: m.status }, null, 2))
      } finally { adapter.close() }
    })
}
