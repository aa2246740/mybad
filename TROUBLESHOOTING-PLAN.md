# MyBad 问题处理预案

## 收到问题后的处理流程

### Step 1: 分类（5 分钟内）

收到用户发来的问题描述后，立即分类：

| 类别 | 特征 | 处理方式 |
|------|------|---------|
| **安装问题** | npm install 失败、node-gyp 报错 | 提供针对性修复命令 |
| **MCP 连接问题** | Agent 看不到工具、连接超时 | 检查路径配置、测试 MCP Server |
| **数据问题** | 数据丢失、计数不对、搜索无结果 | 要求发送 db 文件分析 |
| **功能缺失** | 某个功能不工作 | 确认是否是 bug，给 workaround |
| **体验问题** | 不好用、缺功能 | 记录需求，排入 v0.2 |

### Step 2: 快速诊断命令

让用户运行这些命令，把输出发给我：

```bash
# 1. 基本环境
node -v
npm -v
uname -a  # macOS/Linux

# 2. 安装验证
ls -la ~/mybad-install/node_modules/@mybad/

# 3. CLI 测试
cd ~/mybad-install && npx mybad --help
npx mybad stats

# 4. MCP Server 手动测试
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' | node ~/mybad-install/node_modules/@mybad/mcp-server/dist/index.cjs

# 5. 数据库完整性
ls -la ~/.mybad/
file ~/.mybad/mybad.db
```

### Step 3: 按类别处理

#### 安装类问题

**better-sqlite3 编译失败**：
```bash
# 需要的系统依赖
# macOS: xcode-select --install
# Ubuntu: sudo apt install build-essential python3
# Windows: npm install --global windows-build-tools

# 确认 Node 20+
node -v  # 需要 >= 20.0.0
```

**workspace 协议问题**（从源码安装时）：
- mcp-server 和 cli 的 package.json 中 `@mybad/core: "workspace:*"` 在非 workspace 环境下无效
- tarball 版本已自动替换为具体版本号，不受影响

#### MCP 连接类问题

**Agent 看不到工具**：
1. 确认 args 路径指向 `.cjs` 文件
2. 确认路径中没有空格或中文
3. 在终端手动运行 MCP Server 看报错
4. 检查 MYBAD_DB_PATH 目录是否有写权限

**MCP Server 启动后立即退出**：
- 可能是数据库路径不存在：`mkdir -p ~/.mybad`
- 可能是权限问题：`chmod 755 ~/.mybad`

#### 数据类问题

**recurrence_count 不对**：
- 让用户发数据库文件
- 用 SQLite 工具检查：`sqlite3 ~/.mybad/mybad.db "SELECT category, COUNT(*), MAX(recurrence_count) FROM mistakes GROUP BY category"`

**搜索搜不到**：
- FTS5 中文分词限制，试试单字搜索
- 检查 FTS 是否同步：`sqlite3 ~/.mybad/mybad.db "SELECT COUNT(*) FROM mistakes_fts"`

### Step 4: 修复策略

| 问题严重程度 | 修复方式 | 时间 |
|-------------|---------|------|
| 文档/配置错误 | 直接改文档 | 5 分钟 |
| CLI 参数解析 bug | 改命令文件，重新 build | 15 分钟 |
| MCP 工具返回格式问题 | 改 tools.ts | 15 分钟 |
| 存储层 bug | 改 storage/*.ts + 加测试 | 30 分钟 |
| 引擎层逻辑错误 | 改 engine/*.ts + 加测试 | 1 小时 |
| 架构级问题 | 讨论后决定 | 视情况 |

### Step 5: 发送修复

修复后重新 build 并打包：
```bash
cd /path/to/mybad
pnpm build
cd packages/core && npm pack --pack-destination ../../dist-pack
cd ../mcp-server && npm pack --pack-destination ../../dist-pack
cd ../cli && npm pack --pack-destination ../../dist-pack
```

把新的 tgz 文件发给用户，告诉他们：
```bash
cd ~/mybad-install
npm install ./mybad-core-0.1.0.tgz --force
npm install ./mybad-mcp-server-0.1.0.tgz --force
npm install ./mybad-cli-0.1.0.tgz --force
```

---

## 预防措施

### 测试用户反馈收集点

重点观察：
1. **首次安装成功率** — 安装过程是否有报错
2. **MCP 连接成功率** — Agent 是否能看到全部 11 个工具
3. **correction_capture 调用** — 第一次捕捉是否正常返回
4. **中文搜索体验** — FTS5 中文搜索是否够用
5. **recurrence 自动计数** — 同类错误第二次是否自动 +1
6. **规则提炼流程** — 从错题到规则的完整流程是否通顺

### v0.2 规划（基于测试反馈）

可能需要加入：
- jieba 中文分词
- 自动反思定时器
- 数据导出 JSON
- Agent ID 自动检测
- 错误分类 AI 辅助建议
