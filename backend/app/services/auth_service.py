from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.security import hash_password, verify_password
from app.db.models.auth_account import AuthAccount
from app.db.models.user import User


class AuthError(Exception):
    def __init__(self, code: str, message: str, status_code: int) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def register_user(
    db: Session,
    *,
    email: str,
    password: str,
    timezone: str | None,
    settings: Settings | None = None,
) -> User:
    resolved_settings = settings or get_settings()
    normalized_email = normalize_email(email)

    existing = db.scalar(select(User).where(User.email == normalized_email))
    if existing is not None:
        raise AuthError("INVALID_REQUEST", "Email is already registered.", 400)

    user = User(
        email=normalized_email,
        password_hash=hash_password(password),
        status="active",
        timezone=timezone or resolved_settings.default_timezone,
    )
    db.add(user)
    db.flush()

    db.add(
        AuthAccount(
            user_id=user.id,
            provider="password",
            provider_user_id=normalized_email,
            provider_email=normalized_email,
        )
    )

    try:
        db.flush()
    except IntegrityError as exc:
        raise AuthError("INVALID_REQUEST", "Email is already registered.", 400) from exc

    return user


def authenticate_user(db: Session, *, email: str, password: str) -> User:
    normalized_email = normalize_email(email)
    user = db.scalar(select(User).where(User.email == normalized_email))

    if user is None or not verify_password(password, user.password_hash or ""):
        raise AuthError("UNAUTHORIZED", "Invalid email or password.", 401)

    if user.status != "active":
        raise AuthError("FORBIDDEN", "User account is disabled.", 403)

    return user
