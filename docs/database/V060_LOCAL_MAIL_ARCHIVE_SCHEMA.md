# MailMind v0.6.0 Local Mail Archive Schema

## New Table

`mailbox_archive_states`

Tracks one local archive state per mailbox:

- `mailbox_id`
- `provider`
- `status`
- `cursor`
- `newest_synced_at`
- `oldest_synced_at`
- `total_synced_count`
- `batch_count`
- `last_batch_started_at`
- `last_batch_completed_at`
- `last_error_code`
- `last_error_message`
- `started_at`
- `completed_at`
- timestamps

Statuses: `not_started`, `running`, `partial`, `complete`, `failed`, `canceled`.

## Emails Extension

The `emails` table stores archive-friendly fields:

- `sent_at`
- `is_starred`
- `has_attachments`
- `provider_metadata_json`
- `body_html`
- `body_cache_status`
- `body_cached_at`
- `body_cache_source`

Body cache fields are placeholders for future on-demand body caching. v0.6.0 full-history archive writes `body_cache_status=not_cached`.

## Jobs Extension

`sync_jobs.job_type` accepts `email_archive_backfill`.

## Query Indexes

The local archive depends on efficient filters by mailbox, user, read state, and received time. Existing mailbox/user time indexes are reused where present, and the archive migration extends only fields needed by v0.6.0.

