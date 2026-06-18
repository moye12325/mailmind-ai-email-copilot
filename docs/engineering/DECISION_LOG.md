# Decision Log

This document records architecture decisions that should not be revisited casually during implementation. New decisions should be added as ADR entries instead of silently changing source documents or implementation behavior.

## ADR-000 Official product name is MailMind

**Status:** Accepted
**Context:** Earlier documents used AI Email Copilot as a working name, product type, and title interchangeably.
**Decision:** The official product name is MailMind. AI Email Copilot is the product type, subtitle, or historical working description. The repository name remains `mailmind-ai-email-copilot`.
**Consequences:** Product documents, task descriptions, and user-facing references should use MailMind as the product name. AI Email Copilot may still describe the category or product type.
**Related Docs:** `README.md`, `docs/README.md`, `docs/product/PRD.md`

## ADR-001 Daily Digest is the product homepage

**Status:** Accepted
**Context:** MailMind is an AI decision layer, not a traditional inbox client.
**Decision:** The primary user entry point is the Daily Digest dashboard, not a chronological inbox.
**Consequences:** The frontend must prioritize digest freshness, overview, urgent/review/ignore sections, todos, and risks. Email lists remain supporting views.
**Related Docs:** `docs/product/PRD.md`, `docs/architecture/SYSTEM_DESIGN.md`, `docs/frontend/FRONTEND_DESIGN.md`

## ADR-002 Gmail is the MVP email provider

**Status:** Accepted
**Context:** The MVP must validate the core AI digest workflow with limited provider complexity.
**Decision:** MVP implements Gmail only.
**Consequences:** Outlook and IMAP remain future providers behind the adapter shape but are not runtime MVP features.
**Related Docs:** `docs/product/PRD.md`, `docs/architecture/SYSTEM_DESIGN.md`, `docs/database/DATABASE_DESIGN.md`

## ADR-003 Gmail read/unread sync requires gmail.modify

**Status:** Accepted
**Context:** Gmail read/unread status is represented by the `UNREAD` label.
**Decision:** Real Gmail read/unread synchronization requires the `gmail.modify` scope.
**Consequences:** Mark-read and mark-unread operations must check scope and permission mode before calling Gmail.
**Related Docs:** `docs/security/SECURITY.md`, `docs/api/API_DESIGN.md`, `docs/database/DATABASE_DESIGN.md`

## ADR-004 gmail.modify is a self-use full-experience scope, not minimal read-only permission

**Status:** Accepted
**Context:** `gmail.modify` is required for the desired self-use read/unread experience, but it is broader than read-only access and may trigger stricter Google review for public use.
**Decision:** MVP uses `gmail.readonly + gmail.modify` as a self-use full-experience permission set.
**Consequences:** Public/SaaS distribution must reassess Google verification, security review, and permission minimization strategy. Product copy must not describe this scope set as strict read-only minimum permission.
**Related Docs:** `docs/security/SECURITY.md`, `docs/architecture/SYSTEM_DESIGN.md`, `docs/product/PRD.md`

## ADR-005 Daily Digest must be versioned

**Status:** Accepted
**Context:** Refreshing a digest can fail, and the old successful digest must remain usable.
**Decision:** Every generation or refresh creates a new Daily Digest version. New versions become current only after successful generation and item insertion.
**Consequences:** Implementation must not overwrite old digests or expose half-built versions.
**Related Docs:** `docs/architecture/SYSTEM_DESIGN.md`, `docs/database/DATABASE_DESIGN.md`, `docs/architecture/DATA_FLOWS.md`

## ADR-006 digest_items is the single source of dashboard items

**Status:** Accepted
**Context:** Dashboard sections include emails, todos, and risks. Multiple tables would create duplicated facts.
**Decision:** `digest_items` stores all dashboard items for a digest version.
**Consequences:** Frontend dashboard rendering should read from digest items. Todos and risks are item types, not separate top-level facts.
**Related Docs:** `docs/database/DATABASE_DESIGN.md`, `docs/ai/AI_PIPELINE.md`, `docs/architecture/SYSTEM_DESIGN.md`

