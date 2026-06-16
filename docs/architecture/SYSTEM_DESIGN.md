# AI Email Copilot 系统架构设计

**版本**：v1.2
**最后更新**：2026-06-16
**产品阶段**：MVP
**架构目标**：支持公网部署前置安全模型、Gmail 状态同步、多邮箱扩展、Daily Digest 版本化、AI 调用可追踪、用户行为闭环。

---

## 1. 架构目标

当前系统架构围绕 MVP 设计，优先满足以下目标：

1. **系统登录与用户隔离**
   MVP 阶段即支持系统登录，所有邮箱、邮件、日报、AI 调用、用户行为均归属于具体用户。未来部署公网服务器时，必须保证用户只能访问自己的数据。

2. **Gmail 接入稳定可靠**
   MVP 支持 Gmail OAuth 授权、Token 刷新、当日邮件同步，并支持已读/未读状态真实同步至 Gmail。

3. **Daily Digest 是系统主入口**
   产品首页不是传统收件箱列表，而是今日 AI 邮件决策看板。用户优先查看“必须处理、建议查看、可忽略、待办事项、风险提醒”。

4. **AI 输出可执行、可解析、可追踪**
   AI 输出必须为结构化 JSON，包含明确的行动建议。每次 AI 调用需要记录到 `ai_runs`，便于调试、评估与回溯。

5. **Digest 版本化，避免刷新失败破坏旧日报**
   每次生成或刷新 Daily Digest 均创建新版本。新版本生成成功后才切换为当前版本；失败时保留旧版本。

6. **用户行为闭环**
   AI 建议与用户实际行为分离。系统通过 `user_actions` 记录用户对邮件、看板条目和 Gmail 状态同步的实际操作。

7. **数据安全可控**
   Token 与未来 IMAP 凭据必须加密存储。邮件正文、Token、完整 Prompt、AI API Key 不得进入日志。

8. **后续可扩展**
   虽然 MVP 仅支持 Gmail，但表结构和 Provider Adapter 需要支持未来扩展 Outlook、IMAP、多邮箱统一收件箱和桌面客户端。

---

## 2. 总体架构

系统采用：

> 前后端分离 + 系统登录 + Provider Adapter + 异步任务 + AI Pipeline + 版本化 Daily Digest + 用户行为审计

整体结构如下：

```text
┌──────────────────────────────────────────┐
│              Frontend Web                │
│         Next.js + TypeScript             │
│                                          │
│  登录 / 今日 AI 看板 / 邮件详情 / 设置    │
└───────────────────┬──────────────────────┘
                    │ HTTP API
                    ▼
┌──────────────────────────────────────────┐
│              Backend API                 │
│               FastAPI                    │
│                                          │
│ Auth / Mailbox / Digest / Email / Jobs   │
└──────────┬───────────────┬───────────────┘
           │               │
           ▼               ▼
┌──────────────────┐ ┌────────────────────┐
│ Identity Layer   │ │ Core Services       │
│ Users/Sessions   │ │ Digest/Email/Action │
└──────────┬───────┘ └──────────┬─────────┘
           │                    │
           ▼                    ▼
┌──────────────────┐ ┌────────────────────┐
│ Provider Adapter │ │ AI Pipeline         │
│ Gmail/Outlook/...│ │ LLM/Parser/Decision │
└──────────┬───────┘ └──────────┬─────────┘
           │                    │
           └──────────┬─────────┘
                      ▼
┌──────────────────────────────────────────┐
│           Async Task System              │
│             Celery + Redis               │
│                                          │
│ sync_today_emails / generate_digest      │
│ refresh_digest / check_new_emails        │
│ refresh_token                            │
└───────────────────┬──────────────────────┘
                    ▼
┌──────────────────────────────────────────┐
│              Storage Layer               │
│          PostgreSQL + Redis              │
│                                          │
│ users / sessions / mailboxes             │
│ mailbox_credentials / emails             │
│ daily_digests / digest_items             │
│ user_actions / ai_runs / sync_jobs       │
└──────────────────────────────────────────┘
```

---

## 3. 核心设计原则

### 3.1 Dashboard-first

前端首页不以收件箱为主入口，而以 Daily Digest 看板为主入口。

用户打开系统后，首先看到的是：

1. 日报时效状态；
2. 今日邮件概览；
3. 必须处理；
4. 建议查看；
5. 可忽略；
6. 今日待办；
7. 风险提醒。

邮件列表和邮件详情是支撑页面，不是产品主入口。

---

### 3.2 系统登录与邮箱授权分离

系统中存在两种身份：

#### 系统用户身份

表示谁登录 AI Email Copilot。

用于控制：

