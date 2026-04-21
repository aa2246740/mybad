---
name: mybad
description: myBad 错题记录 + Coach 教练系统。当用户纠正你的错误、否定你的做法、或明确说"记下来"、"错了"、"不对"时触发记录。当用户说"分析错误"、"mybad coach"、"看看犯过什么错"时触发 Coach 分析。当新 session 开始时，检查是否有 pending 的 Coach 推荐需要用户确认。这是一个让 Agent 从错误中学习的系统——记录纠正、发现模式、把教训焊进流程文件。
---

# myBad — 错题记录 + Coach 教练

myBad 让你从错误中学习。它有两层能力：

1. **记录层**：当用户纠正你时，捕捉错误并存储
2. **教练层**：分析反复出现的错误模式，把教训写入你读的流程文件

**核心原则：如果某个东西不在你的上下文里，它就不存在。** Coach 不在运行时教你，它改的是你下次运行时面对的文件。

## 何时触发

### 记录触发（检测到纠正信号时）

这些信号出现时，你应该主动调用 MCP 工具 `correction_capture` 记录：

- **显式否定**：用户说"不对"、"错了"、"搞错了"、"不是这个"、"重做"
- **显式修正**：用户说"改成X"、"应该是Y"、"我要的是Z"、"用url不用title"
- **手动指令**：用户说"记下来"、"记住这个错误"、"下次别犯"、"mybad记一下"

### Coach 触发

- **用户主动**：用户说"mybad coach"、"分析我的错误"、"看看有什么模式"、"总结犯过的错"
- **新 session 开始**：检查是否有等待确认的 Coach 推荐（见下方流程）

## 记录层工作流程

### 被纠正时

1. 分析上下文，确定以下字段：
   - `category`：错误分类（自己判定，英文蛇形命名，如 `api_params`、`intent_weather`）
   - `trigger_type`：`L1`（否定）/ `L2`（修正）/ `manual`（手动）
   - `ai_misunderstanding`：你理解成了什么
   - `user_intent`：用户实际要什么
   - `user_correction`：用户纠正原话
2. 调用 MCP 工具 `correction_capture`，传入上述参数
3. 如果返回的 `recurrence_count > 1`，告诉用户："这个错误已经犯了 N 次了，我会注意"

### 任务开始前

1. 调用 `correction_query` 查询相关分类的历史错误
2. 调用 `correction_rule_query` 查询相关规则
3. 如果有规则，严格执行，不要问用户"要不要遵守"

## Coach 层工作流程

### 新 session 开始时

1. 调用 `correction_coach_applied`（无参数）获取已应用的规则
2. 如果有规则，在执行任何任务前自我提醒遵守
3. 调用 `correction_coach_pending`（无参数）检查待确认推荐
4. 如果有 pending 推荐，在任务间隙告诉用户：

```
之前你对 [category] 纠正了 [N] 次，Coach 建议如下：

"[suggested_rule]"

准备写入 [target_file_type]。你觉得对吗？
```

5. 用户确认 → 调用 `correction_coach_confirm(recommendation_id, "confirm")` → 修改目标文件
6. 用户拒绝 → 调用 `correction_coach_confirm(recommendation_id, "reject")`

### 用户触发 Coach 分析时

1. 调用 `correction_coach` 分析，可以传入 `targets` 列表（当前项目的 SOP/skill 文件）
2. 分析结果会返回：
   - `auto_applied`：已自动标记的可应用推荐 → 直接写入目标文件
   - `pending_confirmation`：需要用户确认的模糊推荐 → 下次 session 提醒
3. 对 `auto_applied` 的推荐，修改目标文件，插入格式：
   ```
   <!-- mybad:auto rule:[category] -->
   [suggested_rule]
   <!-- /mybad:auto -->
   ```

### 目标文件扫描

调用 `correction_coach` 时，扫描当前项目并传入 targets：

```
targets: [
  { type: 'CLAUDE.md', path: 'CLAUDE.md', description: '项目级 Agent 指令' },
  { type: 'skill', path: '.claude/skills/xxx/SKILL.md', description: '技能描述' },
  ...其他相关文件
]
```

Coach 会根据 category 和文件描述匹配最合适的目标。

## 分类命名参考

| 领域 | 示例 |
|------|------|
| 意图理解 | intent_weather, intent_balance |
| 代码风格 | code_naming, code_error_handling |
| API 使用 | api_params, api_auth |
| 数据处理 | data_dedup, data_fetch |
| 输出格式 | format_json, format_markdown |

## 灰区：这些情况不要触发记录

myBad 只记录 Agent 本可以避免的错误。以下场景虽然看起来像纠正，但不应该触发 `correction_capture`：

- **用户报告已有代码的 bug** — "这段代码第42行有 bug" → 这是讨论代码库，不是纠正你的输出
- **用户补充或澄清需求** — "哦我忘了说，还需要支持 dark mode" → 是新信息，不是你犯错
- **需求本身有歧义** — "我说的是 API 的 url 不是前端的 url" → 你无法事先知道，不是你的错
- **用户纠正自己的指令** — "等等我之前说错了，应该是..." → 用户在改主意，不是你犯错
- **偏好或风格选择** — "我不喜欢这个颜色，换一个" → 主观偏好，没有对错
- **探索性尝试** — "试试另一种方式" → 没有否定，只是探索
- **搜索结果不准确** — "你搜到的那个资料不对" → 搜索天然有不确定性，不是你判断失误
- **用户提供上下文** — "这个项目用的是 Vue 不是 React" → 你之前不知道是正常的

**判断标准**：你是否本可以避免这个错误？如果缺少信息、需求有歧义、或用户在改主意，那就不算你的错。

如果实在判断不了，宁可记录——多记一条只是让你更了解用户，漏记则意味着无法从错误中学习。

## 注意事项

- 不要过度记录——只记录用户明确纠正你（Agent）的情况
- 不要重复记录——同一个纠正只记录一次
- 自己判定分类——不要问用户"这属于什么分类"
- Coach 不制造答案——它搬运用户的纠正，安置到流程文件里
- 用户拒绝的推荐不要反复推荐
