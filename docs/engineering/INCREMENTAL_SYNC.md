# AI Email Copilot 增量同步设计

> 本文档由 `docs/architecture/SYSTEM_DESIGN.md` 拆分而来，作为该专题的详细设计文档。
> 系统级背景、设计目标和模块关系请先阅读 `../architecture/SYSTEM_DESIGN.md`。

## 增量同步设计

### 1 MVP 方案：轻量快照检查

用户打开 Dashboard 时，后端检查当前 Digest 的 `coverage_end` 之后是否存在新邮件。

为避免频繁调用 Gmail API，使用 Redis 缓存。

Redis key：

```text
new_mail_check:{mailbox_id}:{digest_id}
```

value 示例：

```json
{
  "checked_at": "2026-06-16T15:00:00+09:00",
  "new_mail_count": 3
}
```

TTL：

```text
60 秒或 120 秒
```

---

### 2 返回示例

```json
{
  "digest_id": "xxx",
  "status": "stale",
  "generated_at": "2026-06-16T09:00:00+09:00",
  "coverage_end": "2026-06-16T09:00:00+09:00",
  "new_mail_count_after_digest": 3
}
```

---

### 3 后续增强

1. Gmail History API 增量同步；
2. Gmail Push Notification；
3. Google Cloud Pub/Sub；
4. 新邮件自动插入看板；
5. 桌面端实时提醒。

MVP 不引入实时推送。

---