* 登录；
* 会话；
* 数据访问权限；
* 用户自己的邮箱连接；
* 用户自己的日报和操作记录。

#### 邮箱授权身份

表示用户连接的外部邮箱账号。

例如：

* Gmail；
* Outlook；
* IMAP 邮箱。

一个系统用户未来可以绑定多个邮箱。

因此：

> 用户登录系统 ≠ 用户授权 Gmail。

即使未来支持 Google 登录系统，也不能等同于 Gmail 邮件读取授权。

---

### 3.3 Provider Adapter

MVP 只实现 Gmail，但从第一天起抽象邮箱 Provider。

```python
class EmailProvider:
    def list_today_messages(self, mailbox) -> list[EmailMessage]: ...
    def get_message_detail(self, mailbox, message_id: str) -> EmailMessage: ...
    def get_new_messages_after(self, mailbox, timestamp) -> list[EmailMessage]: ...
    def mark_as_read(self, mailbox, message_id: str) -> bool: ...
    def mark_as_unread(self, mailbox, message_id: str) -> bool: ...
```

Provider 实现规划：

| Provider          | 状态     | 说明                    |
| ----------------- | ------ | --------------------- |
| `GmailProvider`   | MVP 实现 | Gmail API + OAuth 2.0 |
| `OutlookProvider` | 后续版本   | Microsoft Graph API   |
| `IMAPProvider`    | 后续版本   | 通用 IMAP 协议            |

---

### 3.4 AI 建议与用户行为分离

系统中有三类状态：

| 类型      | 表示什么                   | 存储位置           |
| ------- | ---------------------- | -------------- |
| 邮箱真实状态  | Gmail 中邮件是否已读、Labels 等 | `emails`       |
| AI 建议状态 | AI 认为这封邮件或事项应如何处理      | `digest_items` |
| 用户行为状态  | 用户实际做了什么               | `user_actions` |

三者不能混用。

例如：

* Gmail 已读，不代表用户已经在 AI 看板中处理；
* AI 建议 `reply_today`，不代表用户真的回复；
* 用户点击“忽略”，不一定要修改 Gmail 状态。

---

### 3.5 Daily Digest 版本化

Daily Digest 是核心业务对象，因此刷新日报时不直接覆盖旧日报。

规则：

1. 每次生成或刷新日报均创建新版本；
2. 新版本生成成功后才成为当前版本；
3. 新版本失败时，旧版本继续作为当前日报展示；
4. 首页只展示 `is_current = true` 的 Daily Digest；
5. 失败版本保留，便于排查问题。

---

## 4. 前端架构

### 4.1 技术栈

* Next.js
* TypeScript
* TailwindCSS
* shadcn/ui
* TanStack Query

---

### 4.2 页面结构

```text
/
  /login                    系统登录页
  /register                 系统注册页

/dashboard                  今日 AI 邮件决策看板
/emails/[id]                邮件详情页

/settings/profile           用户设置
/settings/mailboxes         邮箱连接管理
/settings/security          安全设置

/digest/history             历史日报，后续版本
```

---

### 4.3 首页看板区域

首页按以下顺序展示：

1. 日报时效状态栏；
2. 今日邮件概览；
3. 必须处理；
4. 建议查看；
5. 可忽略；
6. 今日待办；
7. 风险提醒；
8. 新邮件提示。

示例：

```text
今日日报已更新至 09:00，共分析 24 封邮件。
```

或：

```text
今日日报生成于 09:00。
此后收到 3 封新邮件，尚未纳入 AI 分析。

[刷新日报] [查看新邮件] [稍后处理]
```

---

### 4.4 前端状态原则

1. Dashboard 页面以 `GET /api/digest/today` 为主数据源；
2. 邮件详情页以 `GET /api/emails/{email_id}` 为主数据源；
3. 异步任务通过 `GET /api/jobs/{job_id}` 轮询；
4. 用户行为执行后，前端刷新相关 Digest Item 或 Email 状态；
5. Gmail 状态同步失败时，不得在前端伪造成功状态。

---

## 5. 后端 API 架构

后端使用 FastAPI，按业务边界拆分 Router。

### 5.1 Auth API

```text
/api/auth
  POST /register              用户注册
  POST /login                 用户登录
  POST /logout                退出登录
  GET  /me                    获取当前登录用户
```

---

### 5.2 Gmail OAuth API

```text
/api/auth/gmail
  GET  /login                 生成 Gmail OAuth 授权链接
  GET  /callback              处理 Gmail OAuth 回调
  POST /disconnect            断开 Gmail 授权并清除凭据
```

说明：

