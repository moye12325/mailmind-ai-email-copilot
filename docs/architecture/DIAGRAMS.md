# Architecture Diagrams

MailMind's architecture visualized through Mermaid source files.

> **Rendered versions:** Generate SVG/PNG from the `.mmd` source files using [Mermaid CLI](https://github.com/mermaid-js/mermaid-cli), [Mermaid Live Editor](https://mermaid.live), or your IDE's Mermaid preview extension.

## Diagram Index

| # | File | Type | Description |
|---|------|------|-------------|
| 01 | [`mermaid/01-system-context.mmd`](mermaid/01-system-context.mmd) | Graph | MailMind and its external dependencies — Frontend, Backend, Workers, Data Stores, External APIs |
| 02 | [`mermaid/02-provider-mailbox-architecture.mmd`](mermaid/02-provider-mailbox-architecture.mmd) | ER | Provider → Mailbox → Credential → Email relationships and the Digest scope model |
| 03 | [`mermaid/03-celery-job-dispatch-sequence.mmd`](mermaid/03-celery-job-dispatch-sequence.mmd) | Sequence | Commit-then-dispatch job lifecycle: creation → dispatch → execution → completion/failure |
| 04 | [`mermaid/04-digest-scope-flow.mmd`](mermaid/04-digest-scope-flow.mmd) | Flowchart | How `scope_type=all` vs `scope_type=mailbox` digest generation works |
| 05 | [`mermaid/05-data-model-erd.mmd`](mermaid/05-data-model-erd.mmd) | ER | Full PostgreSQL data model with all core tables, fields, and relationships |

## How to Generate Images

### Mermaid CLI (recommended)

```bash
# Install
npm install -g @mermaid-js/mermaid-cli

# Generate SVG
mmdc -i docs/architecture/mermaid/01-system-context.mmd -o docs/architecture/diagrams/01-system-context.svg

# Generate PNG
mmdc -i docs/architecture/mermaid/01-system-context.mmd -o docs/architecture/diagrams/01-system-context.png -w 1600 -b transparent
```

### Batch generate all diagrams

```powershell
# From repo root
$files = Get-ChildItem docs/architecture/mermaid/*.mmd
foreach ($f in $files) {
    $name = $f.BaseName
    mmdc -i $f.FullName -o "docs/architecture/diagrams/$name.svg"
    Write-Host "Generated: $name.svg"
}
```

### Mermaid Live Editor

1. Open [mermaid.live](https://mermaid.live)
2. Paste the contents of any `.mmd` file
3. Export as SVG or PNG

## Design Principles

Each diagram follows these conventions:

- **Semantic naming** — files are numbered `01-` through `05-` for logical reading order
- **Self-documenting** — each file includes a `title` and `description` frontmatter
- **Color-coded** — nodes use consistent colors across diagrams (blue=frontend, green=backend, amber=data, purple=external)
- **Minimal but complete** — enough detail to understand the system without overwhelming

## Relationship to Other Docs

| This diagram | Explains concept from |
|--------------|----------------------|
| 01 System Context | [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) |
| 02 Provider/Mailbox | [MAILBOX_PROVIDER_ARCHITECTURE.md](MAILBOX_PROVIDER_ARCHITECTURE.md) |
| 03 Job Dispatch | [JOB_EXECUTION_MODEL.md](JOB_EXECUTION_MODEL.md) |
| 04 Digest Scope | [DATA_FLOWS.md](DATA_FLOWS.md) |
| 05 Data Model | [../database/DATABASE_DESIGN.md](../database/DATABASE_DESIGN.md) |
