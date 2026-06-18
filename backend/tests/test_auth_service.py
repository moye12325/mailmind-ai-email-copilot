from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import delete, select

from app.core.config import Settings
from app.core.security import hash_password, verify_password
from app.core.session import hash_session_token
from app.db.models.auth_account import AuthAccount
from app.db.models.session import UserSession
from app.db.models.user import User
from app.db.session import SessionLocal
from app.services.auth_service import (
    AuthError,
    authenticate_user,
    register_user,
)
from app.services.session_service import (
    create_user_session,
    get_user_by_session_token,
)


def _email(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex}@example.com"


def test_password_hashing_does_not_store_plaintext() -> None:
    password = "correct horse battery staple"

    password_hash = hash_password(password)

    assert password_hash != password
    assert verify_password(password, password_hash)
    assert not verify_password("wrong-password", password_hash)


def test_register_user_normalizes_email_and_creates_password_auth_account() -> None:
    settings = Settings()
    raw_email = f"  USER-{uuid4().hex}@Example.COM  "

    with SessionLocal() as db:
        user = register_user(
            db,
            email=raw_email,
            password="registered-password",
            timezone=None,
            settings=settings,
        )
        db.commit()

        auth_account = db.scalar(
            select(AuthAccount).where(AuthAccount.user_id == user.id)
        )

        assert user.email == raw_email.strip().lower()
        assert user.timezone == settings.default_timezone
        assert user.password_hash != "registered-password"
        assert verify_password("registered-password", user.password_hash or "")
        assert auth_account is not None
        assert auth_account.provider == "password"
        assert auth_account.provider_user_id == user.email


def test_register_user_rejects_duplicate_email() -> None:
    email = _email("duplicate")

    with SessionLocal() as db:
        register_user(db, email=email, password="first-password", timezone=None)
        db.commit()

        try:
            register_user(db, email=email.upper(), password="second-password", timezone=None)
        except AuthError as exc:
            assert exc.code == "INVALID_REQUEST"
        else:
            raise AssertionError("duplicate registration should fail")


def test_authenticate_user_rejects_missing_wrong_password_and_disabled_user() -> None:
    email = _email("auth")

    with SessionLocal() as db:
        user = register_user(db, email=email, password="valid-password", timezone=None)
        db.commit()

        assert authenticate_user(db, email=email.upper(), password="valid-password").id == user.id

        for candidate_email, password in [
            (_email("missing"), "valid-password"),
            (email, "wrong-password"),
        ]:
            try:
                authenticate_user(db, email=candidate_email, password=password)
            except AuthError as exc:
                assert exc.code == "UNAUTHORIZED"
            else:
                raise AssertionError("invalid login should fail")

        user.status = "disabled"
        db.commit()

        try:
            authenticate_user(db, email=email, password="valid-password")
        except AuthError as exc:
            assert exc.code == "FORBIDDEN"
        else:
            raise AssertionError("disabled user login should fail")


def test_session_token_is_hashed_and_expired_or_revoked_sessions_are_rejected() -> None:
    email = _email("session")

    with SessionLocal() as db:
        user = register_user(db, email=email, password="valid-password", timezone=None)
        token, session = create_user_session(db, user=user, expire_days=1)
        db.commit()

        assert session.session_token_hash == hash_session_token(token)
        assert session.session_token_hash != token
        assert get_user_by_session_token(db, token).id == user.id

        session.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()
        assert get_user_by_session_token(db, token) is None

        token, session = create_user_session(db, user=user, expire_days=1)
        session.revoked_at = datetime.now(UTC)
        db.commit()
        assert get_user_by_session_token(db, token) is None