* 系统登录与 Gmail 授权分离；
* 用户必须先登录系统，才能连接 Gmail；
* Gmail OAuth 回调后创建或更新 `mailboxes` 和 `mailbox_credentials`。

---

### 5.3 Digest API

```text
/api/digest
  GET  /today                 获取当前用户今日日报
  POST /today/generate        手动触发生成今日日报
  POST /today/refresh         刷新日报
  GET  /today/new-mails       获取日报生成后的新邮件列表
  GET  /{digest_id}           获取指定日报详情
```

说明：

* `GET /today` 只返回当前版本日报；
* `POST /today/refresh` 创建新版本 Digest；
* 新版本生成失败时，旧版本仍作为当前日报。

---

### 5.4 Email API

```text
/api/emails
  GET  /today                 获取今日邮件列表
  GET  /{email_id}            获取邮件详情
  POST /{email_id}/mark-read  标记为已读，同步至 Gmail
  POST /{email_id}/mark-unread 标记为未读，同步至 Gmail
```

标记已读/未读前必须校验：

1. 当前用户拥有该邮件所属 mailbox；
2. `mailboxes.permission_mode = write_enabled`；
3. `granted_scopes` 包含 `gmail.modify`；
4. Gmail API 操作成功后再更新本地 `emails.is_read`。

---

### 5.5 Mailbox API

```text
/api/mailboxes
  GET  /                         获取当前用户已连接邮箱
  GET  /{mailbox_id}             获取邮箱详情
  GET  /{mailbox_id}/sync-status 获取同步状态
  POST /{mailbox_id}/sync        手动同步今日邮件
```

---

### 5.6 Job API

```text
/api/jobs
  GET /{job_id}                  查询异步任务状态
```

---

### 5.7 User Action API

```text
/api/actions
  POST /                         创建用户行为记录
  GET  /digest-items/{id}        获取某条 Digest Item 的用户行为
```

典型行为包括：

* 打开邮件详情；
* 打开 Gmail 原始邮件；
* 标记已读；
* 标记未读；
* 忽略；
* 稍后处理；
* 标记完成。

---

## 6. 邮箱接入与权限设计

### 6.1 Gmail OAuth Scope

MVP 自用阶段采用完整体验权限集：

| Scope            | 用途               |
| ---------------- | ---------------- |
| `gmail.readonly` | 读取邮件列表、正文、元数据    |
| `gmail.modify`   | 修改 Gmail 已读/未读状态 |

说明：

* `gmail.modify` 用于真实同步 Gmail 已读/未读；
* 该权限不是“最小权限”，而是“自用完整体验权限集”；
* 未来若 SaaS 化，需要重新评估 Google OAuth 审核、安全评估和合规成本；
* MVP 不申请 `gmail.send`，不支持在系统内发送邮件。

---

### 6.2 Gmail 已读/未读同步

Gmail 已读/未读本质是 `UNREAD` Label 操作。

| 操作   | Gmail 行为          |
| ---- | ----------------- |
| 标记已读 | 移除 `UNREAD` label |
| 标记未读 | 添加 `UNREAD` label |

流程：

```text
用户点击标记已读
        ↓
校验用户拥有该 email
        ↓
校验 mailbox 具备 write_enabled 权限
        ↓
调用 GmailProvider.mark_as_read()
        ↓
Gmail API 移除 UNREAD label
        ↓
更新 emails.is_read = true
        ↓
写入 user_actions
        ↓
返回成功
```

如果 Gmail API 失败：

1. 不更新 `emails.is_read`；
2. 写入失败状态的 `user_actions`；
3. 前端提示同步失败。

---

### 6.3 权限模式

`mailboxes.permission_mode`：

| 值               | 含义                     |
| --------------- | ---------------------- |
| `readonly`      | 只允许读取邮件，不允许修改 Gmail 状态 |
| `write_enabled` | 允许修改 Gmail 已读/未读状态     |

即使 MVP 默认使用 `write_enabled`，代码仍必须支持 `readonly`，以便未来开源和产品化。

---

## 7. 核心数据流

### 7.1 用户注册 / 登录流程

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

### 7.2 Gmail 首次授权流程

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

### 7.3 今日邮件同步流程

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
计算用户本地时区的当天时间范围
        ↓
调用 GmailProvider.list_today_messages()
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

---

### 7.4 Daily Digest 生成流程

```text
用户手动生成 / 定时任务触发 / Gmail 授权后自动触发
        ↓
创建 sync_job
        ↓
查询今日已同步邮件
        ↓
创建 daily_digests 新版本，status = generating
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
将新 daily_digest 标记为 is_current = true
        ↓
将旧版本 is_current = false
        ↓
任务完成
```

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

### 7.5 首页打开时的新邮件检测流程

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

