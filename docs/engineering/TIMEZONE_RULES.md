# AI Email Copilot 时区规则

> 本文档由 `docs/architecture/SYSTEM_DESIGN.md` 拆分而来，作为该专题的详细设计文档。
> 系统级背景、设计目标和模块关系请先阅读 `../architecture/SYSTEM_DESIGN.md`。

## 时区规则

### 1 MVP 时区策略

MVP 不再使用“系统本地时区作为用户时区”这一口径。

统一规则如下：

1. 数据库存储统一使用 UTC `TIMESTAMPTZ`；
2. `users.timezone` 保存用户时区，使用 IANA 时区字符串，例如 `Asia/Shanghai`；
3. Digest 的 `date`、`coverage_start`、`coverage_end` 按 `users.timezone` 计算；
4. 若用户尚未显式设置时区，MVP 默认使用 `Asia/Shanghai`，而不是部署机器时区；
5. 前端展示时统一按 `users.timezone` 渲染时间。

规则：

```text
coverage_start = users.timezone 当天 00:00:00
coverage_end   = users.timezone 下的日报生成时刻
date           = coverage_start 对应日期
```

---

### 2 Gmail 查询与本地二次过滤

Gmail 查询可使用日期范围查询。

但为避免边界偏差，必须进行本地二次过滤：

```text
1. 使用 Gmail 查询获取候选邮件；
2. 解析每封邮件 received_at；
3. 转换到 `users.timezone`；
4. 保留 coverage_start <= received_at <= coverage_end 的邮件。
```

---

### 3 调度规则

1. 定时生成任务默认按应用配置时区运行；
2. MVP 单用户场景下，应用配置时区必须与默认 `users.timezone` 保持一致；
3. 多用户调度属于后续版本，届时必须按用户时区分别调度，不能复用单一系统时区。

---
