# MailMind v0.6.0 Local Mail Archive API

## Emails

`GET /api/emails`

Query parameters:

- `range`: `today`, `last_7_days`, `last_30_days`, `custom`, or `all_synced`
- `from`: custom range start date
- `to`: custom range end date
- `mailbox_id`: optional mailbox filter
- `is_read`: optional read/unread filter
- `q`: optional local search over subject, sender, snippet, recipients, and labels
- `limit`, `offset`: pagination
- `sort`: `received_at_desc` or `received_at_asc`

This endpoint must query only PostgreSQL. It must not request Gmail or IMAP.

`GET /api/emails/{email_id}`

Returns metadata, snippet, labels, source mailbox fields, read state, attachment flag, and body cache status. v0.6.0 may return `body_text=null` and `body_html=null`.

## Mailbox Archive

`POST /api/mailboxes/{mailbox_id}/archive-jobs`

Creates a full-history archive job:

```json
{
  "job": {
    "job_type": "email_archive_backfill",
    "status": "queued"
  },
  "archive_state": {
    "status": "running"
  }
}
```

The endpoint does not create range sync jobs.

`GET /api/mailboxes/{mailbox_id}/archive-state`

Returns mailbox archive progress, including status, synced count, batch count, oldest/newest synced timestamps, and last error fields.