### 7.6 刷新日报流程

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

## 8. 数据库设计

### 8.1 表关系总览

```text
users
  ├── auth_accounts
  ├── sessions
  └── mailboxes
        ├── mailbox_credentials
        ├── emails
        ├── daily_digests
        │     └── digest_items
        ├── ai_runs
        ├── user_actions
        └── sync_jobs
```

---

### 8.2 users

系统用户表。

```sql
id             UUID PRIMARY KEY
email          VARCHAR(255) UNIQUE NOT NULL
display_name   VARCHAR(100)
password_hash  TEXT
status         VARCHAR(20) NOT NULL DEFAULT 'active'
timezone       VARCHAR(64) NOT NULL DEFAULT 'Asia/Tokyo'
created_at     TIMESTAMP NOT NULL DEFAULT NOW()
updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
```

说明：

* `email` 是系统登录邮箱；
* `timezone` 用于计算 Daily Digest 的“今日”范围；
* `password_hash` 用于邮箱密码登录；
* 后续若支持第三方登录，可配合 `auth_accounts` 使用。

---

### 8.3 auth_accounts

系统登录方式表。

```sql
id                UUID PRIMARY KEY
user_id           UUID NOT NULL REFERENCES users(id)
provider          VARCHAR(50) NOT NULL
provider_user_id  VARCHAR(255) NOT NULL
email             VARCHAR(255)
created_at        TIMESTAMP NOT NULL DEFAULT NOW()

UNIQUE (provider, provider_user_id)
```

说明：

* 用于记录系统登录方式；
* 不等同于 Gmail 邮箱授权；
* Google 登录系统只需要 `openid email profile`，不代表已授权读取 Gmail。

---

### 8.4 sessions

登录会话表。

```sql
id                  UUID PRIMARY KEY
user_id             UUID NOT NULL REFERENCES users(id)
session_token_hash  TEXT NOT NULL
expires_at          TIMESTAMP NOT NULL
created_at          TIMESTAMP NOT NULL DEFAULT NOW()
last_used_at        TIMESTAMP
ip_address          VARCHAR(64)
user_agent          TEXT
revoked_at          TIMESTAMP
```

建议：

* 使用 HttpOnly Cookie 保存 session token；
* 数据库存储 session token hash；
* 退出登录时写入 `revoked_at`。

---

### 8.5 mailboxes

外部邮箱连接表。

```sql
id                UUID PRIMARY KEY
user_id           UUID NOT NULL REFERENCES users(id)

provider          VARCHAR(20) NOT NULL
email_address     VARCHAR(255) NOT NULL
display_name      VARCHAR(255)

permission_mode   VARCHAR(20) NOT NULL DEFAULT 'write_enabled'
granted_scopes    JSONB NOT NULL DEFAULT '[]'

status            VARCHAR(20) NOT NULL DEFAULT 'active'
last_sync_at      TIMESTAMP
last_history_id   VARCHAR(100)

created_at        TIMESTAMP NOT NULL DEFAULT NOW()
updated_at        TIMESTAMP NOT NULL DEFAULT NOW()

UNIQUE (user_id, provider, email_address)
```

`provider` 可选值：

```text
gmail
outlook
imap
```

`permission_mode` 可选值：

```text
readonly
write_enabled
```

---

### 8.6 mailbox_credentials

邮箱凭据表。

```sql
id                        UUID PRIMARY KEY
mailbox_id                UUID NOT NULL REFERENCES mailboxes(id)

credential_type           VARCHAR(30) NOT NULL
access_token_encrypted    TEXT
refresh_token_encrypted   TEXT
imap_password_encrypted   TEXT

token_expires_at          TIMESTAMP
scopes                    JSONB
extra                     JSONB

created_at                TIMESTAMP NOT NULL DEFAULT NOW()
updated_at                TIMESTAMP NOT NULL DEFAULT NOW()

UNIQUE (mailbox_id)
```

说明：

* Gmail / Outlook 使用 `oauth2`；
* IMAP 使用 `imap_password` 或应用专用密码；
* 凭据统一加密存储；
* 不在 `mailboxes` 主表直接存 Token，避免未来 provider 扩展导致字段混乱。

---

### 8.7 emails

邮件表。

```sql
id                UUID PRIMARY KEY
user_id           UUID NOT NULL REFERENCES users(id)
mailbox_id        UUID NOT NULL REFERENCES mailboxes(id)

provider          VARCHAR(20) NOT NULL
external_id       VARCHAR(255) NOT NULL
thread_id         VARCHAR(255)

subject           TEXT
sender            VARCHAR(500)
recipients        JSONB
snippet           TEXT
body_text         TEXT

received_at       TIMESTAMP NOT NULL
is_read           BOOLEAN NOT NULL DEFAULT FALSE
labels            JSONB

raw_payload_hash  VARCHAR(64)

created_at        TIMESTAMP NOT NULL DEFAULT NOW()
updated_at        TIMESTAMP NOT NULL DEFAULT NOW()

UNIQUE (mailbox_id, external_id)
```

