from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.user import Role, User

_LOGIN_PATTERN = r"^[a-zA-Z0-9_.-]+$"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    login: str
    full_name: str
    roles: list[Role]
    is_active: bool

    @classmethod
    def of(cls, user: User) -> "UserOut":
        return cls(
            id=user.id,
            login=user.login,
            full_name=user.full_name,
            roles=sorted(user.roles),
            is_active=user.is_active,
        )


class UserBrief(BaseModel):
    """Короткая карточка пользователя для списков и ссылок из задач."""

    id: int
    full_name: str


class DemoUserOut(BaseModel):
    id: int
    full_name: str
    roles: list[Role]


class LoginIn(BaseModel):
    login: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class DemoLoginIn(BaseModel):
    user_id: int


def _unique_roles(roles: list[Role]) -> list[Role]:
    if not roles:
        raise ValueError("Нужна хотя бы одна роль")
    return sorted(set(roles))


class UserCreate(BaseModel):
    login: str = Field(min_length=3, max_length=64, pattern=_LOGIN_PATTERN)
    full_name: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=8, max_length=128)
    roles: list[Role]

    _roles = field_validator("roles")(_unique_roles)

    @field_validator("login")
    @classmethod
    def _lower_login(cls, v: str) -> str:
        return v.lower()

    @field_validator("full_name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Имя не может быть пустым")
        return v


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=128)
    password: str | None = Field(default=None, min_length=8, max_length=128)
    roles: list[Role] | None = None
    is_active: bool | None = None

    @field_validator("roles")
    @classmethod
    def _roles(cls, v: list[Role] | None) -> list[Role] | None:
        return None if v is None else _unique_roles(v)
