from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.session import SESSION_COOKIE_NAME
from app.db.models.session import UserSession
from app.db.models.user import User
from app.db.session import SessionLocal
from app.main import app


def _email(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex}@example.com"


def test_register_success_creates_user_and_sets_httponly_cookie() -> None:
    client = TestClient(app)
    email = _email("register")

    response = client.post(
        "/api/auth/register",
        json={"email": f"  {email.upper()}  ", "password": "strong-password"},
    )

    assert response.status_code == 201
    body = response.json()
    assert set(body.keys()) == {"data", "meta"}
    assert body["data"]["user"]["email"] == email
    assert "password_hash" not in body["data"]["user"]
    assert SESSION_COOKIE_NAME in response.cookies
    assert "httponly" in response.headers["set-cookie"].lower()
    assert "samesite=lax" in response.headers["set-cookie"].lower()

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        assert user is not None
        assert user.password_hash != "strong-password"


def test_register_duplicate_email_returns_invalid_request() -> None:
    client = TestClient(app)
    email = _email("duplicate-api")

    first = client.post(
        "/api/auth/register", json={"email": email, "password": "strong-password"}
    )
    second = client.post(
        "/api/auth/register", json={"email": email.upper(), "password": "strong-password"}
    )

    assert first.status_code == 201
    assert second.status_code == 400
    assert second.json()["error"]["code"] == "INVALID_REQUEST"


def test_login_success_sets_cookie_and_does_not_expose_token() -> None:
    client = TestClient(app)
    email = _email("login")
    client.post(
        "/api/auth/register", json={"email": email, "password": "strong-password"}
    )
    client.post("/api/auth/logout")

    response = client.post(
        "/api/auth/login", json={"email": email.upper(), "password": "strong-password"}
    )

    assert response.status_code == 200
    assert SESSION_COOKIE_NAME in response.cookies
    assert "httponly" in response.headers["set-cookie"].lower()
    assert "session_token" not in response.text
    assert "session_token_hash" not in response.text


def test_login_missing_or_wrong_password_returns_unauthorized() -> None:
    client = TestClient(app)
    email = _email("bad-login")
    client.post(
        "/api/auth/register", json={"email": email, "password": "strong-password"}
    )

    wrong_password = client.post(
        "/api/auth/login", json={"email": email, "password": "wrong-password"}
    )
    missing_user = client.post(
        "/api/auth/login", json={"email": _email("missing"), "password": "x"}
    )

    assert wrong_password.status_code == 401
    assert wrong_password.json()["error"]["code"] == "UNAUTHORIZED"
    assert missing_user.status_code == 401
    assert missing_user.json()["error"]["code"] == "UNAUTHORIZED"


def test_me_requires_login_and_returns_current_user_after_login() -> None:
    client = TestClient(app)
    email = _email("me")

    unauthorized = client.get("/api/auth/me")
    assert unauthorized.status_code == 401
    assert unauthorized.json()["error"]["code"] == "UNAUTHORIZED"

    client.post("/api/auth/register", json={"email": email, "password": "strong-password"})
    response = client.get("/api/auth/me")

    assert response.status_code == 200
    user = response.json()["data"]["user"]
    assert user["email"] == email
    assert "password_hash" not in user


def test_logout_revokes_session_and_clears_cookie() -> None:
    client = TestClient(app)
    email = _email("logout")
    client.post("/api/auth/register", json={"email": email, "password": "strong-password"})
    cookie_value = client.cookies.get(SESSION_COOKIE_NAME)

    response = client.post("/api/auth/logout")
    me_response = client.get("/api/auth/me")

    assert response.status_code == 200
    assert "max-age=0" in response.headers["set-cookie"].lower()
    assert me_response.status_code == 401

    with SessionLocal() as db:
        stored_session = db.scalar(select(UserSession).order_by(UserSession.created_at.desc()))
        assert stored_session is not None
        assert stored_session.session_token_hash != cookie_value
