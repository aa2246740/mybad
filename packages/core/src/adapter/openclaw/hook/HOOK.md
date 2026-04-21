---
name: mybad
description: "myBad 纠错记忆系统 — 自动注入纠正规则和检测指令到 Agent 上下文"
version: 1.0.0
hooks:
  agent:bootstrap:
    handler: handler.handler
    description: "在 Agent 启动时注入 myBad 规则和纠正检测指令"
---