## ADR-007 Do not create ai_actions

**Status:** Accepted
**Context:** AI suggestions are properties of digest items, while user actions are separate records.
**Decision:** Do not create an `ai_actions` table.
**Consequences:** Suggested action remains `digest_items.suggested_action`; user execution remains in `user_actions`.
**Related Docs:** `docs/database/DATABASE_DESIGN.md`, `docs/architecture/SYSTEM_DESIGN.md`

## ADR-008 todos and risks are represented as digest_items

**Status:** Accepted
**Context:** Todos and risks appear on the Daily Digest dashboard but do not need separate fact tables in MVP.
**Decision:** Todos and risks use `digest_items.item_type = 'todo'` and `digest_items.item_type = 'risk'`.
**Consequences:** No `todos` or `risks` tables are created in MVP.
**Related Docs:** `docs/database/DATABASE_DESIGN.md`, `docs/ai/AI_PIPELINE.md`

## ADR-009 ai_runs stores AI raw output and run metadata

**Status:** Accepted
**Context:** AI behavior must be traceable without storing full prompts or raw email bodies in logs.
**Decision:** `ai_runs` stores model metadata, input hash, input summary, status, token counts, latency, errors, and raw structured output.
**Consequences:** Every AI call must create an `ai_runs` record. Full prompts and email bodies must not be logged.
**Related Docs:** `docs/database/DATABASE_DESIGN.md`, `docs/ai/AI_PIPELINE.md`, `docs/security/SECURITY.md`

## ADR-010 user_actions stores user behavior

**Status:** Accepted
**Context:** AI recommendations and real user behavior are different business facts.
**Decision:** `user_actions` stores user actions such as opening details, marking read/unread, dismissing items, and refreshing digests.
**Consequences:** Implementation must not mutate `digest_items` to pretend an action happened. Gmail sync results must be recorded through `user_actions`.
**Related Docs:** `docs/database/DATABASE_DESIGN.md`, `docs/architecture/SYSTEM_DESIGN.md`, `docs/security/SECURITY.md`

## ADR-011 mailbox_credentials stores encrypted provider credentials

**Status:** Accepted
**Context:** Mailbox credentials are sensitive and should be separated from mailbox metadata.
**Decision:** Store refresh tokens and future provider secrets in `mailbox_credentials`, encrypted at rest.
**Consequences:** `mailboxes` contains connection metadata only. Access tokens are not stored long term in PostgreSQL.
**Related Docs:** `docs/database/DATABASE_DESIGN.md`, `docs/security/SECURITY.md`

## ADR-012 APP_ENCRYPTION_KEY and encryption_key_version are required

**Status:** Accepted
**Context:** Stored credentials require a consistent encryption mechanism and future key rotation support.
**Decision:** Use `APP_ENCRYPTION_KEY` for credential encryption and record `encryption_key_version`.
**Consequences:** Losing the encryption key requires user reauthorization. Future AI provider keys should reuse the same encryption path.
**Related Docs:** `docs/security/SECURITY.md`, `docs/database/DATABASE_DESIGN.md`

## ADR-013 users.timezone controls Daily Digest date windows

**Status:** Accepted
**Context:** Container or host timezone can differ from the user's business day.
**Decision:** `users.timezone` defines Daily Digest `digest_date`, `coverage_start`, and `coverage_end`.
**Consequences:** Store timestamps as UTC `TIMESTAMPTZ`; compute business windows using IANA timezone strings.
**Related Docs:** `docs/engineering/TIMEZONE_RULES.md`, `docs/database/DATABASE_DESIGN.md`

## ADR-013A Provider adapters receive explicit UTC windows and do not define today

