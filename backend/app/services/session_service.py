from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.session import generate_session_token, hash_session_token
from app.db.models.session import UserSession
from app.db.models.user import User


def create_user_session(
    db: Session,
    *,
    user: User,
    expire_days: int,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> tuple[str, UserSession]:
    token = generate_session_token()
    session = UserSession(
        user_id=user.id,
        session_token_hash=hash_session_token(token),
        expires_at=datetime.now(UTC) + timedelta(days=expire_days),
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(session)
    db.flush()
    return token, session


def get_session_by_token(db: Session, token: str) -> UserSession | None:
    if not token:
        return None

    return db.scalar(
        select(UserSession).where(
            UserSession.session_token_hash == hash_session_token(token)
        )
    )


def get_user_by_session_token(db: Session, token: str) -> User | None:
    session = get_session_by_token(db, token)
    now = datetime.now(UTC)

    if session is None or session.revoked_at is not None or session.expires_at <= now:
        return None

    session.last_used_at = now
    return db.get(User, session.user_id)


def revoke_session_token(db: Session, token: str) -> None:
    session = get_session_by_token(db, token)
    if session is None or session.revoked_at is not None:
        return

    session.revoked_at = datetime.now(UTC)
