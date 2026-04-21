import { Command } from 'commander'
import { makeCaptureCommand } from './commands/capture'
import { makeQueryCommand } from './commands/query'
import { makeLinkCommand } from './commands/link'
import { makeRuleCommand } from './commands/rule'
import { makeReflectCommand } from './commands/reflect'
import { makeStatsCommand } from './commands/stats'
import { makeSearchCommand } from './commands/search'
import { makeConfigCommand } from './commands/config'
import { makeDashboardCommand } from './commands/dashboard'
import { makeInitCommand } from './commands/init'
import { makeRegisterCommand } from './commands/register'
import { makeCoachCommand } from './commands/coach'

const program = new Command()
program
  .name('mybad')
  .description('MyBad — AI Agent 错题集命令行工具')
  .version('0.1.0')

program.addCommand(makeCaptureCommand())
program.addCommand(makeQueryCommand())
program.addCommand(makeLinkCommand())
program.addCommand(makeRuleCommand())
program.addCommand(makeReflectCommand())
program.addCommand(makeStatsCommand())
program.addCommand(makeSearchCommand())
program.addCommand(makeConfigCommand())
program.addCommand(makeDashboardCommand())
program.addCommand(makeInitCommand())
program.addCommand(makeRegisterCommand())
program.addCommand(makeCoachCommand())

program.parse()
