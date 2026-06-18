from ipaddress import ip_address

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.api.deps import error_response, get_current_user, get_db
from app.core.config import Settings, get_settings
from app.core.session import (
    clear_session_cookie,
    session_cookie_name,
    session_expire_days,
    set_session_cookie,
)
from app.db.models.user import User
from app.schemas.auth import EmptyEnvelope, LoginRequest, RegisterRequest
from app.schemas.user import UserRead
from app.services.auth_service import AuthError, authenticate_user, register_user
from app.services.session_service import create_user_session, revoke_session_token


router = APIRouter(prefix="/api/auth", tags=["auth"])


def _auth_payload(user: User) -> dict[str, object]:
    return {"data": {"user": UserRead.model_validate(user).model_dump(mode="json")}, "meta": {}}


def _raise_auth_error(error: AuthError) -> None:
    raise HTTPException(
        status_code=error.status_code,
        detail=error_response(error.code, error.message)["error"],
    )


def _client_ip(request: Request) -> str | None:
    if request.client is None:
        return None
    try:
        return str(ip_address(request.client.host))
    except ValueError:
        return None


@router.post("/register", status_code=201)
def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    try:
        user = register_user(
            db,
            email=str(payload.email),
            password=payload.password,
            timezone=payload.timezone,
            settings=settings,
        )
    except AuthError as error:
        _raise_auth_error(error)

    token, _ = create_user_session(
        db,
        user=user,
        expire_days=session_expire_days(settings),
        ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    set_session_cookie(response, token, settings)
    return _auth_payload(user)


@router.post("/login")
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    try:
        user = authenticate_user(db, email=str(payload.email), password=payload.password)
    except AuthError as error:
        _raise_auth_error(error)

    token, _ = create_user_session(
        db,
        user=user,
        expire_days=session_expire_days(settings),
        ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    set_session_cookie(response, token, settings)
    return _auth_payload(user)


@router.post("/logout", response_model=EmptyEnvelope)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    session_token = request.cookies.get(session_cookie_name(settings))
    if session_token:
        revoke_session_token(db, session_token)
    clear_session_cookie(response, settings)
    return {"data": {}, "meta": {}}


@router.get("/me")
def me(current_user: User = Depends(get_current_user)) -> dict[str, object]:
    return _auth_payload(current_user)
