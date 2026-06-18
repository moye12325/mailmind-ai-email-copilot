from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class UserRead(BaseModel):
    id: UUID
    email: str
    timezone: str
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
