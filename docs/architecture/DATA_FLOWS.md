# MailMind 核心数据流

> 本文档由 `docs/architecture/SYSTEM_DESIGN.md` 拆分而来，作为该专题的详细设计文档。
> 系统级背景、设计目标和模块关系请先阅读 `../architecture/SYSTEM_DESIGN.md`。

## 核心数据流

### 1 用户注册 / 登录流程

```text
用户注册 / 登录
        ↓
后端校验账号密码
        ↓
创建 session
        ↓
设置 HttpOnly Cookie
        ↓
用户进入 Dashboard
```

---

### 2 Gmail 首次授权流程

```text
用户登录系统
        ↓
进入 Settings / Mailboxes
        ↓
点击连接 Gmail
        ↓
后端生成 Google OAuth 授权链接
        ↓
用户完成 Gmail 授权
        ↓
Google 回调 /api/auth/gmail/callback
        ↓
后端换取 access_token / refresh_token
        ↓
使用 APP_ENCRYPTION_KEY 加密 refresh_token
        ↓
写入 mailboxes
        ↓
写入 mailbox_credentials
        ↓
触发 sync_today_emails
        ↓
同步完成后触发 generate_daily_digest
        ↓
首页展示今日 AI 决策看板
```

---

### 3 今日邮件同步流程

```text
sync_today_emails(mailbox_id)
        ↓
读取 mailbox_credentials
        ↓
解密 refresh_token
        ↓
检查 access_token 是否存在或过期
        ↓
必要时刷新 access_token
        ↓
业务层根据 users.timezone 计算 digest_date 的本地时间窗口
        ↓
将本地窗口转换为 UTC window_start / window_end
        ↓
调用 GmailProvider.list_messages_for_window(mailbox, window_start, window_end)
        ↓
批量获取邮件详情
        ↓
EmailPreprocessor 清洗正文
        ↓
本地按 received_at 二次过滤
        ↓
写入 emails 表
        ↓
更新 mailboxes.last_sync_at
        ↓
更新 sync_jobs
```

窗口规则：

1. 业务层根据 `users.timezone` 计算 `digest_date` 的本地自然日窗口；
2. 业务层将本地窗口转换为 UTC `window_start` / `window_end`；
3. Provider 只接收 `window_start` / `window_end`，不负责判断“今天”；
4. Provider 返回候选邮件后，本地再根据 `received_at` 做二次过滤；
5. 不使用 Provider 侧“今日”快捷方法。

---

### 4 Daily Digest 生成流程

```text
用户手动生成 / 定时任务触发 / Gmail 授权后自动触发
        ↓
创建 sync_job
        ↓
查询今日已同步邮件
        ↓
创建 daily_digests 新版本，status = generating，is_current = false
        ↓
创建 ai_runs，status = running
        ↓
DigestInputBuilder 构造 AI 输入
        ↓
LLMClient 调用 AI 模型
        ↓
StructuredOutputParser 校验 JSON Schema
        ↓
DigestDecisionEngine 生成 digest_items
        ↓
写入 ai_runs.output_json
        ↓
写入 digest_items
        ↓
开启事务
        ↓
锁定同一 mailbox_id + digest_date 下的旧 current digest
        ↓
将旧 current digest 的 is_current 设置为 false
        ↓
将新 digest 的 is_current 设置为 true，并更新 status / generated_at
        ↓
提交事务
        ↓
任务完成
```

Digest current 切换规则：

1. 旧版本 `is_current = false` 和新版本 `is_current = true` 必须在同一事务中完成；
2. 如果任一步失败，事务必须回滚；
3. 回滚后旧版本仍然保持 current；
4. 不允许出现同一 `mailbox_id + digest_date` 下两个 current digest；
5. 不允许先设置新版本 current 再取消旧版本 current；
6. 新版本只有在 `digest_items` 安全写入后才允许切换为 current。

失败时：

```text
AI 调用失败 / JSON 解析失败 / 写入失败
        ↓
ai_runs.status = failed
        ↓
daily_digests.status = failed
        ↓
不切换 is_current
        ↓
旧日报继续展示
        ↓
前端提示失败和重试按钮
```

---

### 5 首页打开时的新邮件检测流程

```text
用户打开 Dashboard
        ↓
GET /api/digest/today
        ↓
后端获取当前版本 Daily Digest
        ↓
检查 Redis 中是否存在新邮件检测缓存
        ↓
若缓存存在：直接返回缓存结果
        ↓
若缓存不存在：调用 Gmail API 检查 coverage_end 后的新邮件
        ↓
写入 Redis，TTL = 60 或 120 秒
        ↓
返回 Digest + new_mail_count_after_digest
```

如果有新邮件：

```text
digest.status = stale
new_mail_count_after_digest = N
```

前端展示：

```text
今日日报生成于 09:00。此后收到 3 封新邮件，尚未纳入 AI 分析。
```

---

### 6 刷新日报流程

```text
用户点击刷新日报
        ↓
POST /api/digest/today/refresh
        ↓
检查是否已有 running / refreshing 任务
        ↓
若已有任务，直接返回已有 job_id
        ↓
若无任务，创建 refresh_digest 任务
        ↓
同步 coverage_end 后的新邮件
        ↓
生成新的 Daily Digest 版本
        ↓
新版本成功后切换为 current
        ↓
旧版本保留
```

---
