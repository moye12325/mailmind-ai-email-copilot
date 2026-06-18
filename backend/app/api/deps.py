from collections.abc import Generator

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.session import session_cookie_name
from app.db.models.user import User
from app.db.session import SessionLocal
from app.services.session_service import get_user_by_session_token


def error_response(code: str, message: str, retryable: bool = False) -> dict[str, object]:
    return {
        "error": {
            "code": code,
            "message": message,
            "retryable": retryable,
            "details": {},
        }
    }


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    session_token = request.cookies.get(session_cookie_name(settings))
    if not session_token:
        raise HTTPException(
            status_code=401,
            detail=error_response("UNAUTHORIZED", "Authentication required.")["error"],
        )

    user = get_user_by_session_token(db, session_token)
    if user is None:
        raise HTTPException(
            status_code=401,
            detail=error_response("UNAUTHORIZED", "Authentication required.")["error"],
        )

    return user
