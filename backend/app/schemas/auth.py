from pydantic import BaseModel, Field

from app.schemas.user import UserRead


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8)
    timezone: str | None = None


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1)


class AuthUserEnvelope(BaseModel):
    data: dict[str, UserRead]
    meta: dict[str, object] = {}


class EmptyEnvelope(BaseModel):
    data: dict[str, object] = {}
    meta: dict[str, object] = {}
