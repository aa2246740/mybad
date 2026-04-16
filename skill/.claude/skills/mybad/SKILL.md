# MyBad Skill — 自动错题记录

## 什么时候触发

**被动模式**：当用户表达以下信号时，主动调用 MCP 工具记录：

1. **显式否定** — "不对"、"错了"、"不是这个"、"搞错了"
2. **显式修正** — "改成X"、"应该是Y"、"我要的是Z"
3. **手动指令** — "记下来"、"记住这个错误"、"下次别犯"

## 工作流程

### 被纠正时 → correction_capture

当检测到纠正信号时：

```
1. 分析上下文，确定：
   - category: 错误分类（自己判定，用简短英文描述）
   - trigger_type: L1(否定) / L2(修正) / manual(手动)
   - ai_misunderstanding: 你理解成了什么
   - user_intent: 用户实际要什么
   - user_correction: 用户纠正原话

2. 调用 correction_capture 记录

3. 如果返回 recurrence_count > 1：
   - 告诉用户："这个错误已经犯了 {N} 次了，我会注意"
   - 查看是否有相关规则：correction_rule_query(category=...)
```

### 任务开始前 → 预检

当开始一个新任务时：

```
1. 查询相关分类的历史错误：correction_query(category="相关分类")
2. 查询相关规则：correction_rule_query(category="相关分类")
3. 如果有规则，在执行前提醒自己遵守
4. 如果最近犯过同类错误，格外注意
```

### 每日反思 → correction_reflect

每天第一次对话时：

```
1. 调用 correction_reflect() 获取反思数据
2. 如果有 pending 的错题，提醒自己
3. 如果有反复出现的模式，主动提出来
4. 如果可以提炼规则，调用 correction_rule_add
```

### 规则验证

- 这次没犯同样的错 → `correction_rule_verify(result="pass")`
- 又犯了 → `correction_rule_verify(result="fail")`，然后 `correction_capture` 记录

## 分类命名建议

| 领域 | 分类示例 |
|------|---------|
| 意图理解 | intent_weather, intent_balance, intent_navigation |
| 代码风格 | code_naming, code_error_handling, code_types |
| API 使用 | api_params, api_auth, api_pagination |
| 输出格式 | format_json, format_markdown, format_i18n |
| 安全相关 | security_xss, security_injection, security_auth |

分类名用英文蛇形命名，简洁描述问题领域即可。

## 注意事项

- **不要过度记录**：只记录用户明确纠正的情况，不要记录模糊反馈
- **不要重复记录**：同一个纠正只记录一次
- **自己判定分类**：不要问用户"这属于什么分类"，自己分析
- **主动遵守规则**：查到规则后严格执行，不要问用户"要不要遵守"
