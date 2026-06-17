# AI Email Copilot 前端设计

> 本文档由 `docs/architecture/SYSTEM_DESIGN.md` 拆分而来，作为该专题的详细设计文档。
> 系统级背景、设计目标和模块关系请先阅读 `../architecture/SYSTEM_DESIGN.md`。

## 前端架构

### 1 技术栈

* Next.js
* TypeScript
* TailwindCSS
* shadcn/ui
* TanStack Query

---

### 2 页面结构

```text
/
  /login                    系统登录页
  /register                 系统注册页

/dashboard                  今日 AI 邮件决策看板
/emails                     今日邮件列表页
/emails/new                 日报生成后新增邮件列表页
/emails/[id]                邮件详情页

/settings/profile           用户设置
/settings/mailboxes         邮箱连接管理
/settings/security          安全设置

/digest/history             历史日报，后续版本
```

---

### 3 首页看板区域

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

### 4 前端状态原则

1. Dashboard 页面以 `GET /api/digest/today` 为主数据源；
2. 邮件详情页以 `GET /api/emails/{email_id}` 为主数据源；
3. 异步任务通过 `GET /api/jobs/{job_id}` 轮询；
4. 用户行为执行后，前端刷新相关 Digest Item 或 Email 状态；
5. Gmail 状态同步失败时，不得在前端伪造成功状态。

---

### 5 邮件列表与降级策略

1. `/emails` 展示当日邮件列表，支持按时间倒序、已读状态筛选；
2. AI 优先级筛选基于"当前 Digest 版本 + `digest_items(item_type='email')` join emails"实现，只对已纳入当前 Digest 的邮件生效；
3. `/emails/new` 展示 `coverage_end` 之后的新邮件列表，可附带 `new_mail_preview` 的简要 AI 判断；
4. 当 AI 日报生成失败且没有可展示的当前 Digest 时，Dashboard 必须降级跳转或内嵌展示 `/emails` 原始邮件列表视图，而不是空白页；
5. "查看新邮件"按钮默认进入 `/emails/new`，而不是重新定义临时页面。

---
