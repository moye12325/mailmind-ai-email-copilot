# Docs Freeze Checklist

Use this checklist to decide whether the documentation is ready to freeze before implementation begins. A `PASS` means the current documents appear aligned enough for implementation. A `NEEDS REVIEW` or `NEEDS DECISION` item should be resolved or accepted as an explicit risk before development starts.

## Status Legend

- PASS
- FAIL
- NEEDS REVIEW
- NEEDS DECISION

## Checklist

| Area | Check | Status | Notes |
|---|---|---|---|
| Product / Architecture | PRD and SYSTEM_DESIGN are aligned | PASS | Product name is MailMind, AI Email Copilot is the product type/subtitle, and `gmail.modify` is documented as a self-use full-experience scope rather than strict read-only minimum permission. |
| Database / API | DATABASE and API are aligned | PASS | API resources map to documented tables and ownership model. Implementation must still preserve `is_current` and user filtering. |
| AI / Database | AI_PIPELINE `suggested_action` enum matches DATABASE | PASS | Both define `reply_today`, `review_today`, `handle_before_deadline`, `ignore`, `archive_candidate`, `follow_up_later`, `no_action_required`. |
| Security / Database | SECURITY requirements are reflected in DATABASE | PASS | `mailbox_credentials`, `encryption_key_version`, and no long-term Access Token storage are documented. |
| Security / API | SECURITY requirements are reflected in API | PASS | API docs require auth, ownership, `gmail.modify`, `write_enabled`, and provider success before local read-state updates. |
| Data Flows / Database | DATA_FLOWS digest switch matches DATABASE transaction rules | PASS | DATA_FLOWS is fixed to switch old current `false` before new current `true` in one transaction, with rollback preserving the old current version. |
| Data Flows / Architecture | DATA_FLOWS provider method matches SYSTEM_DESIGN | PASS | DATA_FLOWS uses `GmailProvider.list_messages_for_window(mailbox, window_start, window_end)` and keeps “today” window calculation in the business layer. |
| Task Harness | TASK_BREAKDOWN is executable | PASS | Tasks are bounded with allowed files and acceptance criteria, and Execution Batches clarify dependency order where task IDs and phases differ. |
| Agent Harness | AGENTS defines execution rules and forbidden changes | PASS | Agent behavior, source-of-truth priority, forbidden changes, design review workflow, and documentation gap handling are defined. |
| README | README reflects current documentation status | PASS | README has been updated to describe documentation hardening before MVP implementation and list current docs. |
| Scope | No unresolved P0 architecture conflicts | PASS | No unresolved P0 conflict remains after aligning product naming, Gmail permission wording, Provider method naming, and Digest current switching order. |
| GitHub Workflow | Issue and PR templates support task-driven work | PASS | Templates exist for task issues, design review, bugs, and PRs. |
| MVP Boundaries | Non-MVP features are deferred | PASS | Outlook, IMAP, AI Provider UI, Coding Agent config, and automatic sending remain outside MVP. |
