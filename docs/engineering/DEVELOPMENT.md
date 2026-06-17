# AI Email Copilot 开发与部署设计

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

### 3 目录结构

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

### 4 docker-compose.yml 示意

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
