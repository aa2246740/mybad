import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { SQLiteAdapter, MyBadEngine } from '@mybad/core'
import { tools } from './tools'

export interface MyBadMCPOptions {
  dbPath?: string
}

/** 创建 MCP Server */
export function createServer(options: MyBadMCPOptions = {}) {
  const dbPath = options.dbPath ?? process.env.MYBAD_DB_PATH ?? '~/.mybad/mybad.db'

  const adapter = new SQLiteAdapter(dbPath)
  const engine = new MyBadEngine(adapter)

  const server = new Server(
    { name: 'mybad-mcp-server', version: '0.1.0' },
    { capabilities: { tools: {} } }
  )

  // 注册工具列表
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }))

  // 注册工具调用
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find(t => t.name === request.params.name)
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
        isError: true,
      }
    }

    try {
      const result = await tool.handler(engine, request.params.arguments ?? {})
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      }
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }],
        isError: true,
      }
    }
  })

  return { server, adapter, engine }
}

/** 启动 MCP Server (stdio) */
export async function startServer(options: MyBadMCPOptions = {}) {
  const { server, adapter } = createServer(options)
  const transport = new StdioServerTransport()
  await server.connect(transport)

  // 优雅关闭
  const cleanup = () => {
    try { adapter.close() } catch {}
    process.exit(0)
  }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
}
