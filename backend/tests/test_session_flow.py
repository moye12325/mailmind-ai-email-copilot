from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.session import SESSION_COOKIE_NAME, hash_session_token
from app.db.models.session import UserSession
from app.db.session import SessionLocal
from app.main import app


def _email(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex}@example.com"


def test_session_token_hash_is_stored_instead_of_raw_cookie_token() -> None:
    client = TestClient(app)
    email = _email("hash")

    client.post("/api/auth/register", json={"email": email, "password": "strong-password"})
    raw_token = client.cookies.get(SESSION_COOKIE_NAME)

    assert raw_token
    with SessionLocal() as db:
        session = db.scalar(select(UserSession).order_by(UserSession.created_at.desc()))

    assert session is not None
    assert session.session_token_hash == hash_session_token(raw_token)
    assert session.session_token_hash != raw_token


def test_expired_session_cookie_is_rejected() -> None:
    client = TestClient(app)
    email = _email("expired")

    client.post("/api/auth/register", json={"email": email, "password": "strong-password"})
    raw_token = client.cookies.get(SESSION_COOKIE_NAME)
    assert raw_token

    with SessionLocal() as db:
        session = db.scalar(
            select(UserSession).where(
                UserSession.session_token_hash == hash_session_token(raw_token)
            )
        )
        assert session is not None
        session.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()

    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_revoked_session_cookie_is_rejected() -> None:
    client = TestClient(app)
    email = _email("revoked")

    client.post("/api/auth/register", json={"email": email, "password": "strong-password"})
    raw_token = client.cookies.get(SESSION_COOKIE_NAME)
    assert raw_token

    with SessionLocal() as db:
        session = db.scalar(
            select(UserSession).where(
                UserSession.session_token_hash == hash_session_token(raw_token)
            )
        )
        assert session is not None
        session.revoked_at = datetime.now(UTC)
        db.commit()

    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"