说明：

* `is_read` 表示 Gmail 当前真实已读状态；
* `body_text` 写入时进行长度限制；
* 超长正文在 AI 输入阶段进一步裁剪；
* `user_id` 冗余存储，便于权限过滤和查询优化。

---

### 8.8 daily_digests

Daily Digest 版本表。

```sql
id                          UUID PRIMARY KEY
user_id                     UUID NOT NULL REFERENCES users(id)
mailbox_id                  UUID NOT NULL REFERENCES mailboxes(id)

date                        DATE NOT NULL
version                     INT NOT NULL
is_current                  BOOLEAN NOT NULL DEFAULT FALSE

status                      VARCHAR(20) NOT NULL
generated_at                TIMESTAMP
coverage_start              TIMESTAMP NOT NULL
coverage_end                TIMESTAMP NOT NULL

mail_count                  INT NOT NULL DEFAULT 0
new_mail_count_after_digest INT NOT NULL DEFAULT 0

overview                    TEXT
model_name                  VARCHAR(100)
prompt_version              VARCHAR(20)

created_at                  TIMESTAMP NOT NULL DEFAULT NOW()
updated_at                  TIMESTAMP NOT NULL DEFAULT NOW()

UNIQUE (mailbox_id, date, version)
```

状态值：

```text
generating
fresh
stale
failed
```

当前版本规则：

* 同一 `mailbox_id + date` 只能有一个 `is_current = true`；
* 可通过数据库部分唯一索引或业务事务保证；
* 首页只读取当前版本。

---

### 8.9 digest_items

Daily Digest 看板条目表。

```sql
id                UUID PRIMARY KEY
digest_id         UUID NOT NULL REFERENCES daily_digests(id)
user_id           UUID NOT NULL REFERENCES users(id)
mailbox_id        UUID NOT NULL REFERENCES mailboxes(id)

email_id          UUID REFERENCES emails(id)

item_type         VARCHAR(20) NOT NULL
section           VARCHAR(20) NOT NULL

title             TEXT
summary           TEXT
category          VARCHAR(30)

suggested_action  VARCHAR(50)
priority          VARCHAR(10) NOT NULL
reason            TEXT
deadline          DATE
confidence        FLOAT

display_order     INT NOT NULL DEFAULT 0

created_at        TIMESTAMP NOT NULL DEFAULT NOW()
updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
```

`item_type` 可选值：

```text
email
todo
risk
```

`section` 可选值：

```text
urgent
review
ignore
todo
risk
```

说明：

* 所有看板展示项统一进入 `digest_items`；
* 不再在 `daily_digests` 中单独存 `todos JSONB` / `risks JSONB`；
* 邮件类条目关联 `email_id`；
* todo / risk 条目可以关联 `email_id`，也可以为空；
* `summary` 是卡片摘要；
* `category` 是邮件类型，如 `work / notification / marketing / social / other`。

---

### 8.10 user_actions

用户行为记录表。

```sql
id                UUID PRIMARY KEY

user_id           UUID NOT NULL REFERENCES users(id)
mailbox_id        UUID NOT NULL REFERENCES mailboxes(id)
email_id          UUID REFERENCES emails(id)
digest_item_id    UUID REFERENCES digest_items(id)

action_type       VARCHAR(50) NOT NULL
action_status     VARCHAR(20) NOT NULL

source            VARCHAR(30) NOT NULL DEFAULT 'dashboard'
provider_effect   VARCHAR(30) NOT NULL DEFAULT 'local_only'

before_state      JSONB
after_state       JSONB

error_code        VARCHAR(100)
error_message     TEXT

created_at        TIMESTAMP NOT NULL DEFAULT NOW()
executed_at       TIMESTAMP
```

`action_type` 示例：

```text
open_email_detail
open_gmail
mark_read
mark_unread
dismiss
snooze
mark_done
refresh_digest
generate_digest
disconnect_mailbox
```

`action_status`：

```text
pending
executed
failed
cancelled
```

`provider_effect`：

```text
local_only
gmail_synced
outlook_synced
imap_synced
```

说明：

* AI 建议存在 `digest_items`；
* 用户实际行为存在 `user_actions`；
* Gmail 同步成功或失败都需要记录；
* 该表用于行为审计、错误追踪和 AI 建议采纳率分析。

---

