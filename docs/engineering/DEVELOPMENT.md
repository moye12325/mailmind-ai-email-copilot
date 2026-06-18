# MailMind 开发与部署设计

> 本文档由 `docs/architecture/SYSTEM_DESIGN.md` 拆分而来，作为该专题的详细设计文档。
> 系统级背景、设计目标和模块关系请先阅读 `../architecture/SYSTEM_DESIGN.md`。

本文档集中维护本地开发、服务组成、目录结构和 Docker Compose 相关设计。

## 部署架构

### 1 服务组成

| 服务         | 技术                | 说明             |
| ---------- | ----------------- | -------------- |
| `frontend` | Next.js           | Web 前端         |
| `backend`  | FastAPI + Uvicorn | 后端 API         |
| `worker`   | Celery Worker     | 异步任务           |
| `beat`     | Celery Beat       | 定时任务           |
| `postgres` | PostgreSQL        | 主数据库           |
| `redis`    | Redis             | 队列、缓存、Token 缓存 |

---

### 2 推荐开发部署方式

MVP 开发期推荐：

```text
PostgreSQL + Redis  → Docker Compose
Backend             → 本机 uvicorn
Frontend            → 本机 npm run dev
Worker + Beat       → 本机 celery
```

核心功能稳定后，再将所有服务统一容器化。

---

### 3 MVP 目录结构

```text
mailmind-ai-email-copilot/
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

    tests/
      test_auth.py
      test_encryption.py
      test_gmail_oauth.py
      test_email_sync.py
      test_digest_versioning.py
      test_ai_output_parser.py
      test_user_actions.py

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

Tests should be added incrementally with backend tasks when the task changes testable behavior. `backend/tests/` is not reserved for a final-only testing phase.

MVP provider files:

```text
providers/
  base.py
  gmail.py
```

Future reserved provider files:

```text
providers/
  outlook.py
  imap.py
```

Do not create `outlook.py` or `imap.py` during MVP scaffold unless a specific future-reserved task explicitly asks for placeholder files.

---

### 4 Docker Compose stages

T003 local infrastructure compose must include only:

```text
postgres
redis
```

T003 must not containerize backend, frontend, worker, or beat. Those services belong to a future full-stack compose stage after the local development path is stable.

Future full-stack compose may include:

```text
backend
frontend
worker
beat
```

### 4.1 T003 local infrastructure docker-compose.yml示意

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
```

### 4.2 Future full-stack docker-compose.yml示意

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
