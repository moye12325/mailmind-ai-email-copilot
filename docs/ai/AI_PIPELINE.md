# AI Email Copilot AI Pipeline 设计

> 本文档由 `docs/architecture/SYSTEM_DESIGN.md` 拆分而来，作为该专题的详细设计文档。
> 系统级背景、设计目标和模块关系请先阅读 `../architecture/SYSTEM_DESIGN.md`。

本文档集中维护 AI 处理链路、LLMClient 接口、标准 JSON 输出、JSON Schema、解析约束、失败策略和 `ai_runs` 追踪要求。

## AI Pipeline 架构

AI 层独立抽象，不散落在业务代码中。

```text
AI Pipeline
  ├── EmailPreprocessor
  │     HTML 清洗、去引用、截断正文、过滤无效字符
  │
  ├── DigestInputBuilder
  │     聚合当日邮件，构造 AI 输入，控制 token 上限
  │
  ├── LLMClient
  │     统一封装 Claude / OpenAI / 本地模型
  │
  ├── StructuredOutputParser
  │     校验 JSON Schema，不合规则重试或降级
  │
  ├── DigestDecisionEngine
  │     将 AI 输出转换为 digest_items
  │
  └── SafetyFilter
        过滤敏感字段，避免 Token / 密码 / API Key 进入输出
```

---

### 1 LLMClient 接口

```python
class LLMClient:
    def generate_digest(self, email_inputs: list[EmailInput]) -> DigestOutput: ...
    def analyze_single_email(self, email: EmailInput) -> EmailAnalysis: ...
```

---

### 2 AI 标准输出结构

```json
{
  "overview": {
    "mail_count": 24,
    "summary": "今天主要是项目协作和系统通知邮件，有 3 封需要今日处理。"
  },
  "items": [
    {
      "email_id": "gmail_xxx",
      "item_type": "email",
      "section": "urgent",
      "title": "Project timeline update",
      "summary": "Alice 通知项目排期发生变化，需要今日确认影响。",
      "category": "work",
      "suggested_action": "review_today",
      "priority": "high",
      "reason": "邮件包含项目排期变更，可能影响当前开发计划。",
      "deadline": "2026-06-16",
      "confidence": 0.88
    },
    {
      "item_type": "todo",
      "section": "todo",
      "title": "确认与 Alice 的会议时间",
      "summary": "需要今天确认会议时间是否可行。",
      "priority": "medium",
      "deadline": "2026-06-16",
      "confidence": 0.81
    },
    {
      "item_type": "risk",
      "section": "risk",
      "title": "Bob 的重要邮件可能未及时回复",
      "summary": "该邮件已经超过 2 天未处理。",
      "priority": "high",
      "reason": "存在延迟回复风险。",
      "confidence": 0.76
    }
  ]
}
```

---

### 3 AI 输出约束

1. 必须输出合法 JSON；
2. `items` 必须是数组；
3. 每条 item 必须包含 `item_type`、`section`、`title`、`priority`、`confidence`；
4. 邮件类 item 必须尽量关联 `email_id`；
5. `confidence` 范围为 `0.0 ~ 1.0`；
6. `deadline` 使用 `YYYY-MM-DD` 或 `null`；
7. 解析失败时允许重试；
8. 多次失败后记录 `ai_runs.status = failed`，并走降级流程。

---

### 4 JSON Schema（MVP 最小版）

```json
{
  "type": "object",
  "required": ["overview", "items"],
  "properties": {
    "overview": {
      "type": "object",
      "required": ["mail_count", "summary"],
      "properties": {
        "mail_count": { "type": "integer", "minimum": 0 },
        "summary": { "type": "string", "minLength": 1 }
      },
      "additionalProperties": false
    },
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["item_type", "section", "title", "priority", "confidence"],
        "properties": {
          "email_id": { "type": ["string", "null"] },
          "item_type": { "type": "string", "enum": ["email", "todo", "risk"] },
          "section": { "type": "string", "enum": ["urgent", "review", "ignore", "todo", "risk"] },
          "title": { "type": "string", "minLength": 1 },
          "summary": { "type": ["string", "null"] },
          "category": { "type": ["string", "null"], "enum": ["work", "notification", "marketing", "social", "other", null] },
          "suggested_action": { "type": ["string", "null"] },
          "priority": { "type": "string", "enum": ["high", "medium", "low"] },
          "reason": { "type": ["string", "null"] },
          "deadline": { "type": ["string", "null"] },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
        },
        "additionalProperties": false
      }
    }
  },
  "additionalProperties": false
}
```

### 5 失败重试与降级策略

1. 单次 AI 任务最多重试 2 次，总尝试次数最多 3 次；
2. 第 1 次失败后可立即重试；第 2 次失败后退避 5 秒；
3. 若仍失败，写入 `ai_runs.status = failed` 与错误摘要；
4. `daily_digest` 失败时，前端降级展示原始邮件列表或上一版成功 Digest；
5. `new_mail_preview` 失败时，允许返回新邮件列表但不附带 AI 预览。

---