### 8.11 ai_runs

AI 调用记录表。

```sql
id                UUID PRIMARY KEY

user_id           UUID NOT NULL REFERENCES users(id)
mailbox_id        UUID NOT NULL REFERENCES mailboxes(id)
digest_id         UUID REFERENCES daily_digests(id)

run_type          VARCHAR(50) NOT NULL
model_provider    VARCHAR(50)
model_name        VARCHAR(100)
prompt_version    VARCHAR(50)

input_hash        VARCHAR(64)
output_json       JSONB

status            VARCHAR(20) NOT NULL
error_message     TEXT

token_usage       JSONB
latency_ms        INT

created_at        TIMESTAMP NOT NULL DEFAULT NOW()
```

说明：

* 一次 AI 模型调用对应一条 `ai_runs`；
* `digest_items` 只存解析后的业务结果；
* 原始 AI 输出存放在 `ai_runs.output_json`；
* AI 失败时，即使没有生成 `digest_items`，也能追踪失败原因；
* 不建议在日志中记录完整 Prompt 或邮件正文。

---

### 8.12 sync_jobs

异步任务记录表。

```sql
id            UUID PRIMARY KEY
user_id       UUID NOT NULL REFERENCES users(id)
mailbox_id    UUID REFERENCES mailboxes(id)
digest_id     UUID REFERENCES daily_digests(id)

job_type      VARCHAR(50) NOT NULL
status        VARCHAR(20) NOT NULL
retry_count   INT NOT NULL DEFAULT 0

started_at    TIMESTAMP
finished_at   TIMESTAMP
error_message TEXT

created_at    TIMESTAMP NOT NULL DEFAULT NOW()
```

`job_type` 示例：

```text
sync_today
generate_digest
refresh_digest
check_new
refresh_token
```

---

## 9. AI Pipeline 架构

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

### 9.1 LLMClient 接口

```python
class LLMClient:
    def generate_digest(self, email_inputs: list[EmailInput]) -> DigestOutput: ...
    def analyze_single_email(self, email: EmailInput) -> EmailAnalysis: ...
```

---

### 9.2 AI 标准输出结构

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

### 9.3 AI 输出约束

1. 必须输出合法 JSON；
2. `items` 必须是数组；
3. 每条 item 必须包含 `item_type`、`section`、`title`、`priority`、`confidence`；
4. 邮件类 item 必须尽量关联 `email_id`；
5. `confidence` 范围为 `0.0 ~ 1.0`；
6. `deadline` 使用 `YYYY-MM-DD` 或 `null`；
7. 解析失败时允许重试；
8. 多次失败后记录 `ai_runs.status = failed`，并走降级流程。

---

## 10. 异步任务设计

异步任务使用 Celery + Redis。

### 10.1 任务类型

| 任务名                             | 触发时机                | 说明                    |
| ------------------------------- | ------------------- | --------------------- |
| `sync_today_emails`             | 首次授权、手动同步、刷新日报、定时任务 | 同步当日 Gmail 邮件         |
| `generate_daily_digest`         | 首次同步完成、手动触发、定时任务    | 生成今日 AI 日报            |
| `refresh_daily_digest`          | 用户点击刷新日报            | 同步新邮件并生成新版本           |
| `check_new_emails_after_digest` | 用户打开首页              | 检测日报生成后的新邮件           |
| `refresh_access_token`          | Access Token 过期     | 刷新 Gmail Access Token |

---

### 10.2 任务并发规则

1. 同一 `mailbox_id + date` 同一时间只能有一个 Digest 生成任务；
2. 如果存在 `generating / running / refreshing` 任务，新请求直接返回已有 `job_id`；
3. 手动刷新优先级高于定时任务；
4. 如果当日已有 `fresh` 当前日报，定时任务不覆盖；
5. 如果当日当前日报为 `failed`，允许自动重试；
6. 自动重试最多 3 次；
7. 服务在定时时间未运行，MVP 不做补偿执行。

---

### 10.3 异步任务交互模式

```text
POST /api/digest/today/generate
        ↓
返回 { "job_id": "xxx" }
        ↓
前端轮询 GET /api/jobs/{job_id}
        ↓
任务完成后 GET /api/digest/today
        ↓
展示当前版本日报
```

---

### 10.4 定时任务配置

```env
DIGEST_AUTO_GENERATE=true
DIGEST_GENERATE_TIME=08:00
```

说明：

* MVP 使用系统本地时区；
* 后续可按用户 `users.timezone` 单独调度。

---

## 11. 增量同步设计

### 11.1 MVP 方案：轻量快照检查

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

### 11.2 返回示例

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

### 11.3 后续增强