**Status:** Accepted
**Context:** Provider-specific methods should not decide what “today” means because business windows depend on `users.timezone` and must be consistent across providers.
**Decision:** Business services calculate the local Digest window from `users.timezone`, convert it to UTC `window_start` / `window_end`, and call `list_messages_for_window(mailbox, window_start, window_end)`. Provider adapters do not decide “today” on their own.
**Consequences:** Gmail, and future providers, receive explicit UTC windows and return candidate messages. Business services perform local `received_at` filtering for boundary correctness.
**Related Docs:** `docs/architecture/SYSTEM_DESIGN.md`, `docs/architecture/DATA_FLOWS.md`, `docs/engineering/TIMEZONE_RULES.md`

## ADR-013B Digest current switching must unset old current before setting new current in one transaction

**Status:** Accepted
**Context:** `daily_digests` enforces one current version per `mailbox_id + digest_date`. Setting the new version current before unsetting the old current can violate the partial unique index.
**Decision:** Digest current switching must occur in one transaction after `digest_items` are written. The old current version is set to `is_current = false` before the new version is set to `is_current = true`.
**Consequences:** If any step fails, the transaction rolls back and the old current Digest remains current. Implementations must not expose two current Digests or half-built versions.
**Related Docs:** `docs/database/DATABASE_DESIGN.md`, `docs/architecture/DATA_FLOWS.md`

## ADR-014 MVP uses .env AI provider; V1 reserves AI Provider configuration

**Status:** Accepted
**Context:** MVP needs AI provider flexibility without adding user-facing provider management.
**Decision:** MVP reads the default AI provider from `.env`. V1 may add `ai_provider_configs`.
**Consequences:** MVP must not implement AI Provider settings UI or runtime database configuration.
**Related Docs:** `docs/product/PRD.md`, `docs/ai/AI_PIPELINE.md`, `docs/database/DATABASE_DESIGN.md`

## ADR-015 Codex / Claude Code are not ordinary LLM providers

**Status:** Accepted
**Context:** Codex and Claude Code are coding-agent tools that may consume LLM services but are not themselves generic inference providers.
**Decision:** Do not use Codex or Claude Code as `ai_provider_configs.provider` values.
**Consequences:** Coding Agent credentials and plans, if ever needed, belong to V2-specific configuration, not MVP or V1 LLM provider config.
**Related Docs:** `docs/product/PRD.md`, `docs/ai/AI_PIPELINE.md`, `docs/database/DATABASE_DESIGN.md`

## ADR-016 New mail detection uses snapshot + manual refresh in MVP

**Status:** Accepted
**Context:** Real-time push adds infrastructure and operational complexity.
**Decision:** MVP uses lightweight snapshot checking after the digest coverage end, Redis TTL cache, and manual refresh.
**Consequences:** Gmail History API, Push Notification, Pub/Sub, and automatic insertion are future enhancements.
**Related Docs:** `docs/engineering/INCREMENTAL_SYNC.md`, `docs/architecture/DATA_FLOWS.md`, `docs/frontend/FRONTEND_DESIGN.md`

## ADR-017 No automatic email sending in MVP

**Status:** Accepted
**Context:** Automatic sending is high risk and outside the MVP decision-layer scope.
**Decision:** MVP does not request `gmail.send` and does not send email.
**Consequences:** The UI may open Gmail or mark read/unread, but must not send or auto-reply.
**Related Docs:** `docs/product/PRD.md`, `docs/security/SECURITY.md`, `docs/api/API_DESIGN.md`

## ADR-018 Task IDs are stable identifiers, not strict execution order

**Status:** Accepted
**Context:** Harness tasks are intentionally stable, but some dependencies point to later-numbered tasks or later phases.
**Decision:** Task IDs must remain stable identifiers. Execution order is governed by task dependencies and the Execution Batches section in `TASK_BREAKDOWN.md`.
**Consequences:** Codex must not assume numeric order is sufficient. If dependencies and batches conflict, Codex must stop and request design review rather than silently reordering implementation work.
**Related Docs:** `docs/engineering/TASK_BREAKDOWN.md`, `docs/engineering/AGENTS.md`
