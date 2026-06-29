# MailMind v0.6.0 Local Archive Privacy Notes

## Stored Data

Full-history archive stores email metadata and snippets in the local PostgreSQL database. This includes subject, sender, recipients, labels, received/sent timestamps, read/starred state, attachment presence, provider metadata, and snippet.

## Not Stored By Default

v0.6.0 does not download attachments and does not store full message body text or HTML during full-history archive.

## Provider Tokens

Archive jobs reuse existing provider credentials. No access tokens, refresh tokens, API keys, or authorization codes should be written to docs, logs, frontend bundles, or commits.

## Operational Risk

Full-history archive can store a large amount of personal email metadata. Users should understand local storage impact before starting archive backfill.

Future cleanup work should include mailbox archive reset/delete controls, retention policy controls, and body-cache purge controls before enabling full body caching.