1. Gmail History API 增量同步；
2. Gmail Push Notification；
3. Google Cloud Pub/Sub；
4. 新邮件自动插入看板；
5. 桌面端实时提醒。

MVP 不引入实时推送。

---

## 12. 时区规则

### 12.1 MVP 时区策略

MVP 使用系统本地时区作为用户时区。

规则：

```text
coverage_start = 系统本地时区当天 00:00:00
coverage_end   = 日报生成时刻
date           = coverage_start 对应日期
```

---

### 12.2 Gmail 查询与本地二次过滤

Gmail 查询可使用日期范围查询。

但为避免边界偏差，必须进行本地二次过滤：

```text
1. 使用 Gmail 查询获取候选邮件；
2. 解析每封邮件 received_at；
3. 转换到用户本地时区；
4. 保留 coverage_start <= received_at <= coverage_end 的邮件。
```

---

## 13. 安全架构

### 13.1 安全原则

```text
系统登录             所有 API 必须鉴权
用户数据隔离         用户只能访问自己的邮箱、邮件、日报、行为
自用完整体验权限集   Gmail 使用 gmail.readonly + gmail.modify
Token 加密           refresh_token / IMAP 密码必须加密存储
正文最小化存储       body_text 截断，不存完整原始邮件
敏感信息不进日志     Token、邮件正文、完整 Prompt、AI API Key 不进日志
用户可撤销授权       支持断开邮箱并清除凭据
```

---

### 13.2 APP_ENCRYPTION_KEY

系统使用 `APP_ENCRYPTION_KEY` 加密敏感凭据。

要求：

1. 从 `.env` 读取；
2. 不得提交 Git；
3. 生产和开发环境使用不同密钥；
4. 推荐使用 32 bytes 随机密钥，并进行 Base64 编码；
5. 密钥丢失后，已加密 Token 无法解密，用户需要重新授权 Gmail；
6. 未来 SaaS 化后应迁移到云 KMS 或密钥管理服务。

生成示例：

```bash
python -c "import secrets, base64; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"
```

`.env.example`：

```env
APP_ENCRYPTION_KEY=replace-with-32-byte-base64-key
```

---

### 13.3 Token 处理流程

```text
OAuth callback 获取 token
        ↓
使用 APP_ENCRYPTION_KEY 加密 refresh_token
        ↓
写入 mailbox_credentials
        ↓
access_token 短期缓存至 Redis
        ↓
调用 Gmail API 前检查 access_token
        ↓
过期则解密 refresh_token
        ↓
刷新 access_token
        ↓
更新 Redis 缓存
```

---

### 13.4 日志规范

允许记录：

```text
job_id
user_id
mailbox_id
任务类型
任务状态
耗时
错误类型
```

禁止记录：

```text
access_token
refresh_token
IMAP 密码
邮件正文
完整 AI Prompt
AI API Key
APP_ENCRYPTION_KEY
```

---

### 13.5 AI 调用安全

1. 用户自行配置 AI API Key；
2. 不默认发送附件内容；
3. 邮件正文进入 AI 前进行 HTML 清洗和长度裁剪；
4. 不记录完整 Prompt；
5. `ai_runs.output_json` 自用阶段可保留；
6. 未来商业化时需重新评估是否保留 AI 原始输出。

---

## 14. 部署架构

### 14.1 服务组成

| 服务         | 技术                | 说明             |
| ---------- | ----------------- | -------------- |
| `frontend` | Next.js           | Web 前端         |
| `backend`  | FastAPI + Uvicorn | 后端 API         |
| `worker`   | Celery Worker     | 异步任务           |
| `beat`     | Celery Beat       | 定时任务           |
| `postgres` | PostgreSQL        | 主数据库           |
| `redis`    | Redis             | 队列、缓存、Token 缓存 |

---

### 14.2 推荐开发部署方式

MVP 开发期推荐：

```text
PostgreSQL + Redis  → Docker Compose
Backend             → 本机 uvicorn
Frontend            → 本机 npm run dev
Worker + Beat       → 本机 celery
```

核心功能稳定后，再将所有服务统一容器化。

---

### 14.3 目录结构

