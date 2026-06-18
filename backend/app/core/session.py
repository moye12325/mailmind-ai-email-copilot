from __future__ import annotations

import hashlib
import os
import secrets
from typing import Literal

from fastapi import Response

from app.core.config import Settings


SESSION_COOKIE_NAME = "mailmind_session"
SESSION_EXPIRE_DAYS = 14
SESSION_COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "lax"


def generate_session_token() -> str:
    return secrets.token_urlsafe(48)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def session_cookie_name(settings: Settings) -> str:
    return os.getenv("SESSION_COOKIE_NAME", SESSION_COOKIE_NAME)


def session_expire_days(settings: Settings) -> int:
    raw_value = os.getenv("SESSION_EXPIRE_DAYS")
    if raw_value is None:
        return SESSION_EXPIRE_DAYS
    try:
        return int(raw_value)
    except ValueError:
        return SESSION_EXPIRE_DAYS


def session_cookie_samesite(settings: Settings) -> Literal["lax", "strict", "none"]:
    value = os.getenv("SESSION_COOKIE_SAMESITE", SESSION_COOKIE_SAMESITE).lower()
    if value not in {"lax", "strict", "none"}:
        return SESSION_COOKIE_SAMESITE
    return value  # type: ignore[return-value]


def session_cookie_secure(settings: Settings) -> bool:
    configured = os.getenv("SESSION_COOKIE_SECURE")
    if configured is not None:
        return configured.strip().lower() in {"1", "true", "yes", "on"}
    return settings.app_env.lower() == "production"


def set_session_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        key=session_cookie_name(settings),
        value=token,
        httponly=True,
        secure=session_cookie_secure(settings),
        samesite=session_cookie_samesite(settings),
        max_age=session_expire_days(settings) * 24 * 60 * 60,
        path="/",
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=session_cookie_name(settings),
        path="/",
        secure=session_cookie_secure(settings),
        httponly=True,
        samesite=session_cookie_samesite(settings),
    )
