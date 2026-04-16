#!/usr/bin/env node
export { createServer, startServer } from './server'
export { tools } from './tools'

// 直接运行时启动 server
if (typeof require !== 'undefined' && require.main === module) {
  import('./server').then(({ startServer }) => startServer())
}