```text
ai-email-copilot/
  frontend/
    src/
      app/
        dashboard/
        emails/
        settings/
        login/
      components/
      lib/
    package.json

  backend/
    app/
      main.py

      api/
        auth.py
        gmail_auth.py
        digest.py
        emails.py
        mailboxes.py
        jobs.py
        actions.py

      core/
        config.py
        security.py
        encryption.py
        session.py

      db/
        session.py
        models.py
        migrations/

      providers/
        base.py
        gmail.py
        outlook.py
        imap.py

      services/
        auth_service.py
        mailbox_service.py
        email_service.py
        digest_service.py
        ai_service.py
        token_service.py
        action_service.py

      tasks/
        celery_app.py
        sync_tasks.py
        digest_tasks.py
        token_tasks.py

      ai/
        pipeline.py
        preprocessor.py
        input_builder.py
        llm_client.py
        output_parser.py
        decision_engine.py

      schemas/
        auth.py
        user.py
        mailbox.py
        email.py
        digest.py
        action.py
        job.py

      utils/
        email_parser.py
        logger.py

    requirements.txt

  docker/
    docker-compose.yml

  data/
    postgres/
    redis/

  docs/
    PRD.md
    SYSTEM_DESIGN.md
    DATABASE_DESIGN.md
    API_DESIGN.md
    AI_PIPELINE.md
    SECURITY.md

  .env.example
  .gitignore
  README.md
```

---

### 14.4 docker-compose.yml 示意

```yaml
services:
  postgres:
    image: postgres:15
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    env_file: .env

  redis:
    image: redis:7
    volumes:
      - ./data/redis:/data

  backend:
    build: ./backend
    depends_on: [postgres, redis]
    env_file: .env
    ports:
      - "8000:8000"

  worker:
    build: ./backend
    command: celery -A app.tasks.celery_app worker --loglevel=info
    depends_on: [postgres, redis]
    env_file: .env

  beat:
    build: ./backend
    command: celery -A app.tasks.celery_app beat --loglevel=info
    depends_on: [postgres, redis]
    env_file: .env

  frontend:
    build: ./frontend
    depends_on: [backend]
    ports:
      - "3000:3000"
```

---

## 15. MVP 最小闭环

MVP 第一版需要跑通以下完整链路：

```text
用户注册 / 登录
        ↓
连接 Gmail
        ↓
授权 gmail.readonly + gmail.modify
        ↓
Token 加密存储
        ↓
同步今日邮件
        ↓
生成 Daily Digest v1
        ↓
首页展示 AI 决策看板
        ↓
检测新邮件并提示
        ↓
用户刷新日报
        ↓
生成 Daily Digest v2
        ↓
v2 成功后成为当前版本
        ↓
用户点击邮件详情
        ↓
用户标记已读 / 未读
        ↓
同步 Gmail 状态
        ↓
记录 user_actions
```

---

## 16. 架构决策总结

| 决策点       | 方案                                                 | 原因                  |
| --------- | -------------------------------------------------- | ------------------- |
| 产品入口      | Daily Digest 看板优先                                  | 符合 AI 决策产品定位        |
| 用户身份      | MVP 即支持系统登录                                        | 为公网部署和用户数据隔离做准备     |
| 邮箱接入      | MVP 仅 Gmail                                        | 降低复杂度，验证核心价值        |
| 多邮箱扩展     | Provider Adapter + mailboxes + mailbox_credentials | 支持未来 Outlook / IMAP |
| Gmail 权限  | 自用完整体验权限集：`gmail.readonly + gmail.modify`          | 支持真实已读/未读同步         |
| Digest 模型 | Daily Digest 版本化                                   | 刷新失败时保护旧日报          |
| 看板条目      | 所有展示项统一进入 `digest_items`                           | 避免 todos/risks 多处存储 |
| AI 调用记录   | 使用 `ai_runs`                                       | 原始 AI 输出和业务结果分离     |
| 用户行为      | 使用 `user_actions`                                  | 形成 AI 建议与用户采纳闭环     |
| 新邮件检测     | Redis TTL 缓存                                       | 避免频繁调用 Gmail API    |
| 定时任务      | Celery Beat + 并发控制                                 | 避免重复生成和任务打架         |
| 安全模型      | 登录鉴权、Token 加密、敏感信息不入日志                             | 支持未来公网部署            |
| 时区规则      | MVP 使用系统本地时区并本地二次过滤                                | 保证“今日邮件”边界清晰        |
| 部署模式      | 开发期混合部署，后续全容器化                                     | 降低早期开发复杂度           |

---

## 17. 后续文档拆分建议

本架构文档用于定义系统总体结构。后续需要进一步拆分为：

1. `DATABASE_DESIGN.md`
   详细定义表结构、索引、枚举、约束、迁移策略。

2. `API_DESIGN.md`
   定义 API 请求参数、响应结构、错误码和鉴权规则。

3. `AI_PIPELINE.md`
   定义 Prompt、JSON Schema、解析规则、失败重试和 token 控制。

4. `SECURITY.md`
   定义登录安全、Token 加密、日志规范、密钥管理、公网部署注意事项。

5. `TASK_BREAKDOWN.md`
   拆分 Codex / Harness Engineering 可执行任务。
