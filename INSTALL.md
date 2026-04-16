# MyBad 私有测试版 — 安装和集成指南

## 系统要求

- Node.js 20+ LTS
- 支持 macOS / Linux / Windows
- 不需要网络，完全离线运行

## 安装方式

### 方式 A：从 tarball 安装（推荐，给另一台电脑用）

把 `dist-pack/` 目录下的三个文件拷贝到目标机器：

```
mybad-core-0.1.0.tgz
mybad-mcp-server-0.1.0.tgz
mybad-cli-0.1.0.tgz
```

在目标机器上执行：

```bash
# 创建一个安装目录
mkdir -p ~/mybad-install && cd ~/mybad-install

# 把三个 tgz 文件放进来，然后：
npm init -y
npm install ./mybad-core-0.1.0.tgz
npm install ./mybad-mcp-server-0.1.0.tgz
npm install ./mybad-cli-0.1.0.tgz

# 验证安装
npx mybad --help
```

### 方式 B：从源码安装

```bash
cd /path/to/mybad
pnpm install
pnpm build
```

## 数据库位置

默认位置：`~/.mybad/mybad.db`

可通过环境变量自定义：
```bash
export MYBAD_DB_PATH="/custom/path/mybad.db"
```

首次使用会自动创建数据库和全部表。

---

## Agent 集成

### 1. Claude Code 集成

在 Claude Code 的 MCP 配置中添加（编辑 `~/.claude/mcp.json` 或项目级 `.claude/mcp.json`）：

```json
{
  "mcpServers": {
    "mybad": {
      "command": "node",
      "args": ["/path/to/mybad-install/node_modules/@mybad/mcp-server/dist/index.cjs"],
      "env": {
        "MYBAD_DB_PATH": "~/.mybad/mybad.db"
      }
    }
  }
}
```

或者配合 MyBad Skill 使用（见下方 Skill 部分）。

### 2. Hermes Agent 集成

在 Hermes 的 MCP 配置文件中添加 mybad server：

```json
{
  "mcp": {
    "servers": {
      "mybad": {
        "command": "node",
        "args": ["/path/to/node_modules/@mybad/mcp-server/dist/index.cjs"],
        "env": {
          "MYBAD_DB_PATH": "~/.mybad/hermes-mybad.db"
        }
      }
    }
  }
}
```

Hermes 可用的工具：
- **`correction_capture`** — Hermes 检测到用户纠正时调用
- **`correction_query`** — 执行任务前查一下历史同类错误
- **`correction_search`** — 模糊搜索
- **`correction_stats`** — 查看全局学习进度

### 3. OpenClaw (Jarvis) 集成

在 OpenClaw 的 skills/MCP 配置中添加：

```json
{
  "mybad": {
    "command": "node",
    "args": ["/path/to/node_modules/@mybad/mcp-server/dist/index.cjs"],
    "env": {
      "MYBAD_DB_PATH": "~/.mybad/jarvis-mybad.db"
    }
  }
}
```

### 推荐的 Agent 工作流

```
1. 任务开始前
   → correction_query(category="相关分类") 看有没有历史错误
   → correction_rule_query(category="相关分类") 看有没有规则要遵守

2. 被纠正时
   → correction_capture({
       category: "你判定的分类",
       trigger_type: "L1/L2/manual",
       ai_misunderstanding: "你理解成了什么",
       user_intent: "用户实际要什么",
       user_correction: "用户纠正原话"
     })

3. 每日反思
   → correction_reflect() 获取反思数据
   → 用你自己的 LLM 分析，提炼规则
   → correction_rule_add() 保存规则

4. 规则验证
   → 这次没犯同样的错 → correction_rule_verify(result="pass")
   → 又犯了 → correction_rule_verify(result="fail")
```

---

## CLI 快速测试

```bash
# 捕捉一条错题
mybad capture -c "intent_weather" -t L1 --user-correction "不是余额，是天气"

# 查询所有错题
mybad query

# 按分类查询
mybad query -c "intent_weather"

# 全文搜索
mybad search -q "天气"

# 看统计
mybad stats

# 添加规则
mybad rule add -c "intent_weather" -r "用户说天气就是查天气，不是查余额"

# 验证规则
mybad rule verify -r <rule_id> --result pass

# 列出规则
mybad rule list

# 配置
mybad config get -k version
mybad config set -k auto_reflect -v true
```

---

## 故障排查

### 问题 1: `node-gyp` 编译失败

**症状**: `npm install` 报 node-gyp / python / xcodebuild 错误

**解决**:
```bash
# macOS
xcode-select --install

# 确保 Node.js 20+
node -v

# 清除缓存重装
rm -rf node_modules package-lock.json
npm install
```

### 问题 2: MCP Server 启动报错 `Cannot find module`

**症状**: `Error: Cannot find module '@mybad/core'`

**解决**: 确保三个包都安装了，core 要先于 mcp-server 安装：
```bash
npm install ./mybad-core-0.1.0.tgz
npm install ./mybad-mcp-server-0.1.0.tgz
```

### 问题 3: 数据库锁定 `SQLITE_BUSY`

**症状**: `database is locked`

**解决**: MyBad 已配置 WAL 模式和 busy_timeout=5000ms。如果仍然出现，确保没有其他进程同时写同一个 db 文件。不同 Agent 用不同的 db 文件（见上面的 MYBAD_DB_PATH 配置）。

### 问题 4: 中文搜索搜不到

**症状**: `correction_search` 搜中文关键词没结果

**解决**: FTS5 使用 unicode61 分词器，中文按字符分词。搜"天气"试试搜"天"或"气"。这是已知限制，后续版本可加 jieba 分词。

### 问题 5: MCP 工具列表为空

**症状**: Agent 看不到 mybad 的工具

**解决**:
1. 检查 MCP 配置中 command 路径是否正确
2. 手动测试 MCP Server:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' | node /path/to/mcp-server/dist/index.cjs
```
3. 检查 MYBAD_DB_PATH 是否有写权限

---

## 问题报告模板

遇到问题请复制以下模板填写后发给我：

```
## MyBug 报告

**环境**:
- 操作系统: macOS / Linux / Windows
- Node.js 版本: (node -v 的输出)
- Agent 名称: Claude Code / Hermes / OpenClaw
- 安装方式: tarball / 源码

**问题描述**:
[一句话描述发生了什么]

**复现步骤**:
1. ...
2. ...

**错误信息**:
```
[贴完整的错误日志]
```

**数据库状态**:
```bash
mybad stats  # 贴输出
```

**Agent 配置**:
[贴 MCP 配置 JSON]
```

---

## 已知限制（v0.1）

| 限制 | 说明 | 计划 |
|------|------|------|
| 中文分词精度 | unicode61 按字符分词，模糊搜索 | v0.2 加 jieba |
| 无自动反思 | 需 Agent 主动调用 correction_reflect | v0.2 加定时触发 |
| 单机版 | 数据不能跨机器同步 | v0.3 加导出/导入 |
| 无 REST API | 只有 MCP + CLI | v2 加 HTTP Server |

---

*MyBad v0.1.0 私有测试版 — 2026-04-16*
